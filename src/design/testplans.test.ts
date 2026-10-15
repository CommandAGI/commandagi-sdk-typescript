// A test plan, a firmware release and a rollout in JSX. Pinned here: each document both ways (fromTree ∘ toTree), the
// order of steps kept, what a tag may not say refused by name, and a unit's serial and revision read from a world.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, TESTPLANS, FIRMWARE, ONTOLOGY } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const SHA = "9f2c".padEnd(64, "0");

test("a test plan in JSX is its steps in order, with conditions and fixtures; each __source by its path", () => {
  const file = el(
    "testplan",
    { title: "Cam-001 power rail", device: "../devices/cam/definition.tsx", __source: 0 },
    el("condition", { id: "ambient", quantity: "temperature", min: 15, max: 35, unit: "C" }),
    el("fixture", { id: "supply", kind: "instrument", unit: "psu-1", channel: "output", __source: 2 }),
    el("step", { id: "rail-3v3", channel: "power", command: { verb: "read" }, read: "v3v3", min: 3.2, max: 3.4, unit: "V", verifies: ["req.tsx#rail"], __source: 3 }),
    el("step", { id: "current", fixture: "supply", read: "current", max: 0.4 }),
  );
  const { document } = declarationOf({ default: () => file });
  assert.equal(document!.format, "testplan");
  assert.deepEqual(document!.sources, { "": 0, "fixture#supply": 2, "step#rail-3v3": 3 });
  const doc = document!.document as Record<string, unknown>;
  assert.deepEqual(doc, {
    title: "Cam-001 power rail",
    device: "../devices/cam/definition.tsx",
    conditions: [{ id: "ambient", quantity: "temperature", min: 15, max: 35, unit: "C" }],
    fixtures: [{ id: "supply", kind: "instrument", unit: "psu-1", channel: "output" }],
    steps: [
      { id: "rail-3v3", channel: "power", command: { verb: "read" }, read: "v3v3", min: 3.2, max: 3.4, unit: "V", verifies: ["req.tsx#rail"] },
      { id: "current", fixture: "supply", read: "current", max: 0.4 },
    ],
  });
  assert.deepEqual(TESTPLANS.testplan.fromTree(TESTPLANS.testplan.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("testplan", {}, el("step", { read: "x" })) }), /<step> needs id/);
  assert.throws(() => declarationOf({ default: el("testplan", {}, el("step", { id: "a", limit: 3 })) }), /limit is not read/);
  assert.throws(() => declarationOf({ default: el("testplan", {}, el("step", { id: "a", verifies: "req.tsx" })) }), /verifies is a list of refs/);
  assert.throws(() => declarationOf({ default: el("testplan", {}, el("step", { id: "a" }), el("step", { id: "a" })) }), /two <step> in <testplan> have id "a"/);
});

test("a firmware release states its digest, SBOM, device and revisions; a rollout its stages, health checks and targets", () => {
  const release = el(
    "firmware",
    { version: "1.4.0", image: "build/cam.bin", sha256: SHA, size: 1024, sbom: "build/cam.cdx.json", device: "../devices/cam/definition.tsx", securityVersion: 2 },
    el("supports", { revision: "B" }),
    el("supports", { revision: "C" }),
  );
  const fw = declarationOf({ default: () => release }).document!;
  assert.equal(fw.format, "firmware");
  assert.deepEqual(fw.document, { version: "1.4.0", image: "build/cam.bin", sha256: SHA, size: 1024, sbom: "build/cam.cdx.json", device: "../devices/cam/definition.tsx", securityVersion: 2, supports: [{ revision: "B" }, { revision: "C" }] });
  assert.deepEqual(FIRMWARE.firmware.fromTree(FIRMWARE.firmware.toTree(fw.document as never)), fw.document);
  assert.throws(() => declarationOf({ default: el("firmware", { version: "1", image: "a.bin", sha256: SHA, device: "d.tsx" }) }), /<firmware> needs sbom/);
  assert.throws(() => declarationOf({ default: el("firmware", { version: "1", image: "a.bin", sha256: "ABC", sbom: "s.json", device: "d.tsx" }) }), /64 lowercase hex digits/);

  const plan = el(
    "rollout",
    { firmware: "cam.firmware.tsx", world: "worlds/fleet/world.tsx", channel: "firmware", canary: 10, waves: [50, 100], settleMs: 5000 },
    el("health", { id: "no-crash", channel: "state", command: { verb: "read" }, read: "crashes", max: 0 }),
    el("target", { unit: "cam-1" }),
    el("target", { unit: "cam-2" }),
  );
  const ro = declarationOf({ default: () => plan }).document!;
  assert.equal(ro.format, "rollout");
  assert.deepEqual(ro.document, { firmware: "cam.firmware.tsx", world: "worlds/fleet/world.tsx", channel: "firmware", canary: 10, waves: [50, 100], settleMs: 5000, health: [{ id: "no-crash", channel: "state", command: { verb: "read" }, read: "crashes", max: 0 }], targets: [{ unit: "cam-1" }, { unit: "cam-2" }] });
  assert.deepEqual(FIRMWARE.rollout.fromTree(FIRMWARE.rollout.toTree(ro.document as never)), ro.document);
  assert.throws(() => declarationOf({ default: el("rollout", { firmware: "a.firmware.tsx", world: "w.tsx", channel: "firmware", canary: 10 }) }), /<rollout> needs waves/);
});

test("a world's unit says its serial and its hardware revision", () => {
  const w = declarationOf({ default: el("world", { name: "fleet", kind: "physical" }, el("unit", { uid: "cam-1", name: "cam", device: "d.tsx", serial: "CAM-000123", revision: "B", position: [0, 0, 0], rotation: 0 })) }).document!;
  assert.deepEqual((w.document as { units: unknown[] }).units[0], { uid: "cam-1", name: "cam", device: "d.tsx", serial: "CAM-000123", revision: "B", position: [0, 0, 0], rotation: 0 });
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(w.document as never)), w.document);
});
