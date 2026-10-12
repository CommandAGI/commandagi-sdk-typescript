/**
 * MONITORS IN JSX — a `monitor.tsx`: one monitor, in the folder of the thing it follows (docs/monitors.md, in the
 * CommandAGI repository). A monitor is a thread that follows one thing in the world; its sources read it, its follows
 * copy what another monitor records, its wakes wake its agent. Its id is its folder's path in the account's Drive
 * (`entities/corporations/nvidia`), so the file never names itself.
 *
 *   // entities/corporations/corporation.tsx — a class of things is a component in an ordinary code file
 *   export const Corporation = ({ cik, ticker, name }) => (
 *     <monitor title={`${name} (${ticker})`} class="corporation" about={`cik:${cik}`}>
 *       <source id="filings" adapter="sec-filings" params={{ cik }} every="15m" />
 *       <follows monitor="../../central-banks/fed" match="fomc.statement" />
 *     </monitor>
 *   );
 *
 *   // entities/corporations/nvidia/monitor.tsx — an instance imports its class by relative path
 *   import { Corporation } from "../corporation.tsx";
 *   export default () => <Corporation cik="0001045810" ticker="NVDA" name="NVIDIA" />;
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim. A
 * source is named by its `id` in its monitor, a follow by the `monitor` it follows (a ref: the followed monitor's
 * folder, relative to this monitor's folder), a wake by its place.
 *
 * Nothing adds a default: what the file does not say, the document does not have (`via`, `readme`, `exit`, `host`,
 * `mode`, `retain`, `since`). `monitorWithDefaults` gives the document as the platform reads it (`via: "worker"`,
 * `mode: "poll"`, `readme`, `exit`, `host` and `since` null; a stream's `retain` "derived", a poll's null). A
 * monitor's lists (`sources`, `follows`, `derives`, `wakes`) are always there, empty when the file has none. Who may read the
 * thread is the file's own Drive visibility, not a word of the file.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a monitor, and of each part of a monitor. */
export const MONITOR_FIELDS = ["title", "class", "about", "readme"] as const;
export const SOURCE_FIELDS = ["id", "adapter", "params", "every", "via", "exit", "host", "mode", "retain", "since"] as const;
export const FOLLOW_FIELDS = ["monitor", "match"] as const;
export const WAKE_FIELDS = ["match", "prompt"] as const;
export const DERIVE_FIELDS = ["id", "op", "inputs", "params", "since"] as const;

export const VIAS = ["worker", "host", "vpn"] as const;
/** `poll` reads at each `every`; `stream` holds a connection open on a host and hands over what came at each `every`. */
export const MODES = ["poll", "stream"] as const;
/** What a stream source's thread keeps: every record, the derived records only, or one per series per duration. */
export const RETAIN = /^(all|derived|sample:[1-9]\d*(s|m|h|d))$/;
/** A source's first day. */
export const SINCE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** The shortest and the longest `every` a source may have (an adapter may ask for longer: its `minEvery`). */
export const EVERY_BOUNDS = { min: "30s", max: "7d" } as const;

/** A monitor's file name: `monitor.tsx` (or `.jsx`, `.py`, `.rs`), in the folder of the thing it follows. */
export const MONITOR_FILE = /^monitor\.(?:[jt]sx|py|rs)$/i;

export interface MonitorSource {
  id: string;
  adapter: string;
  params?: Record<string, unknown>;
  every: string;
  via?: (typeof VIAS)[number];
  exit?: string;
  /** The host that reads it (its name), for `via: "host"`; absent: the account's first online host. */
  host?: string;
  mode?: (typeof MODES)[number];
  /** `all` | `derived` | `sample:<duration>`, for `mode: "stream"`. */
  retain?: string;
  /** The day a first read starts from (`YYYY-MM-DD`), so a first read does not pull a whole history. */
  since?: string;
}
export interface MonitorFollow {
  /** The followed monitor's folder, as a ref relative to this monitor's folder (`../../central-banks/fed`). */
  monitor: string;
  match?: string;
}
/**
 * A derived stream (docs/records.md § 6): an operator folds the records of other monitors into records of this one.
 * `inputs` maps each port of the operator to a monitor's folder, a ref relative to this monitor's folder, as a follow
 * names one. The platform checks the operator, its ports and its params.
 */
