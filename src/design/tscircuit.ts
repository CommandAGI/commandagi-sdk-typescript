/**
 * TSCIRCUIT → THE CIRCUIT OP GRAPH — a convenience importer, not a second model.
 *
 * A tscircuit file's JSX (`<board>`, `<resistor>`, `<trace>`, …) is read here and declared with this SDK's
 * EDA primitives, so it lands as the same circuit graph `circuit()` produces:
 *
 *   export default () => (
 *     <board width="30mm" height="20mm">
 *       <resistor name="R1" resistance="330" footprint="0603" pcbX={-6} pcbY={0} />
 *       <led name="D1" color="red" footprint="0603" pcbX={4} pcbY={0} />
 *       <trace from=".R1 > .pin2" to=".D1 > .anode" />
 *     </board>
 *   );
 *
 * The subset read (anything else is refused, naming the tag or prop — never guessed):
 *   <board width height>                         the outline; tscircuit's origin is the board's centre, Y up
 *   <resistor|capacitor|inductor name footprint resistance|capacitance|inductance pcbX pcbY pcbRotation layer>
 *   <led|diode name footprint color pcbX pcbY>   pin1 = anode, pin2 = cathode, as tscircuit numbers them
 *   <chip name footprint pinLabels pcbX pcbY>    footprints "soic8" / "soic14" / "soic16" / "sot23"
 *   <pinheader name pinCount pitch pcbX pcbY>
 *   <trace from to> or <trace path={[…]}>        ".R1 > .pin1", ".U1 > .VCC", "net.GND"
 *   <net name>                                   declares a net by name
 * Footprint strings: "0402" "0603" "0805" "1206" "soic8" "soic14" "soic16" "sot23" "pinrowN".
 * Schematic placement (`schX`, `schY`) is accepted and not used: the importer declares the netlist and the
 * board. tscircuit's autorouter is an engine and is not here, so traces are nets (the ratsnest shows them).
 */
import type { Declaration } from "./ir.js";
import { board, circuit, connect, footprints, net, part, partByRef, type Footprint, type PartRef } from "./eda.js";
import { childElements, isElement, type DesignElement } from "./jsx-runtime.js";

const TWO_PIN = { pin1: "1", pin2: "2", left: "1", right: "2" };
/** tscircuit numbers a diode's pins anode first; the land pattern (KiCad's) puts the cathode on pad 1. */
const POLAR = { pin1: "2", pin2: "1", anode: "2", cathode: "1", pos: "2", neg: "1", left: "2", right: "1" };

/** A tscircuit length: a number (mm) or a string with a unit ("20mm", "0.1in", "100mil"). */
export function length(v: unknown, what: string): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*(mm|in|mil)?\s*$/.exec(v);
    if (m) {
      const n = Number(m[1]);
      return m[2] === "in" ? n * 25.4 : m[2] === "mil" ? n * 0.0254 : n;
    }
  }
  throw new Error(`${what}: ${JSON.stringify(v)} is not a length`);
}

function footprintOf(v: unknown, kind: "R" | "C" | "L" | "LED" | "D" | "chip", owner: string): Footprint {
  if (typeof v !== "string") throw new Error(`${owner}: footprint is a footprint name ("0603", "soic8", …)`);
  const s = v.toLowerCase();
  if (["0402", "0603", "0805", "1206"].includes(s) && kind !== "chip") return footprints.chip(s as "0603", kind);
  const soic = /^soic(8|14|16)$/.exec(s);
  if (soic) return footprints.soic(Number(soic[1]) as 8);
  if (s === "sot23") return footprints.sot23();
  const row = /^pinrow(\d+)$/.exec(s);
  if (row) return footprints.pinHeader(Number(row[1]));
  throw new Error(`${owner}: footprint ${JSON.stringify(v)} is not one this importer knows`);
}

const KNOWN_PROPS = new Set(["name", "footprint", "pcbX", "pcbY", "pcbRotation", "layer", "schX", "schY", "schRotation", "children", "key"]);
function refuseUnknown(el: DesignElement, extra: string[]): void {
  for (const k of Object.keys(el.props))
    if (!KNOWN_PROPS.has(k) && !extra.includes(k)) throw new Error(`<${el.type} name="${String(el.props.name ?? "")}">: prop ${k} is not read by this importer`);
}

