// A 3D document in JSX declares the document's graph itself: features as nodes of their type with their fields as ports,
// a sketch's entities in its `sketch` port, parameters as inputs whose drives are their bindings, the built-in planes,
// bodies and slots; `__source` rides to `meta.source` / `meta.sources`. The Python SDK declares the same nodes
// (sdk/python tests/test_threed.py holds the same expectations).
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, THREED_FEATURES } from "./index.js";

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
      jsx("fillet", { id: "fillet1", name: "Fillet1", radius: 1, edges: [{ kind: "edge", signature: { point: [20, 0, 6] } }], consumes: ["extrude1"], suppressed: true }),
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
  assert.deepEqual(n.fillet1, { id: "fillet1", type: "fillet", label: "Fillet1", disabled: true, inputs: { radius: 1, edges: [{ kind: "edge", signature: { point: [20, 0, 6] } }], consumes: ["extrude1"] } });
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
  const g = graph({}, jsx("cylinder", { id: "fan/bore", center: [0, 0, 0], axis: [0, 0, 1], radius: 2, height: 5, operation: "cut" }), jsx("feature", { type: "rotate", id: "r1", name: "rotate_y_30", axis: [0, 1, 0], angle: 30 }));
  assert.deepEqual(g.nodes["fan/bore"]!.inputs, { center: [0, 0, 0], axis: [0, 0, 1], radius: 2, height: 5, operation: "cut" });
  assert.deepEqual(g.nodes.r1, { id: "r1", type: "rotate", label: "rotate_y_30", inputs: { axis: [0, 1, 0], angle: 30 } });
  assert.deepEqual(g.meta?.presentation, { order: ["fan/bore", "r1"] });
});

test("a feature element whose fields do not fit its type is refused with the op panel's sentence for each", () => {
  const read = (...children: unknown[]) => () => declarationOf({ default: jsx("part", { name: "P", children }) });
  const profile = { sketch: "s1" };
  assert.throws(read(jsx("extrude", { id: "e1", profile, distance: -1, operation: "new" })), { message: '<extrude id="e1">: distance: must be greater than 0 (got -1)' });
  assert.throws(read(jsx("extrude", { id: "e1", profile, distance: 5, operation: "glue", colour: "red" })), {
    message: '<extrude id="e1">: operation: must be one of new, add, cut, intersect (got "glue"); colour: is not one of its fields',
  });
  assert.throws(read(jsx("extrude", { id: "e1", distance: 5, operation: "new" })), { message: '<extrude id="e1">: profile: is required' });
  assert.throws(read(jsx("sketch", { id: "s1", plane: { type: "datum", plane: "plane_xy" }, children: [jsx("circle", { id: "c", center: "p", radius: "big" }), jsx("point", { id: "p", x: 0, y: 0 })] })), {
    message: '<sketch id="s1">: sketch/segments/c/radius: must be number (got "string")',
  });
  // A large array kept in a file beside the document stands for the array.
  const positions = { $file: "P.assets/m/positions.f64", mime: "application/octet-stream", encoding: "f64le", len: 9 };
  assert.ok(THREED_FEATURES.includes("makeHuman") && !THREED_FEATURES.includes("makehuman"));
  assert.doesNotThrow(read(jsx("pointCloud", { id: "pc", positions })));
  // Every refused element of the file is named in one run, one line each, in the file's order.
  const engineering = (process: string, more = {}) => ({ partNumber: "X", material: "6061-T6", process, ...more });
  assert.throws(read(jsx("body", { id: "b4", engineering: engineering("sheet-metal") }), jsx("body", { id: "b6", engineering: engineering("cnc-milling", { notes: "x" }) }), jsx("extrude", { id: "e1", profile, distance: -1, operation: "new" })), {
    message: [
      '<body id="b4">: engineering/process: must be one of cnc-milling, cnc-turning, laser-cutting, waterjet-cutting, sheet-metal-bending, extrusion, casting, injection-moulding, fdm-printing, sla-printing, sls-printing, welding, grinding, manual, purchased, reference (got "sheet-metal")',
      '<body id="b6">: engineering/notes: is not one of its fields',
      '<extrude id="e1">: distance: must be greater than 0 (got -1)',
    ].join("\n"),
  });
});

