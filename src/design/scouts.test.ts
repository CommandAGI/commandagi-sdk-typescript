// A scout's comparison and a replacement-cost analysis in JSX declare the documents the scout runner and the
// replacement reader take (docs/scouts.md, in the CommandAGI repository). Pinned here: both ways give the same
// document, and what would make a run dishonest is refused by name (a customer's case, a case with two scorers, two
// incumbents, a check with no kind).
import assert from "node:assert/strict";
import { test } from "node:test";

import { SCOUTS, declarationOf, jsx } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, children });
const declare = (root: unknown) => declarationOf({ default: () => root }).document!;

const comparison = (caseProps: Record<string, unknown> = {}, more: unknown[] = []) =>
  el("scout", { title: "GLM against Sonnet", budget: 10, repeats: 3 },
    el("configuration", { id: "sonnet", model: "anthropic/claude-sonnet-5-5", effort: "low", incumbent: true }),
    el("configuration", { id: "glm", model: "dashscope/glm-5.3" }),
    el("workload", { id: "knowledge", title: "Knowledge work", sample: 20, needs: ["structured"] },
      el("case", { id: "rate", from: "synthetic", prompt: "What is 4.2% as a decimal?", check: { number: 0.042, tolerance: 0.0005 }, ...caseProps }),
      el("case", { id: "page", from: "own-run", source: "runs/thread-1/streams/chat@a/records.jsonl#12", prompt: "Write the provider page.", rubric: "Names the price and the terms." })),
    el("judge", { model: "openai/gpt-5.6-terra" }),
    ...more);

test("a comparison declares its configurations, workloads with their cases, and judges; and both ways", () => {
  const doc = declare(comparison());
  assert.equal(doc.format, "scout");
  assert.deepEqual(doc.document, {
    title: "GLM against Sonnet", budget: 10, repeats: 3,
    configurations: [{ id: "sonnet", model: "anthropic/claude-sonnet-5-5", effort: "low", incumbent: true }, { id: "glm", model: "dashscope/glm-5.3" }],
    workloads: [{ id: "knowledge", title: "Knowledge work", sample: 20, needs: ["structured"], cases: [
      { id: "rate", from: "synthetic", prompt: "What is 4.2% as a decimal?", check: { number: 0.042, tolerance: 0.0005 } },
      { id: "page", from: "own-run", source: "runs/thread-1/streams/chat@a/records.jsonl#12", prompt: "Write the provider page.", rubric: "Names the price and the terms." },
    ] }],
    judges: [{ model: "openai/gpt-5.6-terra" }],
  });
  const v = SCOUTS.scout;
  assert.deepEqual(v.fromTree(v.toTree(doc.document as never)), doc.document);
  assert.ok(doc.sources !== undefined);
});

test("a comparison refuses what would make its verdict dishonest", () => {
  assert.throws(() => declare(comparison({ from: "customer" })), /from is one of public, synthetic, own-run/);
  assert.throws(() => declare(comparison({ rubric: "and a judge" })), /exactly one of check .* or rubric/);
  assert.throws(() => declare(comparison({ check: { tolerance: 1 } })), /check is exactly one of/);
  assert.throws(() => declare(comparison({ check: { exact: "a", contains: ["b"] } })), /it has exact and contains/);
  assert.throws(() => declare(comparison({ check: { regex: "(" } })), /not a regular expression/);
  assert.throws(() => declare(comparison({}, [el("configuration", { id: "third", model: "openai/gpt-6-luna", incumbent: true })])), /one incumbent/);
  assert.throws(() => declare(el("scout", { budget: 0 })), /budget is a number above 0/);
  assert.throws(() => declare(el("scout", { title: "no budget" })), /needs budget/);
  assert.throws(() => declare(el("scout", { budget: 5 }, el("case", { id: "x", from: "public", prompt: "p", check: { exact: "1" } }))), /<case> stands in <workload>/);
});

