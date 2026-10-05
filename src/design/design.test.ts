// commandagi/design — the primitives declare the op graph, and nothing else. Pinned here: ids are
// deterministic; a node used as a port value is a wire; a wire inside a literal field is refused; CAD
// booleans set the tool's operation and wire it after the target; sketches and offsets are wired
// references; the circuit's part type is the engine's pin-signature hash; nets join by name and by
// connection; the tscircuit, JSCAD and replicad importers declare the same graphs; a code part's params
// and default export are read by declarationOf.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  board,
  box,
  channels,
  circuit,
  component,
  connect,
  cylinder,
  declarationOf,
  extrude,
  footprints,
  graph,
  hole,
  input,
  jscadModeling,
  jsx,
  linearPattern,
  net,
  node,
  part,
  partTypeFor,
  replicadModule,
  schSymbolTypeFor,
  sketch,
  subtract,
  type IRGraph,
} from "./index.js";

const wireTo = (node: string, port = "out") => ({ wire: { node, port } });

test("a graph declares nodes with wires, inputs and channels, with deterministic ids", () => {
  const build = () =>
    graph("Mix", () => {
      const gain = input("gain", 0.8, { min: 0, max: 1 });
      const a = node("oscillator", { frequency: 440 });
      const b = node("oscillator", { frequency: 660 });
      return node("mixer", { gain, ...channels("channels", [a, b]) });
    }).ir;
  const g = build();
  assert.deepEqual(build(), g, "the same declaration twice is the same graph");
  assert.deepEqual(Object.keys(g.nodes), ["gain", "oscillator", "oscillator_2", "mixer"]);
  assert.deepEqual(g.nodes.gain, { id: "gain", type: "input", label: "gain", inputs: { value: 0.8, min: 0, max: 1 } });
  assert.deepEqual(g.nodes.mixer!.inputs, { gain: wireTo("gain"), "channels.1": wireTo("oscillator"), "channels.2": wireTo("oscillator_2") });
  assert.deepEqual(g.outputs, ["mixer"]);
});

test("a wire drives a whole port, never a field inside one; ports hold plain data", () => {
  assert.throws(
    () => graph("G", () => void node("x", { at: [node("y"), 2] })),
    /a wire drives a whole port, not a field inside one/,
  );
  assert.throws(() => graph("G", () => void node("x", { f: () => 1 })), /not plain data/);
  assert.throws(() => node("x"), /must be called inside part/);
});

test("a part: primitives, a cut with its target wired first, sketches, offsets and patterns", () => {
  const g = part("Bracket", () => {
    const plate = box({ size: [60, 40, 5], center: [0, 0, 2.5], name: "Plate" });
    const pin = cylinder({ base: [-22, 0, 0], radius: 1.6, height: 5, name: "Pin hole" });
    const cut = subtract(plate, pin);
    const holes = linearPattern(pin, { direction: [1, 0, 0], spacing: 44, count: 2 });
    const boss = extrude(sketch({ plane: "XY", offset: 5 }, (s) => s.circle({ radius: 6 })), { distance: 8 });
    return [holes, boss, cut];
  }).ir;
  assert.equal(g.meta!.domain, "cad");
  assert.deepEqual(g.nodes.Plate!.inputs, { center: [0, 0, 2.5], size: [60, 40, 5], operation: "new" });
  assert.equal(g.nodes.Pin_hole!.inputs.operation, "cut");
  assert.deepEqual(g.nodes.Pin_hole!.inputs["base.1"], wireTo("Plate"));
  assert.deepEqual(g.nodes.LinearPattern_1!.inputs.seed, wireTo("Pin_hole"));
  const datum = Object.values(g.nodes).find((n) => n.type === "datumPlane")!;
  assert.deepEqual(datum.inputs, { base: "plane_xy", offset: 5 });
  const sk = Object.values(g.nodes).find((n) => n.type === "sketch")!;
  assert.deepEqual(sk.inputs.plane, wireTo(datum.id));
  const ex = Object.values(g.nodes).find((n) => n.type === "extrude")!;
  assert.deepEqual(ex.inputs.profile, wireTo(sk.id));
  assert.equal(ex.inputs.distance, 8);
});

