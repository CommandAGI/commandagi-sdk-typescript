/**
 * THE ONTOLOGY'S OWN FILES IN JSX — worlds, device definitions, dashboards, geo projects (and their shocks, scenarios,
 * models and parameter sets) and node graphs, written as
 * the elements their editors edit (docs/formats.md § code as the source of truth, in the CommandAGI repository).
 *
 *   // worlds/shop/world.tsx
 *   export default () => (
 *     <world name="Shop" kind="physical">
 *       <unit uid="arm" name="arm" device="../../devices/so-101/definition.tsx" position={[0, 0, 0]} rotation={0} />
 *     </world>
 *   );
 *
 * A record is an element and its fields are the element's attributes, verbatim; a list of records is the parent's
 * children (`units` → `<unit>`, `channels` → `<channel>`, a scene's `bodies` → `<body>`). The tags:
 *
 *   <world name kind description? from? model?    world.tsx             <space origin_mm size_mm>, <group uid …>,
 *          links? policies?>                                                     <unit uid …>, <view …>, <scene …> (<body id …>),
 *                                                                                  <interlock name unit channel requires why …>
 *   <device name … firmware? revision?>           definition.tsx        <channel id dir medium format transport …>,
 *                                                                        <bound channel field min? max? maxRate? maxSpeed?>,
 *                                                                        <interlock name channel requires why verbs? when?>
 *   <dashboard name …>                            <name>.dashboard.tsx   <param id type …>, one layout: <split axis
 *                                                                        ratio> of two <split>|<pane id kind …>, or
 *                                                                        one <pane> (repeat="live-stream": one pane
 *                                                                        per live stream); <region side tab …>
 *   <geoproject id name …>                        <name>.geo.tsx         <dateRange start end>, <camera …>,
 *                                                                        <reference role path …>
 *   <shock id name eventType targets start …>     <name>.shock.tsx       <reference role path …>
 *   <scenario id name baselineDate events …>      <name>.scenario.tsx    <reference role path …>
 *   <geomodel id name runtime version …>          <name>.geomodel.tsx    <parameter name default min max label?>,
 *                                                                        <reference role path …>
 *   <geoparams id name forModel values>           <name>.geoparams.tsx   <reference role path …>
 *   <opgraph name>                                <name>.opgraph.tsx     <node id type x y …ports>, <wire from to>
 *
 * A node graph is the editor's op graph itself (no carrier): `<node id="blur" type="blur" x={300} y={80} radius={6} />`
 * is the node `{ id: "blur", type: "blur", inputs: { radius: 6 }, meta: { x: 300, y: 80 } }`, and
 * `<wire from="gradient:out" to="blur:in" />` the wire into its `in` port (a node's literal for a wired port is kept
 * beside the wire, as the format keeps it). `output` marks a terminal. A port whose name is not an attribute name
 * (`layers.3`) is written in `inputs={{ "layers.3": null }}`.
 *
 * A code form declares; it never enforces. A definition's bounds, interlocks and grants are read and enforced by the
 * host as they are for its JSON.
 *
 * Bounds and interlocks are what the host's admission gate holds every command to, driver or not (docs/devices.md §
 * the admission gate, in the CommandAGI repository). A `<bound>` names its channel and one field of what the channel's
 * commands set (`fr3_joint1`, `FL_knee.q`); it folds into that channel's `bounds`. An `<interlock>` refuses a command
 * on its `channel` unless each of `requires` holds on another channel's last known state; an unknown state refuses:
 *
 *   <bound channel="joints" field="fr3_joint1" min={-2.9007} max={2.9007} maxRate={2.62} />
 *   <interlock name="gate-closes-only-with-shuttle-home" channel="gate" when={{ field: "lift", lt: 420 }}
 *     requires={[{ channel: "shuttle-switches", field: "home", eq: true }]} why="…" />
 *
 * A world's `<interlock>` names the unit it guards (`unit`) and, in each requirement, the unit it reads (`unit`, the
 * guarded one when absent).
 */
import { Declaration, type IRGraph, type IRNode, type IRWire } from "./ir.js";
import { isElement, type DesignElement } from "./jsx-runtime.js";
import { registerVocabulary, treeOfElement, type DocTree, type TagRule, type Vocabulary } from "./documents.js";

