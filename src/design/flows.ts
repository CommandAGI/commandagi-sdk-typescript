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
 *
 * A WORKFLOW IS THE SAME DOCUMENT: a step whose `kind` is an action acts on any channel (a message to a person, a
 * terminal command, a computer action, a robot command) or calls another workflow, a frozen chain, an agent or a
 * decision model. Its `after` names the steps it follows (the graph's edges, space separated), an `<expect>` says what
 * must be observed after it, and `surprise` says where a surprise goes (the parent workflow, an agent, a person).
 * A root `<input>` declares a typed value the run binds; a step's param refers to it as `${input:name}` (a secret from
 * the secret store is `${env:NAME}`), so the document holds the reference, never the value (docs/workflows.md).
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** What a step is: work (it takes time on a tool, by someone), a note (context), or an action on a channel. */
export const FLOW_STEP_KINDS = ["work", "note", "message", "command", "computer", "robot", "chain", "workflow", "decision", "agent"] as const;
/** The kinds that act, with what each must state. */
export const FLOW_ACTION_KINDS = ["message", "command", "computer", "robot", "chain", "workflow", "decision", "agent"] as const;
export const FLOW_INPUT_TYPES = ["text", "number", "boolean"] as const;
/** Where a surprise goes: up to the parent workflow, to an agent, or to a person. */
export const FLOW_SURPRISE = ["parent", "agent", "person"] as const;

export const FLOW_FIELDS = ["name", "description", "of"] as const;
export const FLOW_INPUT_FIELDS = ["name", "type", "private", "default", "required", "description"] as const;
export const FLOW_TOOL_FIELDS = ["id", "ref", "name", "ratePerHour", "currency", "description"] as const;
export const FLOW_STEP_FIELDS = ["id", "order", "kind", "tool", "fixture", "by", "minutes", "setupMinutes", "ratePerHour", "currency", "instruction", "note", "channel", "ref", "command", "after", "surprise", "surpriseTo"] as const;
export const FLOW_PARAM_FIELDS = ["name", "value", "unit", "description"] as const;
export const FLOW_MEASURE_FIELDS = ["id", "name", "nominal", "min", "max", "plus", "minus", "unit", "method", "sampling", "acceptance"] as const;
/** One more tool a step goes to: its time there, and its rate when it is not the tool's. */
export const FLOW_VISIT_FIELDS = ["tool", "minutes", "setupMinutes", "ratePerHour", "currency", "instruction"] as const;
/** What must be observed after a step: the observation, what it should equal, a tolerance, and how long it may take. */
export const FLOW_EXPECT_FIELDS = ["name", "equals", "tolerance", "within"] as const;

type Rec = Record<string, unknown>;
export interface FlowDoc { name?: string; description?: string; of?: string; inputs?: Rec[]; tools?: Rec[]; steps?: Rec[] }

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

/** A typed input a run binds: its type, whether it is private (held out of the document), its default and whether a run must give it. */
function checkInput(a: Rec): void {
  const at = where("input", "name", a);
  check(typeof a.name === "string" && ID.test(a.name), `${at}: name is letters, digits, ".", "_" and "-"`);
  check(a.type === undefined || (FLOW_INPUT_TYPES as readonly unknown[]).includes(a.type), `${at}: type is one of ${FLOW_INPUT_TYPES.join(", ")} (got ${JSON.stringify(a.type)})`);
  for (const k of ["private", "required"]) check(a[k] === undefined || typeof a[k] === "boolean", `${at}: ${k} is true or false`);
  check(!(a.private === true && a.default !== undefined), `${at}: a private input states no default: its value is bound by the run and never written in the document`);
  check(a.default === undefined || (a.type === "number" ? isNum(a.default) : a.type === "boolean" ? typeof a.default === "boolean" : typeof a.default === "string"), `${at}: default is a ${a.type ?? "text"} (the input's type)`);
}

/** The placeholders in a text: `${input:name}` (a typed input) and `${env:NAME}` (the host's secret store). */
function placeholders(s: string): { kind: string; name: string }[] {
  return [...s.matchAll(/\$\{([^}]*)\}/g)].map((m) => {
    const inner = m[1] ?? "";
    const i = inner.indexOf(":");
    return i < 0 ? { kind: "", name: inner } : { kind: inner.slice(0, i), name: inner.slice(i + 1) };
  });
}

function checkBound(value: unknown, at: string, inputs: ReadonlySet<string>): void {
  if (typeof value !== "string") return;
  for (const p of placeholders(value)) {
    const ok = (p.kind === "input" && inputs.has(p.name)) || (p.kind === "env" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name));
    check(ok, `${at}: ${"${"}${p.kind ? `${p.kind}:` : ""}${p.name}} is not a bound value: name a declared input (${[...inputs].join(", ") || "none declared"}) as ${"${"}input:name}, or the secret store as ${"${"}env:NAME}`);
  }
}

/** What an action step must state, per kind. */
const ACTION_NEEDS: Record<string, readonly string[]> = {
  message: ["channel", "instruction"],
  command: ["channel", "command"],
  computer: ["channel", "instruction"],
  robot: ["channel", "command"],
  chain: ["ref"],
  workflow: ["ref"],
  decision: ["instruction"],
  agent: ["ref", "instruction"],
};

