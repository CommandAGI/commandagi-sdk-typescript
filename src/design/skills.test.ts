// A skill in JSX declares the SkillDoc a symbolic agent's runtime reads (docs/symbolic-agents.md, in the CommandAGI
// repository), and a literal script declares its result. Pinned here: the steps keep the order written, a step is one
// kind, and what the vocabulary has no words for is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { SKILLS, declarationOf, jsx, result } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, children });
const declare = (root: unknown, inputs: Record<string, unknown> = {}) => declarationOf({ default: () => root }, inputs).document!;

test("a skill with a phrase, a tool step, a literal script, a reply, a rule and an example; and both ways", () => {
  const doc = declare(
    el("skill", { about: "How many lines of a file say error.", needs: ["file(?file)"], gives: ["counted(?file)"] },
      el("phrase", { match: "count [the] errors in {file:path}" }),
      el("step", { tool: "read_file", args: { path: "{file}" }, as: "read" }),
      el("step", { script: "./count.ts", args: { text: "{read.text}", word: "error" }, as: "n" }),
      el("step", { tool: "close_channel", args: { session: "{s}" }, always: true }),
      el("reply", { text: "{file} has {n} lines that say error." }),
      el("rule", { if: ["counted(?f)", "not flagged(?f)"], then: "clean(?f)" }),
      el("fact", { is: "file(log.txt)" }),
      el("example", { say: "count errors in log.txt", reply: "log.txt has 2 lines that say error." })),
  );
  assert.equal(doc.format, "skill");
  assert.deepEqual(doc.document, {
    about: "How many lines of a file say error.", needs: ["file(?file)"], gives: ["counted(?file)"],
    phrases: [{ match: "count [the] errors in {file:path}" }],
    steps: [{ tool: "read_file", args: { path: "{file}" }, as: "read" }, { script: "./count.ts", args: { text: "{read.text}", word: "error" }, as: "n" }, { tool: "close_channel", args: { session: "{s}" }, always: true }],
    reply: "{file} has {n} lines that say error.",
    rules: [{ if: ["counted(?f)", "not flagged(?f)"], then: "clean(?f)" }],
    facts: ["file(log.txt)"],
    examples: [{ say: "count errors in log.txt", reply: "log.txt has 2 lines that say error." }],
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
  assert.throws(() => declare(el("skill", {}, el("phrase", {}))), /needs match/);
  assert.throws(() => declare(el("skill", { gives: "at(arm, home)" })), /gives is a list of facts/);
  assert.throws(() => declare(el("skill", {}, el("rule", { if: [], then: "x" }))), /if is a fact or a list of facts/);
  assert.throws(() => declare(el("skill", {}, el("reply", { text: "a" }), el("reply", { text: "b" }))), /has one <reply>/);
  assert.throws(() => declare(el("skill", {}, el("harness", { kind: "program", label: "x" }))), /stands in|not a tag of a skill/);
  assert.throws(() => declare(el("result", {})), /needs value/);
  assert.throws(() => declare(el("result", { value: () => 1 })), /plain data/);
});
