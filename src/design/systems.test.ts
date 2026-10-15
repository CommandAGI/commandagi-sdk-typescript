// Systems in JSX declare a requirements document, a system and an interface. Pinned here: each record is an element
// with its fields verbatim, the documents come back the same both ways, and a wrong field is refused by name with the
// sentence an editor shows (the Python and Rust SDKs hold the same cases).
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, SYSTEMS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const declare = (root: unknown) => declarationOf({ default: () => root }).document!;

test("a requirements document is its requirements, each by its id, verifiedBy and design as refs", () => {
  const d = declare(
    el(
      "requirements",
      { name: "Rover", __source: 0 },
      el("requirement", { id: "mass", text: "At most 500 g.", method: "analysis", verifiedBy: "Rover.system.tsx#mass", design: ["cad/Rover.3d.tsx"], __source: 1 }),
      el("requirement", { id: "drop", text: "Survives a 1 m drop.", method: "test", rationale: "a person drops it" }),
    ),
  );
  assert.equal(d.format, "requirements");
  assert.deepEqual(d.sources, { "": 0, "requirement#mass": 1 });
  assert.deepEqual(d.document, {
    name: "Rover",
    requirements: [
      { id: "mass", text: "At most 500 g.", method: "analysis", verifiedBy: "Rover.system.tsx#mass", design: ["cad/Rover.3d.tsx"] },
      { id: "drop", text: "Survives a 1 m drop.", method: "test", rationale: "a person drops it" },
    ],
  });
  assert.deepEqual(SYSTEMS.requirements.fromTree(SYSTEMS.requirements.toTree(d.document as never)), d.document, "both ways");
  assert.throws(() => declare(el("requirements", {}, el("requirement", { id: "x", text: "t", method: "review" }))), /<requirement id="x">: method must be one of test, analysis, inspection, demonstration \(got "review"\)/);
  assert.throws(() => declare(el("requirements", {}, el("requirement", { id: "a b", text: "t" }))), /id is letters, digits/);
  assert.throws(() => declare(el("requirements", {}, el("requirement", { id: "x" }))), /<requirement id="x"> needs text/);
  assert.throws(() => declare(el("requirements", {}, el("requirement", { id: "x", text: "t", verifiedBy: 3 }))), /verifiedBy is a ref or a list of refs/);
  assert.deepEqual(SYSTEMS.requirements.empty!("Rover"), { name: "Rover" });
});

