// A study in JSX declares the question of an analysis. Pinned here: the document both ways (fromTree ∘ toTree), loads
// keep their tag as their type, a tag of another kind is refused by name, and a kind added later reads its own tags.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, registerStudyKind, STUDY } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const face = (select: Record<string, unknown>) => ({ kind: "face", select });

test("a structural study in JSX is its question: fixtures, load cases with typed loads, mesh, criteria, each __source by its path", () => {
  const file = el(
    "study",
    { kind: "structural", part: "Jaw.3d.tsx", units: "mm-N-MPa-t", __source: 0 },
    el("material", { grade: "PETG", poisson: 0.38 }),
    el("fixture", { id: "mount", type: "fixed", faces: face({ normal: [0, 0, -1] }) }),
    el("fixture", { id: "hinge", type: "fixed", faces: face({ normal: [-1, 0, 0] }), region: { inBox: { min: [0, -5, 0], max: [0, 5, 0] } } }),
    el("loadCase", { id: "clamp", __source: 2 }, el("force", { id: "grip", faces: face({ farthest: [1, 0, 0] }), total: [-40, 0, 0], __source: 3 }), el("pressure", { id: "air", faces: face({ normal: [0, 1, 0] }), value: 0.1 })),
    el("mesh", { order: 2, size: 2, refine: [1, 0.7, 0.5] }),
    el("solver", { kind: "calculix", analysis: "static", timeout: 1800 }),
    el("criterion", { id: "safety", quantity: "vonMises.max", limit: "yield / 2" }),
    el("revise", { parameter: "thickness", min: 3, max: 8 }),
  );
  const { document } = declarationOf({ default: () => file });
  assert.equal(document!.format, "study");
  assert.deepEqual(document!.sources, { "": 0, "loadCase#clamp": 2, "loadCase#clamp/force#grip": 3 });
  const doc = document!.document as Record<string, unknown>;
  assert.deepEqual(doc, {
    kind: "structural",
    part: "Jaw.3d.tsx",
    units: "mm-N-MPa-t",
    material: { grade: "PETG", poisson: 0.38 },
    fixtures: [{ id: "mount", type: "fixed", faces: face({ normal: [0, 0, -1] }) }, { id: "hinge", type: "fixed", faces: face({ normal: [-1, 0, 0] }), region: { inBox: { min: [0, -5, 0], max: [0, 5, 0] } } }],
    loadCases: [{ id: "clamp", loads: [{ type: "force", id: "grip", faces: face({ farthest: [1, 0, 0] }), total: [-40, 0, 0] }, { type: "pressure", id: "air", faces: face({ normal: [0, 1, 0] }), value: 0.1 }] }],
    mesh: { order: 2, size: 2, refine: [1, 0.7, 0.5] },
    solver: { kind: "calculix", analysis: "static", timeout: 1800 },
    criteria: [{ id: "safety", quantity: "vonMises.max", limit: "yield / 2" }],
    revise: [{ parameter: "thickness", min: 3, max: 8 }],
  });
  assert.deepEqual(STUDY.study.fromTree(STUDY.study.toTree(doc as never)), doc, "both ways");

  assert.throws(() => declarationOf({ default: el("study", { kind: "structural" }) }), /<study> needs part/);
  assert.throws(() => declarationOf({ default: el("study", { kind: "thermal", part: "a.3d.tsx" }) }), /kind is one of structural/);
  assert.throws(() => declarationOf({ default: el("study", { kind: "structural", part: "a.3d.tsx" }, el("force", { id: "f", faces: face({}), total: [0, 0, 1] })) }), /<force> stands in <loadCase>, not in <study>/);
  assert.throws(() => declarationOf({ default: el("study", { kind: "structural", part: "a.3d.tsx" }, el("fixture", { id: "a", type: "fixed" })) }), /<fixture id="a"> needs faces/);
  assert.throws(() => declarationOf({ default: el("study", { kind: "structural", part: "a.3d.tsx" }, el("mesh", { colour: "red" })) }), /colour is not read/);
});

test("a flow study in JSX: the fluid, the inlet and the outlet as face picks, the mesh levels; structural tags refused in it", () => {
  const file = el(
    "study",
    { kind: "flow", part: "Channel.3d.tsx", units: "m-kg-s" },
    el("fluid", { nu: 1e-6 }),
    el("inlet", { faces: face({ normal: [-1, 0, 0] }), velocity: 0.5 }),
    el("outlet", { faces: face({ normal: [1, 0, 0] }) }),
    el("flowMesh", { cells: [20, 3, 3], levels: [1, 2, 4] }),
    el("criterion", { id: "drop", quantity: "pressureDrop", limit: 2 }),
  );
  const doc = declarationOf({ default: () => file }).document!.document as Record<string, unknown>;
  assert.deepEqual(doc, {
    kind: "flow",
    part: "Channel.3d.tsx",
    units: "m-kg-s",
    fluid: { nu: 1e-6 },
    inlet: { faces: face({ normal: [-1, 0, 0] }), velocity: 0.5 },
    outlet: { faces: face({ normal: [1, 0, 0] }) },
    flowMesh: { cells: [20, 3, 3], levels: [1, 2, 4] },
    criteria: [{ id: "drop", quantity: "pressureDrop", limit: 2 }],
  });
  assert.deepEqual(STUDY.study.fromTree(STUDY.study.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("study", { kind: "flow", part: "a.3d.tsx" }, el("mesh", { size: 2 })) }), /<mesh> belongs to a structural study, not to a flow one/);
  assert.throws(() => declarationOf({ default: el("study", { kind: "flow", part: "a.3d.tsx" }, el("inlet", { faces: face({ normal: [1, 0, 0] }) })) }), /<inlet> needs velocity/);
});

test("a kind registered later reads its own tags and refuses them in a study of another kind", () => {
  registerStudyKind("probe-kind", { probe: { rule: { parents: ["study"], key: "id", required: ["id"], attrs: ["id", "depthMm"] }, field: "probes", list: true } });
  const ok = declarationOf({ default: el("study", { kind: "probe-kind", part: "a.3d.tsx" }, el("probe", { id: "p1", depthMm: 3 }), el("criterion", { id: "c", quantity: "probe.depth", limit: 4 })) });
  assert.deepEqual(ok.document!.document, { kind: "probe-kind", part: "a.3d.tsx", probes: [{ id: "p1", depthMm: 3 }], criteria: [{ id: "c", quantity: "probe.depth", limit: 4 }] });
  assert.throws(() => declarationOf({ default: el("study", { kind: "structural", part: "a.3d.tsx" }, el("probe", { id: "p1" })) }), /<probe> belongs to a probe-kind study, not to a structural one/);
  assert.throws(() => registerStudyKind("other", { fixture: { rule: { parents: ["study"] }, field: "holds", list: true } }), /fills holds, but it already fills fixtures/);
});
