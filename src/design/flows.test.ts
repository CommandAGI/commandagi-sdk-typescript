// A process flow in JSX declares its tools and its steps, each step with its params and measures. Pinned here: the
// document both ways, and each refusal by name with the sentence an editor shows (the Python and Rust SDKs hold the
// same cases).
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, FLOWS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const declare = (root: unknown) => declarationOf({ default: () => root }).document!;
const flow = (...children: unknown[]) => el("flow", { name: "Marks" }, ...children);

test("a flow is its tools and its steps, each step with its params and measures", () => {
  const d = declare(
    el(
      "flow",
      { name: "Marks", of: "Kit.3d.tsx#wafer", __source: 0 },
      el("tool", { id: "coater", ref: "Kit.3d.tsx#coater", ratePerHour: 40, currency: "USD" }),
      el("step", { id: "why", kind: "note", instruction: "Marks first." }),
      el(
        "step",
        { id: "coat", order: 1, tool: "coater", by: "in-house", minutes: 6, __source: 2 },
        el("param", { name: "speed", value: 3000, unit: "rpm", __source: 3 }),
        el("measure", { id: "resist", name: "resist thickness", nominal: 1.2, plus: 0.1, minus: 0.1, unit: "um" }),
      ),
    ),
  );
  assert.equal(d.format, "flow");
  assert.deepEqual(d.sources, { "": 0, "step#coat": 2, "step#coat/param@0": 3 });
  assert.deepEqual(d.document, {
    name: "Marks",
    of: "Kit.3d.tsx#wafer",
    tools: [{ id: "coater", ref: "Kit.3d.tsx#coater", ratePerHour: 40, currency: "USD" }],
    steps: [
      { id: "why", kind: "note", instruction: "Marks first." },
      { id: "coat", order: 1, tool: "coater", by: "in-house", minutes: 6, params: [{ name: "speed", value: 3000, unit: "rpm" }], measures: [{ id: "resist", name: "resist thickness", nominal: 1.2, plus: 0.1, minus: 0.1, unit: "um" }] },
    ],
  });
  assert.deepEqual(FLOWS.flow.fromTree(FLOWS.flow.toTree(d.document as never)), d.document, "both ways");
  assert.deepEqual(FLOWS.flow.empty!("Marks"), { name: "Marks" });
});

test("a wrong field of a flow is refused by name", () => {
  const refused: [unknown, RegExp][] = [
    [flow(el("step", { id: "a", kind: "rest" })), /<step id="a">: kind must be one of work, note \(got "rest"\)/],
    [flow(el("step", { id: "a", minutes: -1 })), /<step id="a">: minutes is a number of at least 0/],
    [flow(el("step", { id: "a", order: 0 })), /<step id="a">: order is a whole number from 1/],
    [flow(el("step", { id: "a", kind: "note", minutes: 5 })), /<step id="a">: a note step names no tool, takes no time/],
    [flow(el("step", { id: "a", currency: "usd" })), /<step id="a">: currency is an ISO 4217 code/],
    [flow(el("tool", { id: "t", ratePerHour: -2 })), /<tool id="t">: ratePerHour is a number of at least 0/],
    [flow(el("step", { id: "a" }, el("param", { name: "gas", value: ["SF6"] }))), /<param name="gas">: value is a number, a text or true\/false/],
    [flow(el("step", { id: "a" }, el("measure", { id: "m", plus: 0.1 }))), /<measure id="m">: plus and minus are tolerances of the nominal: give nominal/],
    [flow(el("step", { id: "a" }, el("measure", { id: "m", min: 2, max: 1 }))), /<measure id="m">: min is at most max/],
    [flow(el("param", { name: "x", value: 1 })), /<param> stands in <step>, not in <flow>/],
    [flow(el("step", { id: "a" }, el("measure", { id: "m", max: 1 })), el("step", { id: "b" }, el("measure", { id: "m", max: 2 }))), /<measure id="m">: two measures have this id/],
    [flow(el("step", { id: "a" }, el("param", { name: "t", value: 1 }), el("param", { name: "t", value: 2 }))), /<step id="a">: two params are named "t"/],
  ];
  for (const [root, why] of refused) assert.throws(() => declare(root), why);
});