// sdk/python tests/test_threed.py holds the same document and the same refusals.
test("a hole is placed, and faces and edges are chosen by a query; no feature names what it follows", () => {
  const top = { kind: "face", select: { normal: [0, 0, 1], farthest: [0, 0, 1] } };
  const xy = { type: "datum", plane: "plane_xy" };
  const g = declarationOf({
    default: jsx("part", {
      name: "Plate",
      children: [
        jsx("box", { id: "plate", center: [0, 0, 4], size: [100, 60, 8], operation: "new" }),
        jsx("sketch", { id: "places", plane: xy, children: [jsx("point", { id: "a", x: -30, y: 0 }), jsx("point", { id: "b", x: 30, y: 0 })] }),
        jsx("hole", { id: "cbore", face: top, positions: [[10, 20, 8], [-10, 20, 8]], diameter: 5.5, through: true, style: "counterbore", headDiameter: 10, headDepth: 5 }),
        jsx("hole", { id: "pins", face: top, sketch: "places", diameter: 3, through: true, style: "simple" }),
        jsx("chamfer", { id: "rims", distance: 0.5, edges: [{ kind: "edge", select: { any: [{ createdBy: "cbore" }, { createdBy: "pins" }], geometry: "circle", radius: { max: 3 } } }] }),
        jsx("fillet", { id: "corners", radius: 2, edges: [{ kind: "edge", select: { parallel: [0, 0, 1], not: { inBox: { min: [0, -99, -99], max: [99, 99, 99] } } } }] }),
      ],
    }),
  }).graph;
  const n = g.nodes;
  assert.deepEqual(n.cbore!.inputs.positions, [[10, 20, 8], [-10, 20, 8]]);
  assert.deepEqual(n.cbore!.inputs.face, top);
  assert.equal(n.pins!.inputs.sketch, "places");
  assert.deepEqual((n.rims!.inputs.edges as { select: { any: unknown[] } }[])[0]!.select.any[1], { createdBy: "pins" });
  // The order of the file says what each feature follows (the reader fills `consumes`).
  assert.equal(n.rims!.inputs.consumes, undefined);
  assert.deepEqual((g.meta!.presentation as { order: string[] }).order, ["plate", "places", "cbore", "pins", "rims", "corners"]);

  const read = (el: unknown) => () => declarationOf({ default: jsx("part", { name: "P", children: [jsx("box", { id: "plate", size: [1, 1, 1] }), el] }) });
  assert.throws(read(jsx("hole", { id: "h", face: top, positions: [[1, 2]] })), { message: '<hole id="h">: positions/0: needs at least 3 items (got 2)' });
  assert.throws(read(jsx("fillet", { id: "f", edges: [{ kind: "edge", select: { vertical: true } }] })), { message: '<fillet id="f">: edges/0/select/vertical: is not one of its fields' });
  assert.throws(read(jsx("fillet", { id: "f", edges: [{ kind: "edge", select: { geometry: "helix" } }] })), {
    message: '<fillet id="f">: edges/0/select/geometry: must be one of line, circle, arc, ellipse, spline, other, plane, cylinder, cone, sphere, torus (got "helix")',
  });
});

// sdk/python and sdk/rust read the same assembly to the same inputs (their tests hold the same values).
test("a required field with a declared default may be left out: it reads as the default, at every depth", () => {
  const read = (...children: unknown[]) => declarationOf({ default: jsx("assembly", { name: "A", children }) }).graph;
  const identity = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: 1 };
  const g = read(
    jsx("externalPart", { id: "bare", path: "bracket.3d.tsx" }),
    jsx("externalPart", { id: "moved", path: "bracket.3d.tsx", placement: { position: [10, 0, 5] }, operation: "add" }),
  );
  assert.deepEqual(g.nodes.bare!.inputs, { path: "bracket.3d.tsx", placement: identity, operation: "new" });
  // A placement that says only where: its orientation and scale are the identity's. The author's values stay.
  assert.deepEqual(g.nodes.moved!.inputs, { path: "bracket.3d.tsx", placement: { position: [10, 0, 5], quaternion: [0, 0, 0, 1], scale: 1 }, operation: "add" });
  // An optional field stays absent: its absence is a value the kernel reads.
  assert.ok(!("importer" in g.nodes.bare!.inputs) && !("localPlacement" in g.nodes.bare!.inputs));
  // A defaulted field the author wrote wrong is still refused, and a field with no default is still required.
  assert.throws(() => read(jsx("externalPart", { id: "p", path: "b.3d.tsx", placement: { scale: "big" } })), { message: '<externalPart id="p">: placement/scale: must be number (got "string")' });
  assert.throws(() => read(jsx("import", { id: "i", format: "step" })), { message: '<import id="i">: data: is required' });
});

