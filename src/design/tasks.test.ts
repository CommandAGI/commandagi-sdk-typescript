// Tasks and projects in JSX declare the documents the tasks and projects apps edit. Pinned here: a task is its body
// both ways (fromTree ∘ toTree on what the file says), subtasks are <subtask ref> children in order, times read from a
// date or a UTC time and are written back as one; a run leaves the run's one shape; what the vocabulary has no words
// for is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, TASKS, timeOf, timeText } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

test("a task in JSX is its body: fields are attributes, subtasks are <subtask ref> children in order, each __source by its path", () => {
  const file = el(
    "task",
    { id: "ship", title: "Ship it", status: "doing", priority: "high", assignees: ["agent:writer"], dueAt: "2026-10-20", readme: "Ship it.md", __source: 0 },
    el("subtask", { ref: "Ship it/Draft.task.tsx", __source: 1 }),
    el("subtask", { ref: "Ship it/Send.task.tsx" }),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {}, "a task leaves beside an empty graph");
  assert.equal(document!.format, "task");
  assert.deepEqual(document!.sources, { "": 0, "subtask#Ship it/Draft.task.tsx": 1 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    id: "ship",
    title: "Ship it",
    status: "doing",
    priority: "high",
    assignees: ["agent:writer"],
    dueAt: Date.UTC(2026, 9, 20),
    readme: "Ship it.md",
    subtasks: ["Ship it/Draft.task.tsx", "Ship it/Send.task.tsx"],
  });
  const tree = TASKS.task.toTree(doc as never);
  assert.equal(tree.attrs.dueAt, "2026-10-20", "a time is written as a date when it is midnight UTC");
  assert.deepEqual(TASKS.task.fromTree(tree), doc, "both ways");
  assert.deepEqual(TASKS.task.toTree({ id: "a", labels: [], assignees: [] }).attrs, { id: "a" }, "a field that says nothing is not written");

  assert.throws(() => declarationOf({ default: el("task", { title: "no id" }) }), /<task> needs id/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a", subtasks: ["x.task.tsx"] }) }), /subtasks is not read/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("task", { id: "b" })) }), /<task> stands in .*not in <task>|a task in code is one <task> element/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("subtask", { ref: "x.task.tsx" }), el("subtask", { ref: "x.task.tsx" })) }), /two <subtask> in <task> have ref "x.task.tsx"/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a", dueAt: "next week" }) }), /dueAt is a date/);
});

test("a proposal in JSX: its sketch is one <sketch ref>, each ask one <asks> in order; expires and approvedAt are times", () => {
  const file = el(
    "task",
    { id: "cut", title: "Cut the bracket", status: "proposed", assignees: ["agent:claude"], expires: "2026-10-11T18:00:00Z", __source: 0 },
    el("sketch", { ref: "../worlds/shop/runs/cut/run.json", __source: 1 }),
    el("asks", { world: "../worlds/shop/world.tsx", units: ["cnc-1"], channels: ["gcode"], verbs: ["open", "arm", "run"], hours: 4, __source: 2 }),
    el("asks", { folder: "..", files: ["out"], hours: 4, note: "the program" }),
  );
  const { document } = declarationOf({ default: () => file });
  assert.deepEqual(document!.sources, { "": 0, sketch: 1, "asks@0": 2 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    id: "cut",
    title: "Cut the bracket",
    status: "proposed",
    assignees: ["agent:claude"],
    expires: Date.UTC(2026, 9, 11, 18),
    sketch: "../worlds/shop/runs/cut/run.json",
    asks: [
      { world: "../worlds/shop/world.tsx", units: ["cnc-1"], channels: ["gcode"], verbs: ["open", "arm", "run"], hours: 4 },
      { folder: "..", files: ["out"], hours: 4, note: "the program" },
    ],
  });
  const approved = { ...doc, status: "todo", approvedBy: "person:ada", approvedAt: Date.UTC(2026, 9, 10, 9, 30), grants: ["g-0123456789ab"] };
  const tree = TASKS.task.toTree(approved as never);
  assert.deepEqual(tree.children.map((c) => c.tag), ["sketch", "asks", "asks"], "the sketch, then the asks");
  assert.equal(tree.attrs.approvedAt, "2026-10-10T09:30:00Z");
  assert.deepEqual(TASKS.task.fromTree(tree), approved, "both ways");
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("sketch", { ref: "a" }), el("sketch", { ref: "b" })) }), /<task> has one <sketch>/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("asks", { world: "w/world.tsx", reach: 3 })) }), /<asks>: reach is not read/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("sketch", {})) }), /<sketch> needs ref/);
});

