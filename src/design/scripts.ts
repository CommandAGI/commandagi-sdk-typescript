/**
 * SCRIPTS IN JSX — a `<name>.script.tsx`: one script, anywhere in a Drive (docs/scripts.md, in the CommandAGI
 * repository). A script is a code file that declares what it reads (`<source>`) and the files it tails (`<tail of>`,
 * `<derive>`, `<wake when>`, `<discover>`); its run, beside the file, holds the records its parts append. Its id is the
 * file's own path in the account's Drive, so the file never names itself, and a folder may hold several scripts.
 *
 *   // entities/corporations/corporation.tsx — a class of things is a component in an ordinary code file
 *   export const Corporation = ({ cik, ticker, name }) => (
 *     <script title={`${name} (${ticker})`} class="corporation" about={`cik:${cik}`}>
 *       <source id="filings" adapter="sec-filings" params={{ cik }} every="30m" />
 *       <tail of="../../central-banks/fed/fed.script.tsx" when={{ class: "fomc.statement" }} />
 *     </script>
 *   );
 *
 *   // entities/corporations/nvidia/nvidia.script.tsx — an instance imports its class by relative path
 *   import { Corporation } from "../corporation.tsx";
 *   export default () => <Corporation cik="0001045810" ticker="NVDA" name="NVIDIA" />;
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim. A
 * source is named by its `id` in its script, a tail by the file it tails (`of`: a ref from this script's folder to a
 * script file, a run's `records.jsonl`, or a statistics series by its id, `fred:DGS10`), a wake by its place. A wake
 * wakes the agent on the script's own records (`when`, a record predicate) or on a clock (`every="7d"`: a weekly brief).
 * `stream` names the stream of the run a part appends to (absent: `records`).
 *
 * Nothing adds a default: what the file does not say, the document does not have (`via`, `readme`, `exit`, `host`,
 * `mode`, `retain`, `since`, `session`, `snapshot`, `profile`, `keep`, `maxCostPerDay`, `unit`, `stream`).
 * `scriptWithDefaults` gives the document as the platform reads it (`via: "worker"`, `mode: "poll"`, `stream:
 * "records"`, the others null; a stream source's `retain` "derived", a poll's null). A script's lists (`sameAs`,
 * `sources`, `tails`, `derives`, `wakes`, `discovers`, `judges`, `params`) are always there, empty when the file has none. Who may
 * read the run is the file's own Drive visibility, not a word of the file.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a script, and of each part of a script. */
export const SCRIPT_FIELDS = ["title", "class", "about", "readme", "sameAs"] as const;
/** A subject: `<scheme>:<id>` (`cik:0001045810`, `ticker:NVDA`, `fomc:`). */
export const SUBJECT = /^[a-z][a-z0-9-]*:\S*$/;
export const SOURCE_FIELDS = ["id", "adapter", "params", "every", "via", "exit", "host", "mode", "retain", "since", "session", "snapshot", "profile", "keep", "maxCostPerDay", "unit", "vantage", "connection", "stream"] as const;
export const TAIL_FIELDS = ["of", "when", "stream"] as const;
export const DISCOVER_FIELDS = ["into", "of", "when", "slug", "class", "props", "name", "max", "visibility"] as const;
/** The most new folders a discover writes a tick. */
export const DISCOVER_MAX = 50;
/** Who may read a file a discover writes (docs/scripts.md § a script file). */
export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const WAKE_FIELDS = ["when", "every", "prompt", "agent", "maxSpend"] as const;
export const SCRIPT_JUDGE_FIELDS = ["id", "of", "rubric", "model"] as const;
/** What a judge judges: each turn of the thread's agents, or each turn on a mounted task. */
export const SCRIPT_JUDGE_OF = ["turn", "task"] as const;
export const DERIVE_FIELDS = ["id", "op", "inputs", "params", "since", "stream"] as const;
/** A template's parameter (docs/scripts.md § the catalogue): its `${id}` placeholders are filled when it is copied. */
export const SCRIPT_PARAM_FIELDS = ["id", "type", "label", "default", "required", "choices", "accept"] as const;
/** What a parameter is: the same types a dashboard template's parameters have. */
export const SCRIPT_PARAM_TYPES = ["file", "device", "world", "unit", "channel", "run", "stream", "number", "string", "choice"] as const;

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

