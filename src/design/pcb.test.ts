// A board in JSX declares the board half of a circuit: the outline and cross-section, each component's footprint and
// placement, and the copper with what its ends land on. Pinned here: the node shapes the circuit editor joins onto its
// schematic, ids that do not change between runs, __source on every declared node, and the named refusals.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx } from "./index.js";

const board = (props: Record<string, unknown>, ...children: unknown[]) => () =>
  declarationOf({ default: jsx("board", { schematic: "Divider.sch.tsx", ...props, children }) }).graph;

test("a <board> that names its schematic declares the board half: outline, stack, footprints and copper", () => {
  const g = board(
    { width: 40, height: 30, core: 1.5, copper: 0.035, __source: 0 },
    jsx("component", { name: "R1", footprint: "smd-0805", pcbX: 10, pcbY: 10, __source: 1 }),
    jsx("component", { name: "R2", footprint: "axial-7.62", pcbX: 25, pcbY: 10, pcbRotation: 90, layer: "bottom" }),
    jsx("component", { name: "V1", footprint: "smd-0805" }),
    jsx("trace", { layer: "F.Cu", width: 0.2, points: [[11, 10], [18, 14], [24, 10]], from: ".R1 > .pin2", to: ".R2 > .1", __source: 4 }),
    jsx("trace", { layer: "B.Cu", width: 0.25, points: [[18, 14], [18, 20]], from: ".VIA1" }),
    jsx("via", { name: "VIA1", pcbX: 18, pcbY: 14, drill: 0.4, diameter: 0.8 }),
  )();
  assert.equal(g.meta?.schematic, "Divider.sch.tsx");
  assert.deepEqual(g.outputs, ["board"]);
  assert.equal(g.nodes.board!.inputs.thicknessMm, 1.57);
  assert.deepEqual(g.nodes.board!.inputs.stack, { wire: { node: "stack", port: "stack" } });
  assert.deepEqual((g.nodes.board!.inputs.boardArtwork as { graphics: { points: unknown }[] }).graphics[0]!.points, [{ x: 0, y: 0 }, { x: 40, y: 30 }]);
  assert.deepEqual(g.nodes.stack!.inputs.layers, [
    { name: "F.Cu", role: "conductor", thickness: 0.035 },
    { name: "core", role: "dielectric", thickness: 1.5 },
    { name: "B.Cu", role: "conductor", thickness: 0.035 },
  ]);
  assert.deepEqual(g.nodes.board!.meta, { source: 0 });
  assert.deepEqual(g.nodes.fp_R1!, { id: "fp_R1", type: "eda.footprint", label: "R1", inputs: { ref: "R1", footprint: "Authored:smd-0805", placement: { x: 10, y: 10, rot: 0, side: "top" } }, meta: { source: 1 } });
  assert.deepEqual(g.nodes.fp_R2!.inputs.placement, { x: 25, y: 10, rot: 90, side: "bottom" });
  assert.equal(g.nodes.fp_V1!.inputs.placement, undefined, "a footprint with no pcbX and pcbY is not placed");
  assert.deepEqual(g.nodes.cu_1!.inputs, {
    kind: "run",
    points: [{ x: 11, y: 10, id: "start" }, { x: 18, y: 14, id: "p1" }, { x: 24, y: 10, id: "end" }],
    widthMm: 0.2,
    layer: "F.Cu",
    rule: "any",
    terminals: [{ point: 0, ref: "R1", number: "2" }, { point: 2, ref: "R2", number: "1" }],
  });
  assert.deepEqual(g.nodes.cu_1!.meta, { source: 4 });
  assert.deepEqual(g.nodes.cu_2!.inputs.terminals, [{ point: 0, via: "VIA1" }]);
});

