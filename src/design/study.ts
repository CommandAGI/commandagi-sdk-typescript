/**
 * STUDIES IN JSX — a study (`<name>.study.tsx`) holds the question of an analysis of a part, never the answer: the part
 * by ref, what holds it, what loads it, what it is made of, how to mesh it and which quantities must stay within which
 * limits (docs/formats.md § studies, in the CommandAGI repository). Its runs (the answers) are beside it.
 *
 *   // Jaw.study.tsx
 *   export default () => (
 *     <study kind="structural" part="Jaw.3d.tsx" units="mm-N-MPa-t">
 *       <material grade="PETG" poisson={0.38} />
 *       <fixture id="mount" type="fixed" faces={{ kind: "face", select: { normal: [0, 0, -1] } }} />
 *       <loadCase id="clamp">
 *         <force id="grip" faces={{ kind: "face", select: { normal: [1, 0, 0], farthest: [1, 0, 0] } }} total={[-40, 0, 0]} />
 *       </loadCase>
 *       <mesh order={2} size={2} refine={[1, 0.7, 0.5]} />
 *       <solver kind="calculix" analysis="static" />
 *       <criterion id="safety" quantity="vonMises.max" limit="yield / 2" />
 *       <criterion id="stiffness" quantity="displacement.max" limit={0.2} />
 *       <revise parameter="thickness" min={3} max={8} />
 *     </study>
 *   );
 *
 * One root, `<study kind part units>`, for every kind of study. A kind adds its own tags (`registerStudyKind`): this
 * file declares `structural` (FEA) and `flow` (CFD). `<criterion>` and `<revise>` are every kind's. The rule of the ontology's files: a
 * record is an element and its fields are its attributes, verbatim; a face pick is the 3D document's pick
 * (`{ kind: "face", select: { … } }`). Nothing adds a default: the runner says what it assumes, and a check fails on
 * what is missing.
 *
 * The document a study declares (`fromTree`):
 *   { kind, part, units, material?, fixtures?: [{ id, type, faces, region?, stiffness?, axis? }], loadCases?: [{ id, loads: [{ type: "force" |
 *     "pressure", id, faces, total | value }] }], mesh?, solver?, criteria?: [{ id, quantity, limit, region?,
 *     loadCase? }], revise?: [{ parameter, min, max }] }
 */
import { registerVocabulary, type DocTree, type TagRule, type Vocabulary } from "./documents.js";

/** The one unit set a study may declare: millimetres, newtons, megapascals, tonnes. */
export const STUDY_UNITS = "mm-N-MPa-t";
export const STUDY_ROOT_FIELDS = ["kind", "part", "units", "title"] as const;

/**
 * A tag of a study: where it stands (its rule), the field of its parent record it fills, whether that field is a list,
 * and whether the tag is the record's `type` (a load is `<force>` or `<pressure>`, both in `loads`).
 */
export interface StudyTag {
  rule: TagRule;
  field: string;
  list?: boolean;
  typed?: boolean;
  /** The kind it belongs to; absent: every kind's. */
  kind?: string;
}

const FACES = "faces";
const tags: Record<string, StudyTag> = {
  criterion: { rule: { parents: ["study"], key: "id", required: ["id", "quantity", "limit"], attrs: ["id", "quantity", "limit", "region", "loadCase", "note"] }, field: "criteria", list: true },
  revise: { rule: { parents: ["study"], key: "parameter", required: ["parameter", "min", "max"], attrs: ["parameter", "min", "max"] }, field: "revise", list: true },
};

/** The kinds a study may name, each with its tags. */
export const STUDY_KINDS = new Set<string>();

/** The vocabulary's tags: the root, then every kind's (kept in step by registerStudyKind). */
const vocabularyTags: Record<string, TagRule> = { study: { parents: [], required: ["kind", "part"], attrs: STUDY_ROOT_FIELDS } };

/**
 * Add a kind of study and its tags. A tag's rule names its parents (`study`, or another of the kind's tags); one tag
 * name means one thing in every kind, so a second kind may reuse a tag only with the same field.
 */
export function registerStudyKind(kind: string, kindTags: Record<string, Omit<StudyTag, "kind">>): void {
  for (const [tag, t] of Object.entries(kindTags)) {
    const was = tags[tag];
    if (was && (was.field !== t.field || !!was.list !== !!t.list))
      throw new Error(`<${tag}> of a ${kind} study fills ${t.field}, but it already fills ${was.field}`);
    tags[tag] = was ?? { ...t, kind };
    const rule = vocabularyTags[tag];
    vocabularyTags[tag] = rule ? { ...rule, parents: [...new Set([...rule.parents, ...t.rule.parents])] } : { ...t.rule };
  }
  STUDY_KINDS.add(kind);
}
for (const [tag, t] of Object.entries(tags)) vocabularyTags[tag] = t.rule;

registerStudyKind("structural", {
  material: { rule: { parents: ["study"], single: true, required: ["grade"], attrs: ["grade", "body", "poisson"] }, field: "material" },
  fixture: { rule: { parents: ["study"], key: "id", required: ["id", "type", FACES], attrs: ["id", "type", FACES, "region", "stiffness", "axis"] }, field: "fixtures", list: true },
  loadCase: { rule: { parents: ["study"], key: "id", required: ["id"], attrs: ["id"] }, field: "loadCases", list: true },
  force: { rule: { parents: ["loadCase"], key: "id", required: ["id", FACES, "total"], attrs: ["id", FACES, "total"] }, field: "loads", list: true, typed: true },
  pressure: { rule: { parents: ["loadCase"], key: "id", required: ["id", FACES, "value"], attrs: ["id", FACES, "value"] }, field: "loads", list: true, typed: true },
  mesh: { rule: { parents: ["study"], single: true, attrs: ["order", "size", "refine"] }, field: "mesh" },
  solver: { rule: { parents: ["study"], single: true, attrs: ["kind", "analysis", "timeout"] }, field: "solver" },
});