/** A script's file name: `<name>.script.tsx` (or `.jsx`, `.py`, `.rs`), anywhere in a Drive. */
export const SCRIPT_FILE = /^[^/]+\.script\.(?:[jt]sx|py|rs)$/i;
/** A stream of the run a part appends to (`records`, `ticks`): a word. */
export const STREAM_NAME = /^[a-z][a-z0-9-]{0,39}$/;

export interface ScriptSource {
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
  /** The phone a `phone` read runs on: `<world.tsx ref>#<uid>`, relative to the script's folder, or an absolute address. */
  unit?: string;
  /** The observer it reads as: a vantage folder, relative to this script's folder (`../../infra/vantages/fsn-1`). */
  vantage?: string;
  /**
   * The connected account it reads as (docs/sources.md): the integration's id and, after
   * `@`, the account's name (`gmail@jacobfv123@gmail.com`); the api worker (via="worker") reads it.
   */
  connection?: string;
  /** The stream of the run its records go to (absent: `records`). */
  stream?: string;
}
export interface ScriptTail {
  /**
   * The file it tails, a ref from this script's folder: a script file (`../fed/fed.script.tsx`, its run's records), a
   * run's `records.jsonl`, or a statistics series by its id (`fred:DGS10`). Never a folder.
   */
  of: string;
  /** Which records it takes: one condition, or a list of them (any holds); its `class` term is a glob. Absent: every record. */
  when?: WhenCondition | WhenCondition[];
  /** The stream of this run it appends to (absent: `records`). */
  stream?: string;
}
/** A term of a `when`: a value (a string is a glob), the values allowed, or operators on the value. */
export type WhenTest =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean>
  | { eq?: string | number | boolean; ne?: string | number | boolean; gt?: number | string; gte?: number | string; lt?: number | string; lte?: number | string; in?: Array<string | number | boolean>; glob?: string; contains?: string; exists?: boolean };
/** A condition: every term holds. A term is named `class`, `about`, `key`, `title` or `data.<path>`. */
export type WhenCondition = Record<string, WhenTest>;
/**
 * A discovering script's part (docs/scripts.md § a script file): each record that satisfies `when` and names a thing
 * by its `slug` that has no folder yet gets `<into>/<word>/<word>.script.tsx`, a one-line instance of the class `class`
 * (`<file>#<Component>`) with `props` taken from the record. It reads its own records, or those of the script files
 * `of` names. It never deletes a folder.
 */
export interface ScriptDiscover {
  /** The folder the new folders go in, relative to this script's folder; at or under it (absent: `./`). */
  into?: string;
  /** The script files whose records it reads, relative to this script's folder (absent: its own). */
  of?: string | string[];
  /** Which records name a thing that gets its own thread: one condition, or a list of them (any holds). Absent: every record. */
  when?: WhenCondition | WhenCondition[];
  /** What names the thing, one folder per value, ever: a data path, or the first value of `paths` that `pattern` takes. */
  slug: string | { paths: string[]; pattern?: string };
  /** The class an instance renders: its file relative to this script's folder, `#`, its exported name. */
  class: string;
  /** Each prop of the instance and the data path it is taken from; `"$slug"` is the thing's slug. */
  props?: Record<string, string>;
  /** The data path a folder's name is made from (a counterparty's name); absent: the slug. */
  name?: string;
  /** At most this many new folders a tick (absent: 10). */
  max?: number;
  /** The Drive visibility each written file takes (absent: private); a file whose terms forbid passing its data on stays private. */
  visibility?: Visibility;
}
/**
 * A derived stream (docs/records.md § 6): an operator folds the records of other files into records of this script.
 * `inputs` maps each port of the operator to what a `<tail of>` names (a script file, a run's records file, a series).
 * The platform checks the operator, its ports and its params.
 */
