/**
 * MONITOR BLUEPRINTS IN JSX — a `<name>.monitors.tsx`: many monitors declared at once (docs/monitors.md, in the
 * CommandAGI repository). A monitor is a thread that follows one thing in the world; its sources read it, its follows
 * copy what another monitor records, its wakes wake its agent.
 *
 *   // monitors/economy.monitors.tsx
 *   const Series = ({ id, title, series, every = "6h" }) => (
 *     <monitor id={`economy/${id}`} title={title} class="economic-series" about={`fred:${series}`}>
 *       <source id="fred" adapter="fred" params={{ series }} every={every} />
 *     </monitor>
 *   );
 *
 *   export default () => (
 *     <monitors id="economy" title="Economy and monetary policy">
 *       {[["cpi", "CPI, all items", "CPIAUCSL"], ["unrate", "Unemployment rate", "UNRATE"]].map(([id, title, series]) => (
 *         <Series id={id} title={title} series={series} />
 *       ))}
 *       <monitor id="economy/treasury-yields" title="Treasury yields" class="interest-rate">
 *         <source id="dgs10" adapter="fred" params={{ series: "DGS10" }} every="6h" />
 *         <follows monitor="economy/cpi" match="fred.*" />
 *         <wake match="fred.observation" prompt="Say what moved." />
 *       </monitor>
 *     </monitors>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim. A
 * class of things is a component, its instances are data, its wiring is props. A monitor is named by its `id` in the
 * blueprint, a source by its `id` in its monitor, a follow by the `monitor` it follows; a wake by its place.
 *
 * Nothing adds a default: what the file does not say, the document does not have (`visibility`, `via`, `readme`,
 * `exit`). `monitorsWithDefaults` gives the document as the platform reads it (`visibility: "public"`, `via:
 * "worker"`, `readme` and `exit` null). A monitor's lists (`sources`, `follows`, `wakes`) and the blueprint's
 * `monitors` are always there, empty when the file has none.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a blueprint, of a monitor, and of each part of a monitor. */
export const BLUEPRINT_FIELDS = ["id", "title"] as const;
export const MONITOR_FIELDS = ["id", "title", "class", "about", "visibility", "readme"] as const;
export const SOURCE_FIELDS = ["id", "adapter", "params", "every", "via", "exit"] as const;
export const FOLLOW_FIELDS = ["monitor", "match"] as const;
export const WAKE_FIELDS = ["match", "prompt"] as const;

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export const VIAS = ["worker", "host", "vpn"] as const;
/** The shortest and the longest `every` a source may have (an adapter may ask for longer: its `minEvery`). */
export const EVERY_BOUNDS = { min: "30s", max: "7d" } as const;

export interface MonitorSource {
  id: string;
  adapter: string;
  params?: Record<string, unknown>;
  every: string;
  via?: (typeof VIAS)[number];
  exit?: string;
}
export interface MonitorFollow {
  monitor: string;
  match?: string;
}
export interface MonitorWake {
  match?: string;
  prompt: string;
}
export interface Monitor {
  id: string;
  title?: string;
  class?: string;
  about?: string;
  visibility?: (typeof VISIBILITIES)[number];
  readme?: string;
  sources: MonitorSource[];
  follows: MonitorFollow[];
  wakes: MonitorWake[];
}
export interface MonitorsDoc {
  id: string;
  title?: string;
  monitors: Monitor[];
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

function monitorOf(t: DocTree): Monitor {
  for (const k of MONITOR_FIELDS) if (k !== "visibility") text(t, k);
  oneOf(t, "visibility", VISIBILITIES);
  const parts = (tag: string) => t.children.filter((c) => c.tag === tag);
  const follows = parts("follows").map((c) => {
    text(c, "monitor", "monitor");
    text(c, "match", "monitor");
    if (c.attrs.monitor === t.attrs.id) throw new Error(`${where(t)} follows itself; a follow names another monitor`);
    return said(c.attrs, FOLLOW_FIELDS) as unknown as MonitorFollow;
  });
  const wakes = parts("wake").map((c) => {
    text(c, "match", "match");
    text(c, "prompt", "match");
    return said(c.attrs, WAKE_FIELDS) as unknown as MonitorWake;
  });
  return { ...(said(t.attrs, MONITOR_FIELDS) as { id: string }), sources: parts("source").map(sourceOf), follows, wakes };
}

/** A blueprint's stem as its id: `Economy` → `economy`, `Public companies` → `public-companies`. */
export const blueprintId = (name: string) =>
  name.trim().toLowerCase().replace(/[^a-z0-9/._-]+/g, "-").replace(/^-+|-+$/g, "") || "monitors";

export const monitorsVocabulary: Vocabulary<MonitorsDoc> = {
  format: "monitors",
  noun: "a monitor blueprint",
  root: "monitors",
  tags: {
    monitors: { parents: [], required: ["id"], attrs: BLUEPRINT_FIELDS },
    monitor: { parents: ["monitors"], key: "id", required: ["id"], attrs: MONITOR_FIELDS },
    source: { parents: ["monitor"], key: "id", scoped: true, required: ["id", "adapter", "every"], attrs: SOURCE_FIELDS },
    follows: { parents: ["monitor"], key: "monitor", scoped: true, required: ["monitor"], attrs: FOLLOW_FIELDS },
    wake: { parents: ["monitor"], required: ["prompt"], attrs: WAKE_FIELDS },
  },
  fromTree(t) {
    text(t, "id");
    text(t, "title");
    // A follow may name a monitor of another blueprint of the account: apply checks that it exists, not the file.
    return { ...(said(t.attrs, BLUEPRINT_FIELDS) as { id: string }), monitors: t.children.map(monitorOf) };
  },
  toTree(d) {
    return {
      tag: "monitors",
      attrs: attrsOf(d, BLUEPRINT_FIELDS),
      children: (d.monitors ?? []).map((m) => ({
        tag: "monitor",
        attrs: attrsOf(m, MONITOR_FIELDS),
        children: [
          ...(m.sources ?? []).map((s) => ({ tag: "source", attrs: attrsOf(s, SOURCE_FIELDS), children: [] })),
          ...(m.follows ?? []).map((f) => ({ tag: "follows", attrs: attrsOf(f, FOLLOW_FIELDS), children: [] })),
          ...(m.wakes ?? []).map((w) => ({ tag: "wake", attrs: attrsOf(w, WAKE_FIELDS), children: [] })),
        ],
      })),
    };
  },
  empty: (name) => ({ id: blueprintId(name), title: name, monitors: [] }),
};

registerVocabulary(monitorsVocabulary);

/** The vocabulary of monitor blueprints, by format. */
export const MONITORS = { monitors: monitorsVocabulary } as const;

/** A monitor as the platform reads it: what the file does not say, filled (`visibility: "public"`, `via: "worker"` …). */
export function monitorsWithDefaults(d: MonitorsDoc) {
  return {
    id: d.id,
    title: d.title ?? null,
    monitors: d.monitors.map((m) => ({
      id: m.id,
      title: m.title ?? null,
      class: m.class ?? null,
      about: m.about ?? null,
      visibility: m.visibility ?? "public",
      readme: m.readme ?? null,
      sources: m.sources.map((s) => ({ id: s.id, adapter: s.adapter, params: s.params ?? {}, every: s.every, via: s.via ?? "worker", exit: s.exit ?? null })),
      follows: m.follows.map((f) => ({ monitor: f.monitor, match: f.match ?? null })),
      wakes: m.wakes.map((w) => ({ match: w.match ?? null, prompt: w.prompt })),
    })),
  };
}
