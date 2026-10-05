/**
 * A BOARD IN JSX — the board half of a circuit, declared as the nodes the CommandAGI circuit editor's board holds
 * (`eda.board`, `eda.stack`, `eda.conductor`) plus, for each part, the board facts the `.pcb.json` keeps beside it
 * (`eda.footprint`: which footprint, and where it sits). A board names its schematic, as a `.pcb.json` does; the
 * schematic says what the parts are and what is connected, the board says where they sit and where the copper runs:
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
 *   <board schematic width height core copper>        the root. `schematic` is the schematic file, relative to this
 *                                                      one. The outline is a width × height rectangle from (0, 0);
 *                                                      core and copper are the cross-section's thicknesses (mm).
 *                                                      A board with no width and height declares no outline yet.
 *   <component name footprint pcbX pcbY pcbRotation layer>
 *                                                      the schematic's part `name` on this board: its footprint (one
 *                                                      of the editor's own land patterns, BOARD_FOOTPRINTS), where it
 *                                                      sits, its rotation (degrees) and its side ("top" or "bottom").
 *                                                      With no pcbX and pcbY it has a footprint and is not placed.
 *   <trace name layer width points from to>            a copper run: its points ([[x, y], …]), on one copper layer,
 *                                                      with a finished width.
 *                                                      `from` and `to` say what its first and last points land on.
 *   <via name pcbX pcbY drill diameter layers>         a plated barrel; `layers` defaults to ["F.Cu", "B.Cu"].
 *
 * Coordinates are the board's own: millimetres, Y DOWN, from the outline's corner (tscircuit's board is centred and
 * Y up; a `<board>` that names no schematic is read as tscircuit, `./tscircuit.ts`). The ends of a trace are bound
 * by what they say, never by where they are drawn: ".R1 > .pin2" (a pin of a component, by its number), ".V1" (a
 * via, by name), ".T1 > .end" (a point of another trace: .start, .end or its index). Anything else is refused by
 * name, never guessed. Each node an element declares carries the element's `source` in `meta.source`.
 */
import { Declaration, Scope, slug, withScope } from "./ir.js";
import { childElements, type DesignElement } from "./jsx-runtime.js";

export const BOARD_PART = "eda.footprint";
export const CONDUCTOR = "eda.conductor";
/** The editor's own land patterns, by the name a `<component footprint>` gives (the circuit's id is `Authored:<name>`). */
export const BOARD_FOOTPRINTS = ["smd-0805", "axial-7.62", "header-2.54"] as const;
/** A new board's layer table (the circuit editor's blank board). */
const LAYERS = [
  { ordinal: 0, name: "F.Cu", type: "signal" },
  { ordinal: 31, name: "B.Cu", type: "signal" },
  { ordinal: 36, name: "B.SilkS", type: "user" },
  { ordinal: 37, name: "F.SilkS", type: "user" },
  { ordinal: 44, name: "Edge.Cuts", type: "user" },
];
const COPPER = new Set(["F.Cu", "B.Cu"]);

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

function points(el: DesignElement): { x: number; y: number }[] {
  const v = el.props.points;
  if (!Array.isArray(v) || v.length < 2) throw new Error(`${where(el)}: points is a list of at least two [x, y]`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((c) => typeof c === "number" && Number.isFinite(c)))
      throw new Error(`${where(el)}: point ${i} is [x, y] in mm, not ${JSON.stringify(p)}`);
    return { x: p[0] as number, y: p[1] as number };
  });
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

