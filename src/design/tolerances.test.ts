// Tolerances as the SDK reads them: classes against numbers typed here from ISO 286-2 and ISO 492 (the shipped CSVs
// name the page each row was read from), a fit's kind, and a parameter's tolerance through the 3D reader. The Python
// and Rust SDKs hold the same cases (tests/test_tolerances.py, tests/tolerances.rs).
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, fitOf, jsx, toleranceLimits } from "./index.js";

test("a class is read from the tables at its size; a class or a size they do not have is refused", () => {
  assert.deepEqual([toleranceLimits(25, { class: "H7" }).upper, toleranceLimits(25, { class: "H7" }).lower], [0.021, 0]);
  assert.deepEqual([toleranceLimits(25, { class: "g6" }).upper, toleranceLimits(25, { class: "g6" }).lower], [-0.007, -0.02]);
  assert.deepEqual([toleranceLimits(10, { class: "H7" }).max, toleranceLimits(15, { class: "ISO 492 bore" }).min], [10.015, 14.992]);
  assert.ok(toleranceLimits(25, { class: "H7" }).source);
  assert.throws(() => toleranceLimits(25, { class: "H77" }), /no tolerance class "H77"/);
  assert.throws(() => toleranceLimits(3200, { class: "H7" }), /H7: ISO 286 gives sizes over 0 up to 3150 mm, not 3200 mm/);
  // Any ISO 286 class at any size to 3150 mm, from the fundamental deviation and the grade (ISO 286-2 values).
  const um = (cls: string, size: number) => [toleranceLimits(size, { class: cls }).upper, toleranceLimits(size, { class: cls }).lower].map((v) => Math.round(v * 1000));
  assert.deepEqual([um("E10", 6), um("H9", 255), um("e8", 250), um("H13", 31.7), um("M6", 300), um("ISO 2768-m", 50)], [[68, 20], [130, 0], [-100, -172], [390, 0], [-9, -41], [300, -300]]);
  assert.deepEqual(toleranceLimits(12, { upper: 0.05, lower: -0.05 }), { nominal: 12, upper: 0.05, lower: -0.05, min: 11.95, max: 12.05 });
});

test("a fit is clearance, transition or interference from both ends", () => {
  const fit = (h: string, s: string, d = 25) => fitOf(toleranceLimits(d, { class: h }), toleranceLimits(d, { class: s }));
  assert.deepEqual(fit("H7", "g6"), { kind: "clearance", minClearance: 0.007, maxClearance: 0.041 });
  assert.equal(fit("H7", "p6").kind, "interference");
  assert.equal(fit("H7", "k6").kind, "transition");
  assert.equal(fit("ISO 492 bore", "k5", 15).kind, "interference");
});

test("a parameter's tolerance is read into the graph; a tolerance given two ways is refused", () => {
  const doc = (...children: unknown[]) => () => declarationOf({ default: jsx("part", { name: "P", children }) });
  const g = doc(jsx("parameter", { name: "shaftD", value: 15, tolerance: { class: "k5" } }))().graph;
  assert.deepEqual(g.nodes.shaftD!.inputs, { value: 15, tolerance: { class: "k5" } });
  assert.throws(doc(jsx("parameter", { name: "w", value: 6, tolerance: { class: "k5", upper: 0.1, lower: 0 } })), /<parameter name="w">: tolerance: give the class \(k5\) or the deviations, not both/);
  assert.throws(doc(jsx("parameter", { name: "w", value: 6, tolerance: { upper: 0.1 } })), /tolerance: give both deviations, upper and lower \(0 for none\)/);
  assert.throws(doc(jsx("parameter", { name: "w", value: 6, tolerance: { upper: -0.1, lower: 0.1 } })), /tolerance: the upper deviation \(-0.1\) is below the lower \(0.1\)/);
  // A check's fields and a hole's tolerance are the schema's: a wrong one is refused with the op panel's sentence.
  assert.throws(doc(jsx("check", { id: "c", kind: "stackup", method: "average" })), /method: must be one of worst-case, rss, monte-carlo/);
  assert.throws(doc(jsx("check", { id: "c", kind: "stackup", chain: [] })), /chain: needs at least 1 items/);
});
