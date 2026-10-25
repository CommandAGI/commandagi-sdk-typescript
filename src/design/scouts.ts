/**
 * SCOUTS IN JSX — the two documents of CommandAGI's scouts (docs/scouts.md, in the CommandAGI repository). The Python
 * SDK's `scouts.py` and the Rust SDK's `scouts.rs` declare the same documents.
 *
 *   `<name>.scout.tsx`        one comparison to run: the configurations (a harness, a model, an effort, instructions)
 *                             measured on the same cases of each workload, and the rules of the verdict;
 *   `<name>.replacement.tsx`  what replacing a product would cost: its capabilities by layer, what we have of each,
 *                             the effort, the running cost and the labour of the rest, and the decision.
 *
 *   // scouts/comparisons/glm-against-sonnet.scout.tsx
 *   export default () => (
 *     <scout title="GLM-5.3 against Sonnet 5.5 on knowledge work" budget={10} repeats={3}>
 *       <configuration id="sonnet" model="anthropic/claude-sonnet-5-5" effort="low" incumbent />
 *       <configuration id="glm" model="dashscope/glm-5.3" />
 *       <workload id="knowledge" title="Knowledge work" sample={20}>
 *         <case id="rate" from="synthetic" prompt="…" check={{ number: 0.042, tolerance: 0.001 }} />
 *         <case id="page" from="own-run" source="runs/…" prompt="…" rubric="Names the price, the context and the terms." />
 *       </workload>
 *       <judge model="openai/gpt-5.6-terra" />
 *       <judge model="dashscope/qwen3.8-max" />
 *     </scout>
 *   );
 *
 *   // scouts/replacements/beehiiv.replacement.tsx
 *   export default () => (
 *     <replacement product="beehiiv" vendor="beehiiv, Inc." url="https://www.beehiiv.com" asOf="2026-10-14" by="scout">
 *       <layer kind="invisible" title="Deliverability">
 *         <capability id="auth" title="DKIM, SPF, DMARC-aligned custom domains" need="must" have="none" effort="M">
 *           <evidence source="beehiiv checklist" claim="reported" />
 *         </capability>
 *       </layer>
 *       <decision choice="skip" because="…" />
 *     </replacement>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are its attributes, verbatim. Nothing adds a
 * default: what the file does not say, the document does not have (the runner and the reader fill their own). Structure
 * and enums are checked here; the meaning (a model the catalog lists, a ref that resolves, the sums) is the reader's.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const SCOUT_FIELDS = ["title", "budget", "repeats", "margin", "relativeMargin", "errorFloor", "minCalls", "minCases", "resamples", "alpha", "seed", "maxCases", "readme"] as const;
export const CONFIGURATION_FIELDS = ["id", "model", "harness", "effort", "instructions", "maxTokens", "incumbent"] as const;
export const WORKLOAD_FIELDS = ["id", "title", "needs", "sample", "context"] as const;
export const CASE_FIELDS = ["id", "from", "prompt", "system", "check", "rubric", "tools", "turns", "source", "terms"] as const;
export const JUDGE_FIELDS = ["model", "effort"] as const;

/** Where a case's data came from (docs/scouts.md § the corpus). A customer's runs and third-party records are never cases. */
export const CASE_ORIGINS = ["public", "synthetic", "own-run"] as const;
/** What a workload needs of a model: a hard gate, never a score. */
export const WORKLOAD_NEEDS = ["tools", "structured", "image"] as const;
/**
 * The checks a case may name, cheapest first (a judge's rubric only where no check exists): the answer's text equal to
 * one (`exact`, `oneOf`), a number within `tolerance`, phrases it holds, a pattern, a JSON object it holds, a
 * multiple-choice `letter`, a Python `literal` (spaces and quotes aside), the first `tool` the model called, a
 * `program` (an arithmetic expression in `x` that maps each input to its output), or a `document` (the answer is one of
 * our documents in code, read by that document's own reader).
 */
export const CHECK_KINDS = ["exact", "oneOf", "number", "contains", "regex", "json", "letter", "literal", "tool", "program", "document"] as const;
/** The file names a `document` check reads: one our reader knows by its extension (`world.tsx`, `definition.py` …). */
export const DOCUMENT_FILE = /\.(?:[jt]sx|py|rs)$/i;