export interface ScriptDerive {
  id: string;
  op: string;
  inputs: Record<string, string>;
  params?: Record<string, unknown>;
  /** The first day the derive takes; its first run folds the inputs' logs from it. */
  since?: string;
  /** The stream of this run it appends to (absent: `records`). */
  stream?: string;
}
/** A wake on the script's own records (`when`, a record predicate) or on a clock (`every`, from 30s to 7d): never both. */
export interface ScriptWake {
  when?: WhenCondition | WhenCondition[];
  every?: string;
  prompt: string;
  /** A named agent of the account (its name): the thread seats it and the wake goes to it; absent: the account's default agent. */
  agent?: string;
  /** The most one wake may spend on model calls, in US dollars: the wake stops before the call that would pass it. */
  maxSpend?: number;
}
/**
 * A judge of the script's run (docs/scripts.md § how a trigger runs a script): when a span of the thread's trace ends,
 * the model reads it with the rubric and its verdict is a record of the thread that cites the events. A verdict is an
 * opinion: it never changes the trace and never counts as physical or engine evidence.
 */
export interface ScriptJudge {
  /** The judge's id in its script (a word). */
  id: string;
  /** What is judged: each turn of the thread's agents (`turn`), or each turn on a mounted task (`task`). */
  of: (typeof SCRIPT_JUDGE_OF)[number];
  /** The rubric: a `.md`, a ref relative to the script's folder. */
  rubric: string;
  /** A model of the catalog (`fireworks/glm-5p3`). */
  model: string;
}
/** A template's parameter, as a dashboard template's `<param>` is. */
export interface ScriptParam {
  id: string;
  type: (typeof SCRIPT_PARAM_TYPES)[number];
  label?: string;
  default?: string | number;
  required?: boolean;
  choices?: string[];
  accept?: string[];
}
/** What a `<name>.script.tsx` declares: one script. A script with `<param>`s is a template: it applies once copied. */
export interface ScriptDoc {
  title?: string;
  class?: string;
  about?: string;
  readme?: string;
  /** Other ids of the same subject (`ticker:NVDA` beside `about="cik:0001045810"`): a declared statement, never a merge. */
  sameAs?: string[];
  sources: ScriptSource[];
  tails: ScriptTail[];
  derives: ScriptDerive[];
  wakes: ScriptWake[];
  discovers: ScriptDiscover[];
  judges: ScriptJudge[];
  params: ScriptParam[];
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

function sourceOf(t: DocTree): ScriptSource {
  for (const k of ["id", "adapter", "exit", "host", "retain", "since", "session", "snapshot", "profile", "keep", "unit", "vantage", "connection"]) text(t, k);
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
  if (t.attrs.connection !== undefined && (t.attrs.via ?? "worker") !== "worker") throw new Error(`${where(t)} connection names a connected account, which the api worker reads (via="worker")`);
  return said(t.attrs, SOURCE_FIELDS) as unknown as ScriptSource;
}

const WORD = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DATA_PATH = /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/;
/** A term's name in a `when`: a record field, or a path of its data. */
const WHEN_NAME = /^(class|about|key|title|data(\.[A-Za-z_]\w*)+)$/;
const WHEN_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "glob", "contains", "exists"];
/** The shape of a `when` (the platform reads its meaning: packages/domain/world/predicate.js in the repository). */
function whenShape(when: unknown): string | null {
  const list = Array.isArray(when) ? when : [when];
  if (!list.length || list.length > 16) return "one condition, or a list of one to 16";
  for (const c of list) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return `a condition is an object of terms ({ class: "security.kev" }), not ${JSON.stringify(c)}`;
    for (const [name, test] of Object.entries(c as Record<string, unknown>)) {
      if (!WHEN_NAME.test(name)) return `${JSON.stringify(name)} is class, about, key, title or a data path (data.cvss3)`;
      if (test && typeof test === "object" && !Array.isArray(test))
        for (const op of Object.keys(test)) if (!WHEN_OPS.includes(op)) return `${name}: ${op} is not an operator (${WHEN_OPS.join(", ")})`;
    }
  }
  return null;
}
function discoverOf(t: DocTree): ScriptDiscover {
  const at = `<discover into="${(t.attrs.into as string | undefined) ?? "./"}">`;
  for (const k of ["into", "class", "name"]) text(t, k, "into");
  const of = t.attrs.of;
  if (of !== undefined && !(typeof of === "string" ? of : Array.isArray(of) && of.length && of.every((x) => typeof x === "string" && x)))
    throw new Error(`${at} of is a script file or a list of them (["../kev/kev.script.tsx"]), not ${JSON.stringify(of)}`);
  for (const ref of of === undefined ? [] : typeof of === "string" ? [of] : (of as string[])) {
    const bad = tailRefProblem(ref);
    if (bad) throw new Error(`${at} of ${bad}`);
  }
  if (t.attrs.when !== undefined) {
    const bad = whenShape(t.attrs.when);
    if (bad) throw new Error(`${at} when: ${bad}`);
  }
  const slug = t.attrs.slug;
  const slugOk =
    (typeof slug === "string" && DATA_PATH.test(slug)) ||
    (!!slug && typeof slug === "object" && !Array.isArray(slug) && Array.isArray((slug as { paths?: unknown }).paths) && ((slug as { paths: unknown[] }).paths).length > 0 &&
      (slug as { paths: unknown[] }).paths.every((p) => typeof p === "string" && DATA_PATH.test(p)) &&
      Object.keys(slug).every((k) => k === "paths" || k === "pattern"));
  if (!slugOk) throw new Error(`${at} slug is a data path (data.cve) or { paths: [...], pattern }, not ${JSON.stringify(slug)}`);
  if (!/^[^#\s]+\.[jt]sx?#[A-Z][A-Za-z0-9_]{0,59}$/.test(t.attrs.class as string) && !PLACEHOLDER.test(t.attrs.class as string))
    throw new Error(`${at} class is the class file and its exported name ("../exploit.tsx#Exploit"), not ${JSON.stringify(t.attrs.class)}`);
  if (t.attrs.name !== undefined && !DATA_PATH.test(t.attrs.name as string)) throw new Error(`${at} name is a data path (fromName), not ${JSON.stringify(t.attrs.name)}`);
  const props = t.attrs.props;
  if (props !== undefined) {
    if (!props || typeof props !== "object" || Array.isArray(props)) throw new Error(`${at} props maps each prop to a data path ({ conversation: "conversation" }), not ${JSON.stringify(props)}`);
    for (const [k, v] of Object.entries(props as Record<string, unknown>))
      if (!/^[a-z][A-Za-z0-9]*$/.test(k) || typeof v !== "string" || !(DATA_PATH.test(v) || v === "$slug")) throw new Error(`${at} props.${k} is a data path or "$slug", not ${JSON.stringify(v)}`);
  }
  const max = t.attrs.max;
  if (max !== undefined && !(Number.isInteger(max) && (max as number) >= 1 && (max as number) <= DISCOVER_MAX)) throw new Error(`${at} max is a whole number from 1 to ${DISCOVER_MAX}, not ${JSON.stringify(max)}`);
  const visibility = t.attrs.visibility;
  if (visibility !== undefined && !VISIBILITIES.includes(visibility as Visibility)) throw new Error(`${at} visibility is ${VISIBILITIES.join(", ")}, not ${JSON.stringify(visibility)}`);
  return said(t.attrs, DISCOVER_FIELDS) as unknown as ScriptDiscover;
}
function deriveOf(t: DocTree): ScriptDerive {
  for (const k of ["id", "op", "since"]) text(t, k);
  if (!WORD.test(t.attrs.id as string)) throw new Error(`${where(t)} id is a word (letters, digits, _ and -)`);
  const inputs = t.attrs.inputs;
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs) || !Object.keys(inputs).length)
    throw new Error(`${where(t)} inputs maps each port to a file it tails ({ quotes: "../quotes/quotes.script.tsx" }), not ${JSON.stringify(inputs)}`);
  for (const [port, ref] of Object.entries(inputs as Record<string, unknown>)) {
    if (!WORD.test(port)) throw new Error(`${where(t)} a port is a word, not ${JSON.stringify(port)}`);
    if (typeof ref !== "string" || !ref) throw new Error(`${where(t)} inputs.${port} is a file it tails, not ${JSON.stringify(ref)}`);
    // A derive may fold its own script's records: "./".
    const bad = /^\.\/?$/.test(ref) ? null : tailRefProblem(ref);
    if (bad) throw new Error(`${where(t)} inputs.${port} ${bad}`);
  }
  const p = t.attrs.params;
  if (p !== undefined && (!p || typeof p !== "object" || Array.isArray(p))) throw new Error(`${where(t)} params is an object ({ window: "1m" }), not ${JSON.stringify(p)}`);
  if (t.attrs.since !== undefined && !SINCE.test(t.attrs.since as string)) throw new Error(`${where(t)} since is a day ("2024-01-01"), not ${JSON.stringify(t.attrs.since)}`);
  return said(t.attrs, DERIVE_FIELDS) as unknown as ScriptDerive;
}

