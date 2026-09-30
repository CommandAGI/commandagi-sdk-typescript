/**
 * EDA — components, nets and the board, declared as the circuit op graph a CommandAGI circuit
 * (`<name>.sch.json` + `<name>.pcb.json`) holds in memory.
 *
 *   import { circuit, board, component, net, footprints as fp } from "commandagi/design";
 *
 *   export default circuit("Blinker", () => {
 *     board({ width: 30, height: 20 });
 *     const r1 = component({ ref: "R1", value: "330", footprint: fp.chip("0603", "R"), at: [8, 10] });
 *     const d1 = component({ ref: "D1", value: "red", footprint: fp.chip("0603", "LED"), at: [16, 10] });
 *     const j1 = component({ ref: "J1", footprint: fp.pinHeader(2), at: [4, 10] });
 *     net("VIN", j1.pin(1), r1.pin(1));
 *     net("LED_A", r1.pin(2), d1.pin("A"));
 *     net("GND", d1.pin("K"), j1.pin(2));
 *   });
 *
 * What is declared (the node types are the circuit's own):
 *   `eda.part.<signature>`  a part: reference, value, footprint, pins (each with its pad), placement.
 *                           Its pins are its output ports; the type is a hash of the pin signature.
 *   `eda.net`               a net: its channels `pins.1 … pins.N` are wires from the pins on it — the
 *                           netlist, and nothing else says what is connected.
 *   `eda.board`             the board: its layer table and its outline on `Edge.Cuts`.
 *
 * Structure only: no placement optimiser, no router, no DRC. A net says what is MEANT to be connected; the
 * copper that realises it is routed by an engine (or declared as `route`), and the difference between the
 * two is what an editor shows as the ratsnest. Footprints here are the SDK's own copies of common land
 * patterns, named after the KiCad library footprints they follow; check them against your fabricator.
 */
import { Declaration, NodeRef, Out, Scope, currentScope, withScope, channels, slug } from "./ir.js";

/** One pad's geometry, in footprint-local millimetres (y down, as KiCad draws). */
export interface Pad {
  type: "smd" | "thru_hole" | "np_thru_hole";
  shape: "rect" | "circle" | "oval" | "roundrect";
  at: { x: number; y: number; rot?: number };
  size: { w: number; h: number };
  drill?: { w: number; h: number; oval: boolean };
  layers: string[];
  roundrectRatio?: number;
}

/** A footprint: its library name and its pads by pin number, with optional pin names. */
export interface Footprint {
  name: string;
  pads: { number: string; name?: string; pad: Pad }[];
  attr?: string[];
}

const SMD_LAYERS = ["F.Cu", "F.Paste", "F.Mask"];
const TH_LAYERS = ["*.Cu", "*.Mask"];

function smd(number: string, x: number, y: number, w: number, h: number, name?: string) {
  return { number, ...(name ? { name } : {}), pad: { type: "smd" as const, shape: "roundrect" as const, at: { x, y }, size: { w, h }, layers: SMD_LAYERS, roundrectRatio: 0.25 } };
}

/** Two-terminal chip land patterns (R, C, L, LED, D), after KiCad's `*_<size>_<metric>Metric` footprints. */
const CHIP: Record<string, { metric: string; x: number; w: number; h: number }> = {
  "0402": { metric: "1005", x: 0.51, w: 0.54, h: 0.64 },
  "0603": { metric: "1608", x: 0.825, w: 0.8, h: 0.95 },
  "0805": { metric: "2012", x: 0.9125, w: 1.025, h: 1.4 },
  "1206": { metric: "3216", x: 1.4625, w: 1.125, h: 1.75 },
};
const CHIP_LIB: Record<string, [string, string]> = {
  R: ["Resistor_SMD", "R"],
  C: ["Capacitor_SMD", "C"],
  L: ["Inductor_SMD", "L"],
  LED: ["LED_SMD", "LED"],
  D: ["Diode_SMD", "D"],
};

