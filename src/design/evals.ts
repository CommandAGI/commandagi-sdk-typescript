/**
 * AN EVAL AND A METRIC IN JSX — `<name>.eval.tsx` and `<name>.metric.tsx` (docs/formats.md § an eval and a metric in
 * code, in the CommandAGI repository). An eval declares one `<eval>`, each of its cases one `<case>`; a metric declares
 * one `<metric>`. A record is an element and its fields are its attributes, verbatim:
 *
 *   // Evals/Yard shakedown.eval.tsx
 *   export default () => (
 *     <eval domain="robot" slug="yard-shakedown" version="3" metrics={["Fleet availability.metric.tsx"]} repeats={3}>
 *       <case slug="undock-and-lap" name="Undock and lap" task="../Tasks/Undock and lap.task.tsx" environment={{ kind: "synthetic", seed: 41 }} />
 *       <case slug="open-a-terminal" name="Open a terminal" instruction="Open a terminal window." timeLimitMs={120000} environment={{ kind: "none" }} />
 *     </eval>
 *   );
 *
 *   // Evals/Fleet availability.metric.tsx
 *   export default () => <metric slug="fleet-availability" probe={{ kind: "event", eventKind: "telemetry" }} aggregation="rate" />;
 *
 * References are refs: a path relative to the eval file's folder, or an absolute address (`cloud://home/<uuid>/…`).
 * `metrics` names the metric files the eval reads; a case's `task` names the `.task.tsx` whose title and text the agent
 * is handed, read when the case runs. A case with no task file says its `instruction` itself; a case says one of the
 * two. `acceptance`, `acceptanceMetric` (a ref to a metric file), `hints`, `maxSteps` and `timeLimitMs` judge and bound
 * the case either way.
 *
 * `frozen` is the digest an eval is frozen at (`sha256:<hex>`, written by the platform when it publishes the eval): the
 * reader computes the digest of what the eval grades by (its declaration and the tasks and metrics it names) and
 * refuses to run an eval that no longer matches it. A file has no format version; nothing adds a default: what the file
 * does not say, the document does not have (the platform's schema fills its defaults when it reads the document). The
 * Python SDK's `evals.py` and the Rust SDK's `evals.rs` declare the same documents.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const EVAL_FIELDS = ["domain", "slug", "version", "description", "metrics", "scoring", "objective", "axes", "repeats", "published", "frozen", "official", "rung", "provenance"] as const;
export const EVAL_CASE_FIELDS = ["slug", "name", "task", "instruction", "acceptance", "acceptanceMetric", "hints", "maxSteps", "timeLimitMs", "environment", "config", "seed", "weight", "tags"] as const;
export const METRIC_FIELDS = ["slug", "description", "probe", "aggregation", "role", "direction", "unit", "target", "pass", "threadId"] as const;
/** The form of a frozen eval's digest. */
export const EVAL_DIGEST = /^sha256:[0-9a-f]{64}$/;

/** An eval as its file declares it: each field only when the file says it. */
export interface DeclaredEval {
  slug: string;
  domain?: string;
  version?: string;
  description?: string;
  /** The metric files the eval reads, by ref. */
  metrics?: string[];
  scoring?: Record<string, unknown>;
  objective?: Record<string, unknown>;
  axes?: string[];
  repeats?: number;
  published?: boolean;
  /** The digest the eval is frozen at: `sha256:<hex>`. */
  frozen?: string;
  official?: boolean;
  rung?: string;
  provenance?: Record<string, unknown>;
  cases: DeclaredEvalCase[];
}
export interface DeclaredEvalCase {
  slug: string;
  name: string;
  /** The `.task.tsx` the agent is handed, by ref; else `instruction`. */
  task?: string;
  instruction?: string;
  acceptance?: Record<string, unknown>;
  /** The metric file that accepts the case, by ref. */
  acceptanceMetric?: string;
  hints?: string[];
  maxSteps?: number;
  timeLimitMs?: number;
  environment: Record<string, unknown>;
  config?: Record<string, unknown>;
  seed?: number;
  weight?: number;
  tags?: string[];
}
/** A metric as its file declares it: each field only when the file says it. */
export interface DeclaredMetric {
  slug: string;
  probe: Record<string, unknown>;
  aggregation: string;
  description?: string;
  role?: string;
  direction?: string;
  unit?: string;
  target?: number;
  pass?: Record<string, unknown>;
  threadId?: string;
}

const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** A field's value says nothing (absent, null, "", [] or {}): code does not write it. */
const nothing = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) || (plainObject(v) && !Object.keys(v).length);
const said = (attrs: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]]));
const attrsOf = (o: object, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => !nothing((o as Record<string, unknown>)[k])).map((k) => [k, (o as Record<string, unknown>)[k]]));
const where = (t: DocTree) => `<${t.tag}${typeof t.attrs.slug === "string" ? ` slug="${t.attrs.slug}"` : ""}>`;

