/**
 * A PROCESS FLOW IN JSX — `<name>.flow.tsx`: the ordered steps that make one thing (a wafer, a board, a part), each with
 * the tool it visits, its recipe parameters with their units, the time it takes and who does it, and the measurements
 * taken in the process with their acceptance (docs/formats.md § a process flow, in the CommandAGI repository).
 *
 *   // Litho.flow.tsx
 *   export default () => (
 *     <flow name="Alignment marks" of="stage1.bom.3d.tsx#wafer">
 *       <tool id="coater" ref="stage1.bom.3d.tsx#coater" ratePerHour={40} currency="USD" />
 *       <step id="why" kind="note" instruction="Marks first: every later layer aligns to them." />
 *       <step id="coat" order={1} tool="coater" by="in-house" minutes={6}>
 *         <param name="speed" value={3000} unit="rpm" />
 *         <measure id="resist" name="resist thickness" nominal={1.2} plus={0.1} minus={0.1} unit="um" method="reflectometer" />
 *         <visit tool="oven" minutes={2} instruction="soft bake" />
 *       </step>
 *     </flow>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim. A
 * tool is named by its `ref`: a device definition, or an item or body of a 3D document (`<file>#<id>`). A step names
 * its tool by the tool's id; a step that goes to more tools than its own names each in a `<visit tool minutes>`, so one
 * recipe step stays one step and every tool still counts its visit. Nothing adds a default. The check (each tool's ref read, each unit known, each step's
 * time and who, the roll-up of minutes, labour and tool visits) is the host's: `commandagi check <file>.flow.tsx`.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** What a step is: work (it takes time on a tool, by someone) or a note (context: no tool, no time). */
export const FLOW_STEP_KINDS = ["work", "note"] as const;

export const FLOW_FIELDS = ["name", "description", "of"] as const;
export const FLOW_TOOL_FIELDS = ["id", "ref", "name", "ratePerHour", "currency", "description"] as const;
export const FLOW_STEP_FIELDS = ["id", "order", "kind", "tool", "fixture", "by", "minutes", "setupMinutes", "ratePerHour", "currency", "instruction", "note"] as const;
export const FLOW_PARAM_FIELDS = ["name", "value", "unit", "description"] as const;
export const FLOW_MEASURE_FIELDS = ["id", "name", "nominal", "min", "max", "plus", "minus", "unit", "method", "sampling", "acceptance"] as const;
/** One more tool a step goes to: its time there, and its rate when it is not the tool's. */
export const FLOW_VISIT_FIELDS = ["tool", "minutes", "setupMinutes", "ratePerHour", "currency", "instruction"] as const;

type Rec = Record<string, unknown>;
export interface FlowDoc { name?: string; description?: string; of?: string; tools?: Rec[]; steps?: Rec[] }

