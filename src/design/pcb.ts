/**
 * A BOARD IN JSX — the board half of a circuit, declared as the nodes the CommandAGI circuit editor's board holds
 * (`eda.board`, `eda.stack`, `eda.conductor`) plus, for each part, the board facts that sit on the schematic's part
 * (`eda.footprint`: which footprint, where it sits). A board names its schematic; the schematic says what the parts are
 * and what is connected, the board says where they sit and where the copper runs:
 *
 *   export default () => (
 *     <board schematic="Divider.sch.tsx" width={40} height={30} core={1.5} copper={0.035}>
 *       <component name="R1" footprint="smd-0805" pcbX={10} pcbY={10} />
 *       <component name="R2" footprint="smd-0805" pcbX={25} pcbY={10} pcbRotation={90} layer="bottom" />
 *       <trace layer="F.Cu" width={0.2} points={[[11, 10], [24, 10]]} from=".R1 > .pin2" to=".R2 > .pin1" />
 *       <via name="V1" pcbX={18} pcbY={14} drill={0.4} diameter={0.8} />
 *     </board>
 *   );
 *
 * The tags:
 *   <board schematic width height core copper thickness layers surface>
 *                                     the root. `schematic` is the schematic file, relative to this one. A width ×
 *                                     height rectangle outline from (0, 0); core and copper make a two-layer
 *                                     cross-section (mm); thickness is the finished thickness when no cross-section
 *                                     says it; layers is the layer table ([{ ordinal, name, type, userName }], the
 *                                     editor's blank board's when absent). `surface` puts the board on the faces of a
 *                                     CAD part: { cadRef, domain, trims, curvedTrims } (the part's file, relative to
 *                                     this one, and its faces unfolded into charts, as the Surfaces view picks them).
 *   <stack name label domain units process layers overallThickness>
 *                                     the cross-section, layer by layer (top first), when it is more than core and
 *                                     copper: each { name, role, thickness, material, copperWeightOz, ply, … }.
 *   <masks name label libName unitUmPerDb polygons>
 *                                     an IC mask layout, flattened: each polygon { layer, datatype, points } with
 *                                     points in micrometres, the stream's units (micrometres per database unit) and
 *                                     the library the stream names.
 *   <graphic kind layer points width filled id kicad>
 *                                     a board drawing (`line`, `arc`, `circle`, `rect`, `poly`) on a layer: the
 *                                     outline is graphics on Edge.Cuts when it is not the width × height rectangle.
 *   <text text|field at rotation layer size sizeX thickness kind id kicad>
 *   <dimension points height layer width textSize id kicad>
 *                                     board text, and an aligned dimension (its text is derived, never stored).
 *   <kicad version generator forms>   the KiCad forms the board carries for exchange and nothing else reads
 *                                     (`setup`, `paper`, …): s-expression text. `kicad` on another element is that
 *                                     element's own carried forms.
 *   <net name code>                   the KiCad net code of the schematic's net `name`.
 *   <check id kind severity>, <accept id check rule refs net region reason>
 *                                     the checks the board must pass (erc, drc) and the findings it accepts on
 *                                     purpose (`./circuit-checks.ts`)
 *   <component name footprint library pcbX pcbY pcbRotation layer refAt refRot chart uuid kicad>
 *                                     the schematic's part `name` on this board: its footprint (one of the editor's
 *                                     own land patterns, BOARD_FOOTPRINTS, or a library footprint by its ref,
 *                                     "Package_SO:SOIC-8", in the `.pretty` folder `library` names: its
 *                                     `SOIC-8.kicad_mod`), where it sits, its rotation (degrees), its side ("top" or
 *                                     "bottom"), where its reference text sits (`refAt`, [x, y] mm in the footprint's
 *                                     frame) and how far it is turned there (`refRot`, degrees), its KiCad uuid,
 *                                     the KiCad forms that say which instance it is
 *                                     (its schematic path). With no pcbX and pcbY it is not placed. The editor
 *                                     reads a library footprint's pads, artwork and attributes from its file. A
 *                                     footprint ref with no library is named only: no pads yet, not placed. On a
 *                                     board with a `surface`, `chart` names the face it sits on.
 *   <trace name layer width points from to net surface uuid segmentUuids kicad>
 *                                     a copper run: its points ([[x, y], …]) on one copper layer, a finished width.
 *                                     `surface` (true) runs it on the board's surface: its points are in the unfolded
 *                                     charts.
 *   <arc name layer width points from to net uuid kicad>
 *                                     a circular copper arc: start, a point on it, end.
 *   <via name pcbX pcbY drill diameter layers pads net uuid kicad>
 *                                     a plated barrel; `layers` defaults to ["F.Cu", "B.Cu"]; `pads` names the pads
 *                                     it is plated into (".R1 > .pin2").
 *   <pour name layers points terminals net uuid kicad>
 *                                     a copper pour: its boundary on its layers; `terminals` names what boundary
 *                                     points land on ([[0, ".J1 > .pin2"], …]); `kicad` its fill settings.
 *
 * The layout's constraints (the board's design intent, which the placer, the router, the layout score and the checks
 * read; each element is one fact, written back by the editor and the layout operations):
 *   <netclass name nets kind width minWidth clearance edgeClearance holeClearance inner minSpokes viaDiameter viaDrill
 *             current criticality maxLength maxVias impedance>
 *                                     the rules of the nets named (`nets`: names, "FIN*" matches by prefix): the
 *                                     track width the router lays and the narrowest allowed (`minWidth`, a neck-down;
 *                                     `width` when absent), the clearance, the least gap to the board edge and to a
 *                                     hole (mm), the rules on inner copper layers (`inner`: { clearance, width,
 *                                     minWidth }), the fewest thermal spokes a pad needs to a pour (`minSpokes`,
 *                                     KiCad's `min_resolved_spokes`), the via, the current (A) the copper carries,
 *                                     the kind ("signal", "power", "ground", "noisy", "sensitive", "highspeed"),
 *                                     the criticality (0 to 1: routed first, kept short), the longest route (mm),
 *                                     the most vias, the impedance (ohm) of a trace over its reference plane.
 *   <diffpair name positive negative gap width impedance maxSkew>
 *                                     two nets routed as a pair: the gap between the tracks, the most length
 *                                     difference (mm).
 *   <group name parts region near maxDistance conviction side edge mating>
 *                                     parts placed together: `region` [x0, y0, x1, y1] the box they stay in; `near`
 *                                     a part or a pin (".J1 > .pin5") they stay within `maxDistance` of; conviction
 *                                     0 (free) to 1 (fixed where they are); `side` "top", "bottom" or "any" (the
 *                                     placer turns a part over where that costs less); `edge` the board edge they sit
 *                                     against ("left", "right", "top", "bottom"), their `mating` side (in the
 *                                     footprint's own frame) facing out.
 *   <keepout name points layers no>  a region where `no` ("track", "via", "component", "pour") may be, on `layers`
 *                                     (all copper layers when absent).
 *   <thermal name parts watts spacing awayFrom distance>
 *                                     the heat each part dissipates (W), the least spacing between them, and the
 *                                     parts (`awayFrom`) they keep `distance` from.
 *   <bus name nets pitch>             nets that run together ("D*" matches by prefix): where their tracks run side by
 *                                     side they are parallel, `pitch` (mm) apart centre to centre.
 *   <objective weights>               the weight of each term of the layout score ({ wirelength: 1, vias: 2, … }).
 *
 * How the board is made (docs/formats.md § logistics):
 *   <fab suppliers finish mask silk minTrack minSpace minDrill minAnnularRing maxLayers thicknesses assembly
 *        inspection compliance shipping>
 *                                     the fab house (the first of `suppliers`, with its terms), its capabilities for
 *                                     the service ordered (mm), the finish, the solder mask and silk colours, the
 *                                     assembly ({ house, sides }), the board's test ({ electrical, procedure,
 *                                     acceptance, … }), its compliance and shipping. One per board. The board's
 *                                     layers, thickness and copper stay its own.
 *
 * `from` and `to` say what a run's first and last points land on; `net` names the schematic net the copper realises.
 * Coordinates are the board's own: millimetres, Y DOWN, from the outline's corner (tscircuit's board is centred and
 * Y up; a `<board>` that names no schematic is read as tscircuit, `./tscircuit.ts`). An end is bound by what it
 * says, never by where it is drawn: ".R1 > .pin2" (a pin of a component, by its number), ".V1" (a via, by name),
 * ".T1 > .end" (a point of another trace or arc: .start, .end or its index). Anything else is refused by name, never
 * guessed. Each node an element declares carries the element's `source` in `meta.source`.
 */