test("hole() is a cylinder cut entering at a point along -axis", () => {
  const g = part("P", () => hole(box({ size: [10, 10, 4], center: [0, 0, 2] }), { at: [0, 0, 4], diameter: 3, depth: 4 })).ir;
  const h = g.nodes.Hole!;
  assert.deepEqual(h.inputs, { center: [0, 0, 0], axis: [0, 0, 1], radius: 1.5, height: 4, operation: "cut", "base.1": wireTo("Box_1") });
  assert.deepEqual(g.outputs, ["Hole"]);
});

test("a circuit: the part type is the engine's pin-signature hash; nets join by name and by connection", () => {
  // The same pins as the Rail monitor demo's C1 (eda.part.fe2410c4 in its .sch.json).
  assert.equal(partTypeFor([{ id: "p1", number: "1", name: "1" }, { id: "p2", number: "2", name: "2" }]), "eda.part.fe2410c4");

  const g = circuit("Blinker", () => {
    board({ width: 30, height: 20 });
    const j1 = component({ ref: "J1", footprint: footprints.pinHeader(2), at: [4, 8] });
    const r1 = component({ ref: "R1", value: "330", footprint: footprints.chip("0603", "R"), at: [12, 10] });
    const d1 = component({ ref: "D1", value: "red", footprint: footprints.chip("0603", "LED"), at: { x: 20, y: 10, rot: 90 } });
    net("VIN", j1.pin(1), r1.pin(1));
    connect(r1.pin(2), d1.pin("A"));
    net("GND", d1.pin("K"));
    net("GND", j1.pin(2));
  }).ir;
  assert.equal(g.id, "eda:Blinker");
  assert.deepEqual(g.outputs, ["board"]);
  assert.equal(g.nodes.board!.type, "eda.board");
  assert.equal((g.nodes.board!.inputs.boardArtwork as { graphics: unknown[] }).graphics.length, 4);
  const d1 = g.nodes.part_D1!;
  assert.deepEqual(d1.inputs.placement, { x: 20, y: 10, rot: 90, side: "top" });
  assert.equal(d1.inputs.footprint, "LED_SMD:LED_0603_1608Metric");
  assert.deepEqual(
    Object.values(g.nodes).filter((n) => n.type === "eda.net").map((n) => [n.label, n.inputs]),
    [
      ["VIN", { "pins.1": wireTo("part_J1", "p1"), "pins.2": wireTo("part_R1", "p1") }],
      ["GND", { "pins.1": wireTo("part_D1", "p1"), "pins.2": wireTo("part_J1", "p2") }],
      ["Net-(R1-Pad2)", { "pins.1": wireTo("part_R1", "p2"), "pins.2": wireTo("part_D1", "p2") }],
    ],
  );
  assert.throws(
    () => circuit("X", () => {
      const r = component({ ref: "R1", footprint: footprints.chip("0402") });
      net("A", r.pin(1));
      net("B", r.pin(1));
    }),
    /one net cannot have two names/,
  );
  assert.throws(() => circuit("X", () => void component({ ref: "R1", footprint: footprints.chip("0402") }).pin(3)), /R1 has no pin 3/);
});

test("tscircuit JSX declares the same circuit: board-centred Y-up placement, LED pin1 is the anode", () => {
  const tree = jsx("board", {
    width: "30mm",
    height: "20mm",
    children: [
      jsx("resistor", { name: "R1", resistance: "330", footprint: "0603", pcbX: -6, pcbY: 2 }),
      jsx("led", { name: "D1", color: "red", footprint: "0603", pcbX: 4, pcbY: 0 }),
      jsx("trace", { from: ".R1 > .pin2", to: ".D1 > .anode" }),
      jsx("trace", { from: ".D1 > .cathode", to: "net.GND" }),
    ],
  });
  const { graph: g } = declarationOf({ default: () => tree });
  assert.deepEqual(g.nodes.part_R1!.inputs.placement, { x: 9, y: 8, rot: 0, side: "top" });
  assert.equal(g.nodes.part_R1!.inputs.value, "330");
  const nets = Object.fromEntries(Object.values(g.nodes).filter((n) => n.type === "eda.net").map((n) => [n.label, n.inputs]));
  assert.deepEqual(nets.GND, { "pins.1": wireTo("part_D1", "p1") }, "the cathode is pad 1 of the LED land pattern");
  assert.deepEqual(nets["Net-(R1-Pad2)"], { "pins.1": wireTo("part_R1", "p2"), "pins.2": wireTo("part_D1", "p2") });
  assert.throws(() => declarationOf({ default: jsx("board", { width: 10, height: 10, children: [jsx("crystal", { name: "Y1" })] }) }), /<crystal> is not read/);
});