export const footprints = {
  /** A two-terminal chip part. LEDs and diodes name pin 1 `K` (cathode) and pin 2 `A` (anode), as KiCad does. */
  chip(size: "0402" | "0603" | "0805" | "1206", kind: "R" | "C" | "L" | "LED" | "D" = "R"): Footprint {
    const c = CHIP[size];
    const lib = CHIP_LIB[kind];
    if (!c || !lib) throw new Error(`no ${kind} ${size} chip footprint`);
    const polar = kind === "LED" || kind === "D";
    return {
      name: `${lib[0]}:${lib[1]}_${size}_${c.metric}Metric`,
      pads: [smd("1", -c.x, 0, c.w, c.h, polar ? "K" : undefined), smd("2", c.x, 0, c.w, c.h, polar ? "A" : undefined)],
      attr: ["smd"],
    };
  },
  /** A single-row 2.54 mm pin header, pins down the Y axis from pin 1 (square pad). */
  pinHeader(count: number, pitch = 2.54): Footprint {
    if (!Number.isInteger(count) || count < 1 || count > 40) throw new Error("a pin header has 1 to 40 pins");
    const p = pitch.toFixed(2);
    return {
      name: `Connector_PinHeader_${p}mm:PinHeader_1x${String(count).padStart(2, "0")}_P${p}mm_Vertical`,
      pads: Array.from({ length: count }, (_, i) => ({
        number: String(i + 1),
        pad: { type: "thru_hole" as const, shape: i === 0 ? ("rect" as const) : ("oval" as const), at: { x: 0, y: i * pitch }, size: { w: 1.7, h: 1.7 }, drill: { w: 1, h: 1, oval: false }, layers: TH_LAYERS },
      })),
      attr: ["through_hole"],
    };
  },
  /** SOT-23 (three pins). */
  sot23(): Footprint {
    return {
      name: "Package_TO_SOT_SMD:SOT-23",
      pads: [smd("1", -1.1375, -0.95, 1.325, 0.6), smd("2", -1.1375, 0.95, 1.325, 0.6), smd("3", 1.1375, 0, 1.325, 0.6)],
      attr: ["smd"],
    };
  },
  /** SOIC with `pins` pins (8, 14 or 16), 1.27 mm pitch, 3.9 mm body; pin 1 top left, counter-clockwise. */
  soic(pins: 8 | 14 | 16): Footprint {
    const body = pins === 8 ? "3.9x4.9mm" : pins === 14 ? "3.9x8.7mm" : "3.9x9.9mm";
    const half = pins / 2;
    const y0 = (-(half - 1) * 1.27) / 2;
    const pads = [];
    for (let i = 0; i < half; i++) pads.push(smd(String(i + 1), -2.475, y0 + i * 1.27, 1.95, 0.6));
    for (let i = 0; i < half; i++) pads.push(smd(String(half + i + 1), 2.475, -y0 - i * 1.27, 1.95, 0.6));
    return { name: `Package_SO:SOIC-${pins}_${body}_P1.27mm`, pads, attr: ["smd"] };
  },
};

// ── The part type rule (the circuit engine's `partTypeFor`, restated: it is part of the format) ──────

function pinLabel(number: string, name: string | undefined): string {
  const t = (name ?? "").trim();
  return !t || t === number || t === "~" ? number : `${number} ${t}`;
}
/** A part's node type: `eda.part.` + FNV-1a over each pin's `id\0label`, pins joined by `\u0001`. */
export function partTypeFor(pins: readonly { id: string; number: string; name?: string }[]): string {
  const signature = pins.map((p) => `${p.id}\u0000${pinLabel(p.number, p.name)}`).join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) {
    h ^= signature.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `eda.part.${h.toString(16).padStart(8, "0")}`;
}

// ── Declaring a circuit ─────────────────────────────────────────────────────────────────────────────

interface Pending {
  /** Named nets, in declaration order: name → pins. */
  named: Map<string, Out[]>;
  /** Unnamed connections (pin pairs), joined into nets at the end. */
  links: [Out, Out][];
  /** Pin selectors resolved at the end (tscircuit's `.R1 > .pin1`). */
  parts: Map<string, PartRef>;
}
const pending = new WeakMap<Scope, Pending>();