const own = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const omit = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !keys.includes(k) && v !== undefined));
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const childrenOf = (t: DocTree, tag: string) => t.children.filter((c) => c.tag === tag);
const leaf = (tag: string, attrs: Record<string, unknown>): DocTree => ({ tag, attrs, children: [] });

// ── world.tsx ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The fields of a unit in a world's file (packages/domain/world/worlds.js). */
/** `serial`: the serial number of the one physical thing a unit is; `revision`: its hardware revision (a firmware release says which it supports); `calibration`: a ref to the unit's own `.calibration.tsx` (its joints' zeros and gains, and its re-zeros). */
export const UNIT_FIELDS = ["uid", "name", "device", "serial", "revision", "domain", "group", "size_mm", "support", "channels", "manualUrl", "position", "rotation", "tilt_deg", "release", "calibration"] as const;
/**
 * The fields of a group in a world's file (packages/domain/world/worlds.js): what one unit stands in — a shelf level, a
 * bench, a rack, a desk. `group` nests a group in another (a shelf holds its levels); `size_mm` with `position` and
 * `rotation` is the box the world view draws. A group has no device and no channel: nothing runs or is granted on it.
 */
export const GROUP_FIELDS = ["uid", "name", "description", "group", "size_mm", "position", "rotation"] as const;
/**
 * `links`: the parts of the world's model that a run moves (packages/domain/world/pose.js modelPose). A definition's
 * link grammar, with the unit named in each joint and emit: `links={[{ node: "ram", joint: { unit: "press-1",
 * channel: "axes", name: "z", type: "prismatic", axis: "z", origin_mm: [0, 0, 0], home: 0 } }]}`, `node` the id of
 * the model's feature that makes the part. A model with no links is drawn as it is.
 *
 * `policies`: the world's follow policies (docs/follow.md in the CommandAGI repository): one unit's robot (the follower)
 * tracks another's joints (the leader), by angle. `reality` is where the follower is driven; `leader.run` which run
 * leads (`twin`, `physical`, or a ref to a run folder: replay).
 */
const WORLD_FIELDS = ["name", "kind", "description", "from", "model", "links", "policies"] as const;
/** A `<bound>`'s attributes: the channel it bounds, the field, and its limits. */
const BOUND_FIELDS = ["channel", "field", "min", "max", "maxRate", "maxSpeed", "why"] as const;
/** An `<interlock>`'s attributes; `unit` only in a world. */
const INTERLOCK_FIELDS = ["name", "unit", "channel", "verbs", "when", "requires", "why"] as const;

/** A follow policy of a world (`<world policies={[…]}>`; docs/follow.md). Units are rad, rad/s, rad/s², ms. */
export interface FollowPolicy {
  id: string;
  kind: "follow";
  /** The follower: a unit uid of this world. */
  robot: string;
  /** The follower's servo-bus channel; the unit's one servo-bus channel when absent. */
  channel?: string;
  reality: "physical" | "simulation";
  leader: { unit: string; channel?: string; run: "twin" | "physical" | string };
  /** `{ <follower joint>: <leader joint> }`; same-named joints when absent. */
  map?: Record<string, string>;
  hz?: number;
  maxSpeed?: number;
  maxAccel?: number;
  divergence?: number;
  divergenceMs?: number;
  leaderTimeoutMs?: number;
  onStop?: "hold" | "torque-off";
}

export interface WorldDoc {
  name: string;
  kind: "physical" | "simulation";
  units: Record<string, unknown>[];
  policies?: FollowPolicy[];
  /** Interlocks between its units, each an `<interlock>` element. */
  interlocks?: Record<string, unknown>[];
  groups?: Record<string, unknown>[];
  [field: string]: unknown;
}