test("a change proposal in JSX: each file it changes is one <change file base proposed>, in order, both ways", () => {
  const BASE = "a".repeat(64);
  const file = el(
    "task",
    { id: "thinner", title: "Thinner plate", status: "proposed", assignees: ["agent:claude"], __source: 0 },
    el("change", { file: "../cad/Plate.3d.tsx", base: BASE, proposed: "Thinner plate/Plate.3d.tsx", __source: 1 }),
    el("change", { file: "../ee/Divider.sch.tsx", base: "b".repeat(64), proposed: "Thinner plate/Divider.sch.tsx" }),
  );
  const { document } = declarationOf({ default: file });
  assert.deepEqual(document!.sources, { "": 0, "change#../cad/Plate.3d.tsx": 1 });
  const doc = document!.document as Record<string, unknown>;
  assert.deepEqual(doc.changes, [
    { file: "../cad/Plate.3d.tsx", base: BASE, proposed: "Thinner plate/Plate.3d.tsx" },
    { file: "../ee/Divider.sch.tsx", base: "b".repeat(64), proposed: "Thinner plate/Divider.sch.tsx" },
  ]);
  assert.deepEqual(TASKS.task.fromTree(TASKS.task.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("change", { file: "x.3d.tsx", base: "HEAD", proposed: "y.3d.tsx" })) }), /base is the content id/);
  assert.throws(() => declarationOf({ default: el("task", { id: "a" }, el("change", { file: "x.3d.tsx", base: BASE })) }), /<change file="x.3d.tsx"> needs proposed/);
});

test("times: a date, a UTC time or epoch ms in; a date or a UTC time out", () => {
  assert.equal(timeOf("2026-10-20", "t"), Date.UTC(2026, 9, 20));
  assert.equal(timeOf("2026-10-20T14:30:00Z", "t"), Date.UTC(2026, 9, 20, 14, 30));
  assert.equal(timeOf(1, "t"), 1);
  assert.equal(timeText(Date.UTC(2026, 9, 20, 14, 30)), "2026-10-20T14:30:00Z");
  assert.equal(timeText(Date.UTC(2026, 9, 20, 14, 30, 0, 5)), "2026-10-20T14:30:00.005Z");
  assert.throws(() => timeOf("20/10/2026", "dueAt"), /dueAt is a date/);
});

test("a project in JSX: its views are <view> children; its fields are attributes", () => {
  const file = el(
    "project",
    { id: "launch", name: "Launch", glyph: "R", archived: false },
    el("view", { id: "board", name: "Board", mode: "board", groupBy: "status" }),
    el("view", { id: "due", name: "By date", mode: "timeline", groupBy: "due", filter: { includeClosed: true } }),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "project");
  assert.deepEqual(doc.document, {
    id: "launch",
    name: "Launch",
    glyph: "R",
    archived: false,
    views: [
      { id: "board", name: "Board", mode: "board", groupBy: "status" },
      { id: "due", name: "By date", mode: "timeline", groupBy: "due", filter: { includeClosed: true } },
    ],
  });
  assert.deepEqual(TASKS.project.fromTree(TASKS.project.toTree(doc.document as never)), doc.document, "both ways");
  assert.throws(() => declarationOf({ default: el("project", { id: "p" }, el("view", { id: "v", colour: "red" })) }), /<view id="v">: colour is not read/);
});