test("a system is its modes, rails, converters, loads, contributions, boms, budgets and checks, as written", () => {
  const d = declare(
    el(
      "system",
      { name: "Cam" },
      el("mode", { id: "lte" }),
      el("rail", { id: "+5V", voltage: 5, source: "USB" }),
      el("rail", { id: "VBAT", voltage: 3.8 }),
      el("converter", { id: "U3", input: "+5V", output: "VBAT", efficiency: 0.88, source: "estimate" }),
      el("load", { id: "modem", part: "U4", rail: "VBAT", mode: "lte", current: 0.67, source: "datasheet table 35" }),
      el("contribution", { id: "shell", quantity: "mass", part: "P1", value: 15.2, unit: "g", source: "check-fit.mjs" }),
      el("bom", { ref: "bom.csv" }),
      el("budget", { id: "power", quantity: "power", rail: "+5V", mode: "lte", limit: 10, unit: "W", margin: 0.2 }),
      el("check", { id: "link", kind: "interface", of: "Link.interface.tsx" }),
    ),
  );
  assert.equal(d.format, "system");
  const doc = d.document as Record<string, unknown[]>;
  assert.deepEqual(Object.keys(doc), ["name", "modes", "rails", "converters", "loads", "contributions", "boms", "budgets", "checks"]);
  assert.deepEqual(doc.rails, [{ id: "+5V", voltage: 5, source: "USB" }, { id: "VBAT", voltage: 3.8 }]);
  assert.deepEqual(SYSTEMS.system.fromTree(SYSTEMS.system.toTree(doc as never)), doc, "both ways");
  const bad = (props: Record<string, unknown>, tag = "budget") => () => declare(el("system", {}, el(tag, props)));
  assert.throws(bad({ id: "b", quantity: "volume", limit: 1 }), /<budget id="b">: quantity must be one of mass, power, cost, thermal \(got "volume"\)/);
  assert.throws(bad({ id: "b", quantity: "power", limit: 1 }), /a power budget names its rail and its mode/);
  assert.throws(bad({ id: "b", quantity: "thermal", limit: 1, mode: "m" }), /thermal resistance to the ambient \(resistance, K\/W\)/);
  assert.throws(bad({ id: "b", quantity: "mass", limit: 1, margin: 1.5 }), /margin is a fraction/);
  assert.throws(bad({ id: "b", quantity: "cost", per: 100, limit: 30 }), /a cost budget names the design whose logistics roll-up it reads/);
  assert.equal(declare(el("system", {}, el("budget", { id: "b", quantity: "cost", per: 100, limit: 30, design: "Rover.3d.tsx" }))).format, "system");
  assert.throws(bad({ id: "c", quantity: "cost", part: "P", value: 1, source: "a quote" }, "contribution"), /a cost is stated in the design's logistics/);
  assert.throws(bad({ id: "c", input: "a", output: "b", efficiency: 88 }, "converter"), /efficiency is a number in \(0, 1\]/);
  assert.throws(bad({ id: "l", part: "U1", rail: "r", mode: "m" }, "load"), /a load states its current \(A\) or its power \(W\)/);
  assert.throws(bad({ id: "c", quantity: "mass", part: "P", value: 1 }, "contribution"), /source says where the number was read/);
  assert.throws(bad({ id: "k", kind: "erc", of: "x" }, "check"), /kind must be one of interface, trace/);
  assert.throws(bad({ id: "m", watts: 3 }, "mode"), /watts is not read/);
});

test("an interface is its frame, pins, holes, messages, params and sides; a side's maps are one attribute each", () => {
  const d = declare(
    el(
      "interface",
      { name: "Header" },
      el("frame", { description: "the base board's top, pin 1 at the origin", unit: "mm" }),
      el("pin", { number: 1, signal: "+5V", required: true, at: [-11.43, 0] }),
      el("pin", { number: 4, signal: "MODEM_TXD", gpio: 13, dir: "in" }),
      el("hole", { id: "m2-a", at: [0, 0], diameter: 2.2 }),
      el("message", { id: "lte-only", text: "AT+CNMP=38" }),
      el("param", { id: "baud", value: 115200, unit: "Bd" }),
      el("side", { id: "base", ref: "ee/base.circuit.ts", parts: ["J1", "J2"], origin: [0, 1.4] }),
      el("side", { id: "firmware", ref: "fw/config.h", defines: { BOARD: 1 }, pins: { RX_PIN: 4 }, params: { BAUD: "baud" } }),
    ),
  );
  assert.equal(d.format, "interface");
  const doc = d.document as Record<string, unknown>;
  assert.deepEqual(doc.frame, { description: "the base board's top, pin 1 at the origin", unit: "mm" });
  assert.deepEqual((doc.sides as unknown[])[1], { id: "firmware", ref: "fw/config.h", defines: { BOARD: 1 }, pins: { RX_PIN: 4 }, params: { BAUD: "baud" } });
  assert.deepEqual(SYSTEMS.interface.fromTree(SYSTEMS.interface.toTree(doc as never)), doc, "both ways");
  const bad = (tag: string, props: Record<string, unknown>) => () => declare(el("interface", {}, el(tag, props)));
  assert.throws(bad("pin", { number: 0, signal: "x" }), /number is the pin's number, 1, 2, 3/);
  assert.throws(bad("pin", { number: 1, signal: "x", at: [1] }), /at is \[x, y\] mm/);
  assert.throws(bad("hole", { id: "h", at: [0, 0, 0] }), /<hole id="h">: at is \[x, y\] mm/);
  assert.throws(bad("message", { id: "m" }), /a message has its text, its code, or both/);
  assert.throws(bad("side", { id: "s", ref: "x", kind: "mechanical" }), /kind must be one of circuit, 3d, firmware/);
  assert.throws(bad("frame", { unit: "in" }), /positions are in mm/);
  assert.throws(() => declare(el("interface", {}, el("frame", {}), el("frame", {}))), /<interface> has one <frame>/);
});