// A world body as an ingest writes it (sdk/python and sdk/rust read the same element).
const worldBody = (collider: unknown, restitution = 0.1) =>
  jsx("meshBody", {
    id: "world/t",
    name: "t",
    positions: [0, 0, 0, 1000, 0, 0, 0, 1000, 0, 1000, 1000, 0],
    indices: [0, 1, 2, 1, 3, 2],
    worldCollider: collider,
    worldCenter: [0, 0, 100],
    worldFriction: 0.8,
    worldRestitution: restitution,
    worldMeta: { tile: "12/1/2", res: 30 },
  });

test("a world body's collider, centre, material and provenance are declared fields of its meshBody", () => {
  const read = (body: unknown) => () => declarationOf({ default: jsx("part", { name: "W", children: [body] }) });
  const { graph } = read(worldBody({ type: "heightfield", nx: 2, ny: 2, sizeX: 1000, sizeY: 1000 }))();
  assert.deepEqual(graph.nodes["world/t"]!.inputs.worldMeta, { tile: "12/1/2", res: 30 });
  assert.doesNotThrow(read(worldBody({ type: "trimesh" })));
  assert.throws(read(worldBody({ type: "heightfield", nx: 1, ny: 2, sizeX: 1000, sizeY: 1000 }, 2)), {
    message: '<meshBody id="world/t">: worldCollider/nx: must be at least 2 (got 1); worldRestitution: must be at most 1 (got 2)',
  });
});

// sdk/python and sdk/rust read the same elements to the same nodes (their tests hold the same values).
test("a body's engineering data, a joint, a mate and a sheet are typed elements of the document", () => {
  const read = (root: "part" | "assembly", ...children: unknown[]) => declarationOf({ default: jsx(root, { name: "P", children }) }).graph.nodes;
  const engineering = {
    partNumber: "CA-0001",
    material: "6061-T6",
    process: "cnc-milling",
    finish: "anodize clear, 10 µm",
    suppliers: [{ name: "Misumi", sku: "HFS5-2020-300", currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 12.5 }], source: "quote Q-118", date: "2026-10-01" }],
  };
  const joint = { id: "j1", kind: "revolute", a: "base", b: "arm", anchor: [0, 0, 40], axis: [0, 0, 1], limits: [-1.5, 1.5], refA: { kind: "face", point: [0, 0, 40], direction: [0, 0, 1] } };
  const n = read(
    "part",
    jsx("box", { id: "base", center: [0, 0, 0], size: [10, 10, 10], operation: "new" }),
    jsx("body", { id: "base", engineering }),
    jsx("slot", { name: "dynamics", value: { ground: { enabled: true } } }),
    jsx("joint", { ...joint, __source: 4 }),
    jsx("joint", { id: "j2", kind: "screw", a: "arm", anchor: [0, 0, 0], pitch: 2 }),
    jsx("sheet", { id: "sheet1", views: [{ id: "front", view: "front" }, { id: "top", view: "top" }], title: { drawnBy: "JV" } }),
  );
  assert.deepEqual(n.bodyMeta!.inputs, { base: { engineering } });
  // The joints are the `joints` port of the document's dynamics, beside what its slot holds.
  assert.deepEqual(n.dynamics, { id: "dynamics", type: "3d.dynamics", inputs: { ground: { enabled: true }, joints: [joint, { id: "j2", kind: "screw", a: "arm", anchor: [0, 0, 0], pitch: 2 }] }, meta: { sources: { "joint:j1": 4 } } });
  // A sheet's fields with a default may be left out.
  assert.deepEqual(n.drawings, {
    id: "drawings",
    type: "3d.drawings",
    inputs: { value: [{ id: "sheet1", views: [{ id: "front", view: "front" }, { id: "top", view: "top" }], title: { drawnBy: "JV" }, size: "A3", scale: 1, projection: "first-angle", hiddenLines: true, holeCallouts: true, overallDimensions: true }] },
  });
  const mate = { id: "m1", kind: "concentric", a: "p1", b: "p2", axis: "Z" };
  assert.deepEqual(read("assembly", jsx("mate", mate)).assembly, { id: "assembly", type: "3d.assembly", inputs: { mates: [mate] } });

  const refused = (...children: unknown[]) => () => read("part", ...children);
  assert.throws(refused(jsx("joint", { ...joint, kind: "hinge" })), {
    message: '<joint id="j1">: kind: must be one of fixed, revolute, prismatic, cylindrical, planar, screw, spherical, universal (got "hinge")',
  });
  assert.throws(refused(jsx("joint", { id: "j1", kind: "fixed", a: "base" })), { message: '<joint id="j1">: anchor: is required' });
  assert.throws(refused(jsx("body", { id: "base", engineering: { process: "magic", suppliers: [{ sku: "x" }] } })), {
    message:
      '<body id="base">: engineering/process: must be one of other, cnc-milling, cnc-turning, laser-cutting, waterjet-cutting, sheet-metal-bending, extrusion, casting, injection-moulding, fdm-printing, sla-printing, sls-printing, welding, grinding, glass-working, saw-cutting, manual, purchased, reference (got "magic"); engineering/suppliers/0/name: is required',
  });
  assert.throws(refused(jsx("slot", { name: "dynamics", value: { joints: [] } })), { message: '<slot name="dynamics">: joints are written as <joint> elements' });
  assert.throws(refused(jsx("slot", { name: "drawings", value: [] })), /drawings is not a slot/);
  assert.throws(refused(jsx("joint", joint), jsx("joint", joint)), /two <joint> elements are called j1/);
  assert.throws(refused(jsx("sheet", { id: "s", views: [] })), /<sheet id="s">: views: /);
});

