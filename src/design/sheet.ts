/**
 * A SCHEMATIC IN JSX — the circuit's own schematic sheet, declared as the nodes the CommandAGI circuit editor
 * draws and edits (`sch.symbol.*`, `sch.wire`, `sch.junction`, `sch.label`), with tscircuit's tag names where
 * tscircuit has them:
 *
 *   export default () => (
 *     <group name="Divider">
 *       <voltagesource name="V1" voltage="9" schX={114.3} schY={114.3} />
 *       <resistor name="R1" resistance="3k" schX={114.3} schY={88.9} />
 *       <resistor name="R2" resistance="1.5k" schX={139.7} schY={88.9} schRotation={90} />
 *       <ground name="#PWR1" schX={139.7} schY={114.3} />
 *       <trace from=".V1 > .pos" to=".R1 > .pin1" />
 *       <netlabel net="OUT" connection=".R1 > .pin2" />
 *     </group>
 *   );
 *
 * The tags:
 *   <resistor|capacitor|inductor name resistance|capacitance|inductance>   an ideal two-terminal part
 *   <voltagesource|currentsource name voltage|current excitation>          an ideal source: pin 1 (`pos`) is +
 *   <ground name>                                                          a ground symbol (name "#PWR1"): net GND
 *   … schX schY schRotation                                                where its symbol sits on the sheet
 *   <junction name schX schY>                                              a wire vertex
 *   <trace from to> or <trace path={[…]}>                                  wires: ".R1 > .pin2", ".J1" (a junction),
 *                                                                          "net.GND" (a label naming that net)
 *   <netlabel net connection>                                              a label naming the net of a pin
 *   <part name symbol library value>                                       a library part: its symbol named by its
 *                                                                          library ref ("Device:R_Small") in a
 *                                                                          .kicad_sym the file names by path
 *   <unit part unit schX schY schRotation schMirror>                       where another unit of a part sits
 *                                                                          (U1B: unit={2}); the part's own schX and
 *                                                                          schY place unit 1
 *   <code name source inputs>                                              a code part: the parts another file
 *                                                                          declares (its path relative to this one),
 *                                                                          run with these inputs
 *
 * schX and schY are the sheet's own coordinates: millimetres, Y DOWN (tscircuit's are Y up). schRotation is 0, 90,
 * 180 or 270 degrees; schMirror is "x" or "y". A part with neither schX nor schY is declared and not placed. The
 * symbols are named (`Ideal:R`, `Device:R_Small`): the editor draws its own ideal symbols and reads a library part's
 * pins and body from the library file, so the file holds no artwork and no pin geometry. A library part's pin is
 * named by its number (".U1 > .pin5"); the editor binds it to the unit that has that pin (a pin common to every unit
 * lands on the lowest unit placed). A wire is a binding between two pins, never a coincidence of coordinates. Each node the reader declares carries the element's `source` in
 * `meta.source`. Anything else is refused by name, never guessed.
 */
import { channels, currentScope, slug, type Scope } from "./ir.js";
import { partTypeFor } from "./eda.js";
import { childElements, type DesignElement } from "./jsx-runtime.js";

export const SCH_WIRE = "sch.wire";
export const SCH_JUNCTION = "sch.junction";
export const SCH_LABEL = "sch.label";
/** The port a placement consumes its part on, and the part's output that offers it (the circuit's own). */
const PART_PORT = "part";
const PART_BODY_PORT = "@part";
const VERTEX_PORT = "v";

