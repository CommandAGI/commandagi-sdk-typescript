/**
 * A THREAD'S MOUNTED TASKS IN JSX — `mounts.tsx` in the thread's run folder, beside its `triggers.tsx` (docs/formats.md §
 * a thread's mounted tasks, in the CommandAGI repository). The file declares one `<mounts>`, and each `<mount>` is one
 * record of it, its fields the element's attributes verbatim:
 *
 *   // runs/thread-<id>/mounts.tsx
 *   export default () => (
 *     <mounts>
 *       <mount label="launch" folder="../../Tasks/launch" />
 *       <mount label="ship it" task="../../Tasks/Ship it.task.tsx" />
 *       <mount label="owner inbox" assignee="user:u_1" status={["todo", "doing", "blocked"]} />
 *     </mounts>
 *   );
 *
 * `label` names the mount in its thread (unique there). What it mounts is one task (`task`, a ref to a `.task.tsx`), or
 * a list: the tasks at or under a folder (`folder`), the tasks of a project (`project`, a ref to a `.project.tsx`), or a
 * query (`assignee`, `labels`, `status`), each narrowing the others. A ref is a path relative to the run folder, or an
 * absolute address (`cloud://home/<uuid>/…`). While a mount has open work, the thread's agent is prompted with it at
 * the start of each turn and re-prompted with the next task when a turn ends (the platform's task loop). The Python
 * SDK's `mounts.py` and the Rust SDK's `mounts.rs` declare the same document.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A thread's mounts file: `mounts.tsx` (or `.jsx`, `.py`, `.rs`) in its run folder. */
export const MOUNT_FILE = /^mounts\.(?:[jt]sx|py|rs)$/i;
export const MOUNT_FIELDS = ["label", "task", "folder", "project", "assignee", "labels", "status"] as const;
/** The task statuses a mount's `status` may name (`@commandagi/core` TaskStatus). */
export const MOUNT_STATUSES = ["proposed", "todo", "doing", "blocked", "done", "cancelled", "declined"] as const;

export interface DeclaredMount {
  label: string;
  task?: string;
  folder?: string;
  project?: string;
  assignee?: string;
  labels?: string[];
  status?: string[];
}
export interface MountsDoc {
  mounts: DeclaredMount[];
}

const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim().length > 0 && x.length <= 200);

/** One mount as its element declares it; throws with why it does not read. */
export function mountOf(attrs: Record<string, unknown>): DeclaredMount {
  const { label, task, folder, project, assignee, labels, status } = attrs;
  if (!text(label) || (label as string).length > 200) throw new Error(`<mount> label is a short text that names it in its thread, not ${JSON.stringify(label)}`);
  const at = `<mount label="${label}">`;
  for (const [k, v] of Object.entries({ task, folder, project, assignee }))
    if (v !== undefined && !text(v)) throw new Error(`${at} ${k} is a text (a ref or an address), not ${JSON.stringify(v)}`);
  if (labels !== undefined && !texts(labels)) throw new Error(`${at} labels is a list of texts`);
  if (status !== undefined && (!texts(status) || !(status as string[]).every((s) => (MOUNT_STATUSES as readonly string[]).includes(s))))
    throw new Error(`${at} status is a list of ${MOUNT_STATUSES.join(", ")}`);
  if (assignee !== undefined && !/^(user|agent):[^\s:]+$/.test(assignee as string)) throw new Error(`${at} assignee is user:<id> or agent:<id>, not ${JSON.stringify(assignee)}`);
  const query = [folder, project, assignee, labels, status].some((v) => v !== undefined);
  if (task !== undefined && query) throw new Error(`${at} mounts one task, or a list (folder, project, assignee, labels, status): not both`);
  if (task === undefined && !query) throw new Error(`${at} mounts nothing: give task, folder, project, or a query (assignee, labels, status)`);
  const out: DeclaredMount = { label: label as string };
  if (task !== undefined) out.task = task as string;
  if (folder !== undefined) out.folder = folder as string;
  if (project !== undefined) out.project = project as string;
  if (assignee !== undefined) out.assignee = assignee as string;
  if (labels !== undefined && (labels as string[]).length) out.labels = [...(labels as string[])];
  if (status !== undefined && (status as string[]).length) out.status = [...(status as string[])];
  return out;
}

export const mountsVocabulary: Vocabulary<MountsDoc> = {
  format: "mounts",
  noun: "a thread's mounted tasks",
  root: "mounts",
  tags: {
    mounts: { parents: [], attrs: [] },
    mount: { parents: ["mounts"], key: "label", required: ["label"], attrs: MOUNT_FIELDS },
  },
  fromTree(t: DocTree) {
    const mounts = t.children.filter((c) => c.tag === "mount").map((c) => mountOf(c.attrs as Record<string, unknown>));
    const seen = new Set<string>();
    for (const m of mounts) {
      if (seen.has(m.label)) throw new Error(`two mounts are labelled ${JSON.stringify(m.label)}: a label names one mount in its thread`);
      seen.add(m.label);
    }
    return { mounts };
  },
  toTree(d) {
    return {
      tag: "mounts",
      attrs: {},
      children: (d.mounts ?? []).map((m) => ({
        tag: "mount",
        attrs: Object.fromEntries(MOUNT_FIELDS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])),
        children: [],
      })),
    };
  },
  empty: () => ({ mounts: [] }),
};

registerVocabulary(mountsVocabulary);

/** The vocabulary of a thread's mounts, by format. */
export const MOUNTS = { mounts: mountsVocabulary } as const;
