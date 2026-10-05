// Machine jobs in JSX declare the documents the 3D app's CAM and slicing modes edit. Pinned here: a setup is its JSON
// both ways (fromTree ∘ toTree on what the file says), operations keep the order of their elements, a null record is
// no element, `enabled` is written only when false; a run leaves the run's one shape; what the vocabulary has no
// words for is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, FAB, jsx } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

test("a machining setup in JSX is its setup: records are elements, operations in their order, each __source by its path", () => {
  const file = el(
    "cam",
    { __source: 0 },
    el("stock", { materialId: "plywood", thicknessMm: 6, xMm: 90, yMm: 70 }),
    el("machine", { post: "grbl", maxSpindleRpm: 10000 }),
    el("fixture", { name: "clamp", xMm: -14, yMm: 25, wMm: 20, dMm: 20, zMm: 4 }),
    el("operation", { id: "op-2", op: "mill_contour", profile: "contour_wood", tabs: { count: 4, lengthMm: 5, heightMm: 1.5 }, __source: 3 }),
    el("operation", { id: "op-1", op: "mill_pocket", profile: "pocket_wood", enabled: false, params: { toolDiameterMm: 3.175 } }),
    el("runsOn", { unit: "cloud://global/worlds/fab-cell/world.json#cnc-1", channel: "gcode", name: "cnc" }),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "cam");
  assert.deepEqual(document!.sources, { "": 0, "operation#op-2": 3 });
  const doc = document!.document as Record<string, unknown>;
  assert.deepEqual(doc, {
    stock: { materialId: "plywood", thicknessMm: 6, xMm: 90, yMm: 70 },
    machine: { post: "grbl", maxSpindleRpm: 10000 },
    fixtures: [{ name: "clamp", xMm: -14, yMm: 25, wMm: 20, dMm: 20, zMm: 4 }],
    operations: [
      { id: "op-2", op: "mill_contour", profile: "contour_wood", tabs: { count: 4, lengthMm: 5, heightMm: 1.5 } },
      { id: "op-1", op: "mill_pocket", profile: "pocket_wood", enabled: false, params: { toolDiameterMm: 3.175 } },
    ],
    runsOn: { unit: "cloud://global/worlds/fab-cell/world.json#cnc-1", channel: "gcode", name: "cnc" },
  });
  assert.deepEqual(FAB.cam.fromTree(FAB.cam.toTree(doc as never)), doc, "both ways");
  const native = { source: null, design: null, stock: { materialId: "aluminium", thicknessMm: null, xMm: null, yMm: null }, part: null, machine: { post: "grbl", maxSpindleRpm: null, maxFeedMmPerMin: null, spindlePowerKw: null }, fixtures: [], operations: [{ id: "op-1", op: "face", profile: "p", enabled: true, params: {}, tabs: null, region: null }], runsOn: null };
  assert.deepEqual(FAB.cam.toTree(native).children.map((c) => [c.tag, c.attrs]), [
    ["stock", { materialId: "aluminium" }],
    ["machine", { post: "grbl" }],
    ["operation", { id: "op-1", op: "face", profile: "p" }],
  ], "a null record is no element, a null field no attribute, an enabled operation says nothing of it");

  assert.throws(() => declarationOf({ default: el("cam", {}, el("operation", { id: "a", op: "face" })) }), /<operation id="a"> needs profile/);
  assert.throws(() => declarationOf({ default: el("cam", {}, el("operation", { id: "a", op: "face", profile: "p" }), el("operation", { id: "a", op: "face", profile: "p" })) }), /two <operation> in <cam> have id "a"/);
  assert.throws(() => declarationOf({ default: el("cam", {}, el("stock", {}), el("stock", {})) }), /<cam> has one <stock>/);
  assert.throws(() => declarationOf({ default: el("cam", {}, el("spool", {})) }), /<spool> is not a tag of a machining setup/);
  assert.throws(() => declarationOf({ default: el("cam", {}, el("stock", { colour: "red" })) }), /colour is not read/);
});

test("a slicing setup in JSX is its setup: the profile and its overrides on the root, each record one element", () => {
  const file = el(
    "slice",
    { profile: "fdm_pla_0.20_draft", params: { layerHeightMm: 0.2 } },
    el("source", { fileId: "carrier.stl", name: "carrier.stl" }),
    el("spool", { materialId: "pla", diameterMm: 1.75 }),
    el("machine", { unit: "cloud://global/worlds/fab-cell/world.json#printer-1", channel: "gcode", name: "ender" }),
  );
  const { document } = declarationOf({ default: file });
  assert.equal(document!.format, "slice");
  const doc = document!.document as Record<string, unknown>;
  assert.deepEqual(doc, {
    profile: "fdm_pla_0.20_draft",
    params: { layerHeightMm: 0.2 },
    source: { fileId: "carrier.stl", name: "carrier.stl" },
    spool: { materialId: "pla", diameterMm: 1.75 },
    machine: { unit: "cloud://global/worlds/fab-cell/world.json#printer-1", channel: "gcode", name: "ender" },
  });
  assert.deepEqual(FAB.slice.fromTree(FAB.slice.toTree(doc as never)), doc, "both ways");
  assert.deepEqual(FAB.slice.toTree({ profile: "p", params: {}, source: null, design: null, spool: { materialId: "pla", diameterMm: 1.75 }, machine: null }).attrs, { profile: "p" }, "empty overrides are not written");
  assert.throws(() => declarationOf({ default: el("slice", {}) }), /<slice> needs profile/);
  assert.throws(() => declarationOf({ default: el("slice", { profile: "p" }, el("machine", { unit: "x" })) }), /<machine> needs channel/);
});