import { Declaration, Scope, slug, withScope } from "./ir.js";
import { childElements, type DesignElement } from "./jsx-runtime.js";
import { declareCircuitChecks } from "./circuit-checks.js";
import { checkFacet, checkOffers } from "./part-fields.js";

export const BOARD_PART = "eda.footprint";
export const CONDUCTOR = "eda.conductor";
/** A board fact a `<graphic>`, `<text>`, `<dimension>`, `<kicad>` or `<net>` declares; the editor folds it into the circuit. */
export const BOARD_FACT = "eda.boardfact";
/** The editor's own land patterns, by the name a `<component footprint>` gives (the circuit's id is `Authored:<name>`). */
export const BOARD_FOOTPRINTS = ["smd-0805", "axial-7.62", "header-2.54"] as const;
/** A new board's layer table (the circuit editor's blank board). */
export const BOARD_LAYERS = [
  { ordinal: 0, name: "F.Cu", type: "signal" },
  { ordinal: 31, name: "B.Cu", type: "signal" },
  { ordinal: 36, name: "B.SilkS", type: "user" },
  { ordinal: 37, name: "F.SilkS", type: "user" },
  { ordinal: 44, name: "Edge.Cuts", type: "user" },
];
const COPPER = /^[A-Za-z0-9]+\.Cu$/;
const GRAPHICS: Record<string, number | null> = { line: 2, arc: 3, circle: 2, rect: 2, poly: null };

const meta = (el: DesignElement) => (el.source === undefined ? undefined : { source: el.source });
const where = (el: DesignElement) => `<${el.type}${typeof el.props.name === "string" ? ` name="${el.props.name}"` : ""}>`;

function refuseUnknown(el: DesignElement, allowed: string[]): void {
  for (const k of Object.keys(el.props)) {
    if (k === "children" || k === "key" || allowed.includes(k)) continue;
    if (["schX", "schY", "schRotation", "resistance", "capacitance", "inductance", "voltage", "current"].includes(k))
      throw new Error(`${where(el)}: ${k} is the schematic's; a board says only where its parts sit and where its copper runs`);
    throw new Error(`${where(el)}: prop ${k} is not read on a board`);
  }
}

function num(el: DesignElement, prop: string, required = false): number | undefined {
  const v = el.props[prop];
  if (v === undefined) {
    if (required) throw new Error(`${where(el)} needs ${prop}`);
    return undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw new Error(`${where(el)}: ${prop} is a number (mm or degrees), not ${JSON.stringify(v)}`);
}

function positive(el: DesignElement, prop: string, required = false): number | undefined {
  const v = num(el, prop, required);
  if (v !== undefined && !(v > 0)) throw new Error(`${where(el)}: ${prop} is more than 0`);
  return v;
}

function text(el: DesignElement, prop: string, required = false): string | undefined {
  const v = el.props[prop];
  if (v === undefined) {
    if (required) throw new Error(`${where(el)} needs ${prop}`);
    return undefined;
  }
  if (typeof v === "string") return v;
  throw new Error(`${where(el)}: ${prop} is text, not ${JSON.stringify(v)}`);
}

function pointList(el: DesignElement, prop: string, min: number, count: number | null = null): { x: number; y: number }[] {
  const v = el.props[prop];
  if (!Array.isArray(v) || v.length < min || (count !== null && v.length !== count))
    throw new Error(`${where(el)}: ${prop} is a list of ${count !== null ? count : `at least ${min}`} [x, y]`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((c) => typeof c === "number" && Number.isFinite(c)))
      throw new Error(`${where(el)}: point ${i} is [x, y] in mm, not ${JSON.stringify(p)}`);
    return { x: p[0] as number, y: p[1] as number };
  });
}
const points = (el: DesignElement) => pointList(el, "points", 2);