function scriptOf(t: DocTree): ScriptDoc {
  for (const k of SCRIPT_FIELDS) if (k !== "sameAs") text(t, k);
  const same = t.attrs.sameAs;
  if (same !== undefined && !(Array.isArray(same) && same.every((s) => typeof s === "string" && SUBJECT.test(s))))
    throw new Error(`<script> sameAs is a list of subjects ("ticker:NVDA"), not ${JSON.stringify(same)}`);
  const parts = (tag: string) => t.children.filter((c) => c.tag === tag);
  for (const c of t.children) streamOf(c);
  const tails = parts("tail").map((c) => {
    text(c, "of", "of");
    if (c.attrs.when !== undefined && c.attrs.when !== null) {
      const bad = whenShape(c.attrs.when);
      if (bad) throw new Error(`<tail of="${c.attrs.of as string}"> when: ${bad}`);
    }
    const bad = tailRefProblem(c.attrs.of as string);
    if (bad) throw new Error(`<tail of="${c.attrs.of as string}"> ${bad}`);
    return said(c.attrs, TAIL_FIELDS) as unknown as ScriptTail;
  });
  const derives = parts("derive").map(deriveOf);
  const wakes = parts("wake").map((c) => {
    text(c, "prompt", "every");
    text(c, "agent", "every");
    const spend = c.attrs.maxSpend;
    if (spend !== undefined && !(typeof spend === "number" && Number.isFinite(spend) && spend > 0))
      throw new Error(`<wake> maxSpend is a price in USD (0.5), not ${JSON.stringify(spend)}`);
    if (c.attrs.when !== undefined) {
      const bad = whenShape(c.attrs.when);
      if (bad) throw new Error(`<wake> when: ${bad}`);
    }
    if (c.attrs.every !== undefined) {
      if (c.attrs.when !== undefined) throw new Error(`<wake every="${String(c.attrs.every)}"> wakes on records (when) or on a clock (every), not both`);
      const s = durationSeconds(c.attrs.every);
      if (s === null || s < durationSeconds(EVERY_BOUNDS.min)! || s > durationSeconds(EVERY_BOUNDS.max)!)
        throw new Error(`<wake> every is a duration from ${EVERY_BOUNDS.min} to ${EVERY_BOUNDS.max}, not ${JSON.stringify(c.attrs.every)}`);
    }
    return said(c.attrs, WAKE_FIELDS) as unknown as ScriptWake;
  });
  const judges = parts("judge").map((c) => {
    for (const k of ["id", "rubric", "model"]) text(c, k);
    if (!WORD.test(c.attrs.id as string)) throw new Error(`${where(c)} id is a word (letters, digits, _ and -)`);
    oneOf(c, "of", SCRIPT_JUDGE_OF);
    if (!/\.md$/i.test(c.attrs.rubric as string)) throw new Error(`${where(c)} rubric is a .md file ("./rubric.md"), not ${JSON.stringify(c.attrs.rubric)}`);
    return said(c.attrs, SCRIPT_JUDGE_FIELDS) as unknown as ScriptJudge;
  });
  const params = parts("param").map(paramOf);
  const ids = new Set<string>();
  for (const p of params) {
    if (ids.has(p.id)) throw new Error(`<param id="${p.id}"> is declared twice`);
    ids.add(p.id);
  }
  return { ...said(t.attrs, SCRIPT_FIELDS), sources: parts("source").map(sourceOf), tails, derives, wakes, discovers: parts("discover").map(discoverOf), judges, params };
}