export interface MonitorDerive {
  id: string;
  op: string;
  inputs: Record<string, string>;
  params?: Record<string, unknown>;
  /** The first day the derive takes; its first run folds the inputs' logs from it. */
  since?: string;
}
export interface MonitorWake {
  match?: string;
  prompt: string;
}
/** What a `monitor.tsx` declares: one monitor. */
export interface MonitorDoc {
  title?: string;
  class?: string;
  about?: string;
  readme?: string;
  sources: MonitorSource[];
  follows: MonitorFollow[];
  derives: MonitorDerive[];
  wakes: MonitorWake[];
}

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** A duration (`30s`, `15m`, `6h`, `7d`) in seconds, or null when it is not one. */
export function durationSeconds(text: unknown): number | null {
  const m = typeof text === "string" ? /^([1-9]\d*)(s|m|h|d)$/.exec(text) : null;
  return m ? Number(m[1]) * UNIT_SECONDS[m[2]!]! : null;
}

const where = (t: DocTree, key = "id") => `<${t.tag}${typeof t.attrs[key] === "string" ? ` ${key}="${t.attrs[key] as string}"` : ""}>`;

function text(t: DocTree, k: string, key?: string): void {
  const v = t.attrs[k];
  if (v !== undefined && (typeof v !== "string" || !v)) throw new Error(`${where(t, key)} ${k} is a word, not ${JSON.stringify(v)}`);
}
function oneOf(t: DocTree, k: string, values: readonly string[], key?: string): void {
  const v = t.attrs[k];
  if (v !== undefined && !values.includes(v as string)) throw new Error(`${where(t, key)} ${k} is ${values.map((x) => `"${x}"`).join(", ")}, not ${JSON.stringify(v)}`);
}

/** The fields an element says, in the vocabulary's order (what it does not say stays absent). */
function said(attrs: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (attrs[k] !== undefined) out[k] = attrs[k];
  return out;
}

/** A field's value says nothing (absent, null or ""): code does not write it. */
const nothing = (v: unknown) => v === undefined || v === null || v === "";
function attrsOf(o: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (!nothing(v)) out[k] = v;
  }
  return out;
}

function sourceOf(t: DocTree): MonitorSource {
  for (const k of ["id", "adapter", "exit", "host", "retain", "since"]) text(t, k);
  const p = t.attrs.params;
  if (p !== undefined && (!p || typeof p !== "object" || Array.isArray(p))) throw new Error(`${where(t)} params is an object ({ series: "CPIAUCSL" }), not ${JSON.stringify(p)}`);
  const s = durationSeconds(t.attrs.every);
  if (s === null) throw new Error(`${where(t)} every is a duration ("30s", "15m", "6h", "7d"), not ${JSON.stringify(t.attrs.every)}`);
  if (s < durationSeconds(EVERY_BOUNDS.min)! || s > durationSeconds(EVERY_BOUNDS.max)!) throw new Error(`${where(t)} every is from ${EVERY_BOUNDS.min} to ${EVERY_BOUNDS.max}, not ${JSON.stringify(t.attrs.every)}`);
  oneOf(t, "via", VIAS);
  if (t.attrs.exit !== undefined && t.attrs.via !== "vpn") throw new Error(`${where(t)} exit names an exit country ("DE") or an exit ("fsn-1"), for via="vpn" only`);
  oneOf(t, "mode", MODES);
  if (t.attrs.host !== undefined && t.attrs.via !== "host") throw new Error(`${where(t)} host names a host for via="host" only`);
  if (t.attrs.mode === "stream" && t.attrs.via !== "host") throw new Error(`${where(t)} mode="stream" holds a connection open, which runs on a host (via="host")`);
  if (t.attrs.retain !== undefined && t.attrs.mode !== "stream") throw new Error(`${where(t)} retain is for mode="stream" only`);
  if (t.attrs.retain !== undefined && !RETAIN.test(t.attrs.retain as string)) throw new Error(`${where(t)} retain is "all", "derived" or "sample:<duration>", not ${JSON.stringify(t.attrs.retain)}`);
  if (t.attrs.since !== undefined && !SINCE.test(t.attrs.since as string)) throw new Error(`${where(t)} since is a day ("2024-01-01"), not ${JSON.stringify(t.attrs.since)}`);
  if (t.attrs.since !== undefined && t.attrs.mode === "stream") throw new Error(`${where(t)} since is for a polled source; a stream starts when it connects`);
  return said(t.attrs, SOURCE_FIELDS) as unknown as MonitorSource;
}

