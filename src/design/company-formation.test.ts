// A company's <RegisteredAgent> children, a <Paper kind="filing">'s filing attributes and <Entity dissolved>, read as the company document's
// `registeredAgents`, `papers` and `entity.dissolved`. company-formation.golden.json is the golden of the three SDKs
// (sdk/python/tests/company_formation.json, sdk/rust/tests/company_formation.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Company, Entity, declarationOf, jsx } from "./index.js";

interface Part { tag: string; attrs: Record<string, unknown> }
const golden = JSON.parse(readFileSync(new URL("./company-formation.golden.json", import.meta.url), "utf8")) as {
  valid: { entity: Record<string, unknown>; children: Part[]; document: Record<string, unknown> }[];
  invalid: (Part & { error: string })[];
};
const company = (entity: Record<string, unknown>, children: Part[]) =>
  declarationOf({ default: () => jsx(Company, { name: "Acme", children: [jsx(Entity, entity), ...children.map((c) => jsx(c.tag, c.attrs))] }) }).document!.document as Record<string, unknown>;

test("a company's filings, registered agents and dissolution date, as the golden pins them", () => {
  for (const row of golden.valid) {
    const d = company(row.entity, row.children);
    assert.deepEqual(d.entity, row.document.entity);
    assert.deepEqual(d.papers ?? null, row.document.papers);
    assert.deepEqual(d.registeredAgents ?? null, row.document.registeredAgents);
  }
  for (const row of golden.invalid) assert.throws(() => company({ jurisdiction: "US-DE" }, [row]), new RegExp(row.error));
});
