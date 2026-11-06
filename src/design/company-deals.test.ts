// A company's deals, read as its document. company-deals.golden.json is the golden of the three SDKs
// (sdk/python/tests/company_deals.json, sdk/rust/tests/company_deals.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { declarationOf, jsx } from "./index.js";

interface Tree { tag: string; attrs: Record<string, unknown>; children?: Tree[] }
const element = (t: Tree): unknown => jsx(t.tag, { ...t.attrs, ...(t.children?.length ? { children: t.children.map(element) } : {}) });
const golden = JSON.parse(readFileSync(new URL("./company-deals.golden.json", import.meta.url), "utf8")) as {
  valid: { tree: Tree; document: unknown }[];
  invalid: { tree: Tree; error: string }[];
};

test("the deals are the company document's deals, in the file's order; a company that writes none has no deals field", () => {
  for (const row of golden.valid) {
    const d = declarationOf({ default: element(row.tree) }).document!;
    assert.equal(d.format, "company");
    assert.deepEqual(d.document, row.document);
  }
});

test("what a deal does not say is refused by name", () => {
  for (const row of golden.invalid) assert.throws(() => declarationOf({ default: element(row.tree) }), new RegExp(row.error));
});