/**
 * A flow study (`kind="flow"`, `units="m-kg-s"`): incompressible steady flow through one body of the part, the fluid's
 * volume. The inlet and the outlet are face picks on that body (in the part's millimetres); every other face is a
 * wall. The flow kernel meshes the three patches (the 3D kernel's `surfaces` op writes them as STL, in metres), runs
 * `levels` refinements of the background block's `cells`, and reads the pressure drop, inlet to outlet.
 *
 *   <study kind="flow" part="Channel.3d.tsx" units="m-kg-s">
 *     <fluid nu={1e-6} />
 *     <inlet faces={{ kind: "face", select: { normal: [-1, 0, 0] } }} velocity={0.5} />
 *     <outlet faces={{ kind: "face", select: { normal: [1, 0, 0] } }} />
 *     <flowMesh cells={[20, 3, 3]} levels={[1, 2, 4]} />
 *     <criterion id="drop" quantity="pressureDrop" limit={2} />
 *   </study>
 */
export const FLOW_UNITS = "m-kg-s";
registerStudyKind("flow", {
  fluid: { rule: { parents: ["study"], single: true, required: ["nu"], attrs: ["nu", "body"] }, field: "fluid" },
  inlet: { rule: { parents: ["study"], single: true, required: [FACES, "velocity"], attrs: [FACES, "velocity"] }, field: "inlet" },
  outlet: { rule: { parents: ["study"], single: true, required: [FACES], attrs: [FACES] }, field: "outlet" },
  flowMesh: { rule: { parents: ["study"], single: true, required: ["cells"], attrs: ["cells", "levels", "iterations", "wallModel"] }, field: "flowMesh" },
});

export type StudyDocument = { kind: string; part: string; [field: string]: unknown };

const nothing = (v: unknown) => v === undefined || v === null;

function recordsOf(children: DocTree[], into: Record<string, unknown>): void {
  for (const c of children) {
    const t = tags[c.tag];
    if (!t) continue;
    const rec: Record<string, unknown> = { ...(t.typed ? { type: c.tag } : {}), ...c.attrs };
    recordsOf(c.children, rec);
    if (t.list) ((into[t.field] ??= []) as unknown[]).push(rec);
    else into[t.field] = rec;
  }
}

/** The tags that may stand in `parent`, in the order the vocabulary lists them. */
const tagsIn = (parent: string) => Object.entries(tags).filter(([, t]) => t.rule.parents.includes(parent));

function elementsOf(parent: string, rec: Record<string, unknown>): DocTree[] {
  const out: DocTree[] = [];
  const done = new Set<string>();
  for (const [tag, t] of tagsIn(parent)) {
    if (done.has(t.field)) continue;
    const v = rec[t.field];
    if (nothing(v)) continue;
    const items = t.list ? (Array.isArray(v) ? v : []) : [v];
    if (t.typed) done.add(t.field);
    for (const item of items as Record<string, unknown>[]) {
      const itemTag = t.typed ? String(item.type) : tag;
      const it = tags[itemTag];
      if (!it || it.field !== t.field) throw new Error(`${t.field}: "${itemTag}" is not a tag of a study (${tagsIn(parent).filter(([, x]) => x.field === t.field).map(([n]) => n).join(", ")})`);
      const childFields = new Set(tagsIn(itemTag).map(([, x]) => x.field));
      const attrs: Record<string, unknown> = {};
      for (const k of it.rule.attrs ?? Object.keys(item)) if (!nothing(item[k]) && !(k === "type" && it.typed) && !childFields.has(k)) attrs[k] = item[k];
      out.push({ tag: itemTag, attrs, children: elementsOf(itemTag, item) });
    }
  }
  return out;
}

export const studyVocabulary: Vocabulary<StudyDocument> = {
  format: "study",
  noun: "a study",
  root: "study",
  tags: vocabularyTags,
  fromTree(t) {
    const doc = { ...t.attrs } as StudyDocument;
    if (!STUDY_KINDS.has(doc.kind)) throw new Error(`<study> kind is one of ${[...STUDY_KINDS].join(", ")}, not ${JSON.stringify(doc.kind)}`);
    for (const c of t.children) {
      const k = tags[c.tag]?.kind;
      if (k && k !== doc.kind) throw new Error(`<${c.tag}> belongs to a ${k} study, not to a ${doc.kind} one`);
    }
    recordsOf(t.children, doc);
    return doc;
  },
  toTree(d) {
    const attrs: Record<string, unknown> = {};
    for (const k of STUDY_ROOT_FIELDS) if (!nothing(d[k])) attrs[k] = d[k];
    return { tag: "study", attrs, children: elementsOf("study", d) };
  },
  empty: () => ({ kind: "structural", part: "", units: STUDY_UNITS }),
};

registerVocabulary(studyVocabulary);

/** The vocabulary of studies, by format. */
export const STUDY = { study: studyVocabulary } as const;