function paramOf(c: DocTree): ScriptParam {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(c.attrs.id as string)) throw new Error(`${where(c)} id is letters, digits and _, not ${JSON.stringify(c.attrs.id)}`);
  oneOf(c, "type", SCRIPT_PARAM_TYPES);
  text(c, "label");
  const d = c.attrs.default;
  if (d !== undefined && typeof d !== "string" && !(typeof d === "number" && Number.isFinite(d))) throw new Error(`${where(c)} default is a text or a number, not ${JSON.stringify(d)}`);
  if (c.attrs.required !== undefined && typeof c.attrs.required !== "boolean") throw new Error(`${where(c)} required is true or false`);
  for (const k of ["choices", "accept"]) {
    const v = c.attrs[k];
    if (v !== undefined && !(Array.isArray(v) && v.length && v.every((x) => typeof x === "string" && x))) throw new Error(`${where(c)} ${k} is a list of texts`);
  }
  if (c.attrs.type === "choice" && c.attrs.choices === undefined) throw new Error(`${where(c)} a choice names its choices`);
  return said(c.attrs, SCRIPT_PARAM_FIELDS) as unknown as ScriptParam;
}

/** A part's `stream`, when it says one: a word. */
function streamOf(t: DocTree): void {
  const v = t.attrs.stream;
  if (v !== undefined && !(typeof v === "string" && STREAM_NAME.test(v))) throw new Error(`${where(t, t.tag === "tail" ? "of" : "id")} stream is a word ("records", "ticks"), not ${JSON.stringify(v)}`);
}