/** Declare a board in code (its root is `<board schematic="…">`). */
export function declareBoardFile(root: DesignElement, name?: string): Declaration {
  refuseUnknown(root, ["schematic", "name", "width", "height", "core", "copper"]);
  const schematic = root.props.schematic;
  if (typeof schematic !== "string" || !schematic.trim() || schematic.startsWith("/"))
    throw new Error(`<board>: schematic is the schematic file's path, relative to this file`);
  const title = typeof root.props.name === "string" ? root.props.name : (name ?? "Board");
  const s = new Scope(`eda:${slug(title)}`, { domain: "eda", rung: "board", name: title, schematic });
  withScope(s, () => {
    const w = positive(root, "width"), h = positive(root, "height");
    const core = positive(root, "core"), copper = positive(root, "copper");
    if ((w === undefined) !== (h === undefined)) throw new Error("<board>: give width and height together");
    if ((core === undefined) !== (copper === undefined)) throw new Error("<board>: give core and copper together");
    if (core !== undefined && w === undefined) throw new Error("<board>: core and copper need the outline (width and height)");
    if (w !== undefined && h !== undefined) {
      if (core !== undefined && copper !== undefined)
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
      s.add(
        "eda.board",
        {
          layers: LAYERS,
          ...(core !== undefined && copper !== undefined ? { thicknessMm: core + 2 * copper, stack: { wire: { node: "stack", port: "stack" } } } : {}),
          boardArtwork: {
            graphics: [{ id: "outline", kind: "rect", points: [{ x: 0, y: 0 }, { x: w, y: h }], widthMm: 0.05, layer: "Edge.Cuts", filled: false }],
            texts: [],
          },
        },
        { id: "board", label: "Board", meta: meta(root) },
      );
      s.output("board");
    }

    // Names first: a trace's end may name a trace or a via written after it.
    const children = childElements(root.props.children);
    const components = new Set<string>();
    const conductors = new Map<string, { el: DesignElement; id: string }>();
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
      } else if (el.type === "trace" || el.type === "via") {
        if (nm === undefined) continue;
        if (typeof nm !== "string" || !/^[A-Za-z0-9_\-]+$/.test(nm)) throw new Error(`${where(el)}: a name is letters, digits, _ and -`);
        if (components.has(nm) || conductors.has(nm)) throw new Error(`two elements are called ${nm}`);
        conductors.set(nm, { el, id: nm });
      } else throw new Error(`<${el.type}> is not read on a board (see commandagi/design pcb)`);
    }
    const idOf = new Map<DesignElement, string>([...conductors.values()].map((c) => [c.el, c.id]));
    for (const el of children) if ((el.type === "trace" || el.type === "via") && !idOf.has(el)) idOf.set(el, freeId());

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
      if (!run || run.el.type !== "trace") throw new Error(`${where(el)}: there is no component or trace ${owner}`);
      const count = points(run.el).length;
      const index = which === "start" ? 0 : which === "end" ? count - 1 : /^\d+$/.test(which) ? Number(which) : -1;
      if (index < 0 || index >= count) throw new Error(`${where(el)}: trace ${owner} has no point ${which}`);
      return { point, run: run.id, runPoint: tracePointId(index, count) };
    };

    for (const el of children) {
      if (el.type === "component") {
        refuseUnknown(el, ["name", "footprint", "pcbX", "pcbY", "pcbRotation", "layer"]);
        const ref = el.props.name as string;
        const fp = el.props.footprint;
        if (typeof fp !== "string" || !(BOARD_FOOTPRINTS as readonly string[]).includes(fp))
          throw new Error(`${where(el)}: footprint is one of ${BOARD_FOOTPRINTS.join(", ")}, not ${JSON.stringify(fp)}`);
        const x = num(el, "pcbX"), y = num(el, "pcbY"), rot = num(el, "pcbRotation");
        const side = el.props.layer;
        if (side !== undefined && side !== "top" && side !== "bottom") throw new Error(`${where(el)}: layer is "top" or "bottom"`);
        if ((x === undefined) !== (y === undefined)) throw new Error(`${where(el)}: give pcbX and pcbY together`);
        if (x === undefined && (rot !== undefined || side !== undefined)) throw new Error(`${where(el)}: pcbRotation and layer need pcbX and pcbY`);
        s.add(
          BOARD_PART,
          { ref, footprint: `Authored:${fp}`, ...(x !== undefined ? { placement: { x, y, rot: rot ?? 0, side: side ?? "top" } } : {}) },
          { id: `fp_${ref}`, label: ref, meta: meta(el) },
        );
      } else if (el.type === "trace") {
        refuseUnknown(el, ["name", "layer", "width", "points", "from", "to"]);
        const pts = points(el);
        const layer = el.props.layer;
        if (typeof layer !== "string" || !COPPER.has(layer)) throw new Error(`${where(el)}: layer is a copper layer ("F.Cu" or "B.Cu")`);
        const terminals = [
          ...(el.props.from !== undefined ? [end(el.props.from, el, 0)] : []),
          ...(el.props.to !== undefined ? [end(el.props.to, el, pts.length - 1)] : []),
        ];
        s.add(
          CONDUCTOR,
          {
            kind: "run",
            points: pts.map((p, i) => ({ ...p, id: tracePointId(i, pts.length) })),
            widthMm: positive(el, "width", true),
            layer,
            // The board view routes and re-routes it under any angle; a KiCad segment says no rule.
            rule: "any",
            ...(terminals.length ? { terminals } : {}),
          },
          { id: idOf.get(el)!, label: "Trace", meta: meta(el) },
        );
      } else {
        refuseUnknown(el, ["name", "pcbX", "pcbY", "drill", "diameter", "layers"]);
        const layers = el.props.layers ?? ["F.Cu", "B.Cu"];
        if (!Array.isArray(layers) || layers.length < 2 || !layers.every((l) => typeof l === "string" && COPPER.has(l)))
          throw new Error(`${where(el)}: layers is two or more copper layers`);
        const drill = positive(el, "drill", true)!, diameter = positive(el, "diameter", true)!;
        if (diameter <= drill) throw new Error(`${where(el)}: the diameter is more than the drill`);
        s.add(
          CONDUCTOR,
          { kind: "via", points: [{ x: num(el, "pcbX", true)!, y: num(el, "pcbY", true)! }], drillMm: drill, padDiameterMm: diameter, layers },
          { id: idOf.get(el)!, label: "Via", meta: meta(el) },
        );
      }
    }
  });
  return new Declaration("board", s.build());
}
