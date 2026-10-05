// A company, an RFC and a case in JSX read as the native documents (the `.company`, the `.rfc` draft, the `.case`
// draft), with each element's __source by path; an unknown attribute or child is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { Books, CapTable, Case, Change, Company, Entity, Harm, Option, Registration, Relief, Rfc, declaredDocument, jsx } from "./index.js";

test("a <Company> is the .company document: entity, the standard's refs, registrations; sources by path", () => {
  const tree = jsx(Company, {
    __source: 0,
    name: "Northwind",
    files: ["Northwind/"],
    children: [
      jsx(Entity, { __source: 1, jurisdiction: "US-DE", form: "llc", formed: "2024-01-31", ids: { ein: "12-3" } }),
      jsx(Books, { __source: 2, journal: "Northwind/books/main.journal" }),
      jsx(CapTable, { __source: 3, ocf: "Northwind/captable/" }),
      jsx(Registration, { __source: 4, kind: "tax-id", jurisdiction: "US", id: "12-3" }),
    ],
  });
  const d = declaredDocument({ default: () => tree });
  assert.equal(d.kind, "company");
  assert.deepEqual(d.document, {
    format: "commandagi-company",
    name: "Northwind",
    about: "",
    files: ["Northwind/"],
    dashboard: null,
    entity: { jurisdiction: "US-DE", form: "llc", name: null, formed: "2024-01-31", fiscalYearEnd: null, ids: { ein: "12-3" }, operatesIn: [] },
    standard: {
      enabled: true,
      books: "Northwind/books/main.journal",
      captable: "Northwind/captable/",
      people: null,
      calendar: null,
      registrations: [{ kind: "tax-id", jurisdiction: "US", id: "12-3" }],
      matters: null,
    },
  });
  assert.deepEqual(d.sources, { "": 0, entity: 1, books: 2, captable: 3, "registrations/0": 4 });
  assert.deepEqual((declaredDocument({ default: jsx(Company, { name: "Bare" }) }).document as { standard: unknown }).standard, { enabled: false }, "no part named: the standard is off");
});

test("an <Rfc> is its draft and, once opened, its id; a <Case> is its harms and relief", () => {
  const rfc = declaredDocument({
    default: jsx(Rfc, { id: "rfc_1", title: "Rest", children: jsx(Option, { title: "Ten hours", children: jsx(Change, { __source: 7, op: "set_parameter", parameter: "rfcDepositCents", value: "500" }) }) }),
  });
  assert.deepEqual(rfc.document, { id: "rfc_1", draft: { title: "Rest", options: [{ title: "Ten hours", changes: [{ op: "set_parameter", key: "rfcDepositCents", value: "500" }] }] } });
  assert.deepEqual(rfc.sources, { "options/0/changes/0": 7 });
  const kase = declaredDocument({ default: jsx(Case, { respondent: "Acme", children: [jsx(Harm, { id: "h1", interest: "property", amount: "4200" }), jsx(Relief, { kind: "restitution", harmIds: ["h1"] })] }) });
  assert.deepEqual(kase.document, { draft: { respondent: "Acme", harms: [{ id: "h1", interest: "property", amount: "4200" }], relief: [{ kind: "restitution", harmIds: ["h1"] }] } });
});

test("what the vocabulary does not say is refused by name", () => {
  const run = (v: unknown) => () => declaredDocument({ default: v });
  assert.throws(run(jsx(Company, { name: "X", mailbox: "a@b" })), /<Company> has no attribute mailbox/);
  assert.throws(run(jsx(Company, { name: "X", children: jsx(Harm, { id: "h" }) })), /<Company> does not take <Harm>/);
  assert.throws(run(jsx(Company, { name: "X", children: [jsx(Books, { journal: "a" }), jsx(Books, { journal: "b" })] })), /two <Books>/);
  assert.throws(run(jsx(Company, {})), /<Company> needs name/);
  assert.throws(run(jsx(Company, { name: "X", files: "X/" })), /files is a list of text/);
  assert.throws(run(jsx("group", { name: "X" })), /declares no company, RFC or case/);
});