const WORD = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
function deriveOf(t: DocTree): MonitorDerive {
  for (const k of ["id", "op", "since"]) text(t, k);
  if (!WORD.test(t.attrs.id as string)) throw new Error(`${where(t)} id is a word (letters, digits, _ and -)`);
  const inputs = t.attrs.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs) || !Object.keys(inputs).length)
    throw new Error(`${where(t)} inputs maps each port to a monitor's folder ({ quotes: "../quotes" }), not ${JSON.stringify(inputs)}`);
  for (const [port, ref] of Object.entries(inputs as Record<string, unknown>)) {
    if (!WORD.test(port)) throw new Error(`${where(t)} a port is a word, not ${JSON.stringify(port)}`);
    if (typeof ref !== "string" || !ref) throw new Error(`${where(t)} inputs.${port} is a monitor's folder, not ${JSON.stringify(ref)}`);
    if (/^\.\/?$/.test(ref)) throw new Error(`${where(t)} inputs.${port} names this monitor; a derive takes other monitors' records`);
  }
  const p = t.attrs.params;
  if (p !== undefined && (!p || typeof p !== "object" || Array.isArray(p))) throw new Error(`${where(t)} params is an object ({ window: "1m" }), not ${JSON.stringify(p)}`);
  if (t.attrs.since !== undefined && !SINCE.test(t.attrs.since as string)) throw new Error(`${where(t)} since is a day ("2024-01-01"), not ${JSON.stringify(t.attrs.since)}`);
  return said(t.attrs, DERIVE_FIELDS) as unknown as MonitorDerive;
}

function monitorOf(t: DocTree): MonitorDoc {
  for (const k of MONITOR_FIELDS) text(t, k);
  const parts = (tag: string) => t.children.filter((c) => c.tag === tag);
  const follows = parts("follows").map((c) => {
    text(c, "monitor", "monitor");
    text(c, "match", "monitor");
    if (/^\.\/?$/.test(c.attrs.monitor as string)) throw new Error(`<follows monitor="${c.attrs.monitor as string}"> names this monitor; a follow names another monitor's folder`);
    return said(c.attrs, FOLLOW_FIELDS) as unknown as MonitorFollow;
  });
  const derives = parts("derive").map(deriveOf);
  const wakes = parts("wake").map((c) => {
    text(c, "match", "match");
    text(c, "prompt", "match");
    return said(c.attrs, WAKE_FIELDS) as unknown as MonitorWake;
  });
  return { ...said(t.attrs, MONITOR_FIELDS), sources: parts("source").map(sourceOf), follows, derives, wakes };
}

export const monitorVocabulary: Vocabulary<MonitorDoc> = {
  format: "monitor",
  noun: "a monitor",
  root: "monitor",
  tags: {
    monitor: { parents: [], attrs: MONITOR_FIELDS },
    source: { parents: ["monitor"], key: "id", required: ["id", "adapter", "every"], attrs: SOURCE_FIELDS },
    follows: { parents: ["monitor"], key: "monitor", required: ["monitor"], attrs: FOLLOW_FIELDS },
    derive: { parents: ["monitor"], key: "id", required: ["id", "op", "inputs"], attrs: DERIVE_FIELDS },
    wake: { parents: ["monitor"], required: ["prompt"], attrs: WAKE_FIELDS },
  },
  // A follow names a monitor by its folder: the platform checks that one is there, not the file.
  fromTree: monitorOf,
  toTree(m) {
    return {
      tag: "monitor",
      attrs: attrsOf(m, MONITOR_FIELDS),
      children: [
        ...(m.sources ?? []).map((s) => ({ tag: "source", attrs: attrsOf(s, SOURCE_FIELDS), children: [] })),
        ...(m.follows ?? []).map((f) => ({ tag: "follows", attrs: attrsOf(f, FOLLOW_FIELDS), children: [] })),
        ...(m.derives ?? []).map((d) => ({ tag: "derive", attrs: attrsOf(d, DERIVE_FIELDS), children: [] })),
        ...(m.wakes ?? []).map((w) => ({ tag: "wake", attrs: attrsOf(w, WAKE_FIELDS), children: [] })),
      ],
    };
  },
  empty: () => ({ sources: [], follows: [], derives: [], wakes: [] }),
};

registerVocabulary(monitorVocabulary);

/** The vocabulary of a monitor, by format. */
export const MONITORS = { monitor: monitorVocabulary } as const;

/** A monitor as the platform reads it: what the file does not say, filled (`via: "worker"`, `readme: null` …). */
export function monitorWithDefaults(m: MonitorDoc) {
  return {
    title: m.title ?? null,
    class: m.class ?? null,
    about: m.about ?? null,
    readme: m.readme ?? null,
    sources: m.sources.map((s) => ({ id: s.id, adapter: s.adapter, params: s.params ?? {}, every: s.every, via: s.via ?? "worker", exit: s.exit ?? null, host: s.host ?? null, mode: s.mode ?? "poll", retain: s.mode === "stream" ? (s.retain ?? "derived") : null, since: s.since ?? null })),
    follows: m.follows.map((f) => ({ monitor: f.monitor, match: f.match ?? null })),
    derives: (m.derives ?? []).map((d) => ({ id: d.id, op: d.op, inputs: d.inputs, params: d.params ?? {}, since: d.since ?? null })),
    wakes: m.wakes.map((w) => ({ match: w.match ?? null, prompt: w.prompt })),
  };
}