function checkStep(t: DocTree): void {
  const a = t.attrs, at = where("step", "id", a);
  check(typeof a.id === "string" && ID.test(a.id), `${at}: id is letters, digits, ".", "_" and "-"`);
  check(a.order === undefined || (Number.isInteger(a.order) && (a.order as number) >= 1), `${at}: order is a whole number from 1`);
  check(a.kind === undefined || (FLOW_STEP_KINDS as readonly unknown[]).includes(a.kind), `${at}: kind must be one of ${FLOW_STEP_KINDS.join(", ")} (got ${JSON.stringify(a.kind)})`);
  for (const k of ["minutes", "setupMinutes"]) check(a[k] === undefined || (isNum(a[k]) && (a[k] as number) >= 0), `${at}: ${k} is a number of at least 0`);
  money(a, at);
  if (a.kind === "note")
    check(a.tool === undefined && (a.minutes === undefined || a.minutes === 0) && !t.children.length, `${at}: a note step names no tool, takes no time (minutes 0 or absent) and holds no param, measure, visit or expect`);
  const action = (FLOW_ACTION_KINDS as readonly unknown[]).includes(a.kind);
  if (action) {
    const says = (n: string) => n === "instruction" ? "its instruction" : n === "channel" ? "its channel" : n === "command" ? "its command" : "what it calls (ref)";
    const missing = (ACTION_NEEDS[a.kind as string] ?? []).filter((n) => a[n] === undefined).map(says);
    check(!missing.length, `${at}: a ${a.kind} step states ${missing.join(" and ")}`);
    check(a.tool === undefined && a.by === undefined && a.fixture === undefined, `${at}: an action step names no tool, no fixture and no by: it acts on its channel (or calls what its ref names)`);
    check(!t.children.some((c) => c.tag === "visit" || c.tag === "measure"), `${at}: an action step takes no visit or measure: say what must be observed after it in an <expect>`);
    check(!(a.kind === "chain" || a.kind === "workflow") || (typeof a.ref === "string" && a.ref.trim()), `${at}: a ${a.kind} step names the ${a.kind} it calls (ref)`);
    const expects = t.children.filter((c) => c.tag === "expect");
    check(expects.length > 0, `${at}: an action step declares what must be observed after it (<expect name equals>)`);
    check(a.surprise !== undefined, `${at}: an action step says where a surprise goes (surprise: parent, agent or person)`);
  }
  check(a.surprise === undefined || (FLOW_SURPRISE as readonly unknown[]).includes(a.surprise), `${at}: surprise is one of ${FLOW_SURPRISE.join(", ")} (got ${JSON.stringify(a.surprise)})`);
  check(a.surprise === undefined || a.surprise === "parent" || (typeof a.surpriseTo === "string" && a.surpriseTo.trim()), `${at}: surprise ${JSON.stringify(a.surprise)} names who handles it (surpriseTo: an agent or a person)`);
  check(a.surprise !== "parent" || a.surpriseTo === undefined, `${at}: a surprise that goes to the parent names no surpriseTo`);
  if (a.after !== undefined) {
    check(typeof a.after === "string" && a.after.trim(), `${at}: after names the steps this one follows (their ids, space separated)`);
    const ids = typeof a.after === "string" ? a.after.trim().split(/\s+/) : [];
    for (const id of ids) check(ID.test(id), `${at}: after names a step's id (got ${JSON.stringify(id)})`);
    check(!ids.includes(a.id as string), `${at}: after does not name the step itself`);
    check(ids.length === new Set(ids).size, `${at}: after names a step twice`);
  }
  const names = t.children.filter((c) => c.tag === "param").map((c) => c.attrs.name);
  const twice = names.find((n, i) => names.indexOf(n) !== i);
  check(twice === undefined, `${at}: two params are named ${JSON.stringify(twice)}`);
  const expectNames = t.children.filter((c) => c.tag === "expect").map((c) => c.attrs.name);
  const expectTwice = expectNames.find((n, i) => expectNames.indexOf(n) !== i);
  check(expectTwice === undefined, `${at}: two expects are named ${JSON.stringify(expectTwice)}`);
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
    } else if (c.tag === "expect") {
      const eat = where("expect", "name", b);
      check(typeof b.name === "string" && b.name.trim(), `${eat}: name says what is observed (a screen, an exit code, a reply)`);
      check(isNum(b.equals) || typeof b.equals === "string" || typeof b.equals === "boolean", `${eat}: equals is the value the observation must have (a number, a text or true/false)`);
      check(b.tolerance === undefined || (isNum(b.tolerance) && (b.tolerance as number) >= 0), `${eat}: tolerance is a number of at least 0`);
      check(b.tolerance === undefined || isNum(b.equals), `${eat}: a tolerance holds of a number: equals is not a number`);
      check(b.within === undefined || (isNum(b.within) && (b.within as number) > 0), `${eat}: within is a number of seconds, more than 0`);
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
  const expects = t.children.filter((c) => c.tag === "expect").map((c) => ({ ...c.attrs }));
  return { ...t.attrs, ...(params.length ? { params } : {}), ...(measures.length ? { measures } : {}), ...(visits.length ? { visits } : {}), ...(expects.length ? { expects } : {}) };
}

