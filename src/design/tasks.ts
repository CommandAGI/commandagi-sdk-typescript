/**
 * TASKS AND PROJECTS IN JSX — a `.task` and a `.project` written as the elements the tasks and projects apps edit
 * (docs/formats.md § editor documents and § the ontology's files, in the CommandAGI repository).
 *
 *   // Tasks/Ship it.task.tsx
 *   export default () => (
 *     <task id="ship" title="Ship it" status="doing" priority="high" dueAt="2026-10-20" readme="Ship it.md">
 *       <subtask ref="Ship it/Draft.task.tsx" />
 *     </task>
 *   );
 *
 *   // Launch.project.tsx
 *   export default () => (
 *     <project id="launch" name="Launch">
 *       <view id="board" name="Board" mode="board" groupBy="status" />
 *     </project>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim. A
 * task's `subtasks` (the files of its subtasks, by path from this file) are `<subtask ref>` children, in order; a
 * project's `views` are `<view>` children. A subtask is its own file, never inlined: a task holds no other task.
 *
 * Times (`startAt`, `dueAt`, `closedAt`, `createdAt`, `updatedAt`) are epoch milliseconds in the document. In code they
 * may be written as a date (`"2026-10-20"`, UTC midnight) or a UTC time (`"2026-10-20T14:30:00Z"`), and are written so
 * by an editor. Nothing adds a default: what the file does not say, the document does not have (the app's schema
 * fills its own defaults when it reads the document, as it does for the JSON).
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a task's body (packages/domain/core/src/task.ts `TaskDoc`), but its subtasks. */
export const TASK_FIELDS = [
  "id",
  "title",
  "status",
  "priority",
  "glyph",
  "assignees",
  "projects",
  "blockedBy",
  "labels",
  "startAt",
  "dueAt",
  "closedAt",
  "threadId",
  "createdBy",
  "readme",
  "createdAt",
  "updatedAt",
] as const;
/** The fields of a project's body (`ProjectDoc`), but its views. */
export const PROJECT_FIELDS = ["id", "name", "glyph", "defaultViewId", "subprojects", "archived", "readme", "createdAt", "updatedAt"] as const;
/** The fields of a project's view (`TaskView`). */
export const VIEW_FIELDS = ["id", "name", "mode", "groupBy", "filter", "laneOrder"] as const;
/** The fields that are times: epoch milliseconds in the document, a date or a UTC time in code. */
export const TIME_FIELDS = ["startAt", "dueAt", "closedAt", "createdAt", "updatedAt"] as const;

export interface TaskDoc {
  id: string;
  subtasks?: string[];
  [field: string]: unknown;
}
export interface ProjectDoc {
  id: string;
  views?: Record<string, unknown>[];
  [field: string]: unknown;
}

const isTime = (k: string) => (TIME_FIELDS as readonly string[]).includes(k);

/** A time as the document holds it: epoch ms from a number, a date or a UTC time. */
export function timeOf(value: unknown, what: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
    if (Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.test(value)) return ms;
  }
  throw new Error(`${what} is a date ("2026-10-20"), a UTC time ("2026-10-20T14:30:00Z") or epoch milliseconds, not ${JSON.stringify(value)}`);
}

/** A time as code writes it: the date when it is UTC midnight, else the UTC time to the second (or the millisecond). */
export function timeText(ms: number): string {
  const iso = new Date(ms).toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return iso.endsWith(".000Z") ? `${iso.slice(0, 19)}Z` : iso;
}

/** A field's value says nothing (absent, null, "", [] or {}): code does not write it. */
const nothing = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (!!v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);

/** The fields of a record as attributes: those that say something, times as text. */
function attrsOf(o: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = o[k];
    if (nothing(v)) continue;
    out[k] = isTime(k) && typeof v === "number" ? timeText(v) : v;
  }
  return out;
}

/** The attributes of an element as a record's fields: times as epoch ms. */
function fieldsOf(attrs: Record<string, unknown>, where: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) out[k] = isTime(k) ? timeOf(v, `${where} ${k}`) : v;
  return out;
}

const where = (t: DocTree) => `<${t.tag}${typeof t.attrs.id === "string" ? ` id="${t.attrs.id}"` : ""}>`;

export const taskVocabulary: Vocabulary<TaskDoc> = {
  format: "task",
  noun: "a task",
  root: "task",
  tags: {
    task: { parents: [], required: ["id"], attrs: TASK_FIELDS },
    subtask: { parents: ["task"], key: "ref", required: ["ref"], attrs: ["ref"] },
  },
  fromTree(t) {
    const subtasks = t.children.filter((c) => c.tag === "subtask").map((c) => c.attrs.ref);
    for (const ref of subtasks) if (typeof ref !== "string" || !ref) throw new Error(`<subtask> ref is a path to a .task file, not ${JSON.stringify(ref)}`);
    return { ...(fieldsOf(t.attrs, where(t)) as { id: string }), ...(subtasks.length ? { subtasks: subtasks as string[] } : {}) };
  },
  toTree(d) {
    return { tag: "task", attrs: attrsOf(d, TASK_FIELDS), children: (d.subtasks ?? []).map((ref) => ({ tag: "subtask", attrs: { ref }, children: [] })) };
  },
};

export const projectVocabulary: Vocabulary<ProjectDoc> = {
  format: "project",
  noun: "a project",
  root: "project",
  tags: {
    project: { parents: [], required: ["id"], attrs: PROJECT_FIELDS },
    view: { parents: ["project"], key: "id", required: ["id"], attrs: VIEW_FIELDS },
  },
  fromTree(t) {
    const views = t.children.filter((c) => c.tag === "view").map((c) => ({ ...c.attrs }));
    return { ...(fieldsOf(t.attrs, where(t)) as { id: string }), ...(views.length ? { views } : {}) };
  },
  toTree(p) {
    return {
      tag: "project",
      attrs: attrsOf(p, PROJECT_FIELDS),
      children: (p.views ?? []).map((v) => ({ tag: "view", attrs: attrsOf(v, VIEW_FIELDS), children: [] })),
    };
  },
};

for (const v of [taskVocabulary, projectVocabulary]) registerVocabulary(v);

/** The vocabularies of tasks and projects, by format. */
export const TASKS = { task: taskVocabulary, project: projectVocabulary } as const;