export interface ScoutConfiguration {
  id: string;
  /** The catalog's id (`anthropic/claude-sonnet-5-5`), or a candidate's (`paperinstruments/ultramarine-1-flash`). */
  model: string;
  /** How it is called: `api` (the provider's wire, as the platform calls it). */
  harness?: string;
  effort?: string;
  /** The system text every case of this configuration is sent with, before the case's own. */
  instructions?: string;
  maxTokens?: number;
  /** The configuration in use today: each other one is compared with it. */
  incumbent?: boolean;
}
export interface ScoutCheck {
  exact?: string;
  oneOf?: string[];
  number?: number;
  tolerance?: number;
  contains?: string[];
  regex?: string;
  json?: Record<string, unknown>;
  letter?: string;
  literal?: string;
  tool?: string;
  /** An arithmetic expression in `x` that maps each input to its output (within `tolerance`). */
  program?: { data: [number, number][]; tolerance?: number };
  /**
   * The answer is one of our documents in code, in the file `as` names (`world.tsx`, `definition.tsx`, `monitor.tsx`,
   * `<name>.task.tsx` …): it is read by that document's own reader, and must say what `expect` names — an object
   * matches by its fields, and a list of objects that each have an `id` matches by id in any order.
   */
  document?: { as: string; expect?: Record<string, unknown> };
}
/**
 * A tool a case offers the model. Its answers are the case's own: the first of `results` whose `when` holds of the
 * call's arguments (each a text the argument contains, case ignored), else "unknown". No tool runs.
 */
export interface ScoutTool {
  name: string;
  description?: string;
  /** The JSON Schema of its arguments. */
  parameters: Record<string, unknown>;
  results?: { when?: Record<string, string>; result: string }[];
}
export interface ScoutCase {
  id: string;
  from: (typeof CASE_ORIGINS)[number];
  prompt: string;
  system?: string;
  check?: ScoutCheck;
  rubric?: string;
  /** The tools offered: the case is a conversation of up to `turns` model turns (5 when absent). */
  tools?: ScoutTool[];
  turns?: number;
  /** Its lineage: the run and record it was drawn from, or the dataset and row. */
  source?: string;
  /** The terms of the data in it (docs/records.md § 5). */
  terms?: string[];
}
export interface ScoutWorkload {
  id: string;
  title?: string;
  needs?: (typeof WORKLOAD_NEEDS)[number][];
  /** How many of its cases a run starts with; an undecided verdict doubles it, up to the cases there are. */
  sample?: number;
  /** The context, in tokens, a model must take. */
  context?: number;
  cases: ScoutCase[];
}
export interface ScoutJudge {
  model: string;
  effort?: string;
}
export interface ScoutDoc {
  title?: string;
  /** The most a run may spend, in USD (list prices of the calls it makes). */
  budget: number;
  repeats?: number;
  /** The non-inferiority margin of quality and reliability, in points of 100. */
  margin?: number;
  /** The non-inferiority margin of cost and latency, as a share of the incumbent's. */
  relativeMargin?: number;
  /** The most errors a configuration may answer with, as a share of its calls. */
  errorFloor?: number;
  /** The fewest calls the error gate is judged on. */
  minCalls?: number;
  /** The fewest shared cases a verdict is given on; fewer is undecided. */
  minCases?: number;
  resamples?: number;
  alpha?: number;
  seed?: number;
  maxCases?: number;
  readme?: string;
  configurations: ScoutConfiguration[];
  workloads: ScoutWorkload[];
  judges: ScoutJudge[];
}

export const REPLACEMENT_FIELDS = ["product", "vendor", "url", "asOf", "by", "readme"] as const;
export const LAYER_FIELDS = ["kind", "title"] as const;
export const CAPABILITY_FIELDS = ["id", "title", "need", "have", "effort", "run", "labour", "ref", "note"] as const;
export const EVIDENCE_FIELDS = ["source", "claim"] as const;
export const DECISION_FIELDS = ["choice", "because"] as const;
export const ECONOMICS_FIELDS = ["price", "customers", "margin", "note"] as const;