export const worldVocabulary: Vocabulary<WorldDoc> = {
  format: "world",
  noun: "a world",
  root: "world",
  tags: {
    world: { parents: [], required: ["name", "kind"], attrs: WORLD_FIELDS },
    space: { parents: ["world"], single: true, required: ["origin_mm", "size_mm"], attrs: ["origin_mm", "size_mm"] },
    group: { parents: ["world"], key: "uid", required: ["uid", "name"], attrs: GROUP_FIELDS },
    unit: { parents: ["world"], key: "uid", required: ["uid", "name", "device"], attrs: UNIT_FIELDS },
    view: { parents: ["world"], single: true },
    scene: { parents: ["world"], single: true },
    body: { parents: ["scene"], key: "id", required: ["id"] },
    interlock: { parents: ["world"], key: "name", required: ["name", "unit", "channel", "requires", "why"], attrs: INTERLOCK_FIELDS },
  },
  fromTree(t) {
    if (t.attrs.kind !== "physical" && t.attrs.kind !== "simulation") throw new Error(`<world> kind is "physical" or "simulation", said explicitly, not ${JSON.stringify(t.attrs.kind)}`);
    const space = childrenOf(t, "space")[0], view = childrenOf(t, "view")[0], scene = childrenOf(t, "scene")[0];
    const bodies = scene ? childrenOf(scene, "body") : [], groups = childrenOf(t, "group"), interlocks = childrenOf(t, "interlock");
    return {
      ...(own(t.attrs, WORLD_FIELDS) as { name: string; kind: "physical" | "simulation" }),
      ...(space ? { space: { ...space.attrs } } : {}),
      ...(groups.length ? { groups: groups.map((g) => ({ ...g.attrs })) } : {}),
      units: childrenOf(t, "unit").map((u) => ({ ...u.attrs })),
      ...(view ? { view: { ...view.attrs } } : {}),
      ...(scene ? { scene: { ...scene.attrs, ...(bodies.length ? { bodies: bodies.map((b) => ({ ...b.attrs })) } : {}) } } : {}),
      ...(interlocks.length ? { interlocks: interlocks.map((i) => ({ ...i.attrs })) } : {}),
    };
  },
  toTree(w) {
    const children: DocTree[] = [];
    if (isRecord(w.space)) children.push(leaf("space", { ...w.space }));
    for (const g of w.groups ?? []) children.push(leaf("group", own(g, GROUP_FIELDS)));
    for (const u of w.units ?? []) children.push(leaf("unit", own(u, UNIT_FIELDS)));
    if (isRecord(w.view)) children.push(leaf("view", { ...w.view }));
    if (isRecord(w.scene)) {
      const bodies = Array.isArray(w.scene.bodies) && w.scene.bodies.every((b) => isRecord(b) && typeof b.id === "string") ? (w.scene.bodies as Record<string, unknown>[]) : null;
      children.push({ tag: "scene", attrs: bodies ? omit(w.scene, ["bodies"]) : { ...w.scene }, children: (bodies ?? []).map((b) => leaf("body", { ...b })) });
    }
    for (const i of w.interlocks ?? []) children.push(leaf("interlock", { ...i }));
    return { tag: "world", attrs: own(w, WORLD_FIELDS), children };
  },
};

// ── definition.tsx ─────────────────────────────────────────────────────────────────────────────────────────────

export interface DeviceDoc {
  name: string;
  channels?: Record<string, unknown>[];
  interlocks?: Record<string, unknown>[];
  [field: string]: unknown;
}

export const deviceVocabulary: Vocabulary<DeviceDoc> = {
  format: "device",
  noun: "a device definition",
  root: "device",
  tags: {
    device: { parents: [], required: ["name"] },
    channel: { parents: ["device"], key: "id", required: ["id"] },
    bound: { parents: ["device"], required: ["channel", "field"], attrs: BOUND_FIELDS },
    interlock: { parents: ["device"], key: "name", required: ["name", "channel", "requires", "why"], attrs: INTERLOCK_FIELDS.filter((k) => k !== "unit") },
  },
  fromTree(t) {
    if ("channels" in t.attrs) throw new Error("<device>: write each channel as a <channel> element, not a channels attribute");
    if ("interlocks" in t.attrs) throw new Error("<device>: write each interlock as an <interlock> element, not an interlocks attribute");
    const channels = childrenOf(t, "channel").map((c) => {
      if ("bounds" in c.attrs) throw new Error(`<channel id="${String(c.attrs.id)}">: write each bound as a <bound channel="${String(c.attrs.id)}"> element, not a bounds attribute`);
      return { ...c.attrs } as Record<string, unknown>;
    });
    for (const b of childrenOf(t, "bound")) {
      const c = channels.find((x) => x.id === b.attrs.channel);
      if (!c) throw new Error(`<bound field="${String(b.attrs.field)}">: channel ${JSON.stringify(b.attrs.channel)} is not a <channel> of this device`);
      ((c.bounds ??= []) as Record<string, unknown>[]).push(omit(b.attrs, ["channel"]));
    }
    const interlocks = childrenOf(t, "interlock").map((i) => ({ ...i.attrs }));
    return { ...(t.attrs as { name: string }), ...(channels.length ? { channels } : {}), ...(interlocks.length ? { interlocks } : {}) };
  },
  toTree(d) {
    const channels = d.channels ?? [];
    const bounds = channels.flatMap((c) => (Array.isArray(c.bounds) ? (c.bounds as Record<string, unknown>[]).map((b) => leaf("bound", { channel: c.id, ...b })) : []));
    return {
      tag: "device",
      attrs: omit(d, ["channels", "interlocks"]),
      children: [...channels.map((c) => leaf("channel", omit(c, ["bounds"]))), ...bounds, ...(d.interlocks ?? []).map((i) => leaf("interlock", { ...i }))],
    };
  },
};