test("a tool case offers its tools and their answers", () => {
  const tools = [
    { name: "get_capital", parameters: { type: "object", properties: { country: { type: "string" } } }, results: [{ when: { country: "france" }, result: "Paris" }] },
    { name: "send_email", description: "send an email", parameters: { type: "object" } },
  ];
  const doc = declare(el("scout", { budget: 1 },
    el("configuration", { id: "a", model: "x/a" }),
    el("workload", { id: "agentic" },
      el("case", { id: "chain", from: "synthetic", prompt: "p", tools, turns: 4, check: { number: 4280000 } }),
      el("case", { id: "first", from: "synthetic", prompt: "p", tools, check: { tool: "send_email" } }),
      el("case", { id: "mc", from: "public", source: "TIGER-Lab/MMLU-Pro test 12", prompt: "p", check: { letter: "I" } }),
      el("case", { id: "crux", from: "public", prompt: "p", check: { literal: "[1, 'a']" } }))));
  const w = (doc.document as { workloads: { cases: { tools?: unknown; turns?: number }[] }[] }).workloads[0]!;
  assert.deepEqual(w.cases[0]!.tools, tools);
  assert.equal(w.cases[0]!.turns, 4);
  const one = (props: Record<string, unknown>) => declare(el("scout", { budget: 1 }, el("workload", { id: "w" }, el("case", { id: "c", from: "synthetic", prompt: "p", ...props }))));
  assert.throws(() => one({ check: { tool: "send_email" } }), /tool needs the case's tools/);
  assert.throws(() => one({ check: { letter: "ab" } }), /letter is one capital letter/);
  assert.throws(() => one({ check: { exact: "x" }, turns: 3 }), /turns goes with tools/);
  assert.throws(() => one({ check: { exact: "x" }, tools: [{ name: "a b", parameters: {} }] }), /a tool's name is a word/);
  assert.throws(() => one({ check: { exact: "x" }, tools: [{ name: "a", parameters: {}, results: [{ when: { x: 1 }, result: "r" }] }] }), /a result is/);
  // A `program` check evaluates an expression in x against its data; its shape is checked.
  const prog = declare(el("scout", { budget: 1 }, el("workload", { id: "w" }, el("case", { id: "c", from: "synthetic", prompt: "p", check: { program: { data: [[1, 4], [2, 7], [5, 16]] } } }))));
  assert.deepEqual((prog.document as { workloads: { cases: { check: unknown }[] }[] }).workloads[0]!.cases[0]!.check, { program: { data: [[1, 4], [2, 7], [5, 16]] } });
  assert.throws(() => one({ check: { program: { data: [] } } }), /program is { data: \[\[x, y\], …\] }/);
  assert.throws(() => one({ check: { program: { data: [[1, 4], [2]] } } }), /program is { data: \[\[x, y\], …\] }/);
  assert.throws(() => one({ check: { program: { data: [[1, 4]], tolerance: -1 } } }), /program tolerance is a number of 0 or more/);
  // A `document` check reads the answer as one of our documents: the file it must be, and what it must say.
  const docCheck = { document: { as: "world.tsx", expect: { kind: "simulation" } } };
  const code = declare(el("scout", { budget: 1 }, el("workload", { id: "w" }, el("case", { id: "c", from: "synthetic", prompt: "p", check: docCheck }))));
  assert.deepEqual((code.document as { workloads: { cases: { check: unknown }[] }[] }).workloads[0]!.cases[0]!.check, docCheck);
  assert.throws(() => one({ check: { document: { as: "result.txt" } } }), /the file a document's own reader knows by its extension/);
  assert.throws(() => one({ check: { document: { as: "world.tsx", expect: [] } } }), /document expect is the object the document must hold/);
});

test("a replacement analysis declares its layers, capabilities with evidence, and its decision; and both ways", () => {
  const doc = declare(
    el("replacement", { product: "beehiiv", vendor: "beehiiv, Inc.", url: "https://www.beehiiv.com", asOf: "2026-10-14", by: "scout" },
      el("layer", { kind: "invisible", title: "Deliverability" },
        el("capability", { id: "bulk-send", title: "3M+ emails a minute", need: "must", have: "none", effort: "XL", run: 2000, labour: 160, note: "ESP or own MTAs" },
          el("evidence", { source: "beehiiv checklist", claim: "reported" })),
        el("capability", { id: "abuse", title: "signup validation", need: "must", have: "partial", effort: "L", ref: "docs/moderation.md" })),
      el("layer", { kind: "visible", title: "Editor" },
        el("capability", { id: "collab", title: "real-time collaboration", need: "should", have: "partial", effort: "M" })),
      el("layer", { kind: "visible", title: "Website" }),
      el("decision", { choice: "skip", because: "The invisible layer is the product." }),
      el("differentiation", { text: "Agents author the newsletter as code." }),
      el("economics", { price: "$49 a month", margin: "unknown" })),
  );
  assert.equal(doc.format, "replacement");
  const d = doc.document as { layers: { title: string; capabilities: { id: string; evidence: unknown[] }[] }[]; decision: unknown; differentiation: string; economics: unknown };
  assert.deepEqual(d.layers.map((l) => l.title), ["Deliverability", "Editor", "Website"]);
  assert.deepEqual(d.layers[0]!.capabilities[0], { id: "bulk-send", title: "3M+ emails a minute", need: "must", have: "none", effort: "XL", run: 2000, labour: 160, note: "ESP or own MTAs", evidence: [{ source: "beehiiv checklist", claim: "reported" }] });
  assert.deepEqual(d.decision, { choice: "skip", because: "The invisible layer is the product." });
  assert.equal(d.differentiation, "Agents author the newsletter as code.");
  assert.deepEqual(d.economics, { price: "$49 a month", margin: "unknown" });
  const v = SCOUTS.replacement;
  assert.deepEqual(v.fromTree(v.toTree(doc.document as never)), doc.document);
});

test("a replacement analysis refuses a value its sums cannot read", () => {
  const one = (props: Record<string, unknown>) => el("replacement", { product: "p", asOf: "2026-10-14" }, el("layer", { kind: "visible", title: "V" }, el("capability", { id: "c", title: "t", need: "must", have: "none", ...props })));
  assert.throws(() => declare(one({ need: "nice" })), /need is one of must, should, later/);
  assert.throws(() => declare(one({ have: "some" })), /have is one of built, partial, none/);
  assert.throws(() => declare(one({ effort: "XXL" })), /effort is one of S, M, L, XL/);
  assert.throws(() => declare(one({ run: "ESP or own MTAs" })), /run is a number of 0 or more/);
  assert.throws(() => declare(el("replacement", { product: "p", asOf: "October" })), /asOf is a day/);
  assert.throws(() => declare(el("replacement", { product: "p", asOf: "2026-10-14" }, el("layer", { kind: "hidden", title: "H" }))), /kind is one of visible, invisible/);
  assert.throws(() => declare(el("replacement", { product: "p", asOf: "2026-10-14" }, el("decision", { choice: "maybe", because: "x" }))), /choice is one of build, buy, integrate, skip/);
});
