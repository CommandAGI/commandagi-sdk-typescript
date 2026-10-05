// A 3D document in JSX declares the document's graph itself: features as nodes of their type with their fields as ports,
// a sketch's entities in its `sketch` port, parameters as inputs whose drives are their bindings, the built-in planes,
// bodies and slots; `__source` rides to `meta.source` / `meta.sources`. The Python SDK declares the same nodes
// (sdk/python tests/test_threed.py holds the same expectations).
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx } from "./index.js";

const plate = () =>
  jsx("part", {
    name: "Plate",
    children: [
      jsx("parameter", { name: "depth", value: 6, unit: "mm", bindings: [{ target: "extrude1", field: "distance" }], __source: 1 }),
      jsx("sketch", {
        id: "sketch1",
        name: "Sketch1",
        plane: { type: "datum", plane: "plane_xy" },
        __source: 2,
        children: [
          jsx("point", { id: "p1", x: 0, y: 0, __source: 3 }),
          jsx("point", { id: "p2", x: 40, y: 0, __source: 4 }),
          jsx("point", { id: "p3", x: 40, y: 20 }),
          jsx("line", { id: "l1", a: "p1", b: "p2", __source: 5 }),
          jsx("line", { id: "l2", a: "p2", b: "p3" }),
          jsx("line", { id: "l3", a: "p3", b: "p1" }),
          jsx("constraint", { id: "c1", kind: "horizontal", entities: ["l1"], __source: 6 }),
        ],
      }),
      jsx("extrude", { id: "extrude1", name: "Extrude1", profile: { sketch: "sketch1" }, distance: 6, operation: "new", __source: 7 }),
      jsx("fillet", { id: "fillet1", name: "Fillet1", radius: 1, edges: [], consumes: ["extrude1"], suppressed: true }),
      jsx("body", { id: "extrude1", material: "aluminium-6061", __source: 8 }),
      jsx("slot", { name: "environment", value: { gravity: [0, 0, -9.81] } }),
    ],
  });

test("a <part> declares the document's graph: features, a sketch's entities, parameters, planes, bodies and slots", () => {
  const { graph } = declarationOf({ default: plate });
  assert.equal(graph.id, "3d-plate");
  assert.deepEqual(graph.meta, { name: "Plate", units: "mm", presentation: { order: ["sketch1", "extrude1", "fillet1"] } });
  const n = graph.nodes;
  assert.deepEqual(n.depth, { id: "depth", type: "input", label: "depth", inputs: { value: 6, unit: "mm", drives: [{ target: "extrude1", field: "distance" }] }, meta: { source: 1 } });
  assert.deepEqual(n.extrude1, { id: "extrude1", type: "extrude", label: "Extrude1", inputs: { profile: { sketch: "sketch1" }, distance: 6, operation: "new" }, meta: { source: 7 } });
  assert.deepEqual(n.fillet1, { id: "fillet1", type: "fillet", label: "Fillet1", disabled: true, inputs: { radius: 1, edges: [], consumes: ["extrude1"] } });
  const sketch = n.sketch1!.inputs.sketch as Record<string, unknown>;
  assert.deepEqual(sketch.pointOrder, ["p1", "p2", "p3"]);
  assert.deepEqual((sketch.segments as Record<string, unknown>).l1, { id: "l1", type: "line", a: "p1", b: "p2" });
  assert.deepEqual((sketch.constraints as Record<string, unknown>).c1, { id: "c1", kind: "horizontal", entities: ["l1"] });
  assert.deepEqual(n.sketch1!.meta, { source: 2, sources: { "point:p1": 3, "point:p2": 4, "segment:l1": 5, "constraint:c1": 6 } });
  assert.deepEqual(n.plane_xy!.inputs, { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0], builtin: "XY" });
  assert.deepEqual(n.bodyMeta, { id: "bodyMeta", type: "3d.bodyMeta", inputs: { extrude1: { material: "aluminium-6061" } }, meta: { sources: { extrude1: 8 } } });
  assert.deepEqual(n.environment!.inputs, { gravity: [0, 0, -9.81] });
});

test("an <assembly> opens as an assembly; what a 3D document cannot say is refused by name", () => {
  assert.equal(declarationOf({ default: jsx("assembly", { name: "A" }) }).graph.meta?.isAssembly, true);
  const doc = (...children: unknown[]) => () => declarationOf({ default: jsx("part", { name: "P", children }) });
  assert.throws(doc(jsx("widget", { id: "w" })), /<widget> is not read in a 3D document/);
  assert.throws(doc(jsx("box", { name: "B" })), /needs an id/);
  assert.throws(doc(jsx("box", { id: "a" }), jsx("plane", { id: "a" })), /the id "a" is both plane "a" and feature "a"/);
  assert.throws(doc(jsx("sketch", { id: "s", children: [jsx("line", { id: "l", a: "p1", b: "p2" })] })), /segment l's a names no point/);
  assert.throws(doc(jsx("sketch", { id: "s", children: [jsx("box", { id: "b" })] })), /<box> is not read in a sketch/);
  assert.throws(doc(jsx("slot", { name: "features", value: {} })), /features is not a slot/);
  assert.throws(doc(jsx("extrude", { id: "e", distance: Infinity })), /not a finite number/);
  assert.throws(doc(jsx("parameter", { name: "w", value: "6" })), /value is a number/);
  assert.throws(doc(jsx("feature", { type: "extrude", id: "e" })), /a extrude is written <extrude>/);
  assert.throws(doc(jsx("box", { id: "a//b" })), /an id is letters, digits, _ \. - with \/ between them/);
  assert.throws(() => declarationOf({ default: jsx("part", { name: "P", builtinPlanes: ["XY"] }) }), /builtinPlanes lists built-in planes/);
});

test("what a 3D document may hold: a subset of the built-in planes, an id with /, a feature of a type the kernel does not know", () => {
  const graph = (props: Record<string, unknown>, ...children: unknown[]) => declarationOf({ default: jsx("part", { name: "P", ...props, children }) }).graph;
  const planes = (g: ReturnType<typeof graph>) => Object.values(g.nodes).filter((n) => n.type === "plane").map((n) => n.id).sort();
  assert.deepEqual(planes(graph({})), ["plane_xy", "plane_xz", "plane_yz"]);
  assert.deepEqual(planes(graph({ builtinPlanes: [] })), []);
  assert.deepEqual(planes(graph({ builtinPlanes: ["plane_xz"] }, jsx("plane", { id: "XY", name: "XY", origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0], builtin: "XY" }))), ["XY", "plane_xz"]);
  const g = graph({}, jsx("cylinder", { id: "fan/bore", radius: 2 }), jsx("feature", { type: "rotate", id: "r1", name: "rotate_y_30", axis: [0, 1, 0], angle: 30 }));
  assert.deepEqual(g.nodes["fan/bore"]!.inputs, { radius: 2 });
  assert.deepEqual(g.nodes.r1, { id: "r1", type: "rotate", label: "rotate_y_30", inputs: { axis: [0, 1, 0], angle: 30 } });
  assert.deepEqual(g.meta?.presentation, { order: ["fan/bore", "r1"] });
});
