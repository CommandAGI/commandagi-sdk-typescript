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
 * `mode`, `retain`, `since`, `session`, `snapshot`, `profile`, `keep`, `maxCostPerDay`, `unit`). `monitorWithDefaults`
 * gives the document as the platform reads it (`via: "worker"`, `mode: "poll"`, the others null; a stream's `retain`
 * "derived", a poll's null). A
 * monitor's lists (`sources`, `follows`, `wakes`) are always there, empty when the file has none. Who may read the
 * thread is the file's own Drive visibility, not a word of the file.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a monitor, and of each part of a monitor. */
export const MONITOR_FIELDS = ["title", "class", "about", "readme"] as const;
export const SOURCE_FIELDS = ["id", "adapter", "params", "every", "via", "exit", "host", "mode", "retain", "since", "session", "snapshot", "profile", "keep", "maxCostPerDay", "unit"] as const;
export const FOLLOW_FIELDS = ["monitor", "match"] as const;
export const WAKE_FIELDS = ["match", "prompt"] as const;

/**
 * The paths a source's reads take (docs/sources.md § fetch paths): the api worker, a host, a VPN exit, a headless
 * browser on a host, a Linux cloud computer launched from a snapshot, an Android VM launched from a snapshot, and a real
 * phone unit of a world.
 */
export const VIAS = ["worker", "host", "vpn", "browser", "vm", "android-vm", "phone"] as const;
/** The paths that launch a machine from a snapshot (a logged-in state), and so cost money per read. */
export const VM_VIAS = ["vm", "android-vm"] as const;
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
  /**
   * The host that reads it (its name): for `host`, `browser` and `phone`, a host of the account (absent: the first
   * online one); for `vm` and `android-vm`, the host the machine's snapshot runs when it boots (absent: the snapshot's
   * name).
   */
  host?: string;
  mode?: (typeof MODES)[number];
  /** `all` | `derived` | `sample:<duration>`, for `mode: "stream"`. */
  retain?: string;
  /** The day a first read starts from (`YYYY-MM-DD`), so a first read does not pull a whole history. */
  since?: string;
  /** A ref to a logged-in state (`infra/sessions/<name>/session.tsx`), for `browser`, `vm` and `android-vm`. */
  session?: string;
  /** The snapshot a `vm` or `android-vm` read launches from (its id or name), when no `session` names it. */
  snapshot?: string;
  /** A browser profile of the host (a saved state), for `browser`, when no `session` names it. */
  profile?: string;
  /** How long a `vm` or `android-vm` stays up after a read for the next one (a duration); absent: released at once. */
  keep?: string;
  /** The most a `vm` or `android-vm` source may spend a day, in USD; the pacer refuses a launch past it. */
  maxCostPerDay?: number;
  /** The phone a `phone` read runs on: `<world.tsx ref>#<uid>`, relative to the monitor's folder, or an absolute address. */
  unit?: string;
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

/** A unit ref: a world file's ref or address, `#`, and the unit's uid. */
export const UNIT_REF = /^[^#\s]+\/world\.tsx#[a-z0-9][a-z0-9-]{0,47}$/;

function sourceOf(t: DocTree): MonitorSource {
  for (const k of ["id", "adapter", "exit", "host", "retain", "since", "session", "snapshot", "profile", "keep", "unit"]) text(t, k);
  const p = t.attrs.params;
  if (p !== undefined && (!p || typeof p !== "object" || Array.isArray(p))) throw new Error(`${where(t)} params is an object ({ series: "CPIAUCSL" }), not ${JSON.stringify(p)}`);
  const s = durationSeconds(t.attrs.every);
  if (s === null) throw new Error(`${where(t)} every is a duration ("30s", "15m", "6h", "7d"), not ${JSON.stringify(t.attrs.every)}`);
  if (s < durationSeconds(EVERY_BOUNDS.min)! || s > durationSeconds(EVERY_BOUNDS.max)!) throw new Error(`${where(t)} every is from ${EVERY_BOUNDS.min} to ${EVERY_BOUNDS.max}, not ${JSON.stringify(t.attrs.every)}`);
  oneOf(t, "via", VIAS);
  if (t.attrs.exit !== undefined && t.attrs.via !== "vpn") throw new Error(`${where(t)} exit names an exit country ("DE") or an exit ("fsn-1"), for via="vpn" only`);
  oneOf(t, "mode", MODES);
  const via = t.attrs.via as string | undefined;
  const onVm = via === "vm" || via === "android-vm";
  if (t.attrs.host !== undefined && via !== "host" && via !== "browser" && via !== "phone" && !onVm) throw new Error(`${where(t)} host names the host that reads it, for via="host", "browser", "phone", "vm" or "android-vm" only`);
  if (t.attrs.profile !== undefined && via !== "browser") throw new Error(`${where(t)} profile names a browser profile of the host, for via="browser" only`);
  if (t.attrs.session !== undefined && via !== "browser" && !onVm) throw new Error(`${where(t)} session names a logged-in state, for via="browser", "vm" or "android-vm" only`);
  if (t.attrs.session !== undefined && t.attrs.profile !== undefined) throw new Error(`${where(t)} names its state once: a session or a profile`);
  if (t.attrs.snapshot !== undefined && !onVm) throw new Error(`${where(t)} snapshot is what a via="vm" or "android-vm" read launches from`);
  if (t.attrs.session !== undefined && t.attrs.snapshot !== undefined) throw new Error(`${where(t)} names its state once: a session or a snapshot`);
  if (onVm && t.attrs.session === undefined && t.attrs.snapshot === undefined) throw new Error(`${where(t)} via="${via}" launches from a snapshot: it names a session or a snapshot`);
  const cost = t.attrs.maxCostPerDay;
  if (cost !== undefined && !onVm) throw new Error(`${where(t)} maxCostPerDay bounds what a via="vm" or "android-vm" source spends`);
  if (onVm && cost === undefined) throw new Error(`${where(t)} via="${via}" costs money: it says maxCostPerDay (USD a day)`);
  if (cost !== undefined && !(typeof cost === "number" && Number.isFinite(cost) && cost > 0)) throw new Error(`${where(t)} maxCostPerDay is a price in USD (2.5), not ${JSON.stringify(cost)}`);
  if (t.attrs.keep !== undefined && !onVm) throw new Error(`${where(t)} keep is how long a via="vm" or "android-vm" machine stays up`);
  if (t.attrs.keep !== undefined) {
    const k = durationSeconds(t.attrs.keep);
    if (k === null || k < durationSeconds(EVERY_BOUNDS.min)! || k > durationSeconds(EVERY_BOUNDS.max)!) throw new Error(`${where(t)} keep is a duration from ${EVERY_BOUNDS.min} to ${EVERY_BOUNDS.max}, not ${JSON.stringify(t.attrs.keep)}`);
  }
  if (t.attrs.unit !== undefined && via !== "phone") throw new Error(`${where(t)} unit names the phone a via="phone" read runs on`);
  if (via === "phone" && t.attrs.unit === undefined) throw new Error(`${where(t)} via="phone" names its phone: unit="<world.tsx>#<uid>"`);
  if (t.attrs.unit !== undefined && !UNIT_REF.test(t.attrs.unit as string)) throw new Error(`${where(t)} unit is "<world.tsx ref>#<uid>" ("../../worlds/fleet/world.tsx#android-01"), not ${JSON.stringify(t.attrs.unit)}`);
  if (t.attrs.mode === "stream" && t.attrs.via !== "host") throw new Error(`${where(t)} mode="stream" holds a connection open, which runs on a host (via="host")`);
  if (t.attrs.retain !== undefined && t.attrs.mode !== "stream") throw new Error(`${where(t)} retain is for mode="stream" only`);
  if (t.attrs.retain !== undefined && !RETAIN.test(t.attrs.retain as string)) throw new Error(`${where(t)} retain is "all", "derived" or "sample:<duration>", not ${JSON.stringify(t.attrs.retain)}`);
  if (t.attrs.since !== undefined && !SINCE.test(t.attrs.since as string)) throw new Error(`${where(t)} since is a day ("2024-01-01"), not ${JSON.stringify(t.attrs.since)}`);
  if (t.attrs.since !== undefined && t.attrs.mode === "stream") throw new Error(`${where(t)} since is for a polled source; a stream starts when it connects`);
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
    sources: m.sources.map((s) => ({ id: s.id, adapter: s.adapter, params: s.params ?? {}, every: s.every, via: s.via ?? "worker", exit: s.exit ?? null, host: s.host ?? null, mode: s.mode ?? "poll", retain: s.mode === "stream" ? (s.retain ?? "derived") : null, since: s.since ?? null, session: s.session ?? null, snapshot: s.snapshot ?? null, profile: s.profile ?? null, keep: s.keep ?? null, maxCostPerDay: s.maxCostPerDay ?? null, unit: s.unit ?? null })),
    follows: m.follows.map((f) => ({ monitor: f.monitor, match: f.match ?? null })),
    wakes: m.wakes.map((w) => ({ match: w.match ?? null, prompt: w.prompt })),
  };
}
