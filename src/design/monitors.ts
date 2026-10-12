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
 * Nothing adds a default: what the file does not say, the document does not have (`via`, `readme`, `exit`).
 * `monitorWithDefaults` gives the document as the platform reads it (`via: "worker"`, `readme` and `exit` null). A
 * monitor's lists (`sources`, `follows`, `wakes`) are always there, empty when the file has none. Who may read the
 * thread is the file's own Drive visibility, not a word of the file.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a monitor, and of each part of a monitor. */
export const MONITOR_FIELDS = ["title", "class", "about", "readme"] as const;
export const SOURCE_FIELDS = ["id", "adapter", "params", "every", "via", "exit"] as const;
export const FOLLOW_FIELDS = ["monitor", "match"] as const;
export const WAKE_FIELDS = ["match", "prompt"] as const;

export const VIAS = ["worker", "host", "vpn"] as const;
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
}
export interface MonitorFollow {
  /** The followed monitor's folder, as a ref relative to this monitor's folder (`../../central-banks/fed`). */
  monitor: string;
  match?: string;
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
  for (const k of ["id", "adapter", "exit"]) text(t, k);
  const p = t.attrs.params;
  if (p !== undefined && (!p || typeof p !== "object" || Array.isArray(p))) throw new Error(`${where(t)} params is an object ({ series: "CPIAUCSL" }), not ${JSON.stringify(p)}`);
  const s = durationSeconds(t.attrs.every);
  if (s === null) throw new Error(`${where(t)} every is a duration ("30s", "15m", "6h", "7d"), not ${JSON.stringify(t.attrs.every)}`);
  if (s < durationSeconds(EVERY_BOUNDS.min)! || s > durationSeconds(EVERY_BOUNDS.max)!) throw new Error(`${where(t)} every is from ${EVERY_BOUNDS.min} to ${EVERY_BOUNDS.max}, not ${JSON.stringify(t.attrs.every)}`);
  oneOf(t, "via", VIAS);
  if (t.attrs.exit !== undefined && t.attrs.via !== "vpn") throw new Error(`${where(t)} exit names a country for via="vpn" only`);
  return said(t.attrs, SOURCE_FIELDS) as unknown as MonitorSource;
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
  const wakes = parts("wake").map((c) => {
    text(c, "match", "match");
    text(c, "prompt", "match");
    return said(c.attrs, WAKE_FIELDS) as unknown as MonitorWake;
  });
  return { ...said(t.attrs, MONITOR_FIELDS), sources: parts("source").map(sourceOf), follows, wakes };
}

export const monitorVocabulary: Vocabulary<MonitorDoc> = {
  format: "monitor",
  noun: "a monitor",
  root: "monitor",
  tags: {
    monitor: { parents: [], attrs: MONITOR_FIELDS },
    source: { parents: ["monitor"], key: "id", required: ["id", "adapter", "every"], attrs: SOURCE_FIELDS },
    follows: { parents: ["monitor"], key: "monitor", required: ["monitor"], attrs: FOLLOW_FIELDS },
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
        ...(m.wakes ?? []).map((w) => ({ tag: "wake", attrs: attrsOf(w, WAKE_FIELDS), children: [] })),
      ],
    };
  },
  empty: () => ({ sources: [], follows: [], wakes: [] }),
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
    sources: m.sources.map((s) => ({ id: s.id, adapter: s.adapter, params: s.params ?? {}, every: s.every, via: s.via ?? "worker", exit: s.exit ?? null })),
    follows: m.follows.map((f) => ({ monitor: f.monitor, match: f.match ?? null })),
    wakes: m.wakes.map((w) => ({ match: w.match ?? null, prompt: w.prompt })),
  };
}
