// A skill in JSX declares the SkillDoc an agent's runtime reads (packages/domain/world/symbolic/skills.js, in the
// CommandAGI repository), and a literal script declares its result. Pinned here: the steps keep the order written, a
// step is one kind, and what the vocabulary has no words for (a phrase, an example, a rule) is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { SKILLS, declarationOf, jsx, result } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, children });
const declare = (root: unknown, inputs: Record<string, unknown> = {}) => declarationOf({ default: () => root }, inputs).document!;

test("a skill with a tool step, a literal script, an always step and a reply; and both ways", () => {
  const doc = declare(
    el("skill", { about: "How many lines of a file say error.", origin: "frozen:cua" },
      el("step", { tool: "read_file", args: { path: "{file}" }, as: "read" }),
      el("step", { script: "./count.ts", args: { text: "{read.text}", word: "error" }, as: "n" }),
      el("step", { tool: "close_channel", args: { session: "{s}" }, always: true }),
      el("reply", { text: "{file} has {n} lines that say error." })),
  );
  assert.equal(doc.format, "skill");
  assert.deepEqual(doc.document, {
    about: "How many lines of a file say error.", origin: "frozen:cua",
    steps: [{ tool: "read_file", args: { path: "{file}" }, as: "read" }, { script: "./count.ts", args: { text: "{read.text}", word: "error" }, as: "n" }, { tool: "close_channel", args: { session: "{s}" }, always: true }],
    reply: "{file} has {n} lines that say error.",
  });
  assert.deepEqual(SKILLS.skill.fromTree(SKILLS.skill.toTree(doc.document as never)), doc.document);
});

test("a literal script declares its result from its inputs", () => {
  const script = ({ text, word }: { text: string; word: string }) => el("result", { value: text.split("\n").filter((l) => l.includes(word)).length });
  const out = declarationOf({ default: script }, { text: "an error\nfine\nerror again", word: "error" }).document!;
  assert.deepEqual([out.format, out.document], ["result", { value: 2 }]);
  assert.deepEqual(declarationOf({ default: ({ n }: { n: number }) => result([n, n * 2]) }, { n: 3 }).document!.document, { value: [3, 6] }, "result(value) is <result value={value} />");
  assert.deepEqual(declare(el("result", { value: { blobs: [{ area: 4 }], ok: false } })).document, { value: { blobs: [{ area: 4 }], ok: false } });
});

test("refusals, by name", () => {
  assert.throws(() => declare(el("skill", {}, el("step", { tool: "read_file", expr: "x" }))), /exactly one of expr, tool, script, skill, see \(it has expr and tool\)/);
  assert.throws(() => declare(el("skill", {}, el("step", { as: "x" }))), /exactly one of/);
  assert.throws(() => declare(el("skill", {}, el("step", { tool: "read_file", args: ["x"] }))), /args is an object/);
  assert.throws(() => declare(el("skill", {}, el("reply", { text: "a" }), el("reply", { text: "b" }))), /has one <reply>/);
  // Free text is read only by a model agent: a skill has no phrase to match or example utterance to check.
  for (const [tag, props] of [["phrase", { match: "count errors in {file:path}" }], ["example", { say: "count errors", reply: "2" }], ["rule", { if: "a", then: "b" }], ["fact", { is: "a" }]] as const)
    assert.throws(() => declare(el("skill", {}, el(tag, props))), /stands in|not a tag of a skill/, tag);
  assert.throws(() => declare(el("skill", { gives: ["at(arm, home)"] })), /gives/);
  assert.throws(() => declare(el("skill", {}, el("harness", { kind: "program", label: "x" }))), /stands in|not a tag of a skill/);
  assert.throws(() => declare(el("result", {})), /needs value/);
  assert.throws(() => declare(el("result", { value: () => 1 })), /plain data/);
});