/** Declare a tscircuit element tree (its root is a `<board>`) as a circuit. */
export function fromTscircuit(root: unknown, name?: string): Declaration {
  const boards = isElement(root) ? [root] : childElements(root);
  const b = boards.find((e) => e.type === "board");
  if (!b || boards.length !== 1) throw new Error("a tscircuit design is one <board> element");
  const w = length(b.props.width, "<board> width");
  const h = length(b.props.height, "<board> height");
  return circuit(name ?? String(b.props.name ?? "Circuit"), () => {
    board({ width: w, height: h });
    const at = (el: DesignElement) =>
      el.props.pcbX === undefined && el.props.pcbY === undefined
        ? undefined
        : {
            x: w / 2 + length(el.props.pcbX ?? 0, `${String(el.props.name)} pcbX`),
            y: h / 2 - length(el.props.pcbY ?? 0, `${String(el.props.name)} pcbY`),
            rot: Number(el.props.pcbRotation ?? 0),
            side: el.props.layer === "bottom" ? ("bottom" as const) : ("top" as const),
          };
    const traces: DesignElement[] = [];
    for (const el of childElements(b.props.children)) {
      const nm = el.props.name;
      const needName = () => {
        if (typeof nm !== "string" || !nm) throw new Error(`<${el.type}> needs a name`);
        return nm;
      };
      switch (el.type) {
        case "resistor":
        case "capacitor":
        case "inductor": {
          const valueProp = { resistor: "resistance", capacitor: "capacitance", inductor: "inductance" }[el.type];
          refuseUnknown(el, [valueProp]);
          const kind = el.type === "resistor" ? "R" : el.type === "capacitor" ? "C" : "L";
          part({ ref: needName(), value: el.props[valueProp] === undefined ? undefined : String(el.props[valueProp]), footprint: footprintOf(el.props.footprint ?? "0603", kind, needName()), at: at(el), aliases: TWO_PIN });
          break;
        }
        case "led":
        case "diode": {
          refuseUnknown(el, ["color"]);
          part({ ref: needName(), value: el.props.color === undefined ? undefined : String(el.props.color), footprint: footprintOf(el.props.footprint ?? "0603", el.type === "led" ? "LED" : "D", needName()), at: at(el), aliases: POLAR });
          break;
        }
        case "chip": {
          refuseUnknown(el, ["pinLabels", "manufacturerPartNumber"]);
          const labels = (el.props.pinLabels ?? {}) as Record<string, string>;
          const pinNames: Record<string, string> = {};
          for (const [k, v] of Object.entries(labels)) {
            const m = /^pin(\d+)$/.exec(k);
            if (!m) throw new Error(`${needName()}: pinLabels keys are pin1, pin2, …`);
            pinNames[m[1]!] = v;
          }
          const fp = footprintOf(el.props.footprint, "chip", needName());
          const aliases = Object.fromEntries(fp.pads.map((p) => [`pin${p.number}`, p.number]));
          part({ ref: needName(), value: el.props.manufacturerPartNumber === undefined ? undefined : String(el.props.manufacturerPartNumber), footprint: fp, at: at(el), pinNames, aliases });
          break;
        }
        case "pinheader": {
          refuseUnknown(el, ["pinCount", "pitch", "gender"]);
          const count = Number(el.props.pinCount);
          const fp = footprints.pinHeader(count, el.props.pitch === undefined ? 2.54 : length(el.props.pitch, `${needName()} pitch`));
          part({ ref: needName(), footprint: fp, at: at(el), aliases: Object.fromEntries(fp.pads.map((p) => [`pin${p.number}`, p.number])) });
          break;
        }
        case "net":
          net(needName());
          break;
        case "trace":
          traces.push(el);
          break;
        default:
          throw new Error(`<${el.type}> is not read by this importer (see commandagi/design tscircuit)`);
      }
    }
    for (const t of traces) {
      const path = Array.isArray(t.props.path) ? (t.props.path as unknown[]) : [t.props.from, t.props.to];
      if (path.length < 2 || path.some((p) => typeof p !== "string")) throw new Error("<trace> takes from and to, or a path of selectors");
      const ends = (path as string[]).map(resolveSelector);
      for (let i = 1; i < ends.length; i++) {
        const a = ends[i - 1]!, c = ends[i]!;
        if ("net" in a && "net" in c) throw new Error(`<trace> joins two nets (${a.net}, ${c.net})`);
        if ("net" in a) net(a.net, (c as { pin: ReturnType<PartRef["pin"]> }).pin);
        else if ("net" in c) net(c.net, a.pin);
        else connect(a.pin, c.pin);
      }
    }
  });
}

function resolveSelector(sel: string): { net: string } | { pin: ReturnType<PartRef["pin"]> } {
  const n = /^\s*net\.([A-Za-z0-9_+\-]+)\s*$/.exec(sel);
  if (n) return { net: n[1]! };
  const p = /^\s*\.([A-Za-z0-9_]+)\s*>\s*\.([A-Za-z0-9_+\-]+)\s*$/.exec(sel);
  if (!p) throw new Error(`selector ${JSON.stringify(sel)} is not ".REF > .pin" or "net.NAME"`);
  return { pin: partByRef(p[1]!).pin(p[2]!) };
}