test("JSX that places symbols declares the circuit's own sheet: placements, wires bound to pins, labels; __source rides along", () => {
  const tree = jsx("group", {
    name: "Divider",
    children: [
      jsx("voltagesource", { name: "V1", voltage: "9", schX: 114.3, schY: 114.3, __source: 1 }),
      jsx("resistor", { name: "R1", resistance: "3k", schX: 114.3, schY: 88.9, schRotation: 90 }),
      jsx("ground", { name: "#PWR1", schX: 139.7, schY: 114.3 }),
      jsx("trace", { from: ".V1 > .pos", to: ".R1 > .pin1", __source: 4 }),
      jsx("trace", { from: ".V1 > .neg", to: "net.GND" }),
    ],
  });
  const { graph: g } = declarationOf({ default: () => tree });
  assert.deepEqual(g.nodes.sym_R1_1!.inputs, { unit: 1, style: 1, at: { x: 114.3, y: 88.9 }, rot: 90, mirror: "", part: wireTo("R1", "@part") });
  assert.equal(g.nodes.sym_R1_1!.type, schSymbolTypeFor(["p1", "p2"]));
  assert.deepEqual(g.nodes.w_1!.inputs, { "ends.1": wireTo("sym_V1_1", "p1"), "ends.2": wireTo("sym_R1_1", "p1") });
  assert.deepEqual(g.nodes.w_1!.meta, { source: 4 });
  assert.deepEqual(g.nodes.V1!.meta, { source: 1 }, "__source is not a prop: it becomes the node's meta.source");
  assert.deepEqual(g.nodes.lbl_GND!.inputs, { text: "GND", on: wireTo("sym_V1_1", "p2") });
  assert.equal(g.nodes.PWR1!.inputs.powerSymbol, true);
  const sheet = (...children: unknown[]) => () => declarationOf({ default: jsx("group", { name: "S", children }) });
  assert.throws(sheet(jsx("ground", { name: "GND1", schX: 0, schY: 0 })), /starts with #/);
  assert.throws(sheet(jsx("resistor", { name: "R1" }), jsx("resistor", { name: "R2", schX: 0, schY: 0 }), jsx("trace", { from: ".R1 > .pin1", to: ".R2 > .pin1" })), /R1 is not on the sheet/);
  assert.throws(sheet(jsx("resistor", { name: "R1", schX: 0, schY: 0, footprint: "0603" })), /footprint is not read on a schematic/);
});

test("a sheet's library part names its symbol by ref, places each unit, mirrors; a code part is a code node", () => {
  const tree = jsx("group", {
    name: "Rail",
    children: [
      jsx("part", { name: "U1", symbol: "Amplifier_Operational:LM358", library: "opamps.kicad_sym", value: "LM358", schX: 50.8, schY: 25.4, schMirror: "x" }),
      jsx("unit", { part: "U1", unit: 2, schX: 101.6, schY: 25.4, schRotation: 180, __source: 2 }),
      jsx("resistor", { name: "R1", resistance: "10k", schX: 76.2, schY: 50.8, schMirror: "y" }),
      jsx("code", { name: "blinker", source: "blinker.circuit.ts", inputs: { resistor: "330" }, __source: 4 }),
      jsx("trace", { from: ".U1 > .pin7", to: ".R1 > .pin1" }),
      jsx("netlabel", { net: "OUT", connection: ".U1 > .1" }),
    ],
  });
  const { graph: g } = declarationOf({ default: () => tree });
  assert.deepEqual(g.nodes.U1!.inputs, { ref: "U1", value: "LM358", symbol: "Amplifier_Operational:LM358", library: "opamps.kicad_sym", pins: [] }, "the pins are the library's");
  assert.deepEqual(g.nodes.sym_U1_1!.inputs, { unit: 1, style: 1, at: { x: 50.8, y: 25.4 }, rot: 0, mirror: "x", part: wireTo("U1", "@part") });
  assert.deepEqual(g.nodes.sym_U1_2!.inputs, { unit: 2, style: 1, at: { x: 101.6, y: 25.4 }, rot: 180, mirror: "", part: wireTo("U1", "@part") });
  assert.deepEqual(g.nodes.sym_U1_2!.meta, { source: 2 }, "a unit's placement maps to its <unit> element");
  assert.equal(g.nodes.sym_R1_1!.inputs.mirror, "y");
  assert.deepEqual(g.nodes.w_1!.inputs, { "ends.1": wireTo("U1", "pin:7"), "ends.2": wireTo("sym_R1_1", "p1") }, "a library pin by number, bound by the editor");
  assert.deepEqual(g.nodes.lbl_OUT!.inputs.on, wireTo("U1", "pin:1"));
  assert.deepEqual(g.nodes.blinker, { id: "blinker", type: "code", label: "blinker.circuit.ts", inputs: { source: "blinker.circuit.ts", resistor: "330" }, meta: { source: 4 } });
  const sheet = (...children: unknown[]) => () => declarationOf({ default: jsx("group", { name: "S", children }) });
  assert.throws(sheet(jsx("part", { name: "U1", symbol: "LM358", library: "a.kicad_sym" })), /library ref/);
  assert.throws(sheet(jsx("part", { name: "U1", symbol: "A:B" })), /library is the path/);
  assert.throws(sheet(jsx("resistor", { name: "R1", schX: 0, schY: 0 }), jsx("unit", { part: "R1", unit: 2, schX: 1, schY: 1 })), /one unit/);
  assert.throws(sheet(jsx("part", { name: "U1", symbol: "A:B", library: "a.kicad_sym" }), jsx("unit", { part: "U1", unit: 1, schX: 1, schY: 1 })), /unit is 2 or more/);
  assert.throws(sheet(jsx("part", { name: "U1", symbol: "A:B", library: "a.kicad_sym" }), jsx("unit", { part: "U1", unit: 2 })), /give it schX and schY/);
  assert.throws(sheet(jsx("resistor", { name: "R1", schX: 0, schY: 0, schMirror: "z" })), /schMirror is "x" or "y"/);
  assert.throws(sheet(jsx("code", { name: "c", source: "c.ts", inputs: { source: "d.ts" } })), /source is the file/);
});

test("a netlist circuit lists each part's pins and names the pins on each net; it has no sheet", () => {
  const tree = jsx("group", {
    name: "Buffer",
    children: [
      jsx("part", { name: "U1", value: "LMP7721", pins: ["1", "2", "3"], __source: 1 }),
      jsx("part", { name: "J1", symbol: "Conn:Header", value: "plate", pins: [{ number: "1", name: "PLATE" }] }),
      jsx("net", { name: "PLATE", pins: [".J1 > .pin1", ".U1 > .3"], __source: 3 }),
    ],
  });
  const { graph: g } = declarationOf({ default: () => tree });
  assert.deepEqual(g.nodes.U1!.inputs, { ref: "U1", value: "LMP7721", pins: [{ id: "p1", number: "1" }, { id: "p2", number: "2" }, { id: "p3", number: "3" }] });
  assert.deepEqual(g.nodes.J1!.inputs.pins, [{ id: "p1", number: "1", name: "PLATE" }]);
  assert.equal(g.nodes.J1!.inputs.symbol, "Conn:Header");
  assert.deepEqual(g.nodes.net_PLATE, { id: "net_PLATE", type: "eda.net", label: "PLATE", inputs: { "pins.1": wireTo("J1", "p1"), "pins.2": wireTo("U1", "p3") }, meta: { source: 3 } });
  const sheet = (...children: unknown[]) => () => declarationOf({ default: jsx("group", { name: "S", children }) });
  assert.throws(sheet(jsx("part", { name: "U1", pins: ["1"], schX: 0, schY: 0 })), /netlist circuit's; it has no place on the sheet/);
  assert.throws(sheet(jsx("part", { name: "U1", pins: ["1", "1"] })), /two pins are numbered 1/);
  assert.throws(sheet(jsx("part", { name: "U1", pins: ["1"] }), jsx("net", { name: "N", pins: [".U1 > .pin2"] })), /U1 has no pin 2/);
  assert.throws(sheet(jsx("resistor", { name: "R1", schX: 0, schY: 0 }), jsx("net", { name: "N", pins: [".R1 > .pin1"] })), /a net names pins of a netlist circuit's parts/);
});

test("JSCAD: cuboid minus a centred cylinder is a box and a cut, moves folded into the primitives", () => {
  const { primitives, booleans, transforms } = jscadModeling;
  const main = ({ width }: { width: number }) =>
    booleans.subtract(
      primitives.cuboid({ size: [width, 20, 6] }),
      transforms.translate([10, 0, 0], primitives.cylinder({ radius: 3, height: 8 })),
    );
  const { graph: g, params } = declarationOf({ main, getParameterDefinitions: () => [{ name: "width", type: "float", initial: 40 }] }, {}, { name: "Plate" });
  assert.deepEqual(params, { width: { default: 40 } });
  const [b, c] = Object.values(g.nodes);
  assert.deepEqual([b!.type, b!.inputs.size], ["box", [40, 20, 6]]);
  assert.deepEqual([c!.type, c!.inputs.center, c!.inputs.height, c!.inputs.operation], ["cylinder", [10, 0, -4], 8, "cut"]);
  assert.throws(() => declarationOf({ main: () => transforms.scale() }), /transforms.scale is not read/);
});

test("replicad: a drawing extruded on XY and cut by a cylinder", () => {
  const main = (r: typeof replicadModule, { width }: { width: number }) =>
    r.drawRectangle(width, 20).sketchOnPlane("XY", 2).extrude(5).cut(r.makeCylinder(3, 9, [0, 0, 0]));
  const { graph: g } = declarationOf({ default: main, params: { width: { default: 30, unit: "mm" } } }, { width: 50 }, { replicad: replicadModule });
  const types = Object.values(g.nodes).map((n) => n.type);
  assert.deepEqual(types, ["datumPlane", "sketch", "extrude", "cylinder"]);
  const sk = Object.values(g.nodes).find((n) => n.type === "sketch")!;
  const pts = Object.values((sk.inputs.sketch as { points: Record<string, { x: number; y: number }> }).points).map((p) => [p.x, p.y]);
  assert.deepEqual(pts, [[-25, -10], [25, -10], [25, 10], [-25, 10]]);
  assert.throws(() => declarationOf({ default: (r: typeof replicadModule) => r.makeSphere(2).fillet() }, {}, { replicad: replicadModule }), /fillet/);
});

test("declarationOf reads params, calls the default with them, and refuses what it cannot declare", () => {
  const mod = {
    params: { width: { default: 20, unit: "mm" }, n: 2 },
    default: ({ width, n }: { width: number; n: number }) => part("P", () => box({ size: [width, n, 1] })),
  };
  const r = declarationOf(mod, { n: 3 });
  assert.deepEqual(r.params, { width: { default: 20, unit: "mm" }, n: { default: 2 } });
  assert.deepEqual((r.graph as IRGraph).nodes.Box_1!.inputs.size, [20, 3, 1]);
  assert.throws(() => declarationOf({}), /exports nothing/);
  assert.throws(() => declarationOf({ default: 42 }), /not a part, a circuit, a graph/);
  assert.throws(() => declarationOf({ default: { id: "g", nodes: { a: { id: "a", type: "x", inputs: { p: wireTo("zz") } } } } }), /wired from zz, which is not declared/);
});
