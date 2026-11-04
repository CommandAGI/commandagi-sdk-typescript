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
        el("visit", { tool: "oven", minutes: 2, instruction: "soft bake" }),
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
      { id: "coat", order: 1, tool: "coater", by: "in-house", minutes: 6, params: [{ name: "speed", value: 3000, unit: "rpm" }], measures: [{ id: "resist", name: "resist thickness", nominal: 1.2, plus: 0.1, minus: 0.1, unit: "um" }], visits: [{ tool: "oven", minutes: 2, instruction: "soft bake" }] },
    ],
  });
  assert.deepEqual(FLOWS.flow.fromTree(FLOWS.flow.toTree(d.document as never)), d.document, "both ways");
  assert.deepEqual(FLOWS.flow.empty!("Marks"), { name: "Marks" });
});

test("a workflow is its typed inputs, its action steps, their expectations, their edges and where a surprise goes", () => {
  const d = declare(
    el(
      "flow",
      { name: "Ship a fix" },
      el("input", { name: "ticket", type: "text" }),
      el("input", { name: "token", type: "text", private: true, required: true }),
      el("tool", { id: "arm", ref: "Kit.3d.tsx#arm" }),
      el(
        "step",
        { id: "read", kind: "message", channel: "orders", instruction: "Read the ticket ${input:ticket}.", surprise: "parent" },
        el("expect", { name: "reply", equals: "read", within: 5 }),
      ),
      el(
        "step",
        { id: "go", kind: "command", channel: "arm", command: "move ${env:ARM_TOKEN}", after: "read", minutes: 2, surprise: "person", surpriseTo: "ops@example.com" },
        el("expect", { name: "exit", equals: 0, tolerance: 0 }),
      ),
      el("step", { id: "call", kind: "workflow", ref: "Inspect.flow.tsx", after: "go", surprise: "agent", surpriseTo: "claude" }, el("expect", { name: "done", equals: true })),
    ),
  );
  assert.deepEqual(d.document, {
    name: "Ship a fix",
    inputs: [
      { name: "ticket", type: "text" },
      { name: "token", type: "text", private: true, required: true },
    ],
    tools: [{ id: "arm", ref: "Kit.3d.tsx#arm" }],
    steps: [
      { id: "read", kind: "message", channel: "orders", instruction: "Read the ticket ${input:ticket}.", surprise: "parent", expects: [{ name: "reply", equals: "read", within: 5 }] },
      { id: "go", kind: "command", channel: "arm", command: "move ${env:ARM_TOKEN}", after: "read", minutes: 2, surprise: "person", surpriseTo: "ops@example.com", expects: [{ name: "exit", equals: 0, tolerance: 0 }] },
      { id: "call", kind: "workflow", ref: "Inspect.flow.tsx", after: "go", surprise: "agent", surpriseTo: "claude", expects: [{ name: "done", equals: true }] },
    ],
  });
  assert.deepEqual(FLOWS.flow.fromTree(FLOWS.flow.toTree(d.document as never)), d.document, "both ways");
});

test("a step that waits for an approval names who may give it: a principal, a role or a grant, never a kind of principal", () => {
  const approval = "agent:reviewer person:ada role:release-manager grant:local://desk/home/worlds/shop/world.tsx#arm-1";
  const d = declare(el("flow", { name: "Ship" }, el("step", { id: "ship", kind: "command", channel: "desk", command: "ls", surprise: "parent", approval }, el("expect", { name: "exit", equals: 0 }))));
  assert.equal((d.document as { steps: { approval?: string }[] }).steps[0]!.approval, approval);
  assert.deepEqual(FLOWS.flow.fromTree(FLOWS.flow.toTree(d.document as never)), d.document, "both ways");
  const step = (a: Record<string, unknown>) => flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent", ...a }, el("expect", { name: "e", equals: 1 })));
  for (const [root, why] of [
    [step({ approval: "person" }), /<step id="a">: approval names a principal .* not "person"/],
    [step({ approval: "agents" }), /not "agents"/],
    [step({ approval: "grant:shop" }), /not "grant:shop"/],
    [step({ approval: " " }), /<step id="a">: approval names who may approve the step/],
    [step({ approval: "agent:a agent:a" }), /<step id="a">: approval names an approver twice/],
    [flow(el("step", { id: "a", kind: "note", approval: "agent:a" })), /<step id="a">: a note step does nothing, so it waits for no approval/],
  ] as [unknown, RegExp][])
    assert.throws(() => declare(root), why);
});

