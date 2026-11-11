// A company's legal profile: its website, email and phone, its <Address>, <Stock> and <Owner> children, read as the company
// document's fields. company-profile.golden.json is the golden of the three SDKs (sdk/python/tests/company_profile.json,
// sdk/rust/tests/company_profile.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { Company, declarationOf, jsx } from "./index.js";

interface Part { tag: string; attrs: Record<string, unknown> }
const golden = JSON.parse(readFileSync(new URL("./company-profile.golden.json", import.meta.url), "utf8")) as {
  valid: { company: Record<string, unknown>; children: Part[]; document: Record<string, unknown> }[];
  invalid: (Part & { error: string })[];
};
const company = (props: Record<string, unknown>, children: Part[]) =>
  declarationOf({ default: () => jsx(Company, { ...props, children: children.map((c) => jsx(c.tag, c.attrs)) }) }).document!.document as Record<string, unknown>;

test("a company's legal profile, as the golden pins it", () => {
  for (const row of golden.valid) {
    const d = company(row.company, row.children);
    for (const [field, want] of Object.entries(row.document)) assert.deepEqual(d[field] ?? null, want, field);
  }
  for (const row of golden.invalid)
    assert.throws(() => company({ name: "Acme" }, [{ tag: "Entity", attrs: { jurisdiction: "US-DE" } }, row]), new RegExp(row.error));
});