// sdk/python and sdk/rust accept and refuse the same sheet with the same sentence.
test("a sheet's section view has its cutting plane, and a detail view enlarges another view of the sheet", () => {
  const read = (...children: unknown[]) => declarationOf({ default: jsx("part", { name: "P", children }) }).graph.nodes;
  const views = [
    { id: "front", view: "front" },
    { id: "a", view: "section", section: { point: [0, 0, 3], normal: [0, 1, 0] } },
    { id: "b", view: "detail", detail: { of: "front", center: [-20, 0, 6], radius: 5, label: "C" } },
  ];
  assert.deepEqual((read(jsx("sheet", { id: "s", views })).drawings!.inputs!.value as { views: unknown }[])[0]!.views, views);
  assert.throws(() => read(jsx("sheet", { id: "s", views: [{ id: "front", view: "front" }, { id: "a", view: "section" }] })), {
    message: '<sheet id="s">: view a is a section view with no section: give its cutting plane (point and normal)',
  });
  assert.throws(() => read(jsx("sheet", { id: "s", views: [{ id: "b", view: "detail", detail: { of: "b", center: [0, 0, 0], radius: 5 } }] })), {
    message: '<sheet id="s">: view b is a detail of b, which is a detail itself',
  });
});

test("<check>, <accept>, <permitted> and <fastener> are the document's lists, each checked against its schema", () => {
  const doc = (...children: unknown[]) => declarationOf({ default: () => jsx("assembly", { name: "Stack", children }) }).graph;
  const g = doc(
    jsx("box", { id: "base", name: "Base", center: [0, 0, 5], size: [40, 40, 10], operation: "new" }),
    jsx("fastener", { id: "f1", part: "iso-4762-m6", length: 18, at: [0, 0, 20], clamped: ["Lid"], receiver: "Base" }),
    jsx("check", { id: "clash", kind: "interference" }),
    jsx("accept", { id: "weld", check: "clash", body: "Base", region: { min: [0, 0, 0], max: [1, 1, 1] }, reason: "welded" }),
    jsx("permitted", { id: "cut", check: "edges", body: "Panel*", process: "laser-cutting", reason: "a laser cut" }),
  );
  assert.deepEqual(g.nodes.fasteners!.inputs.value, [{ id: "f1", part: "iso-4762-m6", length: 18, at: [0, 0, 20], clamped: ["Lid"], receiver: "Base" }]);
  assert.deepEqual(g.nodes.checks!.inputs.value, [{ id: "clash", kind: "interference" }]);
  assert.equal((g.nodes.accepted!.inputs.value as { reason: string }[])[0]!.reason, "welded");
  assert.equal((g.nodes.permitted!.inputs.value as { process: string }[])[0]!.process, "laser-cutting");
  assert.throws(() => doc(jsx("fastener", { id: "f1", part: "iso-4762-m6", length: -1, at: [0, 0, 0], clamped: ["A"] })), /length/);
  assert.throws(() => doc(jsx("accept", { id: "a", check: "clash", body: "A", region: { min: [0, 0, 0], max: [1, 1, 1] } })), /reason/);
  assert.throws(() => doc(jsx("slot", { name: "checks", value: [] })), /checks is not a slot/);
});