export const LAYER_KINDS = ["visible", "invisible", "integrations", "operations", "economics"] as const;
export const CAPABILITY_NEEDS = ["must", "should", "later"] as const;
export const CAPABILITY_HAVES = ["built", "partial", "none"] as const;
export const CAPABILITY_EFFORTS = ["S", "M", "L", "XL"] as const;
export const EVIDENCE_CLAIMS = ["verified", "checked", "reported"] as const;
export const DECISION_CHOICES = ["build", "buy", "integrate", "skip"] as const;

export interface ReplacementEvidence {
  source: string;
  claim: (typeof EVIDENCE_CLAIMS)[number];
}
export interface ReplacementCapability {
  id: string;
  title: string;
  /** For the job we would do, not for parity. */
  need: (typeof CAPABILITY_NEEDS)[number];
  /** What CommandAGI has now; `ref` says where. */
  have: (typeof CAPABILITY_HAVES)[number];
  /** To build what is missing. */
  effort?: (typeof CAPABILITY_EFFORTS)[number];
  /** USD a month to operate it (third parties). */
  run?: number;
  /** Hours a month of people or agents. */
  labour?: number;
  ref?: string;
  /** What a number cannot say ("ESP or own MTAs", "ops on call"). */
  note?: string;
  evidence: ReplacementEvidence[];
}
export interface ReplacementLayer {
  kind: (typeof LAYER_KINDS)[number];
  title: string;
  capabilities: ReplacementCapability[];
}
export interface ReplacementDoc {
  product: string;
  vendor?: string;
  url?: string;
  asOf: string;
  by?: string;
  readme?: string;
  layers: ReplacementLayer[];
  decision?: { choice: (typeof DECISION_CHOICES)[number]; because: string };
  differentiation?: string;
  economics?: { price?: string; customers?: string; margin?: string; note?: string };
}

const said = (attrs: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]]));
const nothing = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const attrsOf = (o: object, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => !nothing((o as Record<string, unknown>)[k])).map((k) => [k, (o as Record<string, unknown>)[k]]));
const leaf = (tag: string, attrs: Record<string, unknown>, children: DocTree[] = []): DocTree => ({ tag, attrs, children });
const where = (t: DocTree) => `<${t.tag}${typeof t.attrs.id === "string" ? ` id="${t.attrs.id}"` : ""}>`;

function text(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && (typeof v !== "string" || !v)) throw new Error(`${where(t)} ${k} is text, not ${JSON.stringify(v)}`);
}
function positive(t: DocTree, k: string, { integer = false, zero = false } = {}): void {
  const v = t.attrs[k];
  if (v === undefined) return;
  if (typeof v !== "number" || !Number.isFinite(v) || (zero ? v < 0 : v <= 0) || (integer && !Number.isInteger(v)))
    throw new Error(`${where(t)} ${k} is a ${integer ? "whole " : ""}number${zero ? " of 0 or more" : " above 0"}, not ${JSON.stringify(v)}`);
}
function oneOf(t: DocTree, k: string, allowed: readonly string[]): void {
  const v = t.attrs[k];
  if (v !== undefined && !allowed.includes(v as string)) throw new Error(`${where(t)} ${k} is one of ${allowed.join(", ")}, not ${JSON.stringify(v)}`);
}