function scope(what: string): Scope {
  const s = currentScope(what);
  if (s.meta.domain !== "eda") throw new Error(`${what} declares circuit structure and belongs inside circuit(…)`);
  return s;
}
const state = (s: Scope) => pending.get(s)!;

/** A declared part. `pin(1)`, `pin("1")` or `pin("A")` is one of its pins, for a net. */
export class PartRef extends NodeRef {
  constructor(
    scope: Scope,
    id: string,
    readonly ref: string,
    readonly pins: { id: string; number: string; name?: string }[],
    readonly aliases: Record<string, string> = {},
  ) {
    super(scope, id);
  }
  pin(which: number | string): Out {
    const key = String(which);
    const alias = this.aliases[key.toLowerCase()];
    const p =
      this.pins.find((x) => x.number === (alias ?? key)) ??
      this.pins.find((x) => x.name !== undefined && x.name.toLowerCase() === key.toLowerCase()) ??
      this.pins.find((x) => x.id === key);
    if (!p) throw new Error(`${this.ref} has no pin ${key} (pins: ${this.pins.map((x) => pinLabel(x.number, x.name)).join(", ")})`);
    return new Out(this.id, p.id);
  }
}

/** Declare a circuit: `fn` declares its board, parts and nets. */
export function circuit(name: string, fn: () => void, opts: { id?: string } = {}): Declaration {
  const s = new Scope(opts.id ?? `eda:${slug(name)}`, { domain: "eda", rung: "board", name });
  pending.set(s, { named: new Map(), links: [], parts: new Map() });
  withScope(s, () => {
    fn();
    flushNets(s);
  });
  const ir = s.build();
  ir.outputs = Object.values(ir.nodes).some((n) => n.type === "eda.board") ? ["board"] : [];
  if (!ir.outputs.length) delete ir.outputs;
  return new Declaration("circuit", ir);
}

/** Declare the board: a rectangle `width` × `height` mm with its corner at `origin`, two copper layers. */
export function board(o: { width: number; height: number; origin?: [number, number]; thicknessMm?: number }): NodeRef {
  const s = scope("board()");
  if (s.nodes.board) throw new Error("a circuit has one board");
  const [x0, y0] = o.origin ?? [0, 0];
  const c = [
    { x: x0, y: y0 },
    { x: x0 + o.width, y: y0 },
    { x: x0 + o.width, y: y0 + o.height },
    { x: x0, y: y0 + o.height },
  ];
  return s.add(
    "eda.board",
    {
      layers: [
        { ordinal: 0, name: "F.Cu", type: "signal" },
        { ordinal: 31, name: "B.Cu", type: "signal" },
        { ordinal: 34, name: "B.Paste", type: "user" },
        { ordinal: 35, name: "F.Paste", type: "user" },
        { ordinal: 36, name: "B.SilkS", type: "user" },
        { ordinal: 37, name: "F.SilkS", type: "user" },
        { ordinal: 38, name: "B.Mask", type: "user" },
        { ordinal: 39, name: "F.Mask", type: "user" },
        { ordinal: 44, name: "Edge.Cuts", type: "user" },
      ],
      ...(o.thicknessMm !== undefined ? { thicknessMm: o.thicknessMm } : {}),
      boardArtwork: {
        graphics: c.map((a, i) => ({ kind: "line", id: `edge-${i + 1}`, points: [a, c[(i + 1) % 4]], widthMm: 0.1, layer: "Edge.Cuts" })),
        texts: [],
      },
      stack: null,
    },
    { id: "board", label: "Board" },
  );
}

/** Where a part sits on the board: `[x, y]` mm, or with rotation (degrees) and side. */
export type At = [number, number] | { x: number; y: number; rot?: number; side?: "top" | "bottom" };

