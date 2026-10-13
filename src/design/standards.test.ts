// The engineering tables as the SDK carries them, held to numbers typed here from the standards' own tables (the
// shipped CSVs name the page each row was read from; `cloud://global/standards/<table>.csv`). The Python and Rust SDKs
// hold the same values (sdk/python tests/test_standards.py, sdk/rust tests/standards.rs): one set of tables makes all
// three.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, holeSize, jsx, massGrams, material, MATERIALS, sizedHole, standardRow, STANDARD_SOURCES, STANDARD_TABLES } from "./index.js";

test("a sample of each dimension table is the standard's number", () => {
  const row = (table: string, key: string, fields: Record<string, number | string>) => {
    const r = standardRow(table, key);
    for (const [k, v] of Object.entries(fields)) assert.equal(r[k], v, `${table} ${key} ${k}`);
  };
  // ISO 4762 hexagon socket head cap screws: head diameter, head height, socket.
  row("iso-4762", "M3", { dkMax: 5.5, kMax: 3, s: 2.5 });
  row("iso-4762", "M8", { dkMax: 13, kMax: 8, s: 6 });
  // ISO 7380-1 button head, ISO 10642 countersunk head, ISO 4017 hexagon head, ISO 4026 set screw.
  row("iso-7380-1", "M5", { dkMax: 9.5, kMax: 2.75, s: 3 });
  row("iso-10642", "M6", { dkTheoreticalMax: 13.44, kMax: 3.72, s: 4, headAngleDeg: 90 });
  row("iso-4014-4017", "M10", { sMax: 16, kNom: 6.4 });
  row("iso-4026", "M6", { s: 3 });
  // ISO 4032 and ISO 4035 nuts; ISO 7089 and ISO 7093-1 washers.
  row("iso-4032", "M8", { sMax: 13, mMax: 6.8 });
  row("iso-4035", "M8", { mMax: 4 });
  row("iso-7089", "M6", { d1Nom: 6.4, d2Nom: 12, hNom: 1.6 });
  row("iso-7093-1", "M6", { d1Nom: 6.4, d2Nom: 18, hNom: 1.6 });
  // ISO 261 coarse pitch; ASME B18.3 inch socket head cap screw.
  row("metric-threads", "M5", { d: 5, pitchCoarse: 0.8 });
  row("asme-b18.3-shcs", "#4-40", { headDiameterMaxIn: 0.183, threadsPerInch: 40 });
  // ISO 15 bearing boundary dimensions; a HIWIN MGN12H block; a MISUMI 2020 profile; ISO 2338 pins.
  row("bearings", "608", { d: 8, D: 22, B: 7 });
  row("bearings", "625", { d: 5, D: 16, B: 5 });
  row("mgn-linear-guide", "MGN12H", { H: 13, W: 27, L: 45.4, WR: 12, HR: 8, P: 25 });
  row("t-slot-profiles", "HFS5-2020", { width: 20, height: 20, slotWidth: 6 });
  row("iso-2338", "6", { chamferC: 1.2 });
  row("heat-set-inserts", "M3x5.7", { thread: "M3", length: 5.7, recommendedHoleDiameter: 4 });
});

test("a hole by name is the clearance hole of ISO 273 or the tap drill of ISO 2306", () => {
  assert.deepEqual(["close fit", "normal fit", "loose fit"].map((f) => holeSize(`M5 ${f}`).diameter), [5.3, 5.5, 5.8]);
  assert.deepEqual(["close fit", "normal fit", "loose fit"].map((f) => holeSize(`M8 ${f}`).diameter), [8.4, 9, 10]);
  assert.equal(holeSize("M6 tap").diameter, 5);
  assert.equal(holeSize("m10  Tap").diameter, 8.5);
  assert.match(holeSize("M4 close fit").source, /ISO 273/);
  // An inch thread: ASME B18.2.8 normal fit for 1/4 is 0.281 in.
  assert.equal(holeSize("1/4-20 normal fit").diameter, 7.1374);
  assert.throws(() => holeSize("M4 snug"), { message: '"M4 snug": a hole size is a thread and one of close fit, normal fit, loose fit, tap ("M4 close fit")' });
  assert.throws(() => holeSize("M7.5 tap"), /no hole table has the thread M7\.5 \(it has M1\.6, /);
  // The head of a counterbore (DIN 974-1, for an ISO 4762 screw) and of a countersink (DIN 74 form F, 90°).
  assert.deepEqual(sizedHole({ size: "M4 close fit", style: "counterbore" }), { size: "M4 close fit", style: "counterbore", diameter: 4.3, headDiameter: 8, headDepth: 4.4 });
  assert.deepEqual(sizedHole({ size: "M4 normal fit", style: "countersink" }), { size: "M4 normal fit", style: "countersink", diameter: 4.5, headDiameter: 9.2, headDepth: 2.35 });
  assert.deepEqual(sizedHole({ size: "M4 tap", style: "simple" }), { size: "M4 tap", style: "simple", diameter: 3.3 });
});

test("a material is a row with its density and its source; a mass is volume × density", () => {
  assert.equal(material("6061-T6").densityGCm3, 2.7);
  assert.equal(material("304").densityGCm3, 8);
  assert.equal(material("petg").densityGCm3, 1.27);
  assert.equal(massGrams(1000, "304"), 8);
  // A table of your own is read before the shipped one.
  const mine = [{ id: "304", densityGCm3: 7.93, source: "mill certificate 4711" }];
  assert.equal(massGrams(1000, "304", mine), 7.93);
  assert.throws(() => material("unobtainium"), /no materials table has a row "unobtainium" \(the shipped table has 6061-T6, /);
  for (const m of MATERIALS) assert.ok(m.source && m.sourceUrl && m.densityGCm3 > 0, m.id);
  for (const t of Object.keys(STANDARD_TABLES)) assert.ok(STANDARD_SOURCES[t]?.every((s) => s.source && s.sourceUrl && s.observedAt), t);
});

test("a <hole> that names a size has that size's diameter and head; a diameter that differs is refused", () => {
  const face = { kind: "face", signature: { point: [0, 0, 6], normal: [0, 0, 1] } };
  const read = (hole: Record<string, unknown>) => declarationOf({ default: jsx("part", { name: "P", children: [jsx("hole", { id: "h1", face, ...hole })] }) }).graph.nodes.h1!.inputs;
  assert.deepEqual(read({ size: "M4 close fit", style: "counterbore" }), { face, size: "M4 close fit", style: "counterbore", diameter: 4.3, headDiameter: 8, headDepth: 4.4, depth: 10 });
  assert.equal(read({ size: "M3 tap", through: false, depth: 8 }).diameter, 2.5);
  assert.equal(read({ size: "M4 close fit", diameter: 4.3 }).diameter, 4.3);
  assert.throws(() => read({ size: "M4 close fit", diameter: 6 }), { message: '<hole id="h1">: diameter: "M4 close fit" is 4.3 mm (got 6); leave diameter out, or clear size' });
  assert.throws(() => read({ size: "M4 snug" }), /<hole id="h1">: "M4 snug": a hole size is a thread and one of/);
});