/** A placement's node type: `sch.symbol.` + FNV-1a over its pin sockets joined by NUL (part of the format). */
export function schSymbolTypeFor(sockets: readonly string[]): string {
  const signature = sockets.join("\u0000");
  let h = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    h ^= signature.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sch.symbol.${h.toString(16).padStart(8, "0")}`;
}

interface Ideal {
  symbol: string;
  /** The prop that holds the value, or null (a ground symbol's value is its net). */
  value: string | null;
  pins: number;
  aliases: Record<string, string>;
  power?: string;
  excitation?: boolean;
}
const TWO = { pin1: "1", pin2: "2", left: "1", right: "2" };
const SOURCE = { ...TWO, pos: "1", neg: "2", "+": "1", "-": "2" };
/** The parts a schematic declares, by tag: the circuit editor's ideal symbols. */
export const SHEET_PARTS: Readonly<Record<string, Ideal>> = {
  resistor: { symbol: "Ideal:R", value: "resistance", pins: 2, aliases: TWO },
  capacitor: { symbol: "Ideal:C", value: "capacitance", pins: 2, aliases: TWO },
  inductor: { symbol: "Ideal:L", value: "inductance", pins: 2, aliases: TWO },
  voltagesource: { symbol: "Ideal:V", value: "voltage", pins: 2, aliases: SOURCE, excitation: true },
  currentsource: { symbol: "Ideal:I", value: "current", pins: 2, aliases: SOURCE, excitation: true },
  ground: { symbol: "Ideal:GND", value: null, pins: 1, aliases: { pin1: "1", gnd: "1" }, power: "GND" },
};
/** The tags only a schematic has (a board reads resistors, capacitors and inductors too). */
const SHEET_ONLY = new Set(["voltagesource", "currentsource", "ground", "junction", "netlabel", "part", "unit", "code"]);

const PLACE_PROPS = ["schX", "schY", "schRotation", "schMirror"];
const MIRRORS = ["x", "y"];
/** A library part's wire end before the editor reads its library: the part node, and the pin by number. */
export const LIBRARY_PIN_PORT = "pin:";
/** The node a code part declares (the graph's own `code` op): it runs another file. */
const CODE_OP = "code";
const meta = (el: DesignElement) => (el.source === undefined ? undefined : { source: el.source });
const where = (el: DesignElement) =>
  `<${el.type}${typeof el.props.name === "string" ? ` name="${el.props.name}"` : typeof el.props.part === "string" ? ` part="${el.props.part}"` : ""}>`;

function refuseUnknown(el: DesignElement, allowed: string[]): void {
  for (const k of Object.keys(el.props)) {
    if (k === "children" || k === "key" || allowed.includes(k)) continue;
    if (["footprint", "pcbX", "pcbY", "pcbRotation", "layer"].includes(k))
      throw new Error(`${where(el)}: ${k} is not read on a schematic (a schematic part declares no board placement)`);
    throw new Error(`${where(el)}: prop ${k} is not read on a schematic`);
  }
}

function num(el: DesignElement, prop: string): number | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw new Error(`${where(el)}: ${prop} is a number (mm or degrees), not ${JSON.stringify(v)}`);
}

function plainData(v: unknown, what: string): unknown {
  if (v === null || ["string", "number", "boolean"].includes(typeof v)) return v;
  if (Array.isArray(v)) return v.map((x, i) => plainData(x, `${what}[${i}]`));
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plainData(x, `${what}.${k}`)]));
  throw new Error(`${what} is plain data (numbers, strings, objects)`);
}

interface Placed {
  ref: string;
  /** The part node's id. */
  id: string;
  /** Its placements by unit. */
  units: Map<number, string>;
  /** The ideal symbol, or null for a library part (its pins are the library's). */
  ideal: Ideal | null;
  el: DesignElement;
}

/** Add the placement of `unit` of `part` that `el` declares (its schX, schY, schRotation, schMirror). */
function place(s: Scope, part: Placed, unit: number, el: DesignElement, pins: readonly string[]): void {
  const x = num(el, "schX"), y = num(el, "schY"), rot = num(el, "schRotation");
  const mirror = el.props.schMirror;
  if (x === undefined && y === undefined) {
    if (rot !== undefined || mirror !== undefined) throw new Error(`${where(el)}: ${rot !== undefined ? "schRotation" : "schMirror"} needs schX and schY`);
    if (el.type === "unit") throw new Error(`${where(el)}: a unit is placed: give it schX and schY`);
    return;
  }
  if (rot !== undefined && ![0, 90, 180, 270].includes(rot)) throw new Error(`${where(el)}: schRotation is 0, 90, 180 or 270`);
  if (mirror !== undefined && !MIRRORS.includes(mirror as string)) throw new Error(`${where(el)}: schMirror is "x" or "y"`);
  const id = s.add(
    schSymbolTypeFor(pins),
    { unit, style: 1, at: { x: x ?? 0, y: y ?? 0 }, rot: rot ?? 0, mirror: (mirror as string | undefined) ?? "", [PART_PORT]: { wire: { node: part.id, port: PART_BODY_PORT } } },
    { id: `sym_${part.ref}_${unit}`, label: part.ref, meta: meta(el) },
  ).id;
  part.units.set(unit, id);
}

function str(el: DesignElement, prop: string, what: string): string {
  const v = el.props[prop];
  if (typeof v !== "string" || !v.trim()) throw new Error(`${where(el)}: ${prop} is ${what}`);
  return v;
}

/** Declare a schematic's elements (the root's children) into the current circuit scope. */
export function declareSheet(children: unknown): void {
  const s: Scope = currentScope("a schematic");
  const parts = new Map<string, Placed>();
  const junctions = new Map<string, string>();
  const later: DesignElement[] = [];
  let wires = 0;
  for (const el of childElements(children)) {
    const ideal = SHEET_PARTS[el.type];
    if (ideal) {
      refuseUnknown(el, ["name", ...PLACE_PROPS, ...(ideal.value ? [ideal.value] : []), ...(ideal.excitation ? ["excitation"] : [])]);
      const ref = el.props.name;
      if (typeof ref !== "string" || !ref) throw new Error(`<${el.type}> needs a name`);
      // The netlist leaves power symbols out by their reference (KiCad's rule), so a ground's says it is one.
      if (ideal.power && !ref.startsWith("#")) throw new Error(`${where(el)}: a ground symbol's name starts with # (#PWR1), as KiCad names power symbols`);
      if (parts.has(ref)) throw new Error(`two parts are called ${ref}`);
      const pins = Array.from({ length: ideal.pins }, (_, i) => ({ id: `p${i + 1}`, number: String(i + 1) }));
      const raw = ideal.value ? el.props[ideal.value] : undefined;
      if (raw !== undefined && typeof raw !== "string" && typeof raw !== "number")
        throw new Error(`${where(el)}: ${ideal.value} is a value ("1k", 1000), not ${JSON.stringify(raw)}`);
      const value = ideal.power ?? (raw === undefined ? undefined : String(raw));
      const excitation = el.props.excitation === undefined ? undefined : plainData(el.props.excitation, `${where(el)} excitation`);
      const part = s.add(
        partTypeFor(pins),
        {
          ref,
          ...(value !== undefined ? { value } : {}),
          symbol: ideal.symbol,
          pins,
          units: 1,
          ...(ideal.power ? { powerSymbol: true } : {}),
          ...(excitation !== undefined ? { excitation } : {}),
        },
        { id: ref, label: ref, meta: meta(el) },
      );
      const placed: Placed = { ref, id: part.id, units: new Map(), ideal, el };
      place(s, placed, 1, el, pins.map((p) => p.id));
      parts.set(ref, placed);
      continue;
    }
    switch (el.type) {
      case "part": {
        refuseUnknown(el, ["name", "symbol", "library", "value", ...PLACE_PROPS]);
        const ref = str(el, "name", "the part's reference (U1)");
        if (parts.has(ref)) throw new Error(`two parts are called ${ref}`);
        const symbol = str(el, "symbol", 'its library ref ("Device:R_Small")');
        if (!/^[^:]+:[^:]+$/.test(symbol)) throw new Error(`${where(el)}: symbol is a library ref, "Library:Symbol" ("Device:R_Small"), not ${JSON.stringify(symbol)}`);
        const library = str(el, "library", "the path of the .kicad_sym that holds the symbol");
        if (!/\.kicad_sym$/i.test(library)) throw new Error(`${where(el)}: library names a .kicad_sym file, not ${JSON.stringify(library)}`);
        const raw = el.props.value;
        if (raw !== undefined && typeof raw !== "string" && typeof raw !== "number") throw new Error(`${where(el)}: value is a value ("LM358", 1000), not ${JSON.stringify(raw)}`);
        // The pins are the library's: the editor reads them (and the part's type) from the library file.
        const part = s.add(
          partTypeFor([]),
          { ref, ...(raw !== undefined ? { value: String(raw) } : {}), symbol, library, pins: [] },
          { id: ref, label: ref, meta: meta(el) },
        );
        const placed: Placed = { ref, id: part.id, units: new Map(), ideal: null, el };
        place(s, placed, 1, el, []);
        parts.set(ref, placed);
        break;
      }
      case "code": {
        refuseUnknown(el, ["name", "source", "inputs"]);
        const name = str(el, "name", "the code part's id");
        const source = str(el, "source", "the path of the file it runs, relative to this one");
        const inputs = el.props.inputs === undefined ? {} : plainData(el.props.inputs, `${where(el)} inputs`);
        if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) throw new Error(`${where(el)}: inputs is an object of the file's parameters`);
        if ("source" in inputs) throw new Error(`${where(el)}: source is the file, not one of its inputs`);
        if (s.nodes[name]) throw new Error(`two nodes are called ${name}`);
        s.add(CODE_OP, { source, ...(inputs as Record<string, unknown>) }, { id: name, label: source.split("/").pop() ?? source, meta: meta(el) });
        break;
      }
      case "junction": {
        refuseUnknown(el, ["name", "schX", "schY"]);
        const name = el.props.name;
        if (typeof name !== "string" || !name) throw new Error("<junction> needs a name");
        if (junctions.has(name)) throw new Error(`two junctions are called ${name}`);
        const id = s.add(SCH_JUNCTION, { at: { x: num(el, "schX") ?? 0, y: num(el, "schY") ?? 0 } }, { id: name, label: "Junction", meta: meta(el) }).id;
        junctions.set(name, id);
        break;
      }
      case "unit":
      case "trace":
      case "netlabel":
        later.push(el);
        break;
      default:
        throw new Error(`<${el.type}> is not read on a schematic (see commandagi/design sheet)`);
    }
  }

  const end = (sel: unknown, el: DesignElement): { node: string; port: string } | { net: string } => {
    if (typeof sel !== "string") throw new Error(`${where(el)}: an end is a selector (".R1 > .pin1", ".J1", "net.GND")`);
    const n = /^\s*net\.([A-Za-z0-9_+\-]+)\s*$/.exec(sel);
    if (n) return { net: n[1]! };
    const j = /^\s*\.([A-Za-z0-9_#\-]+)\s*$/.exec(sel);
    if (j) {
      const id = junctions.get(j[1]!);
      if (!id) throw new Error(`${where(el)}: there is no junction ${j[1]}`);
      return { node: id, port: VERTEX_PORT };
    }
    const p = /^\s*\.([A-Za-z0-9_#\-]+)\s*>\s*\.([A-Za-z0-9_+\-]+)\s*$/.exec(sel);
    if (!p) throw new Error(`${where(el)}: ${JSON.stringify(sel)} is not ".REF > .pin", ".JUNCTION" or "net.NAME"`);
    const part = parts.get(p[1]!);
    if (!part) throw new Error(`${where(el)}: there is no part ${p[1]}`);
    if (!part.units.size) throw new Error(`${where(el)}: ${part.ref} is not on the sheet (give it schX and schY)`);
    if (!part.ideal) {
      // A library part's pin by number (".pin5" or ".5"); the editor binds it to the unit that has it.
      const number = /^pin(.+)$/i.exec(p[2]!)?.[1] ?? p[2]!;
      return { node: part.id, port: `${LIBRARY_PIN_PORT}${number}` };
    }
    const key = p[2]!.toLowerCase();
    const number = part.ideal.aliases[key] ?? (/^\d+$/.test(key) ? key : undefined);
    if (!number || Number(number) > part.ideal.pins) throw new Error(`${where(el)}: ${part.ref} has no pin ${p[2]}`);
    return { node: part.units.get(1)!, port: `p${number}` };
  };
  /** A free id `base`, `base_2`, … (ids are deterministic: the same file declares the same ids). */
  const free = (base: string) => {
    let id = slug(base);
    for (let n = 2; s.nodes[id]; n++) id = `${slug(base)}_${n}`;
    return id;
  };
  const label = (text: string, on: { node: string; port: string }, el: DesignElement) =>
    s.add(SCH_LABEL, { text, on: { wire: on } }, { id: free(`lbl_${text}`), label: text, meta: meta(el) });

  // Units first: a wire may land on any unit's pin.
  for (const el of later) {
    if (el.type !== "unit") continue;
    refuseUnknown(el, ["part", "unit", ...PLACE_PROPS]);
    const ref = str(el, "part", "the reference of the part whose unit it places");
    const part = parts.get(ref);
    if (!part) throw new Error(`${where(el)}: there is no part ${ref}`);
    const unit = el.props.unit;
    if (typeof unit !== "number" || !Number.isInteger(unit) || unit < 2)
      throw new Error(`${where(el)}: unit is 2 or more (the part's own schX and schY place unit 1)`);
    if (part.ideal) throw new Error(`${where(el)}: ${ref} is an ideal part, which has one unit`);
    if (part.units.has(unit)) throw new Error(`${where(el)}: unit ${unit} of ${ref} is placed twice`);
    place(s, part, unit, el, []);
  }
  for (const el of later) {
    if (el.type === "unit") continue;
    if (el.type === "netlabel") {
      refuseUnknown(el, ["net", "connection"]);
      const text = el.props.net;
      if (typeof text !== "string" || !text.trim()) throw new Error("<netlabel> needs a net name");
      const on = end(el.props.connection, el);
      if ("net" in on) throw new Error(`${where(el)}: a label's connection is a pin or a junction`);
      label(text.trim(), on, el);
      continue;
    }
    refuseUnknown(el, ["from", "to", "path"]);
    const path = Array.isArray(el.props.path) ? (el.props.path as unknown[]) : [el.props.from, el.props.to];
    if (path.length < 2) throw new Error("<trace> takes from and to, or a path of selectors");
    const ends = path.map((p) => end(p, el));
    for (let i = 1; i < ends.length; i++) {
      const a = ends[i - 1]!, b = ends[i]!;
      if ("net" in a && "net" in b) throw new Error(`<trace> joins two nets (${a.net}, ${b.net})`);
      if ("net" in a) label(a.net, b as { node: string; port: string }, el);
      else if ("net" in b) label(b.net, a, el);
      else s.add(SCH_WIRE, channels("ends", [{ wire: a }, { wire: b }]), { id: free(`w_${++wires}`), label: "Wire", meta: meta(el) });
    }
  }
}

/** Whether a JSX circuit is a schematic: its root is a <group>, or it places a symbol or uses a tag only a schematic has. */
export function isSheet(root: DesignElement): boolean {
  if (root.type === "group") return true;
  return childElements(root.props.children).some(
    (el) => SHEET_ONLY.has(el.type) || PLACE_PROPS.some((p) => el.props[p] !== undefined),
  );
}
