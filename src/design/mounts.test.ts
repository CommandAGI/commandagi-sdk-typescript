// A thread's mounts in JSX declare the document the platform's task loop reads. Pinned here: each mount is its record
// both ways, one task or a list; a mount that names both, or nothing, or a bad assignee or status, is refused with why.
// The Python SDK's tests/test_mounts.py and the Rust SDK's tests/mounts.rs declare the same example.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, MOUNTS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const EXAMPLE = {
  mounts: [
    { label: "launch", folder: "../../Tasks/launch" },
    { label: "ship it", task: "../../Tasks/Ship it.task.tsx" },
    { label: "owner inbox", assignee: "user:u_1", status: ["todo", "doing", "blocked"] },
  ],
};

test("a thread's mounts in JSX: each <mount> is one record, its fields the attributes, each __source by its label", () => {
  const file = el(
    "mounts",
    { __source: 0 },
    el("mount", { label: "launch", folder: "../../Tasks/launch", __source: 1 }),
    el("mount", { label: "ship it", task: "../../Tasks/Ship it.task.tsx" }),
    el("mount", { label: "owner inbox", assignee: "user:u_1", status: ["todo", "doing", "blocked"] }),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {}, "mounts leave beside an empty graph");
  assert.equal(document!.format, "mounts");
  assert.deepEqual(document!.sources, { "": 0, "mount#launch": 1 });
  assert.deepEqual(document!.document, EXAMPLE);
  assert.deepEqual(MOUNTS.mounts.fromTree(MOUNTS.mounts.toTree(EXAMPLE)), EXAMPLE, "both ways");
});

test("a mount that does not read is refused with why", () => {
  const bad = (attrs: Record<string, unknown>) => () => declarationOf({ default: el("mounts", {}, el("mount", attrs)) });
  assert.throws(bad({ label: "a", task: "x.task.tsx", folder: "Tasks" }), /mounts one task, or a list .*: not both/);
  assert.throws(bad({ label: "a" }), /mounts nothing/);
  assert.throws(bad({ label: "a", assignee: "ada" }), /assignee is user:<id> or agent:<id>/);
  assert.throws(bad({ label: "a", status: ["later"] }), /status is a list of proposed, todo, doing/);
  assert.throws(bad({ label: "a", labels: [""] }), /labels is a list of texts/);
  assert.throws(bad({ label: "x".repeat(201), folder: "Tasks" }), /label is a short text/);
  assert.throws(bad({ folder: "Tasks" }), /needs label/);
  assert.throws(() => declarationOf({ default: el("mounts", {}, el("mount", { label: "a", folder: "x" }), el("mount", { label: "a", folder: "y" })) }), /two <mount> in <mounts> have label "a"/);
});