function at(el: DesignElement, prop: string): { x: number; y: number } {
  const v = el.props[prop];
  if (!Array.isArray(v) || v.length !== 2 || !v.every((c) => typeof c === "number" && Number.isFinite(c)))
    throw new Error(`${where(el)}: ${prop} is [x, y] in mm, not ${JSON.stringify(v)}`);
  return { x: v[0] as number, y: v[1] as number };
}

function copperLayers(el: DesignElement, fallback?: string[]): string[] {
  const layers = el.props.layers ?? fallback;
  if (!Array.isArray(layers) || layers.length < 1 || !layers.every((l) => typeof l === "string" && COPPER.test(l)))
    throw new Error(`${where(el)}: layers is a list of copper layers ("F.Cu", "In1.Cu", "B.Cu")`);
  return layers as string[];
}

/** Carried KiCad forms, as s-expression text (`kicad="(stroke (type solid))"`). */
function kicad(el: DesignElement, prop = "kicad"): { kicad?: string } {
  const v = text(el, prop);
  return v === undefined ? {} : { kicad: v };
}

/** Plain data: numbers, strings, booleans, null, arrays and objects of them. */
function plain(el: DesignElement, prop: string, check: (v: unknown) => boolean, what: string): unknown {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (!check(v)) throw new Error(`${where(el)}: ${prop} is ${what}`);
  return JSON.parse(JSON.stringify(v));
}
const isObject = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);

/** A flattened mask layout's polygons: each `{ layer, datatype, points }`, its points `[x, y]` in micrometres. */
function isMaskPolygons(v: unknown): boolean {
  const polygon = (p: unknown): boolean => {
    if (!isObject(p)) return false;
    const { layer, datatype, points } = p as { layer?: unknown; datatype?: unknown; points?: unknown };
    return (
      Number.isInteger(layer) &&
      (layer as number) >= 0 &&
      Number.isInteger(datatype) &&
      (datatype as number) >= 0 &&
      Array.isArray(points) &&
      points.length >= 3 &&
      points.every((q) => Array.isArray(q) && q.length === 2 && q.every((c) => typeof c === "number" && Number.isFinite(c))) &&
      Object.keys(p as object).every((k) => ["layer", "datatype", "points"].includes(k))
    );
  };
  return Array.isArray(v) && v.length > 0 && v.every(polygon);
}

/** A trace point's id: the editor's own (`start`, `end`, and `p<i>` between them). */
export function tracePointId(index: number, count: number): string {
  return index === 0 ? "start" : index === count - 1 ? "end" : `p${index}`;
}

/** Whether a JSX root is a board in code: a `<board>` that names its schematic. */
export function isBoardFile(root: unknown): boolean {
  const el = root as DesignElement;
  return !!el && el.$$design === "element" && el.type === "board" && el.props.schematic !== undefined;
}

const CONDUCTORS = new Set(["trace", "arc", "via", "pour"]);
const FACTS = new Set(["graphic", "text", "dimension", "kicad", "net", "netclass", "diffpair", "group", "keepout", "thermal", "bus", "objective", "fab"]);

/** The layout's constraints, each a board fact (`fact` is its tag): what each takes, and its check. */
const NET_KINDS = ["signal", "power", "ground", "noisy", "sensitive", "highspeed"];
const KEEPOUT_KINDS = ["track", "via", "component", "pour"];
const EDGES = ["left", "right", "top", "bottom"];
const isNames = (v: unknown) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0);
const isBox = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number" && Number.isFinite(x)) && (v[0] as number) < (v[2] as number) && (v[1] as number) < (v[3] as number);
const isWeights = (v: unknown) => isObject(v) && Object.values(v as object).every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0);

