import assert from "node:assert/strict";
import { test } from "node:test";
import { ROUTING, declarationOf, jsx } from "./index.js";

test("routing knowledge declares priors, rules, prices and observations as one code document", () => {
  const element = jsx("routing", { children: [
    jsx("prior", { id: "abstract-codex", region: "abstract", harness: "codex", quality: 0.75, evidence: "reported" }),
    jsx("rule", { id: "cli-only", deny: true, reason: "CLI login only" }),
    jsx("price", { id: "api-model", model: "provider/model", inputPerMillion: 1.2 }),
    jsx("observation", { id: "sample", count: 4, cost: 0.2, evidence: "checked" }),
  ] });
  const declared = declarationOf({ default: () => element });
  const doc = declared.document as { format: string; document: any };
  assert.equal(doc.format, "routing");
  assert.equal(doc.document.priors[0].id, "abstract-codex");
  assert.equal(doc.document.rules[0].deny, true);
  assert.equal(doc.document.prices[0].inputPerMillion, 1.2);
  assert.equal(doc.document.observations[0].count, 4);
  assert.deepEqual(ROUTING.routing.fromTree(ROUTING.routing.toTree(doc.document)), doc.document);
  assert.throws(() => declarationOf({ default: () => jsx("routing", { children: [jsx("rule", { id: "dup" }), jsx("rule", { id: "dup" })] }) }), /two <rule> in <routing>/);
});