test("a trace's end names a via or another trace's point by name, written before or after it", () => {
  const g = board(
    {},
    jsx("trace", { layer: "F.Cu", width: 0.2, points: [[0, 0], [5, 0]], to: ".VIA1" }),
    jsx("trace", { name: "T1", layer: "F.Cu", width: 0.2, points: [[5, 0], [5, 5], [9, 5]] }),
    jsx("trace", { layer: "F.Cu", width: 0.2, points: [[5, 5], [5, 9]], from: ".T1 > .1" }),
    jsx("via", { name: "VIA1", pcbX: 5, pcbY: 0, drill: 0.3, diameter: 0.6 }),
  )();
  assert.equal(g.nodes.board, undefined, "a board with no width and height declares no outline yet");
  assert.deepEqual(g.nodes.cu_1!.inputs.terminals, [{ point: 1, via: "VIA1" }]);
  assert.deepEqual(g.nodes.cu_2!.inputs.terminals, [{ point: 0, run: "T1", runPoint: "p1" }]);
  assert.deepEqual(g.nodes.VIA1!.inputs, { kind: "via", points: [{ x: 5, y: 0 }], drillMm: 0.3, padDiameterMm: 0.6, layers: ["F.Cu", "B.Cu"] });
});

test("a library footprint is its ref and the .pretty folder that holds it; its pads are the library's", () => {
  const g = board({}, jsx("component", { name: "U1", footprint: "Package_SO:SOIC-8", library: "footprints.pretty", pcbX: 12, pcbY: 8, pcbRotation: 90 }))();
  assert.deepEqual(g.nodes.fp_U1!.inputs, { ref: "U1", footprint: "Package_SO:SOIC-8", library: "footprints.pretty", placement: { x: 12, y: 8, rot: 90, side: "top" } });
  assert.throws(board({}, jsx("component", { name: "U1", footprint: "SOIC-8", library: "footprints.pretty" })), /its ref, "Library:Footprint"/);
  assert.throws(board({}, jsx("component", { name: "U1", footprint: "Package_SO:SOIC-8", library: "SOIC-8.kicad_mod" })), /a footprint library folder \(a \.pretty\)/);
});