function checkOf(t: DocTree): void {
  const c = t.attrs.check;
  if (c === undefined) return;
  if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error(`${where(t)} check is an object ({ exact: "42" }), not ${JSON.stringify(c)}`);
  const kinds = Object.keys(c).filter((k) => k !== "tolerance");
  if (kinds.length !== 1 || !CHECK_KINDS.includes(kinds[0] as (typeof CHECK_KINDS)[number]))
    throw new Error(`${where(t)} check is exactly one of ${CHECK_KINDS.join(", ")}${kinds.length ? ` (it has ${kinds.join(" and ")})` : ""}`);
  const x = c as ScoutCheck;
  if ("tolerance" in x && kinds[0] !== "number") throw new Error(`${where(t)} check: tolerance goes with number`);
  if (x.number !== undefined && (typeof x.number !== "number" || !Number.isFinite(x.number) || (x.tolerance !== undefined && !(typeof x.tolerance === "number" && x.tolerance >= 0))))
    throw new Error(`${where(t)} check: number and tolerance are numbers`);
  if (x.exact !== undefined && typeof x.exact !== "string") throw new Error(`${where(t)} check: exact is text`);
  for (const k of ["oneOf", "contains"] as const)
    if (x[k] !== undefined && !(Array.isArray(x[k]) && x[k]!.length && x[k]!.every((s) => typeof s === "string" && s))) throw new Error(`${where(t)} check: ${k} is a list of texts`);
  if (x.regex !== undefined) {
    if (typeof x.regex !== "string" || !x.regex) throw new Error(`${where(t)} check: regex is text`);
    try {
      new RegExp(x.regex);
    } catch {
      throw new Error(`${where(t)} check: regex ${JSON.stringify(x.regex)} is not a regular expression`);
    }
  }
  if (x.json !== undefined && (!x.json || typeof x.json !== "object" || Array.isArray(x.json))) throw new Error(`${where(t)} check: json is the object the answer must hold`);
  if (x.letter !== undefined && !(typeof x.letter === "string" && /^[A-Z]$/.test(x.letter))) throw new Error(`${where(t)} check: letter is one capital letter`);
  for (const k of ["literal", "tool"] as const) if (x[k] !== undefined && !(typeof x[k] === "string" && x[k])) throw new Error(`${where(t)} check: ${k} is text`);
  if (x.tool !== undefined && t.attrs.tools === undefined) throw new Error(`${where(t)} check: tool needs the case's tools`);
  if (x.program !== undefined) {
    const p = x.program;
    if (!p || typeof p !== "object" || !Array.isArray(p.data) || !p.data.length || !p.data.every((d) => Array.isArray(d) && d.length === 2 && d.every((n) => typeof n === "number" && Number.isFinite(n))))
      throw new Error(`${where(t)} check: program is { data: [[x, y], …] }`);
    if (p.tolerance !== undefined && !(typeof p.tolerance === "number" && p.tolerance >= 0)) throw new Error(`${where(t)} check: program tolerance is a number of 0 or more`);
  }
  if (x.document !== undefined) {
    const d = x.document;
    if (!d || typeof d !== "object" || typeof d.as !== "string" || !DOCUMENT_FILE.test(d.as))
      throw new Error(`${where(t)} check: document is { as: "world.tsx", expect? } — the file a document's own reader knows by its extension`);
    if (d.expect !== undefined && (!d.expect || typeof d.expect !== "object" || Array.isArray(d.expect))) throw new Error(`${where(t)} check: document expect is the object the document must hold`);
  }
}

function toolsOf(t: DocTree): void {
  const tools = t.attrs.tools;
  if (tools === undefined) return;
  if (!Array.isArray(tools) || !tools.length) throw new Error(`${where(t)} tools is a list of { name, parameters, results }`);
  const names = new Set<string>();
  for (const tool of tools as ScoutTool[]) {
    if (!tool || typeof tool.name !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(tool.name)) throw new Error(`${where(t)} a tool's name is a word of letters, digits, _ and -`);
    if (names.has(tool.name)) throw new Error(`${where(t)} has two tools named ${tool.name}`);
    names.add(tool.name);
    if (!tool.parameters || typeof tool.parameters !== "object" || Array.isArray(tool.parameters)) throw new Error(`${where(t)} tool ${tool.name}: parameters is a JSON Schema object`);
    for (const r of tool.results ?? [])
      if (!r || typeof r.result !== "string" || (r.when !== undefined && (typeof r.when !== "object" || Array.isArray(r.when) || !Object.values(r.when).every((v) => typeof v === "string"))))
        throw new Error(`${where(t)} tool ${tool.name}: a result is { when?: { <argument>: <text it contains> }, result: <text> }`);
  }
  positive(t, "turns", { integer: true });
}

function caseOf(t: DocTree): ScoutCase {
  for (const k of ["id", "prompt", "system", "rubric", "source"]) text(t, k);
  oneOf(t, "from", CASE_ORIGINS);
  checkOf(t);
  toolsOf(t);
  if (t.attrs.turns !== undefined && t.attrs.tools === undefined) throw new Error(`${where(t)} turns goes with tools`);
  if ((t.attrs.check === undefined) === (t.attrs.rubric === undefined))
    throw new Error(`${where(t)} is scored by exactly one of check (a program) or rubric (a judge panel)`);
  const terms = t.attrs.terms;
  if (terms !== undefined && !(Array.isArray(terms) && terms.every((s) => typeof s === "string" && s))) throw new Error(`${where(t)} terms is a list of term ids`);
  return said(t.attrs, CASE_FIELDS) as unknown as ScoutCase;
}