// ── <name>.dashboard.tsx ───────────────────────────────────────────────────────────────────────────────────────

export interface DashboardDoc {
  format: "commandagi-dashboard";
  name: string;
  layout: LayoutNode;
  panes: Record<string, Record<string, unknown>>;
  params?: Record<string, unknown>[];
  regions?: Record<string, Record<string, unknown>>;
  [field: string]: unknown;
}
export type LayoutNode = { kind: "leaf"; paneId: string } | { kind: "split"; axis: string; ratio: number; children: LayoutNode[] };

const DASHBOARD_STRUCTURE = ["format", "layout", "panes", "params", "regions"];

export const dashboardVocabulary: Vocabulary<DashboardDoc> = {
  format: "dashboard",
  noun: "a dashboard",
  root: "dashboard",
  tags: {
    dashboard: { parents: [], required: ["name"] },
    param: { parents: ["dashboard"], key: "id", required: ["id", "type"] },
    split: { parents: ["dashboard", "split"], required: ["axis", "ratio"], attrs: ["axis", "ratio"] },
    pane: { parents: ["dashboard", "split"], key: "id", required: ["id"] },
    region: { parents: ["dashboard"], key: "side", required: ["side"] },
  },
  fromTree(t) {
    for (const k of DASHBOARD_STRUCTURE) if (k in t.attrs) throw new Error(`<dashboard>: ${k} is written as elements (<param>, <split>, <pane>, <region>), not an attribute`);
    const layouts = t.children.filter((c) => c.tag === "split" || c.tag === "pane");
    if (layouts.length !== 1) throw new Error(`<dashboard> has one layout: a <split> or one <pane> (it has ${layouts.length})`);
    const panes: Record<string, Record<string, unknown>> = {};
    const layout = (n: DocTree): LayoutNode => {
      if (n.tag === "pane") {
        const id = String(n.attrs.id);
        if (panes[id]) throw new Error(`two <pane> have id "${id}"`);
        const pane = omit(n.attrs, ["id"]);
        // A repeating pane is one pane per live stream (the shell grows it): it is what it repeats, never a file.
        if (pane.repeat !== undefined && (pane.repeat !== "live-stream" || pane.kind !== "files" || "selected" in pane || "path" in pane))
          throw new Error(`<pane ${id}>: repeat is "live-stream", and a repeating pane shows files and names no file of its own (it is filled from what is live)`);
        panes[id] = pane;
        return { kind: "leaf", paneId: id };
      }
      const kids = n.children.filter((c) => c.tag === "split" || c.tag === "pane");
      if (kids.length !== 2) throw new Error(`a <split> has two sides (this one has ${kids.length})`);
      return { kind: "split", axis: n.attrs.axis as string, ratio: n.attrs.ratio as number, children: kids.map(layout) };
    };
    const root = layout(layouts[0]!);
    const params = childrenOf(t, "param").map((p) => ({ ...p.attrs }));
    const regions = Object.fromEntries(childrenOf(t, "region").map((r) => [String(r.attrs.side), omit(r.attrs, ["side"])]));
    return {
      format: "commandagi-dashboard",
      ...(t.attrs as { name: string }),
      ...(params.length ? { params } : {}),
      layout: root,
      panes,
      ...(Object.keys(regions).length ? { regions } : {}),
    } as DashboardDoc;
  },
  toTree(d) {
    const used = new Set<string>();
    const layout = (n: LayoutNode): DocTree => {
      if (n.kind === "leaf") {
        used.add(n.paneId);
        return leaf("pane", { id: n.paneId, ...(d.panes?.[n.paneId] ?? {}) });
      }
      // A split's ratio to a thousandth, as a saved tab has it: a ratio the code computes (1 / 3) is the same split.
      return { tag: "split", attrs: { axis: n.axis, ratio: typeof n.ratio === "number" ? Math.round(n.ratio * 1000) / 1000 : n.ratio }, children: n.children.map(layout) };
    };
    const children = [...(d.params ?? []).map((p) => leaf("param", { ...p })), layout(d.layout)];
    for (const id of Object.keys(d.panes ?? {})) if (!used.has(id)) throw new Error(`pane ${id} is in no part of the layout, so a dashboard in code cannot hold it`);
    for (const [side, r] of Object.entries(d.regions ?? {})) children.push(leaf("region", { side, ...r }));
    return { tag: "dashboard", attrs: omit(d, DASHBOARD_STRUCTURE), children };
  },
};

