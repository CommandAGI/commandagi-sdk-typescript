// A harness and an agent in JSX declare the HarnessDoc and AgentDoc of docs/agents.md (the CommandAGI repository).
// Pinned here: a base names its harness, a fork names its parent, never both; a program harness needs no model; what
// the vocabulary has no words for is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { AGENTS, declarationOf, jsx } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}) => jsx(tag, props);
const declare = (root: unknown) => declarationOf({ default: () => root }).document!;

test("a harness of each kind, and both ways", () => {
  const cli = declare(el("harness", { kind: "cli", label: "Claude Code", provider: "anthropic", cli: "claude", runs: ["host", "vm"] }));
  assert.equal(cli.format, "harness");
  assert.deepEqual(cli.document, { kind: "cli", label: "Claude Code", provider: "anthropic", cli: "claude", runs: ["host", "vm"] });
  const program = declare(el("harness", { kind: "program", label: "Symbolic Planner 001", family: "symbolic", experimental: true, runs: ["host"] }));
  assert.deepEqual(program.document, { kind: "program", label: "Symbolic Planner 001", family: "symbolic", experimental: true, runs: ["host"] }, "a program harness has no model and no provider");
  const single = declare(el("harness", { kind: "api", label: "ScaleDown Classify-1", provider: "scaledown", tasks: ["classify", "decide"], family: "system-one", experimental: true, runs: ["host"] }));
  assert.deepEqual(single.document, { kind: "api", label: "ScaleDown Classify-1", provider: "scaledown", runs: ["host"], tasks: ["classify", "decide"], family: "system-one", experimental: true }, "a single-task model's harness says its tasks");
  for (const doc of [cli.document, program.document, single.document]) assert.deepEqual(AGENTS.harness.fromTree(AGENTS.harness.toTree(doc as never)), doc);
});

test("a base names its harness; a fork names its parent", () => {
  const base = declare(el("agent", { harness: "anthropic", model: "anthropic/claude-opus-5-5", effort: "medium", name: "Claude Opus 5.5" }));
  assert.deepEqual(base.document, { harness: "anthropic", model: "anthropic/claude-opus-5-5", effort: "medium", name: "Claude Opus 5.5" });
  assert.throws(() => declare(el("agent", { harness: "anthropic", effort: "" })), /effort is a word/);
  assert.equal(declare(el("agent", { parent: "cloud://global/agents/claude-code", supervisor: "agent:lead" })).document.supervisor, "agent:lead");
  assert.throws(() => declare(el("agent", { parent: "cloud://global/agents/claude-code", supervisor: "lead" })), /supervisor is an agent or a person/);
  const fork = declare(el("agent", { parent: "cloud://global/agents/claude-code", name: "Joe's secretary", instructions: "Keep Joe's calendar.\nAsk before booking.", tools: ["calendar_save_event"] }));
  assert.deepEqual(fork.document, { parent: "cloud://global/agents/claude-code", name: "Joe's secretary", instructions: "Keep Joe's calendar.\nAsk before booking.", tools: ["calendar_save_event"] });
  assert.deepEqual(AGENTS.agent.fromTree(AGENTS.agent.toTree(fork.document as never)), fork.document);
});

test("refusals, by name", () => {
  assert.throws(() => declare(el("agent", { name: "x" })), /names its harness .* or its parent/);
  assert.throws(() => declare(el("agent", { harness: "codex", parent: "../a" })), /not both: a fork keeps its parent's harness/);
  assert.throws(() => declare(el("agent", { harness: "Codex CLI" })), /harness is a harness's id/);
  assert.throws(() => declare(el("agent", { parent: "../a", voiceMode: "loud" })), /voiceMode is/);
  assert.throws(() => declare(el("agent", { parent: "../a", tools: "all" })), /tools is a list/);
  assert.throws(() => declare(el("harness", { kind: "cli", label: "X" })), /names the program it starts/);
  assert.throws(() => declare(el("harness", { kind: "api", label: "X" })), /names its provider/);
  assert.throws(() => declare(el("harness", { kind: "program", label: "X", cli: "x" })), /cli is for kind="cli" only/);
  assert.throws(() => declare(el("harness", { kind: "api", label: "X", provider: "p", runs: ["cloud"] })), /runs is a list of/);
  assert.throws(() => declare(el("harness", { kind: "robot", label: "X" })), /kind is/);
  assert.throws(() => declare(el("harness", { kind: "program", label: "X", experimental: "yes" })), /experimental is true or false/);
  assert.throws(() => declare(el("harness", { kind: "api", label: "X", provider: "p", tasks: ["chat"] })), /tasks is a list of/);
  assert.throws(() => declare(el("harness", { kind: "program", label: "X", tasks: ["classify"] })), /tasks is for kind="api" only/);
});

test("a realtime harness says what its model takes and gives live, and the bounds it holds to", () => {
  const realtime = { in: ["audio", "video", "text"], out: ["audio", "text", "tools"], audio: { in: ["g711-ulaw@8000", "pcm16@24000"], out: ["g711-ulaw@8000"] }, fps: 1, hz: 2, minutes: 60 };
  const h = declare(el("harness", { kind: "api", label: "OpenAI Realtime API", provider: "openai", runs: ["worker", "host"], realtime }));
  assert.deepEqual((h.document as { realtime: unknown }).realtime, realtime);
  assert.deepEqual(AGENTS.harness.fromTree(AGENTS.harness.toTree(h.document as never)), h.document);
  const api = (r: unknown, more: Record<string, unknown> = {}) => declare(el("harness", { kind: "api", label: "X", provider: "p", realtime: r, ...more }));
  assert.throws(() => api({ ...realtime, fps: undefined }), /fps is the most video frames/);
  assert.throws(() => api({ ...realtime, hz: 0 }), /hz is the most tool calls/);
  assert.throws(() => api({ in: ["audio"], out: ["text"] }), /audio names the formats/);
  assert.throws(() => api({ in: ["smell"], out: ["text"] }), /in is a list of/);
  assert.throws(() => api({ ...realtime, latency: 1 }), /has no field latency/);
  assert.throws(() => api(realtime, { tasks: ["act"] }), /realtime is for kind="api" with no tasks/);
});