test("a board refuses, by name, what it cannot say", () => {
  assert.throws(board({}, jsx("component", { name: "R1", footprint: "0603" })), /footprint is one of smd-0805/);
  assert.throws(board({}, jsx("component", { name: "R1", footprint: "smd-0805", schX: 3 })), /schX is the schematic's/);
  assert.throws(board({}, jsx("component", { name: "R1", footprint: "smd-0805", pcbX: 3 })), /pcbX and pcbY together/);
  assert.throws(board({}, jsx("resistor", { name: "R1" })), /<resistor> is not read on a board/);
  assert.throws(board({ width: 10 }), /width and height together/);
  assert.throws(board({}, jsx("trace", { layer: "F.SilkS", width: 0.2, points: [[0, 0], [1, 0]] })), /copper layer/);
  assert.throws(board({}, jsx("arc", { layer: "F.Cu", width: 0.2, points: [[0, 0], [1, 0]] })), /a list of 3 \[x, y\]/);
  assert.throws(board({ core: 1, copper: 0.03, width: 5, height: 5 }, jsx("stack", { layers: [] })), /core and copper are a two-layer <stack>/);
  assert.throws(board({}, jsx("kicad", {}), jsx("kicad", {})), /one <kicad>/);
  assert.throws(board({}, jsx("text", { at: [0, 0], layer: "F.SilkS", size: 1, thickness: 0.1 })), /give text, or field/);
  assert.throws(board({}, jsx("trace", { layer: "F.Cu", width: 0.2, points: [[0, 0], [1, 0]], from: ".R9 > .pin1" })), /no component or trace R9/);
  assert.throws(board({}, jsx("component", { name: "V1", footprint: "smd-0805" }), jsx("via", { name: "V1", pcbX: 0, pcbY: 0, drill: 0.3, diameter: 0.6 })), /two elements are called V1/);
  assert.throws(() => declarationOf({ default: jsx("board", { schematic: "/abs.sch.json" }) }), /relative to this file/);
});

test("a board says what a KiCad board holds: its layers, cross-section, drawings, net codes and what each copper object carries", () => {
  const layers = [{ ordinal: 0, name: "F.Cu", type: "signal" }, { ordinal: 4, name: "In1.Cu", type: "signal" }, { ordinal: 2, name: "B.Cu", type: "signal" }, { ordinal: 25, name: "Edge.Cuts", type: "user" }];
  const g = board(
    { layers },
    jsx("stack", { name: "four-layer", label: "JLC 4-layer", process: { name: "JLC" }, layers: [{ name: "F.Cu", role: "conductor", thickness: 0.035 }], __source: 1 }),
    jsx("kicad", { version: 20260206, generator: "pcbnew", forms: '(paper "A4")', __source: 2 }),
    jsx("graphic", { kind: "line", layer: "Edge.Cuts", points: [[0, 0], [40, 0]], width: 0.1, id: "e0", kicad: "(stroke (type solid))" }),
    jsx("text", { text: "REV A", at: [2, 3], layer: "F.SilkS", size: 1, thickness: 0.15 }),
    jsx("net", { name: "GND", code: 1 }),
    jsx("component", { name: "C1", footprint: "Lib:C_0805", library: "Board.pretty", pcbX: 4, pcbY: 5, uuid: "u-c1" }),
    jsx("trace", { layer: "In1.Cu", width: 0.2, points: [[0, 0], [5, 0]], net: "GND", uuid: "u-t1", kicad: "(locked yes)" }),
    jsx("arc", { name: "A1", layer: "F.Cu", width: 0.2, points: [[0, 0], [1, 1], [2, 0]], to: ".C1 > .pin1" }),
    jsx("via", { name: "V1", pcbX: 5, pcbY: 0, drill: 0.3, diameter: 0.6, layers: ["F.Cu", "In1.Cu", "B.Cu"], pads: [".C1 > .pin2"], net: "GND" }),
    jsx("pour", { layers: ["In1.Cu"], points: [[0, 0], [9, 0], [9, 9]], terminals: [[0, ".V1"]], net: "GND", kicad: "(min_thickness 0.25)" }),
  )();
  assert.deepEqual(g.nodes.board!.inputs, { layers, stack: { wire: { node: "stack", port: "stack" } } });
  assert.deepEqual(g.nodes.stack, { id: "stack", type: "eda.stack", label: "JLC 4-layer", inputs: { id: "four-layer", domain: "pcb", units: "mm", layers: [{ name: "F.Cu", role: "conductor", thickness: 0.035 }], process: { name: "JLC" } }, meta: { source: 1 } });
  const facts = Object.values(g.nodes).filter((n) => n.type === "eda.boardfact").map((n) => n.inputs);
  assert.deepEqual(facts, [
    { fact: "kicad", version: 20260206, generator: "pcbnew", kicad: '(paper "A4")' },
    { fact: "graphic", id: "e0", kind: "line", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], widthMm: 0.1, layer: "Edge.Cuts", kicad: "(stroke (type solid))" },
    { fact: "text", text: "REV A", at: { x: 2, y: 3 }, rot: 0, layer: "F.SilkS", size: 1, sizeX: 1, thickness: 0.15, kind: "text" },
    { fact: "net", name: "GND", code: 1 },
  ]);
  assert.equal(g.nodes.fp_C1!.inputs.uuid, "u-c1");
  assert.deepEqual(g.nodes.cu_1!.inputs, { kind: "run", points: [{ x: 0, y: 0, id: "start" }, { x: 5, y: 0, id: "end" }], widthMm: 0.2, layer: "In1.Cu", rule: "any", uuid: "u-t1", net: "GND", kicad: "(locked yes)" });
  assert.deepEqual(g.nodes.A1!.inputs, { kind: "arc", points: [{ x: 0, y: 0, id: "start" }, { x: 1, y: 1, id: "p1" }, { x: 2, y: 0, id: "end" }], widthMm: 0.2, layer: "F.Cu", terminals: [{ point: 2, ref: "C1", number: "1" }] });
  assert.deepEqual(g.nodes.V1!.inputs.pads, [{ ref: "C1", number: "2" }]);
  assert.deepEqual(g.nodes.cu_2!.inputs, { kind: "pour", points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }], layers: ["In1.Cu"], terminals: [{ point: 0, via: "V1" }], net: "GND", kicad: "(min_thickness 0.25)" });
});