/** A statistics series by its id (`fred:DGS10`): a scheme and no `/`. */
const SERIES = /^[a-z][a-z0-9-]*:[^\s/:][^\s/]*$/;
/** A template's parameter as a whole value: `${of}`. */
const PLACEHOLDER = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;
/** A tailed file: a script file or a run's records file, by a ref or an address. */
const TAILED_FILE = /(?:^|\/)[^/]+\.script\.(?:[jt]sx|py|rs)$|(?:^|\/)records\.jsonl$/i;

/** Why a ref cannot be what a tail (a derive's port, a discover's `of`) reads, or null: it names a file, never a folder. */
export function tailRefProblem(ref: string): string | null {
  // A template's placeholder is a file once its copy fills it (docs/scripts.md § the catalogue).
  if (SERIES.test(ref) || TAILED_FILE.test(ref) || PLACEHOLDER.test(ref)) return null;
  if (/^\.\/?$/.test(ref)) return "names this script's folder; a tail names another file";
  return `names a file: a script ("../nvidia/nvidia.script.tsx"), a run's records.jsonl, or a series ("fred:DGS10"), not ${JSON.stringify(ref)}`;
}

export const scriptVocabulary: Vocabulary<ScriptDoc> = {
  format: "script",
  noun: "a script",
  root: "script",
  tags: {
    script: { parents: [], attrs: SCRIPT_FIELDS },
    source: { parents: ["script"], key: "id", required: ["id", "adapter", "every"], attrs: SOURCE_FIELDS },
    tail: { parents: ["script"], key: "of", required: ["of"], attrs: TAIL_FIELDS },
    derive: { parents: ["script"], key: "id", required: ["id", "op", "inputs"], attrs: DERIVE_FIELDS },
    wake: { parents: ["script"], required: ["prompt"], attrs: WAKE_FIELDS },
    discover: { parents: ["script"], required: ["slug", "class"], attrs: DISCOVER_FIELDS },
    judge: { parents: ["script"], key: "id", required: ["id", "of", "rubric", "model"], attrs: SCRIPT_JUDGE_FIELDS },
    param: { parents: ["script"], key: "id", required: ["id", "type"], attrs: SCRIPT_PARAM_FIELDS },
  },
  // A tail names a file by its ref: the platform checks that the file is there and has a run.
  fromTree: scriptOf,
  toTree(m) {
    return {
      tag: "script",
      attrs: attrsOf(m, SCRIPT_FIELDS),
      children: [
        ...(m.sources ?? []).map((s) => ({ tag: "source", attrs: attrsOf(s, SOURCE_FIELDS), children: [] })),
        ...(m.tails ?? []).map((f) => ({ tag: "tail", attrs: attrsOf(f, TAIL_FIELDS), children: [] })),
        ...(m.derives ?? []).map((d) => ({ tag: "derive", attrs: attrsOf(d, DERIVE_FIELDS), children: [] })),
        ...(m.wakes ?? []).map((w) => ({ tag: "wake", attrs: attrsOf(w, WAKE_FIELDS), children: [] })),
        ...(m.discovers ?? []).map((d) => ({ tag: "discover", attrs: attrsOf(d, DISCOVER_FIELDS), children: [] })),
        ...(m.judges ?? []).map((j) => ({ tag: "judge", attrs: attrsOf(j, SCRIPT_JUDGE_FIELDS), children: [] })),
        ...(m.params ?? []).map((p) => ({ tag: "param", attrs: attrsOf(p, SCRIPT_PARAM_FIELDS), children: [] })),
      ],
    };
  },
  empty: () => ({ sources: [], tails: [], derives: [], wakes: [], discovers: [], judges: [], params: [] }),
};