export const flowVocabulary: Vocabulary<FlowDoc> = {
  format: "flow",
  noun: "a process flow",
  root: "flow",
  tags: {
    flow: { parents: [], attrs: FLOW_FIELDS },
    input: { parents: ["flow"], key: "name", required: ["name"], attrs: FLOW_INPUT_FIELDS },
    tool: { parents: ["flow"], key: "id", required: ["id"], attrs: FLOW_TOOL_FIELDS },
    step: { parents: ["flow"], key: "id", required: ["id"], attrs: FLOW_STEP_FIELDS },
    param: { parents: ["step"], required: ["name", "value"], attrs: FLOW_PARAM_FIELDS },
    measure: { parents: ["step"], key: "id", required: ["id"], attrs: FLOW_MEASURE_FIELDS },
    visit: { parents: ["step"], required: ["tool"], attrs: FLOW_VISIT_FIELDS },
    expect: { parents: ["step"], required: ["name", "equals"], attrs: FLOW_EXPECT_FIELDS },
  },
  fromTree(t) {
    check(t.attrs.of === undefined || typeof t.attrs.of === "string", `<flow>: of is a ref to what the flow makes (a 3D document, or <file>#<item or body>)`);
    for (const c of t.children) if (c.tag === "input") checkInput(c.attrs);
    const inputs = new Set(t.children.filter((c) => c.tag === "input").map((c) => c.attrs.name as string));
    for (const c of t.children) {
      if (c.tag === "tool") checkTool(c.attrs);
      else if (c.tag === "step") {
        checkStep(c);
        const sat = where("step", "id", c.attrs);
        for (const b of c.children) if (b.tag === "param") checkBound(b.attrs.value, where("param", "name", b.attrs), inputs);
        checkBound(c.attrs.command, sat, inputs);
        checkBound(c.attrs.instruction, sat, inputs);
      }
    }
    const stepIds = t.children.filter((c) => c.tag === "step").map((c) => c.attrs.id);
    for (const c of t.children.filter((c) => c.tag === "step"))
      for (const id of typeof c.attrs.after === "string" ? c.attrs.after.trim().split(/\s+/) : [])
        check(stepIds.includes(id), `${where("step", "id", c.attrs)}: after names the step ${JSON.stringify(id)}, which this flow does not declare`);
    const measures = t.children.flatMap((c) => c.children.filter((m) => m.tag === "measure").map((m) => m.attrs.id));
    const again = measures.find((m, i) => measures.indexOf(m) !== i);
    check(again === undefined, `<measure id=${JSON.stringify(again)}>: two measures have this id (a ref names it as <file>#<id>)`);
    const declared = t.children.filter((c) => c.tag === "input").map((c) => ({ ...c.attrs }));
    const tools = t.children.filter((c) => c.tag === "tool").map((c) => ({ ...c.attrs }));
    const steps = t.children.filter((c) => c.tag === "step").map(stepRecord);
    return { ...own(t.attrs, FLOW_FIELDS), ...(declared.length ? { inputs: declared } : {}), ...(tools.length ? { tools } : {}), ...(steps.length ? { steps } : {}) };
  },
  toTree(d) {
    const doc = d as Rec;
    const inputs = ((doc.inputs as Rec[] | undefined) ?? []).map((r) => ({ tag: "input", attrs: own(r, FLOW_INPUT_FIELDS), children: [] }));
    const tools = ((doc.tools as Rec[] | undefined) ?? []).map((r) => ({ tag: "tool", attrs: own(r, FLOW_TOOL_FIELDS), children: [] }));
    const steps = ((doc.steps as Rec[] | undefined) ?? []).map((s) => ({
      tag: "step",
      attrs: own(s, FLOW_STEP_FIELDS),
      children: [
        ...((s.params as Rec[] | undefined) ?? []).map((p) => ({ tag: "param", attrs: own(p, FLOW_PARAM_FIELDS), children: [] })),
        ...((s.measures as Rec[] | undefined) ?? []).map((m) => ({ tag: "measure", attrs: own(m, FLOW_MEASURE_FIELDS), children: [] })),
        ...((s.visits as Rec[] | undefined) ?? []).map((v) => ({ tag: "visit", attrs: own(v, FLOW_VISIT_FIELDS), children: [] })),
        ...((s.expects as Rec[] | undefined) ?? []).map((e) => ({ tag: "expect", attrs: own(e, FLOW_EXPECT_FIELDS), children: [] })),
      ],
    }));
    return { tag: "flow", attrs: own(doc, FLOW_FIELDS), children: [...inputs, ...tools, ...steps] };
  },
  empty: (name) => ({ name }),
};

registerVocabulary(flowVocabulary);

/** The process flow's vocabulary, by format. */
export const FLOWS = { flow: flowVocabulary } as const;