const own = (o: Rec, keys: readonly string[]): Rec => {
  const out: Rec = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
const where = (tag: string, key: string, a: Rec) => `<${tag}${a[key] !== undefined ? ` ${key}=${JSON.stringify(a[key])}` : ""}>`;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function check(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

/** The refusals every language shares (Python `flows.py`, Rust `flows.rs` say the same). */
function money(a: Rec, at: string): void {
  check(a.ratePerHour === undefined || (isNum(a.ratePerHour) && a.ratePerHour >= 0), `${at}: ratePerHour is a number of at least 0 (money an hour)`);
  check(a.currency === undefined || (typeof a.currency === "string" && /^[A-Z]{3}$/.test(a.currency)), `${at}: currency is an ISO 4217 code (USD)`);
}

function checkTool(a: Rec): void {
  const at = where("tool", "id", a);
  check(typeof a.id === "string" && ID.test(a.id), `${at}: id is letters, digits, ".", "_" and "-"`);
  check(a.ref === undefined || (typeof a.ref === "string" && a.ref.trim()), `${at}: ref is a device definition, or an item or body of a 3D document (<file>#<id>)`);
  money(a, at);
}

function checkStep(t: DocTree): void {
  const a = t.attrs, at = where("step", "id", a);
  check(typeof a.id === "string" && ID.test(a.id), `${at}: id is letters, digits, ".", "_" and "-"`);
  check(a.order === undefined || (Number.isInteger(a.order) && (a.order as number) >= 1), `${at}: order is a whole number from 1`);
  check(a.kind === undefined || (FLOW_STEP_KINDS as readonly unknown[]).includes(a.kind), `${at}: kind must be one of ${FLOW_STEP_KINDS.join(", ")} (got ${JSON.stringify(a.kind)})`);
  for (const k of ["minutes", "setupMinutes"]) check(a[k] === undefined || (isNum(a[k]) && (a[k] as number) >= 0), `${at}: ${k} is a number of at least 0`);
  money(a, at);
  if (a.kind === "note")
    check(a.tool === undefined && (a.minutes === undefined || a.minutes === 0) && !t.children.length, `${at}: a note step names no tool, takes no time (minutes 0 or absent) and holds no param, measure or visit`);
  const names = t.children.filter((c) => c.tag === "param").map((c) => c.attrs.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  check(twice === undefined, `${at}: two params are named ${JSON.stringify(twice)}`);
  for (const c of t.children) {
    const b = c.attrs;
    if (c.tag === "param") {
      const pat = where("param", "name", b);
      check(typeof b.name === "string" && b.name.trim(), `${pat}: name says what the parameter is`);
      check(isNum(b.value) || typeof b.value === "string" || typeof b.value === "boolean", `${pat}: value is a number, a text or true/false`);
      check(b.unit === undefined || (typeof b.unit === "string" && b.unit.trim()), `${pat}: unit is a unit's symbol (rpm, sccm, mTorr, °C, s)`);
    } else if (c.tag === "visit") {
      const vat = `${at} ${where("visit", "tool", b)}`;
      check(typeof b.tool === "string" && ID.test(b.tool), `${vat}: tool is the id of one of the flow's tools`);
      for (const k of ["minutes", "setupMinutes"]) check(b[k] === undefined || (isNum(b[k]) && (b[k] as number) >= 0), `${vat}: ${k} is a number of at least 0`);
      money(b, vat);
    } else {
      const mat = where("measure", "id", b);
      check(typeof b.id === "string" && ID.test(b.id), `${mat}: id is letters, digits, ".", "_" and "-"`);
      for (const k of ["nominal", "min", "max", "plus", "minus"]) check(b[k] === undefined || isNum(b[k]), `${mat}: ${k} is a number`);
      for (const k of ["plus", "minus"]) check(b[k] === undefined || (b[k] as number) >= 0, `${mat}: ${k} is a number of at least 0`);
      check((b.plus === undefined && b.minus === undefined) || b.nominal !== undefined, `${mat}: plus and minus are tolerances of the nominal: give nominal`);
      check(b.min === undefined || b.max === undefined || (b.min as number) <= (b.max as number), `${mat}: min is at most max`);
    }
  }
}

function stepRecord(t: DocTree): Rec {
  const params = t.children.filter((c) => c.tag === "param").map((c) => ({ ...c.attrs }));
  const measures = t.children.filter((c) => c.tag === "measure").map((c) => ({ ...c.attrs }));
  const visits = t.children.filter((c) => c.tag === "visit").map((c) => ({ ...c.attrs }));
  return { ...t.attrs, ...(params.length ? { params } : {}), ...(measures.length ? { measures } : {}), ...(visits.length ? { visits } : {}) };
}

export const flowVocabulary: Vocabulary<FlowDoc> = {
  format: "flow",
  noun: "a process flow",
  root: "flow",
  tags: {
    flow: { parents: [], attrs: FLOW_FIELDS },
    tool: { parents: ["flow"], key: "id", required: ["id"], attrs: FLOW_TOOL_FIELDS },
    step: { parents: ["flow"], key: "id", required: ["id"], attrs: FLOW_STEP_FIELDS },
    param: { parents: ["step"], required: ["name", "value"], attrs: FLOW_PARAM_FIELDS },
    measure: { parents: ["step"], key: "id", required: ["id"], attrs: FLOW_MEASURE_FIELDS },
    visit: { parents: ["step"], required: ["tool"], attrs: FLOW_VISIT_FIELDS },
  },
  fromTree(t) {
    check(t.attrs.of === undefined || typeof t.attrs.of === "string", `<flow>: of is a ref to what the flow makes (a 3D document, or <file>#<item or body>)`);
    for (const c of t.children) (c.tag === "tool" ? checkTool(c.attrs) : checkStep(c));
    const measures = t.children.flatMap((c) => c.children.filter((m) => m.tag === "measure").map((m) => m.attrs.id));
    const again = measures.find((m, i) => measures.indexOf(m) !== i);
    check(again === undefined, `<measure id=${JSON.stringify(again)}>: two measures have this id (a ref names it as <file>#<id>)`);
    const tools = t.children.filter((c) => c.tag === "tool").map((c) => ({ ...c.attrs }));
    const steps = t.children.filter((c) => c.tag === "step").map(stepRecord);
    return { ...own(t.attrs, FLOW_FIELDS), ...(tools.length ? { tools } : {}), ...(steps.length ? { steps } : {}) };
  },
  toTree(d) {
    const doc = d as Rec;
    const tools = ((doc.tools as Rec[] | undefined) ?? []).map((r) => ({ tag: "tool", attrs: own(r, FLOW_TOOL_FIELDS), children: [] }));
    const steps = ((doc.steps as Rec[] | undefined) ?? []).map((s) => ({
      tag: "step",
      attrs: own(s, FLOW_STEP_FIELDS),
      children: [
        ...((s.params as Rec[] | undefined) ?? []).map((p) => ({ tag: "param", attrs: own(p, FLOW_PARAM_FIELDS), children: [] })),
        ...((s.measures as Rec[] | undefined) ?? []).map((m) => ({ tag: "measure", attrs: own(m, FLOW_MEASURE_FIELDS), children: [] })),
        ...((s.visits as Rec[] | undefined) ?? []).map((v) => ({ tag: "visit", attrs: own(v, FLOW_VISIT_FIELDS), children: [] })),
      ],
    }));
    return { tag: "flow", attrs: own(doc, FLOW_FIELDS), children: [...tools, ...steps] };
  },
  empty: (name) => ({ name }),
};

registerVocabulary(flowVocabulary);

/** The process flow's vocabulary, by format. */
export const FLOWS = { flow: flowVocabulary } as const;