function scoutOf(t: DocTree): ScoutDoc {
  text(t, "title");
  text(t, "readme");
  positive(t, "budget");
  for (const k of ["repeats", "minCalls", "minCases", "resamples", "maxCases"]) positive(t, k, { integer: true });
  for (const k of ["margin", "relativeMargin", "errorFloor"]) positive(t, k, { zero: true });
  positive(t, "alpha");
  if (typeof t.attrs.alpha === "number" && t.attrs.alpha >= 1) throw new Error(`<scout> alpha is below 1`);
  if (t.attrs.seed !== undefined && !Number.isSafeInteger(t.attrs.seed)) throw new Error(`<scout> seed is a whole number`);
  const parts = (tag: string) => t.children.filter((c) => c.tag === tag);
  const configurations = parts("configuration").map((c) => {
    for (const k of ["id", "model", "harness", "effort", "instructions"]) text(c, k);
    positive(c, "maxTokens", { integer: true });
    if (c.attrs.incumbent !== undefined && typeof c.attrs.incumbent !== "boolean") throw new Error(`${where(c)} incumbent is true or false`);
    return said(c.attrs, CONFIGURATION_FIELDS) as unknown as ScoutConfiguration;
  });
  if (configurations.filter((c) => c.incumbent).length > 1) throw new Error(`<scout> has one incumbent configuration`);
  const workloads = parts("workload").map((w) => {
    text(w, "id");
    text(w, "title");
    positive(w, "sample", { integer: true });
    positive(w, "context", { integer: true });
    const needs = w.attrs.needs;
    if (needs !== undefined && !(Array.isArray(needs) && needs.every((n) => WORKLOAD_NEEDS.includes(n as (typeof WORKLOAD_NEEDS)[number]))))
      throw new Error(`${where(w)} needs is a list of ${WORKLOAD_NEEDS.join(", ")}`);
    return { ...(said(w.attrs, WORKLOAD_FIELDS) as Omit<ScoutWorkload, "cases">), cases: w.children.map(caseOf) };
  });
  const judges = parts("judge").map((j) => {
    text(j, "model");
    text(j, "effort");
    return said(j.attrs, JUDGE_FIELDS) as unknown as ScoutJudge;
  });
  return { ...(said(t.attrs, SCOUT_FIELDS) as Omit<ScoutDoc, "configurations" | "workloads" | "judges">), configurations, workloads, judges };
}

export const scoutVocabulary: Vocabulary<ScoutDoc> = {
  format: "scout",
  noun: "a scout's comparison",
  root: "scout",
  tags: {
    scout: { parents: [], required: ["budget"], attrs: SCOUT_FIELDS },
    configuration: { parents: ["scout"], key: "id", required: ["id", "model"], attrs: CONFIGURATION_FIELDS },
    workload: { parents: ["scout"], key: "id", required: ["id"], attrs: WORKLOAD_FIELDS },
    case: { parents: ["workload"], key: "id", required: ["id", "from", "prompt"], attrs: CASE_FIELDS },
    judge: { parents: ["scout"], key: "model", required: ["model"], attrs: JUDGE_FIELDS },
  },
  fromTree: scoutOf,
  toTree: (s) =>
    leaf("scout", attrsOf(s, SCOUT_FIELDS), [
      ...(s.configurations ?? []).map((c) => leaf("configuration", attrsOf(c, CONFIGURATION_FIELDS))),
      ...(s.workloads ?? []).map((w) => leaf("workload", attrsOf(w, WORKLOAD_FIELDS), (w.cases ?? []).map((c) => leaf("case", attrsOf(c, CASE_FIELDS))))),
      ...(s.judges ?? []).map((j) => leaf("judge", attrsOf(j, JUDGE_FIELDS))),
    ]),
};

