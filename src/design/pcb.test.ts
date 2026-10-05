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

test("a board refuses, by name, what it cannot say", () => {
  assert.throws(board({}, jsx("component", { name: "R1", footprint: "0603" })), /footprint is one of smd-0805/);
  assert.throws(board({}, jsx("component", { name: "R1", footprint: "smd-0805", schX: 3 })), /schX is the schematic's/);
  assert.throws(board({}, jsx("component", { name: "R1", footprint: "smd-0805", pcbX: 3 })), /pcbX and pcbY together/);
  assert.throws(board({}, jsx("resistor", { name: "R1" })), /<resistor> is not read on a board/);
  assert.throws(board({ width: 10 }), /width and height together/);
  assert.throws(board({}, jsx("trace", { layer: "In1.Cu", width: 0.2, points: [[0, 0], [1, 0]] })), /copper layer/);
  assert.throws(board({}, jsx("trace", { layer: "F.Cu", width: 0.2, points: [[0, 0], [1, 0]], from: ".R9 > .pin1" })), /no component or trace R9/);
  assert.throws(board({}, jsx("component", { name: "V1", footprint: "smd-0805" }), jsx("via", { name: "V1", pcbX: 0, pcbY: 0, drill: 0.3, diameter: 0.6 })), /two elements are called V1/);
  assert.throws(() => declarationOf({ default: jsx("board", { schematic: "/abs.sch.json" }) }), /relative to this file/);
});