function text(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && (typeof v !== "string" || !v.trim())) throw new Error(`${where(t)} ${k} is text, not ${JSON.stringify(v)}`);
}
function object(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && !plainObject(v)) throw new Error(`${where(t)} ${k} is an object, not ${JSON.stringify(v)}`);
}
function texts(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && !(Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim()))) throw new Error(`${where(t)} ${k} is a list of texts`);
}
function number(t: DocTree, k: string, integer = false): void {
  const v = t.attrs[k];
  if (v !== undefined && !(typeof v === "number" && Number.isFinite(v) && (!integer || Number.isInteger(v)))) throw new Error(`${where(t)} ${k} is a ${integer ? "whole " : ""}number, not ${JSON.stringify(v)}`);
}
function flag(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && typeof v !== "boolean") throw new Error(`${where(t)} ${k} is true or false`);
}

/** One case as its element declares it; throws with why it does not read. */
export function evalCaseOf(t: DocTree): DeclaredEvalCase {
  for (const k of ["slug", "name", "task", "instruction", "acceptanceMetric"]) text(t, k);
  for (const k of ["acceptance", "environment", "config"]) object(t, k);
  if (!plainObject(t.attrs.environment) || typeof t.attrs.environment.kind !== "string") throw new Error(`${where(t)} environment is a world ({ kind: "synthetic", seed: 41 }), not ${JSON.stringify(t.attrs.environment)}`);
  if ((t.attrs.task === undefined) === (t.attrs.instruction === undefined)) throw new Error(`${where(t)} says what the agent is handed once: a task file (task) or an instruction, not ${t.attrs.task === undefined ? "neither" : "both"}`);
  texts(t, "hints");
  texts(t, "tags");
  number(t, "maxSteps", true);
  number(t, "timeLimitMs", true);
  number(t, "seed", true);
  number(t, "weight");
  return said(t.attrs, EVAL_CASE_FIELDS) as unknown as DeclaredEvalCase;
}

function evalOf(t: DocTree): DeclaredEval {
  for (const k of ["slug", "domain", "version", "description", "rung"]) text(t, k);
  for (const k of ["scoring", "objective", "provenance"]) object(t, k);
  texts(t, "metrics");
  texts(t, "axes");
  number(t, "repeats", true);
  for (const k of ["published", "official"]) flag(t, k);
  if (t.attrs.frozen !== undefined && !(typeof t.attrs.frozen === "string" && EVAL_DIGEST.test(t.attrs.frozen)))
    throw new Error(`${where(t)} frozen is the digest the eval is frozen at (sha256:<hex>), not ${JSON.stringify(t.attrs.frozen)}`);
  const cases = t.children.filter((c) => c.tag === "case").map(evalCaseOf);
  return { ...(said(t.attrs, EVAL_FIELDS) as Omit<DeclaredEval, "cases">), cases };
}

function metricOf(t: DocTree): DeclaredMetric {
  for (const k of ["slug", "description", "aggregation", "role", "direction", "unit", "threadId"]) text(t, k);
  for (const k of ["probe", "pass"]) object(t, k);
  if (!plainObject(t.attrs.probe) || typeof t.attrs.probe.kind !== "string") throw new Error(`${where(t)} probe is what to measure ({ kind: "event", eventKind: "telemetry" }), not ${JSON.stringify(t.attrs.probe)}`);
  number(t, "target");
  return said(t.attrs, METRIC_FIELDS) as unknown as DeclaredMetric;
}

/** A slug from a file's name ("Yard shakedown" → "yard-shakedown"). */
const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "eval";

export const evalVocabulary: Vocabulary<DeclaredEval> = {
  format: "eval",
  noun: "an eval",
  root: "eval",
  tags: {
    eval: { parents: [], required: ["slug"], attrs: EVAL_FIELDS },
    case: { parents: ["eval"], key: "slug", required: ["slug", "name", "environment"], attrs: EVAL_CASE_FIELDS },
  },
  fromTree: evalOf,
  toTree: (d) => ({
    tag: "eval",
    attrs: attrsOf(d, EVAL_FIELDS),
    children: (d.cases ?? []).map((c) => ({ tag: "case", attrs: attrsOf(c, EVAL_CASE_FIELDS), children: [] })),
  }),
  empty: (name) => ({ slug: slugOf(name), cases: [] }),
};

export const metricVocabulary: Vocabulary<DeclaredMetric> = {
  format: "metric",
  noun: "a metric",
  root: "metric",
  tags: {
    metric: { parents: [], required: ["slug", "probe", "aggregation"], attrs: METRIC_FIELDS },
  },
  fromTree: metricOf,
  toTree: (d) => ({ tag: "metric", attrs: attrsOf(d, METRIC_FIELDS), children: [] }),
};

for (const v of [evalVocabulary, metricVocabulary]) registerVocabulary(v);

/** The vocabularies of an eval and a metric, by format. */
export const EVALS = { eval: evalVocabulary, metric: metricVocabulary } as const;