registerVocabulary(scriptVocabulary);

/** The vocabulary of a script, by format. */
export const SCRIPTS = { script: scriptVocabulary } as const;

/** A script as the platform reads it: what the file does not say, filled (`via: "worker"`, `stream: "records"` …). */
export function scriptWithDefaults(m: ScriptDoc) {
  return {
    title: m.title ?? null,
    class: m.class ?? null,
    about: m.about ?? null,
    readme: m.readme ?? null,
    sameAs: m.sameAs ?? [],
    sources: m.sources.map((s) => ({ id: s.id, adapter: s.adapter, params: s.params ?? {}, every: s.every, via: s.via ?? "worker", exit: s.exit ?? null, host: s.host ?? null, mode: s.mode ?? "poll", retain: s.mode === "stream" ? (s.retain ?? "derived") : null, since: s.since ?? null, session: s.session ?? null, snapshot: s.snapshot ?? null, profile: s.profile ?? null, keep: s.keep ?? null, maxCostPerDay: s.maxCostPerDay ?? null, unit: s.unit ?? null, vantage: s.vantage ?? null, connection: s.connection ?? null, stream: s.stream ?? "records" })),
    tails: m.tails.map((f) => ({ of: f.of, when: f.when ?? null, stream: f.stream ?? "records" })),
    derives: (m.derives ?? []).map((d) => ({ id: d.id, op: d.op, inputs: d.inputs, params: d.params ?? {}, since: d.since ?? null, stream: d.stream ?? "records" })),
    wakes: m.wakes.map((w) => ({ when: w.when ?? null, every: w.every ?? null, prompt: w.prompt, agent: w.agent ?? null, maxSpend: w.maxSpend ?? null })),
    discovers: (m.discovers ?? []).map((d) => ({ into: d.into ?? "./", of: d.of === undefined ? [] : typeof d.of === "string" ? [d.of] : d.of, when: d.when ?? null, slug: d.slug, class: d.class, props: d.props ?? {}, name: d.name ?? null, max: d.max ?? 10, visibility: d.visibility ?? null })),
    judges: (m.judges ?? []).map((j) => ({ id: j.id, of: j.of, rubric: j.rubric, model: j.model })),
    params: (m.params ?? []).map((p) => ({ id: p.id, type: p.type, label: p.label ?? null, default: p.default ?? null, required: p.required ?? true, choices: p.choices ?? null, accept: p.accept ?? null })),
  };
}