test("a wrong field of a flow is refused by name", () => {
  const refused: [unknown, RegExp][] = [
    [flow(el("step", { id: "a", kind: "rest" })), /<step id="a">: kind must be one of work, note, message, command, computer, robot, chain, workflow, decision, agent \(got "rest"\)/],
    [flow(el("input", { name: "t", type: "date" })), /<input name="t">: type is one of text, number, boolean \(got "date"\)/],
    [flow(el("input", { name: "t", private: true, default: "x" })), /<input name="t">: a private input states no default/],
    [flow(el("input", { name: "t", type: "number", default: "x" })), /<input name="t">: default is a number/],
    [flow(el("step", { id: "a", kind: "message", channel: "c", surprise: "parent" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: a message step states its instruction/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent" })), /<step id="a">: an action step declares what must be observed after it/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: an action step says where a surprise goes/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "person" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: surprise "person" names who handles it/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent", surpriseTo: "x" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: a surprise that goes to the parent names no surpriseTo/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent", after: "b" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: after names the step "b", which this flow does not declare/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent", after: "a" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: after does not name the step itself/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls ${input:nope}", surprise: "parent" }, el("expect", { name: "e", equals: 1 }))), /<step id="a">: \$\{input:nope\} is not a bound value/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent" }, el("expect", { name: "e", equals: "ok", tolerance: 1 }))), /<expect name="e">: a tolerance holds of a number/],
    [flow(el("step", { id: "a", kind: "command", channel: "c", command: "ls", surprise: "parent" }, el("expect", { name: "e", equals: 1, within: 0 }))), /<expect name="e">: within is a number of seconds, more than 0/],
    [flow(el("step", { id: "a", minutes: -1 })), /<step id="a">: minutes is a number of at least 0/],
    [flow(el("step", { id: "a", order: 0 })), /<step id="a">: order is a whole number from 1/],
    [flow(el("step", { id: "a", kind: "note", minutes: 5 })), /<step id="a">: a note step names no tool, takes no time/],
    [flow(el("step", { id: "a", currency: "usd" })), /<step id="a">: currency is an ISO 4217 code/],
    [flow(el("tool", { id: "t", ratePerHour: -2 })), /<tool id="t">: ratePerHour is a number of at least 0/],
    [flow(el("step", { id: "a" }, el("param", { name: "gas", value: ["SF6"] }))), /<param name="gas">: value is a number, a text or true\/false/],
    [flow(el("step", { id: "a" }, el("measure", { id: "m", plus: 0.1 }))), /<measure id="m">: plus and minus are tolerances of the nominal: give nominal/],
    [flow(el("step", { id: "a" }, el("measure", { id: "m", min: 2, max: 1 }))), /<measure id="m">: min is at most max/],
    [flow(el("param", { name: "x", value: 1 })), /<param> stands in <step>, not in <flow>/],
    [flow(el("step", { id: "a" }, el("visit", { tool: "oven", minutes: -1 }))), /<step id="a"> <visit tool="oven">: minutes is a number of at least 0/],
    [flow(el("step", { id: "a", kind: "note" }, el("visit", { tool: "oven" }))), /<step id="a">: a note step names no tool, takes no time .* no param, measure, visit or expect/],
    [flow(el("step", { id: "a" }, el("measure", { id: "m", max: 1 })), el("step", { id: "b" }, el("measure", { id: "m", max: 2 }))), /<measure id="m">: two measures have this id/],
    [flow(el("step", { id: "a" }, el("param", { name: "t", value: 1 }), el("param", { name: "t", value: 2 }))), /<step id="a">: two params are named "t"/],
  ];
  for (const [root, why] of refused) assert.throws(() => declare(root), why);
});