function constraintFact(el: DesignElement): Record<string, unknown> {
  const name = (required = true) => text(el, "name", required);
  const unit = (prop: string) => {
    const v = num(el, prop);
    if (v !== undefined && !(v >= 0 && v <= 1)) throw new Error(`${where(el)}: ${prop} is from 0 to 1`);
    return v;
  };
  const names = (prop: string, required: boolean) => plain(el, prop, isNames, "a list of names") ?? (required ? (() => { throw new Error(`${where(el)} needs ${prop}`); })() : undefined);
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined) out[k] = v; };
  switch (el.type) {
    case "netclass": {
      refuseUnknown(el, ["name", "nets", "kind", "width", "minWidth", "clearance", "edgeClearance", "holeClearance", "inner", "minSpokes", "viaDiameter", "viaDrill", "current", "criticality", "maxLength", "maxVias", "impedance"]);
      const kind = text(el, "kind");
      if (kind !== undefined && !NET_KINDS.includes(kind)) throw new Error(`${where(el)}: kind is ${NET_KINDS.join(", ")}`);
      const maxVias = num(el, "maxVias");
      if (maxVias !== undefined && !(Number.isInteger(maxVias) && maxVias >= 0)) throw new Error(`${where(el)}: maxVias is a whole number, 0 or more`);
      put("name", name()); put("nets", names("nets", true)); put("kind", kind);
      for (const k of ["width", "minWidth", "clearance", "edgeClearance", "holeClearance", "viaDiameter", "viaDrill", "current", "maxLength", "impedance"]) put(k, positive(el, k));
      put("criticality", unit("criticality")); put("maxVias", maxVias);
      if (out.minWidth !== undefined && out.width !== undefined && (out.minWidth as number) > (out.width as number)) throw new Error(`${where(el)}: minWidth is at most width`);
      const inner = plain(el, "inner", (v) => isObject(v) && Object.keys(v as object).length > 0 && Object.entries(v as object).every(([k, x]) => ["clearance", "width", "minWidth"].includes(k) && typeof x === "number" && Number.isFinite(x) && x > 0), "the rules on inner copper layers: { clearance, width, minWidth } (mm)");
      put("inner", inner);
      const spokes = num(el, "minSpokes");
      if (spokes !== undefined && !(Number.isInteger(spokes) && spokes >= 0 && spokes <= 4)) throw new Error(`${where(el)}: minSpokes is a whole number from 0 to 4`);
      put("minSpokes", spokes);
      const d = out.viaDiameter as number | undefined, h = out.viaDrill as number | undefined;
      if (d !== undefined && h !== undefined && d <= h) throw new Error(`${where(el)}: viaDiameter is more than viaDrill`);
      break;
    }
    case "diffpair":
      refuseUnknown(el, ["name", "positive", "negative", "gap", "width", "impedance", "maxSkew"]);
      put("name", name()); put("positive", text(el, "positive", true)); put("negative", text(el, "negative", true));
      if (out.positive === out.negative) throw new Error(`${where(el)}: positive and negative are two nets`);
      for (const k of ["gap", "width", "impedance", "maxSkew"]) put(k, positive(el, k));
      break;
    case "group": {
      refuseUnknown(el, ["name", "parts", "region", "near", "maxDistance", "conviction", "side", "edge", "mating"]);
      put("name", name()); put("parts", names("parts", true));
      put("region", plain(el, "region", isBox, "[x0, y0, x1, y1] in mm, x0 < x1 and y0 < y1"));
      const near = text(el, "near");
      if (near !== undefined && !/^\s*\.[A-Za-z0-9_#\-]+(\s*>\s*\.[A-Za-z0-9_+\-]+)?\s*$/.test(near)) throw new Error(`${where(el)}: near is a part (".J1") or a pin (".J1 > .pin5")`);
      put("near", near); put("maxDistance", positive(el, "maxDistance")); put("conviction", unit("conviction"));
      if (out.maxDistance !== undefined && near === undefined) throw new Error(`${where(el)}: maxDistance needs near`);
      const side = el.props.side;
      if (side !== undefined && side !== "top" && side !== "bottom" && side !== "any") throw new Error(`${where(el)}: side is "top", "bottom" or "any"`);
      put("side", side);
      for (const k of ["edge", "mating"]) {
        const v = el.props[k];
        if (v !== undefined && !EDGES.includes(v as string)) throw new Error(`${where(el)}: ${k} is ${EDGES.map((e) => `"${e}"`).join(", ")}`);
        put(k, v);
      }
      if (out.mating !== undefined && out.edge === undefined) throw new Error(`${where(el)}: mating needs edge`);
      break;
    }
    case "keepout": {
      refuseUnknown(el, ["name", "points", "layers", "no"]);
      put("name", name(false)); put("points", pointList(el, "points", 3).map((p) => [p.x, p.y]));
      if (el.props.layers !== undefined) put("layers", copperLayers(el));
      const no = plain(el, "no", (v) => isNames(v) && (v as string[]).every((k) => KEEPOUT_KINDS.includes(k)), `a list of ${KEEPOUT_KINDS.join(", ")}`);
      put("no", no);
      break;
    }
    case "thermal":
      refuseUnknown(el, ["name", "parts", "watts", "spacing", "awayFrom", "distance"]);
      put("name", name()); put("parts", names("parts", true)); put("watts", positive(el, "watts", true));
      put("spacing", positive(el, "spacing")); put("awayFrom", names("awayFrom", false)); put("distance", positive(el, "distance"));
      if ((out.awayFrom === undefined) !== (out.distance === undefined)) throw new Error(`${where(el)}: give awayFrom and distance together`);
      break;
    case "bus":
      refuseUnknown(el, ["name", "nets", "pitch"]);
      put("name", name()); put("nets", names("nets", true)); put("pitch", positive(el, "pitch"));
      break;
    case "objective":
      refuseUnknown(el, ["weights"]);
      put("weights", plain(el, "weights", isWeights, "an object of term → weight (0 or more)") ?? (() => { throw new Error(`${where(el)} needs weights`); })());
      break;
  }
  return out;
}
const CONSTRAINTS = new Set(["netclass", "diffpair", "group", "keepout", "thermal", "bus", "objective"]);

const FAB_CAPABILITIES = ["minTrack", "minSpace", "minDrill", "minAnnularRing"];
const SIDES = ["top", "bottom"];
const ELECTRICAL = ["flying-probe", "fixture", "none"];
const INSPECTION_KEYS = ["dimensions", "procedure", "acceptance", "sampling", "electrical", "minutes", "ratePerHour", "currency"];

/**
 * The board's `<fab>`: the house that makes it (`suppliers`, the first is the one that makes it), its capabilities
 * for the service ordered, the finish, mask and silk, the assembly, the board's test and its compliance and shipping
 * (docs/formats.md § logistics). The board's layers, thickness and copper are its own and are not restated here.
 */
function fabFact(el: DesignElement): Record<string, unknown> {
  refuseUnknown(el, ["suppliers", "finish", "mask", "silk", ...FAB_CAPABILITIES, "maxLayers", "thicknesses", "assembly", "inspection", "compliance", "shipping"]);
  const w = where(el);
  const out: Record<string, unknown> = {};
  if (el.props.suppliers !== undefined) out.suppliers = checkOffers(w, el.props.suppliers);
  for (const k of ["finish", "mask", "silk"]) {
    const v = text(el, k);
    if (v !== undefined) {
      if (!v.trim()) throw new Error(`${w}: ${k} is text`);
      out[k] = v;
    }
  }
  for (const k of FAB_CAPABILITIES) {
    const v = positive(el, k);
    if (v !== undefined) out[k] = v;
  }
  const maxLayers = num(el, "maxLayers");
  if (maxLayers !== undefined) {
    if (!(Number.isInteger(maxLayers) && maxLayers >= 1)) throw new Error(`${w}: maxLayers is a whole number of copper layers`);
    out.maxLayers = maxLayers;
  }
  const t = plain(el, "thicknesses", (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && x > 0), "a list of the finished thicknesses the house offers (mm)");
  if (t !== undefined) out.thicknesses = t;
  const assembly = el.props.assembly;
  if (assembly !== undefined) {
    const a = assembly as Record<string, unknown>;
    if (!isObject(a) || Object.keys(a).some((k) => k !== "house" && k !== "sides")) throw new Error(`${w}: assembly is { house, sides }`);
    if (a.house !== undefined && !(typeof a.house === "string" && a.house.trim())) throw new Error(`${w}: assembly.house is the house that places the parts`);
    if (a.sides !== undefined && !(Array.isArray(a.sides) && a.sides.length && a.sides.every((s) => SIDES.includes(s as string)) && new Set(a.sides).size === a.sides.length))
      throw new Error(`${w}: assembly.sides is a list of "top", "bottom"`);
    out.assembly = JSON.parse(JSON.stringify(a));
  }
  const inspection = el.props.inspection;
  if (inspection !== undefined) {
    const i = inspection as Record<string, unknown>;
    if (!isObject(i)) throw new Error(`${w}: inspection is an object ({ ${INSPECTION_KEYS.join(", ")} })`);
    for (const k of Object.keys(i)) if (!INSPECTION_KEYS.includes(k)) throw new Error(`${w}: inspection.${k} is not read (it takes ${INSPECTION_KEYS.join(", ")})`);
    if (i.electrical !== undefined && !ELECTRICAL.includes(i.electrical as string)) throw new Error(`${w}: inspection.electrical is one of ${ELECTRICAL.join(", ")}`);
    for (const k of ["procedure", "acceptance", "sampling"]) if (i[k] !== undefined && !(typeof i[k] === "string" && (i[k] as string).trim())) throw new Error(`${w}: inspection.${k} is text`);
    for (const k of ["minutes", "ratePerHour"]) if (i[k] !== undefined && !(typeof i[k] === "number" && (i[k] as number) >= 0)) throw new Error(`${w}: inspection.${k} is a number, 0 or more`);
    if (i.currency !== undefined && !(typeof i.currency === "string" && /^[A-Z]{3}$/.test(i.currency))) throw new Error(`${w}: inspection.currency is an ISO 4217 code ("USD")`);
    out.inspection = JSON.parse(JSON.stringify(i));
  }
  for (const k of ["compliance", "shipping"] as const) if (el.props[k] !== undefined) out[k] = checkFacet(w, k, el.props[k]);
  return out;
}

/** Declare a board in code (its root is `<board schematic="…">`). */
export function declareBoardFile(root: DesignElement, name?: string): Declaration {
  refuseUnknown(root, ["schematic", "name", "width", "height", "core", "copper", "thickness", "layers", "surface"]);
  const schematic = root.props.schematic;
  if (typeof schematic !== "string" || !schematic.trim() || schematic.startsWith("/"))
    throw new Error(`<board>: schematic is the schematic file's path, relative to this file`);
  const title = typeof root.props.name === "string" ? root.props.name : (name ?? "Board");
  const s = new Scope(`eda:${slug(title)}`, { domain: "eda", rung: "board", name: title, schematic });
  withScope(s, () => {
    const children = declareCircuitChecks(s, childElements(root.props.children));
    const w = positive(root, "width"), h = positive(root, "height");
    const core = positive(root, "core"), copper = positive(root, "copper"), thickness = positive(root, "thickness");
    const layers = plain(
      root,
      "layers",
      (v) => Array.isArray(v) && v.length > 0 && v.every((l) => isObject(l) && typeof (l as { name?: unknown }).name === "string" && typeof (l as { ordinal?: unknown }).ordinal === "number"),
      "the layer table: [{ ordinal, name, type, userName }, …]",
    );
    if ((w === undefined) !== (h === undefined)) throw new Error("<board>: give width and height together");
    if ((core === undefined) !== (copper === undefined)) throw new Error("<board>: give core and copper together");
    const stacks = children.filter((el) => el.type === "stack");
    if (stacks.length > 1) throw new Error("a board has one <stack>");
    const maskLayouts = children.filter((el) => el.type === "masks");
    if (maskLayouts.length > 1) throw new Error("a board has one <masks>");
    if (stacks.length && core !== undefined) throw new Error("<board>: core and copper are a two-layer <stack>; give one or the other");
    if (thickness !== undefined && core !== undefined) throw new Error("<board>: core and copper say the thickness");
    if (core !== undefined && w === undefined) throw new Error("<board>: core and copper need the outline (width and height)");
    const surface = plain(
      root,
      "surface",
      (v) => isObject(v) && typeof (v as { cadRef?: unknown }).cadRef === "string" && isObject((v as { domain?: unknown }).domain) && Object.keys(v as object).every((k) => ["cadRef", "domain", "trims", "curvedTrims"].includes(k)),
      "the CAD faces the board is on: { cadRef, domain, trims, curvedTrims }",
    ) as { cadRef: string; domain: unknown } | undefined;
    const hasBoard = w !== undefined || thickness !== undefined || layers !== undefined || surface !== undefined || stacks.length > 0 || children.some((el) => el.type === "graphic" || el.type === "text" || el.type === "dimension" || el.type === "kicad");

    let stackThickness: number | undefined;
    if (core !== undefined && copper !== undefined) {
      stackThickness = core + 2 * copper;
      s.add(
        "eda.stack",
        {
          id: "stack",
          domain: "pcb",
          units: "mm",
          layers: [
            { name: "F.Cu", role: "conductor", thickness: copper },
            { name: "core", role: "dielectric", thickness: core },
            { name: "B.Cu", role: "conductor", thickness: copper },
          ],
        },
        { id: "stack", label: "Cross-section", meta: meta(root) },
      );
    }
    for (const el of stacks) {
      refuseUnknown(el, ["name", "label", "domain", "units", "process", "layers", "overallThickness"]);
      const stackLayers = plain(el, "layers", (v) => Array.isArray(v) && v.every((l) => isObject(l) && typeof (l as { name?: unknown }).name === "string" && typeof (l as { role?: unknown }).role === "string"), "the layers, top first: [{ name, role, thickness, … }, …]");
      if (stackLayers === undefined) throw new Error("<stack> needs layers");
      const domain = text(el, "domain") ?? "pcb", units = text(el, "units") ?? "mm";
      if (!["pcb", "ic"].includes(domain)) throw new Error(`<stack>: domain is "pcb" or "ic"`);
      if (!["mm", "um", "nm"].includes(units)) throw new Error(`<stack>: units is "mm", "um" or "nm"`);
      const process = plain(el, "process", isObject, "an object ({ name, … })");
      s.add(
        "eda.stack",
        { id: text(el, "name") ?? "stack", domain, units, layers: stackLayers, ...(process !== undefined ? { process } : {}), ...(el.props.overallThickness !== undefined ? { overallThickness: positive(el, "overallThickness") } : {}) },
        { id: "stack", label: text(el, "label") ?? "Cross-section", meta: meta(el) },
      );
    }
    if (hasBoard) {
      s.add(
        "eda.board",
        {
          layers: layers ?? BOARD_LAYERS,
          ...(stackThickness !== undefined ? { thicknessMm: stackThickness } : thickness !== undefined ? { thicknessMm: thickness } : {}),
          ...(core !== undefined || stacks.length ? { stack: { wire: { node: "stack", port: "stack" } } } : {}),
          ...(w !== undefined && h !== undefined
            ? { boardArtwork: { graphics: [{ id: "outline", kind: "rect", points: [{ x: 0, y: 0 }, { x: w, y: h }], widthMm: 0.05, layer: "Edge.Cuts", filled: false }], texts: [] } }
            : {}),
          ...(surface !== undefined ? { surfaceMount: surface } : {}),
        },
        { id: "board", label: "Board", meta: meta(root) },
      );
      s.output("board");
    }

    // Names first: an end may name a trace or a via written after it.
    const components = new Set<string>();
    const conductors = new Map<string, { el: DesignElement; id: string }>();
    const nets = new Set<string>();
    const constraintNames = new Set<string>();
    let kicadForms = 0;
    let fabs = 0;
    let n = 0;
    const freeId = () => {
      let id: string;
      do id = `cu_${++n}`;
      while ([...conductors.values()].some((c) => c.id === id) || components.has(id));
      return id;
    };
    for (const el of children) {
      const nm = el.props.name;
      if (el.type === "component") {
        if (typeof nm !== "string" || !nm) throw new Error("<component> needs the name of the schematic's part");
        if (components.has(nm) || conductors.has(nm)) throw new Error(`two elements are called ${nm}`);
        components.add(nm);
      } else if (CONDUCTORS.has(el.type)) {
        if (nm === undefined) continue;
        if (typeof nm !== "string" || !/^[A-Za-z0-9_\-]+$/.test(nm)) throw new Error(`${where(el)}: a name is letters, digits, _ and -`);
        if (components.has(nm) || conductors.has(nm)) throw new Error(`two elements are called ${nm}`);
        conductors.set(nm, { el, id: nm });
      } else if (el.type === "net") {
        if (typeof nm !== "string" || !nm) throw new Error("<net> needs the name of the schematic's net");
        if (nets.has(nm)) throw new Error(`two <net> elements name ${nm}`);
        nets.add(nm);
      } else if (el.type === "kicad") {
        if (++kicadForms > 1) throw new Error("a board has one <kicad>");
      } else if (el.type === "fab") {
        if (++fabs > 1) throw new Error("a board has one <fab>");
      } else if (CONSTRAINTS.has(el.type)) {
        const key = el.type === "objective" ? "objective" : typeof nm === "string" ? `${el.type}:${nm}` : null;
        if (key && constraintNames.has(key)) throw new Error(el.type === "objective" ? "a board has one <objective>" : `two <${el.type}> elements are called ${nm}`);
        if (key) constraintNames.add(key);
      } else if (el.type !== "stack" && el.type !== "masks" && !FACTS.has(el.type)) throw new Error(`<${el.type}> is not read on a board (see commandagi/design pcb)`);
    }
    const idOf = new Map<DesignElement, string>([...conductors.values()].map((c) => [c.el, c.id]));
    for (const el of children) if (CONDUCTORS.has(el.type) && !idOf.has(el)) idOf.set(el, freeId());

    const pointCount = (el: DesignElement) => (el.type === "arc" ? 3 : pointList(el, "points", 2).length);
    const end = (sel: unknown, el: DesignElement, point: number) => {
      if (typeof sel !== "string") throw new Error(`${where(el)}: an end is a selector (".R1 > .pin2", ".V1", ".T1 > .end")`);
      const one = /^\s*\.([A-Za-z0-9_#\-]+)\s*$/.exec(sel);
      if (one) {
        const via = conductors.get(one[1]!);
        if (!via || via.el.type !== "via") throw new Error(`${where(el)}: there is no via ${one[1]}`);
        return { point, via: via.id };
      }
      const two = /^\s*\.([A-Za-z0-9_#\-]+)\s*>\s*\.([A-Za-z0-9_+\-]+)\s*$/.exec(sel);
      if (!two) throw new Error(`${where(el)}: ${JSON.stringify(sel)} is not ".REF > .pin1", ".VIA" or ".TRACE > .end"`);
      const [, owner, which] = two as unknown as [string, string, string];
      if (components.has(owner)) {
        const number = /^pin(.+)$/i.exec(which)?.[1] ?? which;
        return { point, ref: owner, number };
      }
      const run = conductors.get(owner);
      if (!run || (run.el.type !== "trace" && run.el.type !== "arc")) throw new Error(`${where(el)}: there is no component or trace ${owner}`);
      const count = pointCount(run.el);
      const index = which === "start" ? 0 : which === "end" ? count - 1 : /^\d+$/.test(which) ? Number(which) : -1;
      if (index < 0 || index >= count) throw new Error(`${where(el)}: trace ${owner} has no point ${which}`);
      return { point, run: run.id, runPoint: tracePointId(index, count) };
    };
    const netOf = (el: DesignElement): { net?: string } => {
      const v = text(el, "net");
      if (v === undefined) return {};
      if (!v.trim()) throw new Error(`${where(el)}: net names the schematic's net`);
      return { net: v };
    };
    const uuidOf = (el: DesignElement): { uuid?: string } => {
      const v = text(el, "uuid");
      return v === undefined ? {} : { uuid: v };
    };
    const ends = (el: DesignElement, count: number) => [
      ...(el.props.from !== undefined ? [end(el.props.from, el, 0)] : []),
      ...(el.props.to !== undefined ? [end(el.props.to, el, count - 1)] : []),
    ];

    for (const el of children) {
      switch (el.type) {
        case "stack":
          break;
        case "masks": {
          refuseUnknown(el, ["name", "label", "libName", "unitUmPerDb", "polygons"]);
          const maskPolygons = plain(el, "polygons", isMaskPolygons, "the mask layout's polygons: [{ layer, datatype, points: [[x, y], …] }, …], points in micrometres");
          if (maskPolygons === undefined) throw new Error("<masks> needs polygons");
          const libName = text(el, "libName");
          s.add(
            "eda.masks",
            { polygons: maskPolygons, unitUmPerDb: positive(el, "unitUmPerDb", true), ...(libName !== undefined ? { libName } : {}) },
            { id: text(el, "name") ?? "masks", label: text(el, "label") ?? libName ?? "Masks", meta: meta(el) },
          );
          break;
        }
        case "component": {
          refuseUnknown(el, ["name", "footprint", "library", "pcbX", "pcbY", "pcbRotation", "layer", "refAt", "refRot", "chart", "uuid", "kicad"]);
          const ref = el.props.name as string;
          const fp = el.props.footprint;
          const library = el.props.library;
          if (library !== undefined) {
            if (typeof library !== "string" || !/\.pretty\/?$/i.test(library)) throw new Error(`${where(el)}: library names a footprint library folder (a .pretty), not ${JSON.stringify(library)}`);
            if (typeof fp !== "string" || !/^[^:]+:[^:/]+$/.test(fp)) throw new Error(`${where(el)}: a library footprint is its ref, "Library:Footprint" ("Package_SO:SOIC-8"), not ${JSON.stringify(fp)}`);
          } else if (typeof fp !== "string" || (!(BOARD_FOOTPRINTS as readonly string[]).includes(fp) && !/^[^:]+:[^:/]+$/.test(fp)))
            throw new Error(`${where(el)}: footprint is one of ${BOARD_FOOTPRINTS.join(", ")}, or a library footprint by its ref ("Package_SO:SOIC-8") with its library, not ${JSON.stringify(fp)}`);
          // A library footprint named with no library is named only: its pads are not on the board yet, so it is not placed.
          const named = library === undefined && !(BOARD_FOOTPRINTS as readonly string[]).includes(fp as string);
          if (named && (el.props.pcbX !== undefined || el.props.pcbY !== undefined))
            throw new Error(`${where(el)}: a footprint is placed with its pads: name its library (a .pretty folder)`);
          const x = num(el, "pcbX"), y = num(el, "pcbY"), rot = num(el, "pcbRotation");
          const side = el.props.layer;
          if (side !== undefined && side !== "top" && side !== "bottom") throw new Error(`${where(el)}: layer is "top" or "bottom"`);
          if ((x === undefined) !== (y === undefined)) throw new Error(`${where(el)}: give pcbX and pcbY together`);
          if (x === undefined && (rot !== undefined || side !== undefined)) throw new Error(`${where(el)}: pcbRotation and layer need pcbX and pcbY`);
          // Where the reference text sits, in the footprint's own frame (its library's, on the top): the placer moves it
          // off copper and off other references.
          const refAt = el.props.refAt;
          if (refAt !== undefined && !(Array.isArray(refAt) && refAt.length === 2 && refAt.every((v) => typeof v === "number" && Number.isFinite(v))))
            throw new Error(`${where(el)}: refAt is [x, y] in mm, in the footprint's own frame`);
          if (refAt !== undefined && x === undefined) throw new Error(`${where(el)}: refAt needs pcbX and pcbY`);
          // How far the reference text is turned where it sits: the placer turns a text it has no upright place for.
          const refRot = num(el, "refRot");
          if (refRot !== undefined && x === undefined) throw new Error(`${where(el)}: refRot needs pcbX and pcbY`);
          const chart = text(el, "chart");
          if (chart !== undefined && !surface) throw new Error(`${where(el)}: chart names a face of the board's surface, and the <board> has no surface`);
          if (chart !== undefined && x === undefined) throw new Error(`${where(el)}: chart needs pcbX and pcbY`);
          s.add(
            BOARD_PART,
            {
              ref,
              ...(library !== undefined ? { footprint: fp, library: (library as string).replace(/\/$/, "") } : named ? { footprint: fp } : { footprint: `Authored:${fp}` }),
              ...(x !== undefined ? { placement: { x, y, rot: rot ?? 0, side: side ?? "top" } } : {}),
              ...(refAt !== undefined ? { refAt: [...(refAt as number[])] } : {}),
              ...(refRot !== undefined ? { refRot } : {}),
              ...(chart !== undefined ? { surfaceMount: { chart } } : {}),
              ...uuidOf(el),
              ...kicad(el),
            },
            { id: `fp_${ref}`, label: ref, meta: meta(el) },
          );
          break;
        }
        case "trace":
        case "arc": {
          refuseUnknown(el, ["name", "layer", "width", "points", "from", "to", "net", "uuid", "kicad", ...(el.type === "trace" ? ["segmentUuids", "surface"] : [])]);
          const onSurface = el.props.surface;
          if (onSurface !== undefined && onSurface !== true) throw new Error(`${where(el)}: surface is true or left out`);
          if (onSurface && !surface) throw new Error(`${where(el)}: surface runs the trace on the board's surface, and the <board> has no surface`);
          const pts = el.type === "arc" ? pointList(el, "points", 3, 3) : points(el);
          const layer = el.props.layer;
          if (typeof layer !== "string" || !COPPER.test(layer)) throw new Error(`${where(el)}: layer is a copper layer ("F.Cu", "In1.Cu", "B.Cu")`);
          const terminals = ends(el, pts.length);
          const segmentUuids = plain(el, "segmentUuids", (v) => Array.isArray(v) && v.every((u) => typeof u === "string"), "a list of uuids, one per segment");
          s.add(
            CONDUCTOR,
            {
              kind: el.type === "arc" ? "arc" : "run",
              points: pts.map((p, i) => ({ ...p, id: tracePointId(i, pts.length) })),
              widthMm: positive(el, "width", true),
              layer,
              // The board view routes and re-routes a run under any angle; a KiCad segment says no rule.
              ...(el.type === "trace" ? { rule: "any" } : {}),
              ...(terminals.length ? { terminals } : {}),
              ...(segmentUuids !== undefined ? { segmentUuids } : {}),
              ...(onSurface ? { mount: { kind: "unwrap", domain: surface!.domain } } : {}),
              ...uuidOf(el),
              ...netOf(el),
              ...kicad(el),
            },
            { id: idOf.get(el)!, label: el.type === "arc" ? "Arc" : "Trace", meta: meta(el) },
          );
          break;
        }
        case "via": {
          refuseUnknown(el, ["name", "pcbX", "pcbY", "drill", "diameter", "layers", "pads", "net", "uuid", "kicad"]);
          const layers = copperLayers(el, ["F.Cu", "B.Cu"]);
          if (layers.length < 2) throw new Error(`${where(el)}: layers is two or more copper layers`);
          const drill = positive(el, "drill", true)!, diameter = positive(el, "diameter", true)!;
          if (diameter <= drill) throw new Error(`${where(el)}: the diameter is more than the drill`);
          const pads = el.props.pads;
          if (pads !== undefined && (!Array.isArray(pads) || !pads.length)) throw new Error(`${where(el)}: pads is a list of pins (".R1 > .pin2")`);
          const padRefs = ((pads ?? []) as unknown[]).map((p) => {
            const t = end(p, el, 0);
            if (!("ref" in t)) throw new Error(`${where(el)}: a via is plated into a pad (".R1 > .pin2"), not ${JSON.stringify(p)}`);
            return { ref: t.ref, number: t.number };
          });
          s.add(
            CONDUCTOR,
            {
              kind: "via",
              points: [{ x: num(el, "pcbX", true)!, y: num(el, "pcbY", true)! }],
              drillMm: drill,
              padDiameterMm: diameter,
              layers,
              ...(padRefs.length ? { pads: padRefs } : {}),
              ...uuidOf(el),
              ...netOf(el),
              ...kicad(el),
            },
            { id: idOf.get(el)!, label: "Via", meta: meta(el) },
          );
          break;
        }
        case "pour": {
          refuseUnknown(el, ["name", "layers", "points", "terminals", "net", "uuid", "kicad"]);
          const pts = pointList(el, "points", 3);
          const raw = el.props.terminals;
          if (raw !== undefined && (!Array.isArray(raw) || !raw.every((t) => Array.isArray(t) && t.length === 2 && Number.isInteger(t[0]) && typeof t[1] === "string")))
            throw new Error(`${where(el)}: terminals is a list of [point, selector] ([[0, ".J1 > .pin2"], …])`);
          const terminals = ((raw ?? []) as [number, string][]).map(([point, sel]) => {
            if (point < 0 || point >= pts.length) throw new Error(`${where(el)}: the pour has no point ${point}`);
            return end(sel, el, point);
          });
          s.add(
            CONDUCTOR,
            { kind: "pour", points: pts, layers: copperLayers(el), ...(terminals.length ? { terminals } : {}), ...uuidOf(el), ...netOf(el), ...kicad(el) },
            { id: idOf.get(el)!, label: "Pour", meta: meta(el) },
          );
          break;
        }
        case "graphic": {
          refuseUnknown(el, ["kind", "layer", "points", "width", "filled", "id", "kicad"]);
          const kind = text(el, "kind", true)!;
          if (!(kind in GRAPHICS)) throw new Error(`${where(el)}: kind is ${Object.keys(GRAPHICS).join(", ")}`);
          const filled = el.props.filled;
          if (filled !== undefined && typeof filled !== "boolean") throw new Error(`${where(el)}: filled is true or false`);
          if (filled !== undefined && (kind === "line" || kind === "arc")) throw new Error(`${where(el)}: a ${kind} is not filled`);
          s.add(
            BOARD_FACT,
            {
              fact: "graphic",
              ...(el.props.id !== undefined ? { id: text(el, "id") } : {}),
              kind,
              points: pointList(el, "points", kind === "poly" ? 2 : GRAPHICS[kind]!, GRAPHICS[kind]),
              widthMm: num(el, "width", true),
              layer: text(el, "layer", true),
              ...(kind === "line" || kind === "arc" ? {} : { filled: filled ?? false }),
              ...kicad(el),
            },
            { label: "Graphic", meta: meta(el) },
          );
          break;
        }
        case "text": {
          refuseUnknown(el, ["text", "field", "at", "rotation", "layer", "size", "sizeX", "thickness", "kind", "id", "kicad"]);
          const t = text(el, "text"), field = text(el, "field");
          if ((t === undefined) === (field === undefined)) throw new Error(`<text>: give text, or field ("reference" or "value")`);
          if (field !== undefined && field !== "reference" && field !== "value") throw new Error(`<text>: field is "reference" or "value"`);
          s.add(
            BOARD_FACT,
            {
              fact: "text",
              ...(el.props.id !== undefined ? { id: text(el, "id") } : {}),
              ...(t !== undefined ? { text: t } : { field }),
              at: at(el, "at"),
              rot: num(el, "rotation") ?? 0,
              layer: text(el, "layer", true),
              size: num(el, "size", true),
              sizeX: num(el, "sizeX") ?? num(el, "size", true),
              thickness: num(el, "thickness", true),
              kind: text(el, "kind") ?? "text",
              ...kicad(el),
            },
            { label: "Text", meta: meta(el) },
          );
          break;
        }
        case "dimension":
          refuseUnknown(el, ["points", "height", "layer", "width", "textSize", "id", "kicad"]);
          s.add(
            BOARD_FACT,
            {
              fact: "dimension",
              id: text(el, "id") ?? "",
              points: pointList(el, "points", 2, 2),
              height: num(el, "height", true),
              layer: text(el, "layer", true),
              widthMm: num(el, "width", true),
              textSize: num(el, "textSize", true),
              ...kicad(el),
            },
            { label: "Dimension", meta: meta(el) },
          );
          break;
        case "kicad": {
          refuseUnknown(el, ["version", "generator", "forms"]);
          const version = num(el, "version");
          s.add(
            BOARD_FACT,
            { fact: "kicad", ...(version !== undefined ? { version } : {}), ...(text(el, "generator") !== undefined ? { generator: text(el, "generator") } : {}), ...kicad(el, "forms") },
            { label: "KiCad", meta: meta(el) },
          );
          break;
        }
        case "net": {
          refuseUnknown(el, ["name", "code"]);
          const code = num(el, "code", true)!;
          if (!Number.isInteger(code) || code < 0) throw new Error(`${where(el)}: code is a KiCad net code (0 or more)`);
          s.add(BOARD_FACT, { fact: "net", name: el.props.name as string, code }, { label: "Net", meta: meta(el) });
          break;
        }
        case "fab":
          s.add(BOARD_FACT, { fact: "fab", ...fabFact(el) }, { label: "Fab", meta: meta(el) });
          break;
        default:
          if (CONSTRAINTS.has(el.type)) s.add(BOARD_FACT, { fact: el.type, ...constraintFact(el) }, { label: el.type, meta: meta(el) });
      }
    }
  });
  return new Declaration("board", s.build());
}