/** Declare a part. Unplaced (`at` absent) is a real state: a part not yet put on the board. */
export function part(o: {
  ref: string;
  value?: string;
  footprint: Footprint;
  at?: At;
  /** Pin names by number, overriding the footprint's (`{ 1: "VCC" }`). */
  pinNames?: Record<string, string>;
  /** Other words a pin answers to in `pin()` (`{ pos: "2" }`). */
  aliases?: Record<string, string>;
  symbol?: string;
}): PartRef {
  const s = scope("part()");
  const pins = o.footprint.pads.map((p) => {
    const name = o.pinNames?.[p.number] ?? p.name;
    return { id: `p${slug(p.number)}`, number: p.number, ...(name ? { name } : {}), pad: p.pad };
  });
  const at = o.at === undefined ? undefined : Array.isArray(o.at) ? { x: o.at[0], y: o.at[1], rot: 0, side: "top" as const } : { rot: 0, side: "top" as const, ...o.at };
  const ref = s.add(
    partTypeFor(pins),
    {
      ref: o.ref,
      ...(o.value !== undefined ? { value: o.value } : {}),
      footprint: o.footprint.name,
      ...(o.symbol ? { symbol: o.symbol } : {}),
      pins,
      ...(at ? { placement: at } : {}),
      ...(o.footprint.attr ? { attr: o.footprint.attr } : {}),
    },
    { id: `part_${o.ref}`, label: o.ref },
  );
  const handle = new PartRef(s, ref.id, o.ref, pins.map(({ pad: _pad, ...p }) => p), Object.fromEntries(Object.entries(o.aliases ?? {}).map(([k, v]) => [k.toLowerCase(), v])));
  state(s).parts.set(o.ref, handle);
  return handle;
}

/** Put these pins on the net called `name` (calling it again adds more pins to the same net). */
export function net(name: string, ...pins: Out[]): void {
  const s = scope("net()");
  const named = state(s).named;
  const list = named.get(name) ?? [];
  for (const p of pins) if (!list.some((q) => q.node === p.node && q.port === p.port)) list.push(p);
  named.set(name, list);
}

/** Connect two pins (the net gets a name from one it joins, or `Net-(R1-Pad1)` as KiCad names one). */
export function connect(a: Out, b: Out): void {
  state(scope("connect()")).links.push([a, b]);
}

/** Look up a declared part by its reference. */
export function partByRef(ref: string): PartRef {
  const p = state(scope("partByRef()")).parts.get(ref);
  if (!p) throw new Error(`there is no part ${ref}`);
  return p;
}

function flushNets(s: Scope): void {
  const st = state(s);
  const key = (p: Out) => `${p.node} ${p.port}`;
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const add = (k: string) => void (parent.has(k) || parent.set(k, k));
  const pins = new Map<string, Out>();
  const union = (a: Out, b: Out) => {
    for (const p of [a, b]) add(key(p)), pins.set(key(p), p);
    const ra = find(key(a)), rb = find(key(b));
    if (ra !== rb) parent.set(rb, ra);
  };
  for (const [, list] of st.named) {
    for (const p of list) add(key(p)), pins.set(key(p), p);
    for (let i = 1; i < list.length; i++) union(list[0]!, list[i]!);
  }
  for (const [a, b] of st.links) union(a, b);

  // One net per connected component; named by the first declared name that lands in it.
  const groups = new Map<string, Out[]>();
  for (const k of pins.keys()) {
    const r = find(k);
    groups.set(r, [...(groups.get(r) ?? []), pins.get(k)!]);
  }
  const nameOf = new Map<string, string>();
  for (const [name, list] of st.named) {
    if (!list.length) continue;
    const r = find(key(list[0]!));
    const prior = nameOf.get(r);
    if (prior && prior !== name) throw new Error(`nets ${prior} and ${name} are connected: one net cannot have two names`);
    nameOf.set(r, name);
  }
  const refOf = (p: Out) => (s.nodes[p.node]?.inputs.ref as string) ?? p.node;
  const numberOf = (p: Out) => ((s.nodes[p.node]?.inputs.pins as { id: string; number: string }[]) ?? []).find((x) => x.id === p.port)?.number ?? p.port;
  for (const [r, list] of groups) {
    const name = nameOf.get(r) ?? `Net-(${refOf(list[0]!)}-Pad${numberOf(list[0]!)})`;
    s.add("eda.net", channels("pins", list), { id: `net_${name}`, label: name });
  }
}
