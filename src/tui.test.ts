import { test } from "node:test";
import assert from "node:assert/strict";
import { Transcript, parseInput } from "./tui.js";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

function transcript() {
  const out: string[] = [];
  return { t: new Transcript((s) => out.push(s)), text: () => plain(out.join("")) };
}

test("a streamed reply types itself: each delta prints only what is new, and the commit closes the line", () => {
  const { t, text } = transcript();
  t.apply({ t: "message.delta", id: "m1", text: "", thinking: true });
  t.apply({ t: "message.delta", id: "m1", text: "Hel" });
  t.apply({ t: "message.delta", id: "m1", text: "Hello, wor" });
  t.apply({ t: "message.delta", id: "m1", text: "Hello, wor" }); // a repeat prints nothing
  t.apply({ t: "message", id: "m1", role: "agent", text: "Hello, world." });
  assert.equal(text(), "agent › Hello, world.\n");
});

test("a committed message with no draft prints whole; the user's own line is not echoed twice", () => {
  const { t, text } = transcript();
  t.apply({ t: "message", id: "u1", role: "user", text: "hi" });
  t.apply({ t: "message", id: "a1", role: "agent", text: "hello", senderName: "Ada" });
  t.apply({ t: "message", id: "s1", role: "system", text: "Snapshot saved" });
  assert.equal(text(), "Ada › hello\nsystem › Snapshot saved\n");
});

test("a deleted draft is marked interrupted; status tracks the live turn", () => {
  const { t, text } = transcript();
  t.apply({ t: "agent.status", state: "tool", label: "Editing report.md…" });
  assert.equal(t.status, "Editing report.md…");
  t.apply({ t: "message.delta", id: "m2", text: "Work" });
  t.apply({ t: "message.delete", id: "m2" });
  t.apply({ t: "agent.status", state: "idle" });
  assert.equal(t.status, "");
  assert.equal(text(), "agent › Work (interrupted)\n");
});

test("input: text for the agent, slash commands with their argument", () => {
  assert.deepEqual(parseInput("  summarise the news "), {
    kind: "text",
    text: "summarise the news",
  });
  assert.deepEqual(parseInput("/open 3"), { kind: "command", name: "open", arg: "3" });
  assert.deepEqual(parseInput("/launch  simulation/warehouse "), {
    kind: "command",
    name: "launch",
    arg: "simulation/warehouse",
  });
  assert.deepEqual(parseInput("/quit"), { kind: "command", name: "quit", arg: "" });
  assert.deepEqual(parseInput("   "), { kind: "empty" });
});