function replacementOf(t: DocTree): ReplacementDoc {
  for (const k of ["product", "vendor", "url", "by", "readme"]) text(t, k);
  if (typeof t.attrs.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.attrs.asOf)) throw new Error(`<replacement> asOf is a day (2026-10-14), not ${JSON.stringify(t.attrs.asOf)}`);
  const parts = (tag: string) => t.children.filter((c) => c.tag === tag);
  const layers = parts("layer").map((l) => {
    oneOf(l, "kind", LAYER_KINDS);
    text(l, "title");
    return {
      ...(said(l.attrs, LAYER_FIELDS) as Omit<ReplacementLayer, "capabilities">),
      capabilities: l.children.map((c) => {
        for (const k of ["id", "title", "ref", "note"]) text(c, k);
        oneOf(c, "need", CAPABILITY_NEEDS);
        oneOf(c, "have", CAPABILITY_HAVES);
        oneOf(c, "effort", CAPABILITY_EFFORTS);
        positive(c, "run", { zero: true });
        positive(c, "labour", { zero: true });
        return {
          ...(said(c.attrs, CAPABILITY_FIELDS) as Omit<ReplacementCapability, "evidence">),
          evidence: c.children.map((e) => {
            text(e, "source");
            oneOf(e, "claim", EVIDENCE_CLAIMS);
            return said(e.attrs, EVIDENCE_FIELDS) as unknown as ReplacementEvidence;
          }),
        };
      }),
    };
  });
  const decision = parts("decision")[0];
  if (decision) {
    oneOf(decision, "choice", DECISION_CHOICES);
    text(decision, "because");
  }
  const differentiation = parts("differentiation")[0];
  if (differentiation) text(differentiation, "text");
  const economics = parts("economics")[0];
  if (economics) for (const k of ECONOMICS_FIELDS) text(economics, k);
  return {
    ...(said(t.attrs, REPLACEMENT_FIELDS) as Omit<ReplacementDoc, "layers">),
    layers,
    ...(decision ? { decision: said(decision.attrs, DECISION_FIELDS) as ReplacementDoc["decision"] } : {}),
    ...(differentiation ? { differentiation: differentiation.attrs.text as string } : {}),
    ...(economics ? { economics: said(economics.attrs, ECONOMICS_FIELDS) } : {}),
  };
}

export const replacementVocabulary: Vocabulary<ReplacementDoc> = {
  format: "replacement",
  noun: "a replacement-cost analysis",
  root: "replacement",
  tags: {
    replacement: { parents: [], required: ["product", "asOf"], attrs: REPLACEMENT_FIELDS },
    // Two layers may be of one kind (the visible editor and the visible website): a layer is told apart by its title.
    layer: { parents: ["replacement"], key: "title", required: ["kind", "title"], attrs: LAYER_FIELDS },
    capability: { parents: ["layer"], key: "id", required: ["id", "title", "need", "have"], attrs: CAPABILITY_FIELDS },
    evidence: { parents: ["capability"], key: "source", required: ["source", "claim"], attrs: EVIDENCE_FIELDS },
    decision: { parents: ["replacement"], single: true, required: ["choice", "because"], attrs: DECISION_FIELDS },
    differentiation: { parents: ["replacement"], single: true, required: ["text"], attrs: ["text"] },
    economics: { parents: ["replacement"], single: true, attrs: ECONOMICS_FIELDS },
  },
  fromTree: replacementOf,
  toTree: (r) =>
    leaf("replacement", attrsOf(r, REPLACEMENT_FIELDS), [
      ...(r.layers ?? []).map((l) =>
        leaf("layer", attrsOf(l, LAYER_FIELDS), (l.capabilities ?? []).map((c) => leaf("capability", attrsOf(c, CAPABILITY_FIELDS), (c.evidence ?? []).map((e) => leaf("evidence", attrsOf(e, EVIDENCE_FIELDS))))))),
      ...(r.decision ? [leaf("decision", attrsOf(r.decision, DECISION_FIELDS))] : []),
      ...(r.differentiation ? [leaf("differentiation", { text: r.differentiation })] : []),
      ...(r.economics && Object.keys(attrsOf(r.economics, ECONOMICS_FIELDS)).length ? [leaf("economics", attrsOf(r.economics, ECONOMICS_FIELDS))] : []),
    ]),
};

for (const v of [scoutVocabulary, replacementVocabulary]) registerVocabulary(v);

/** The vocabularies of the scouts, by format. */
export const SCOUTS = { scout: scoutVocabulary, replacement: replacementVocabulary } as const;
