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
 *   <board schematic width height core copper thickness layers>
 *                                     the root. `schematic` is the schematic file, relative to this one. A width ×
 *                                     height rectangle outline from (0, 0); core and copper make a two-layer
 *                                     cross-section (mm); thickness is the finished thickness when no cross-section
 *                                     says it; layers is the layer table ([{ ordinal, name, type, userName }], the
 *                                     editor's blank board's when absent).
 *   <stack name label domain units process layers>
 *                                     the cross-section, layer by layer (top first), when it is more than core and
 *                                     copper: each { name, role, thickness, material, copperWeightOz, ply, … }.
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
 *   <component name footprint library pcbX pcbY pcbRotation layer uuid kicad>
 *                                     the schematic's part `name` on this board: its footprint (one of the editor's
 *                                     own land patterns, BOARD_FOOTPRINTS, or a library footprint by its ref,
 *                                     "Package_SO:SOIC-8", in the `.pretty` folder `library` names: its
 *                                     `SOIC-8.kicad_mod`), where it sits, its rotation (degrees), its side ("top" or
 *                                     "bottom"), its KiCad uuid, the KiCad forms that say which instance it is
 *                                     (its schematic path). With no pcbX and pcbY it is not placed. The editor
 *                                     reads a library footprint's pads, artwork and attributes from its file.
 *   <trace name layer width points from to net uuid segmentUuids kicad>
 *                                     a copper run: its points ([[x, y], …]) on one copper layer, a finished width.
 *   <arc name layer width points from to net uuid kicad>
 *                                     a circular copper arc: start, a point on it, end.
 *   <via name pcbX pcbY drill diameter layers pads net uuid kicad>
 *                                     a plated barrel; `layers` defaults to ["F.Cu", "B.Cu"]; `pads` names the pads
 *                                     it is plated into (".R1 > .pin2").
 *   <pour name layers points terminals net uuid kicad>
 *                                     a copper pour: its boundary on its layers; `terminals` names what boundary
 *                                     points land on ([[0, ".J1 > .pin2"], …]); `kicad` its fill settings.
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
const FACTS = new Set(["graphic", "text", "dimension", "kicad", "net"]);

/** Declare a board in code (its root is `<board schematic="…">`). */
export function declareBoardFile(root: DesignElement, name?: string): Declaration {
  refuseUnknown(root, ["schematic", "name", "width", "height", "core", "copper", "thickness", "layers"]);
  const schematic = root.props.schematic;
  if (typeof schematic !== "string" || !schematic.trim() || schematic.startsWith("/"))
    throw new Error(`<board>: schematic is the schematic file's path, relative to this file`);
  const title = typeof root.props.name === "string" ? root.props.name : (name ?? "Board");
  const s = new Scope(`eda:${slug(title)}`, { domain: "eda", rung: "board", name: title, schematic });
  withScope(s, () => {
    const children = childElements(root.props.children);
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
    if (stacks.length && core !== undefined) throw new Error("<board>: core and copper are a two-layer <stack>; give one or the other");
    if (thickness !== undefined && core !== undefined) throw new Error("<board>: core and copper say the thickness");
    if (core !== undefined && w === undefined) throw new Error("<board>: core and copper need the outline (width and height)");
    const hasBoard = w !== undefined || thickness !== undefined || layers !== undefined || stacks.length > 0 || children.some((el) => el.type === "graphic" || el.type === "text" || el.type === "dimension" || el.type === "kicad");

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
      refuseUnknown(el, ["name", "label", "domain", "units", "process", "layers"]);
      const stackLayers = plain(el, "layers", (v) => Array.isArray(v) && v.every((l) => isObject(l) && typeof (l as { name?: unknown }).name === "string" && typeof (l as { role?: unknown }).role === "string"), "the layers, top first: [{ name, role, thickness, … }, …]");
      if (stackLayers === undefined) throw new Error("<stack> needs layers");
      const domain = text(el, "domain") ?? "pcb", units = text(el, "units") ?? "mm";
      if (!["pcb", "ic"].includes(domain)) throw new Error(`<stack>: domain is "pcb" or "ic"`);
      if (!["mm", "um", "nm"].includes(units)) throw new Error(`<stack>: units is "mm", "um" or "nm"`);
      const process = plain(el, "process", isObject, "an object ({ name, … })");
      s.add(
        "eda.stack",
        { id: text(el, "name") ?? "stack", domain, units, layers: stackLayers, ...(process !== undefined ? { process } : {}) },
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
        },
        { id: "board", label: "Board", meta: meta(root) },
      );
      s.output("board");
    }

    // Names first: an end may name a trace or a via written after it.
    const components = new Set<string>();
    const conductors = new Map<string, { el: DesignElement; id: string }>();
    const nets = new Set<string>();
    let kicadForms = 0;
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
      } else if (el.type !== "stack" && !FACTS.has(el.type)) throw new Error(`<${el.type}> is not read on a board (see commandagi/design pcb)`);
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
        case "component": {
          refuseUnknown(el, ["name", "footprint", "library", "pcbX", "pcbY", "pcbRotation", "layer", "uuid", "kicad"]);
          const ref = el.props.name as string;
          const fp = el.props.footprint;
          const library = el.props.library;
          if (library !== undefined) {
            if (typeof library !== "string" || !/\.pretty\/?$/i.test(library)) throw new Error(`${where(el)}: library names a footprint library folder (a .pretty), not ${JSON.stringify(library)}`);
            if (typeof fp !== "string" || !/^[^:]+:[^:/]+$/.test(fp)) throw new Error(`${where(el)}: a library footprint is its ref, "Library:Footprint" ("Package_SO:SOIC-8"), not ${JSON.stringify(fp)}`);
          } else if (typeof fp !== "string" || !(BOARD_FOOTPRINTS as readonly string[]).includes(fp))
            throw new Error(`${where(el)}: footprint is one of ${BOARD_FOOTPRINTS.join(", ")}, or a library footprint with its library, not ${JSON.stringify(fp)}`);
          const x = num(el, "pcbX"), y = num(el, "pcbY"), rot = num(el, "pcbRotation");
          const side = el.props.layer;
          if (side !== undefined && side !== "top" && side !== "bottom") throw new Error(`${where(el)}: layer is "top" or "bottom"`);
          if ((x === undefined) !== (y === undefined)) throw new Error(`${where(el)}: give pcbX and pcbY together`);
          if (x === undefined && (rot !== undefined || side !== undefined)) throw new Error(`${where(el)}: pcbRotation and layer need pcbX and pcbY`);
          s.add(
            BOARD_PART,
            {
              ref,
              ...(library !== undefined ? { footprint: fp, library: (library as string).replace(/\/$/, "") } : { footprint: `Authored:${fp}` }),
              ...(x !== undefined ? { placement: { x, y, rot: rot ?? 0, side: side ?? "top" } } : {}),
              ...uuidOf(el),
              ...kicad(el),
            },
            { id: `fp_${ref}`, label: ref, meta: meta(el) },
          );
          break;
        }
        case "trace":
        case "arc": {
          refuseUnknown(el, ["name", "layer", "width", "points", "from", "to", "net", "uuid", "kicad", ...(el.type === "trace" ? ["segmentUuids"] : [])]);
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
      }
    }
  });
  return new Declaration("board", s.build());
}