// ── <name>.geo.tsx (the geo project's manifest) ────────────────────────────────────────────────────────────────────

const GEO_FIELDS = ["id", "name", "createdAt", "updatedAt", "description", "defaultWorkspace", "metadata"] as const;
export interface GeoProjectDoc {
  type: "geoeconomics/project";
  schemaVersion: string;
  id: string;
  name: string;
  data: Record<string, unknown>;
  [field: string]: unknown;
}

export const geoVocabulary: Vocabulary<GeoProjectDoc> = {
  format: "geo",
  noun: "a geo project",
  root: "geoproject",
  tags: {
    geoproject: { parents: [], required: ["id", "name"], attrs: GEO_FIELDS },
    dateRange: { parents: ["geoproject"], single: true, required: ["start", "end"] },
    camera: { parents: ["geoproject"], single: true },
    reference: { parents: ["geoproject"], key: "path", required: ["role", "path"], attrs: ["role", "path", "hash"] },
  },
  fromTree(t) {
    const range = childrenOf(t, "dateRange")[0], camera = childrenOf(t, "camera")[0], refs = childrenOf(t, "reference");
    const { description, defaultWorkspace, ...top } = own(t.attrs, GEO_FIELDS);
    return {
      type: "geoeconomics/project",
      // The geo project's manifest says which shape it is in; this is the one the studio reads.
      schemaVersion: "1.0",
      ...(top as { id: string; name: string }),
      ...(refs.length ? { references: refs.map((r) => ({ ...r.attrs })) } : {}),
      data: {
        ...(defaultWorkspace !== undefined ? { defaultWorkspace } : {}),
        ...(range ? { defaultDateRange: { ...range.attrs } } : {}),
        ...(camera ? { defaultCamera: { ...camera.attrs } } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    };
  },
  toTree(g) {
    const data = isRecord(g.data) ? g.data : {};
    const attrs = { ...own(g, GEO_FIELDS.filter((k) => k !== "description" && k !== "defaultWorkspace")), ...own(data, ["description", "defaultWorkspace"]) };
    const children: DocTree[] = [];
    if (isRecord(data.defaultDateRange)) children.push(leaf("dateRange", { ...data.defaultDateRange }));
    if (isRecord(data.defaultCamera)) children.push(leaf("camera", { ...data.defaultCamera }));
    for (const r of Array.isArray(g.references) ? g.references : []) if (isRecord(r)) children.push(leaf("reference", { ...r }));
    const extra = Object.keys(data).filter((k) => !["defaultDateRange", "defaultCamera", "description", "defaultWorkspace"].includes(k));
    if (extra.length) throw new Error(`the project's ${extra.join(", ")} has no element in a geo project in code yet`);
    return { tag: "geoproject", attrs, children };
  },
};

// ── a geo project's documents: <name>.shock.tsx, .scenario.tsx, .geomodel.tsx, .geoparams.tsx ───────────────────────

/** What a geo document says of itself. Its times are the file's own: the code holds none, so an edit changes one field. */
const GEO_OWN = ["id", "name", "metadata"] as const;
/** The envelope the geo studio holds a geo document in (`type` says which), its fields under `data`. */
export interface GeoFileDoc {
  type: string;
  schemaVersion: string;
  id: string;
  name: string;
  data: Record<string, unknown>;
  [field: string]: unknown;
}

/** A keyed record of the document's `data` (a model's `parameterSchema`), written as one child element per entry. */
interface GeoRecord {
  tag: string;
  field: string;
  key: string;
  attrs: readonly string[];
  required: readonly string[];
}

/**
 * The vocabulary of one geo document: a root element whose attributes are its own fields and its `data`'s, verbatim,
 * and `<reference role path hash?>` children (its `references`).
 */
function geoFileVocabulary(format: string, noun: string, root: string, type: string, fields: readonly string[], record?: GeoRecord): Vocabulary<GeoFileDoc> {
  const tags: Record<string, TagRule> = {
    [root]: { parents: [], required: ["id", "name"], attrs: [...GEO_OWN, ...fields] },
    reference: { parents: [root], key: "path", required: ["role", "path"], attrs: ["role", "path", "hash"] },
  };
  if (record) tags[record.tag] = { parents: [root], key: record.key, required: record.required, attrs: record.attrs };
  const envelope = new Set(["type", "schemaVersion", "createdAt", "updatedAt", "data", "references", ...GEO_OWN]);
  return {
    format,
    noun,
    root,
    tags,
    fromTree(t) {
      const refs = childrenOf(t, "reference");
      const data = own(t.attrs, fields);
      const entries = record ? childrenOf(t, record.tag) : [];
      if (record && entries.length) data[record.field] = Object.fromEntries(entries.map((e) => [String(e.attrs[record.key]), omit(e.attrs, [record.key])]));
      return {
        type,
        // A geo document says which shape it is in; this is the one the studio reads.
        schemaVersion: "1.0",
        ...(own(t.attrs, GEO_OWN) as { id: string; name: string }),
        ...(refs.length ? { references: refs.map((r) => ({ ...r.attrs })) } : {}),
        data,
      };
    },
    toTree(g) {
      const data = isRecord(g.data) ? g.data : {};
      const extra = [
        ...Object.keys(g).filter((k) => !envelope.has(k) && g[k] !== undefined),
        ...Object.keys(data).filter((k) => !fields.includes(k) && k !== record?.field && data[k] !== undefined),
      ];
      if (extra.length) throw new Error(`the ${extra.join(", ")} of ${noun} has no element in code yet`);
      const children: DocTree[] = [];
      if (record && isRecord(data[record.field]))
        for (const [k, v] of Object.entries(data[record.field] as Record<string, unknown>)) children.push(leaf(record.tag, { [record.key]: k, ...(isRecord(v) ? v : {}) }));
      for (const r of Array.isArray(g.references) ? g.references : []) if (isRecord(r)) children.push(leaf("reference", { ...r }));
      return { tag: root, attrs: { ...own(g, GEO_OWN), ...own(data, fields) }, children };
    },
  };
}

/** A shock (`<name>.shock.tsx`): one intervention of a scenario. A click on the globe rewrites its `targets`. */
export const shockVocabulary = geoFileVocabulary("shock", "a shock", "shock", "geoeconomics/event", [
  "eventType",
  "targets",
  "start",
  "durationMonths",
  "magnitude",
  "probability",
  "implementationLagMonths",
  "enabled",
  "affectedVariables",
  "transmissionChannels",
  "notes",
]);
/** A scenario (`<name>.scenario.tsx`): the shocks, models and parameter sets it runs, by their paths. */
export const scenarioVocabulary = geoFileVocabulary("scenario", "a scenario", "scenario", "geoeconomics/scenario", [
  "baselineDate",
  "timeHorizon",
  "parentScenario",
  "events",
  "models",
  "parameterSets",
  "tags",
]);
/** A model's manifest (`<name>.geomodel.tsx`): its runtime and a `<parameter>` per entry of its `parameterSchema`. */
export const geomodelVocabulary = geoFileVocabulary(
  "geomodel",
  "a geo model",
  "geomodel",
  "geoeconomics/model",
  ["runtime", "version", "compatibleEvents", "assumptions", "limitations", "citations", "validation"],
  { tag: "parameter", field: "parameterSchema", key: "name", attrs: ["name", "label", "default", "min", "max"], required: ["name", "default", "min", "max"] },
);
/** A parameter set (`<name>.geoparams.tsx`): values for one model's parameters. */
export const geoparamsVocabulary = geoFileVocabulary("geoparams", "a geo parameter set", "geoparams", "geoeconomics/params", ["forModel", "values"]);

// ── <name>.opgraph.tsx: the node graph ─────────────────────────────────────────────────────────────────────────────

/** The graph id and domain a node graph has unless its file says another (the node-graph editor's new graph). */
export const NODE_GRAPH_ID = "nodegraph";
/** A node's attributes that are not its ports. */
const NODE_ATTRS = ["id", "type", "label", "x", "y", "disabled", "output", "meta", "inputs"] as const;
const ATTRIBUTE_NAME = /^[A-Za-z_$][\w$-]*$/;
/** Whether a port is written as an attribute of its node (else in `inputs={{ … }}`). */
export const portIsAttribute = (port: string) => ATTRIBUTE_NAME.test(port) && !(NODE_ATTRS as readonly string[]).includes(port) && port !== "key" && port !== "children";

const isWire = (v: unknown): v is IRWire => isRecord(v) && isRecord(v.wire) && typeof v.wire.node === "string" && typeof v.wire.port === "string";
/** `"gradient:out"` → { node, port } (a node id has no colon; a port may have dots: `mix:layers.2`). */
function endOf(text: unknown, what: string): { node: string; port: string } {
  const m = typeof text === "string" ? /^([^:]+):(.+)$/.exec(text) : null;
  if (!m) throw new Error(`<wire> ${what} is "node:port", not ${JSON.stringify(text)}`);
  return { node: m[1]!, port: m[2]! };
}

export const opgraphVocabulary: Vocabulary<IRGraph> = {
  format: "opgraph",
  noun: "a node graph",
  root: "opgraph",
  tags: {
    opgraph: { parents: [], attrs: ["id", "name", "domain", "meta"] },
    node: { parents: ["opgraph"], key: "id", required: ["id", "type"] },
    wire: { parents: ["opgraph"], key: "to", required: ["from", "to"], attrs: ["from", "to"] },
  },
  fromTree(t) {
    const nodes: Record<string, IRNode> = {};
    const outputs: string[] = [];
    for (const n of childrenOf(t, "node")) {
      const a = n.attrs;
      const id = String(a.id);
      if (typeof a.type !== "string" || !a.type) throw new Error(`<node id="${id}"> needs a type`);
      if (id.includes(":")) throw new Error(`<node id="${id}">: an id has no colon (a wire names "node:port")`);
      const inputs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(a)) if (!(NODE_ATTRS as readonly string[]).includes(k)) inputs[k] = v;
      if (a.inputs !== undefined) {
        if (!isRecord(a.inputs)) throw new Error(`<node id="${id}"> inputs is an object of ports`);
        for (const [k, v] of Object.entries(a.inputs)) {
          if (portIsAttribute(k)) throw new Error(`<node id="${id}">: write ${k} as an attribute (${k}={…}), not in inputs`);
          inputs[k] = v;
        }
      }
      if (a.meta !== undefined && !isRecord(a.meta)) throw new Error(`<node id="${id}"> meta is an object`);
      const meta = { ...(isRecord(a.meta) ? a.meta : {}), ...(a.x !== undefined ? { x: a.x } : {}), ...(a.y !== undefined ? { y: a.y } : {}), ...(n.source !== undefined ? { source: n.source } : {}) };
      nodes[id] = {
        id,
        type: a.type,
        ...(typeof a.label === "string" ? { label: a.label } : {}),
        inputs,
        ...(a.disabled === true ? { disabled: true } : {}),
        ...(Object.keys(meta).length ? { meta } : {}),
      };
      if (a.output === true) outputs.push(id);
    }
    for (const w of childrenOf(t, "wire")) {
      const from = endOf(w.attrs.from, "from"), to = endOf(w.attrs.to, "to");
      const target = nodes[to.node];
      if (!target) throw new Error(`<wire to="${String(w.attrs.to)}">: no <node id="${to.node}">`);
      if (!nodes[from.node]) throw new Error(`<wire from="${String(w.attrs.from)}">: no <node id="${from.node}">`);
      const literal = target.inputs[to.port];
      if (isWire(literal)) throw new Error(`two <wire> go into ${to.node}:${to.port} (a port takes one wire)`);
      target.inputs[to.port] = { wire: from, ...(literal !== undefined && literal !== null ? { value: literal } : {}) };
      // Where the wire was written (`meta.sources`, by `wire:<port>`): the editor finds the element again to remove it.
      if (w.source !== undefined) target.meta = { ...target.meta, sources: { ...(target.meta?.sources as object), [`wire:${to.port}`]: w.source } };
    }
    const meta = { ...(isRecord(t.attrs.meta) ? t.attrs.meta : {}), ...(t.attrs.name !== undefined ? { name: t.attrs.name } : {}), domain: t.attrs.domain ?? NODE_GRAPH_ID };
    return { id: typeof t.attrs.id === "string" ? t.attrs.id : NODE_GRAPH_ID, nodes, outputs, meta };
  },
  toTree(g) {
    const { name, domain, ...rest } = (g.meta ?? {}) as Record<string, unknown>;
    const attrs: Record<string, unknown> = {
      ...(g.id !== NODE_GRAPH_ID ? { id: g.id } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(domain !== undefined && domain !== NODE_GRAPH_ID ? { domain } : {}),
      ...(Object.keys(rest).length ? { meta: rest } : {}),
    };
    const nodes: DocTree[] = [], wires: DocTree[] = [];
    const outputs = new Set(g.outputs ?? []);
    for (const n of Object.values(g.nodes)) {
      const { x, y, source, sources, ...meta } = (n.meta ?? {}) as Record<string, unknown>;
      const a: Record<string, unknown> = { id: n.id, type: n.type };
      if (n.label !== undefined) a.label = n.label;
      // A position on the canvas to a tenth of a unit: what a person reads, and what a drag can mean.
      if (x !== undefined) a.x = typeof x === "number" ? Math.round(x * 10) / 10 : x;
      if (y !== undefined) a.y = typeof y === "number" ? Math.round(y * 10) / 10 : y;
      if (n.disabled) a.disabled = true;
      if (outputs.has(n.id)) a.output = true;
      if (Object.keys(meta).length) a.meta = meta;
      const odd: Record<string, unknown> = {};
      for (const [port, v] of Object.entries(n.inputs)) {
        const literal = isWire(v) ? v.value : v;
        if (isWire(v)) {
          const ws = isRecord(sources) ? sources[`wire:${port}`] : undefined;
          wires.push({ tag: "wire", attrs: { from: `${v.wire.node}:${v.wire.port}`, to: `${n.id}:${port}` }, children: [], ...(ws !== undefined ? { source: ws } : {}) });
        }
        if (literal === undefined) continue;
        if (portIsAttribute(port)) {
          // An empty port is not written: only a channel's emptiness is (it counts the channels).
          if (literal !== null) a[port] = literal;
        } else if (isWire(v) && literal === null) continue;
        else odd[port] = literal;
      }
      if (Object.keys(odd).length) a.inputs = odd;
      nodes.push({ tag: "node", attrs: a, children: [], ...(source !== undefined ? { source } : {}) });
    }
    return { tag: "opgraph", attrs, children: [...nodes, ...wires] };
  },
  empty: (name) => ({ id: NODE_GRAPH_ID, nodes: {}, outputs: [], meta: { name, domain: NODE_GRAPH_ID } }),
};

/** Whether a declared value is a node graph's `<opgraph>` element. */
export const isOpGraph = (value: unknown): value is DesignElement => isElement(value) && value.type === "opgraph";

/** Declare a node graph from its `<opgraph>` element: the editor's own op graph, each node with `meta.source`. */
export function declareOpGraph(root: DesignElement): Declaration {
  return new Declaration("graph", opgraphVocabulary.fromTree(treeOfElement(root, opgraphVocabulary)));
}

const GEO_DOCUMENTS = [shockVocabulary, scenarioVocabulary, geomodelVocabulary, geoparamsVocabulary];
for (const v of [worldVocabulary, deviceVocabulary, dashboardVocabulary, geoVocabulary, ...GEO_DOCUMENTS, opgraphVocabulary]) registerVocabulary(v);

/** The vocabularies of the ontology's files, by format. */
export const ONTOLOGY = {
  world: worldVocabulary,
  device: deviceVocabulary,
  dashboard: dashboardVocabulary,
  geo: geoVocabulary,
  shock: shockVocabulary,
  scenario: scenarioVocabulary,
  geomodel: geomodelVocabulary,
  geoparams: geoparamsVocabulary,
  opgraph: opgraphVocabulary,
} as const;
