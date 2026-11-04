// A company, an RFC and a case in JSX read as the native documents (the `.company`, the `.rfc` draft, the `.case`
// draft), with each element's __source by path; an unknown attribute or child is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { Books, CapTable, Case, Change, Company, Entity, Harm, Investment, Option, Paper, Registration, Relief, Rfc, Round, Signature, Subsidiary, Version, declarationOf, documentOf, jsx } from "./index.js";

/** What a module declares, as a run reads it: the document beside an empty graph. */
const declaredDocument = (mod: Record<string, unknown>) => declarationOf(mod).document!;

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
  assert.equal(d.format, "company");
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
  // An amount a file stored as a number stays a number (the form types text; both are kept as they are).
  const stored = declaredDocument({ default: jsx(Case, { children: [jsx(Harm, { id: "h1", amount: 4200 }), jsx(Relief, { kind: "exclusion", amount: 10.5, days: 30 })] }) });
  assert.deepEqual(stored.document, { draft: { harms: [{ id: "h1", amount: 4200 }], relief: [{ kind: "exclusion", amount: 10.5, days: 30 }] } });
  assert.throws(() => declaredDocument({ default: jsx(Case, { children: jsx(Harm, { id: "h1", amount: true }) }) }), /<Harm>: amount is text or a number, not true/);
});

test("what the vocabulary does not say is refused by name", () => {
  const run = (v: unknown) => () => declaredDocument({ default: v });
  assert.throws(run(jsx(Company, { name: "X", mailbox: "a@b" })), /<Company> has no attribute mailbox/);
  assert.throws(run(jsx(Company, { name: "X", children: jsx(Harm, { id: "h" }) })), /<Company> does not take <Harm>/);
  assert.throws(run(jsx(Company, { name: "X", children: [jsx(Books, { journal: "a" }), jsx(Books, { journal: "b" })] })), /two <Books>/);
  assert.throws(run(jsx(Company, {})), /<Company> needs name/);
  assert.throws(run(jsx(Company, { name: "X", files: "X/" })), /files is a list of text/);
  assert.equal(documentOf(jsx("group", { name: "X" })), null);
});

test("a group names its subsidiaries by ref and its papers with their signatures and versions (docs/company-substrate.md)", () => {
  const tree = jsx(Company, {
    name: "Acme",
    children: [
      jsx(Subsidiary, { file: "Acme UK.company.tsx", ownership: "100", since: "2026-01-10" }),
      jsx(Paper, {
        kind: "agreement", file: "Acme/Lease.pdf", status: "signed", parties: ["Acme Inc.", "Pier 9 LLC"], expires: "2027-01-31", renewal: "1 year", noticeDays: "90",
        children: [jsx(Signature, { party: "Acme Inc.", signer: "Ada Park", date: "2026-01-20", method: "wet" }), jsx(Version, { file: "Acme/Lease v1.pdf", date: "2026-01-02" })],
      }),
    ],
  });
  assert.deepEqual(declaredDocument({ default: () => tree }).document, {"format": "commandagi-company", "name": "Acme", "about": "", "files": [], "dashboard": null, "entity": null,
  "standard": {"enabled": false},
  "subsidiaries": [{"file": "Acme UK.company.tsx", "ownership": "100", "since": "2026-01-10"}],
  "papers": [{"kind": "agreement", "file": "Acme/Lease.pdf", "status": "signed", "parties": ["Acme Inc.", "Pier 9 LLC"], "expires": "2027-01-31", "renewal": "1 year", "noticeDays": "90",
              "signatures": [{"party": "Acme Inc.", "signer": "Ada Park", "date": "2026-01-20", "method": "wet"}],
              "versions": [{"file": "Acme/Lease v1.pdf", "date": "2026-01-02"}]}]});
  assert.throws(() => declaredDocument({ default: jsx(Company, { name: "X", children: jsx(Subsidiary, { file: "B.company.tsx" }) }) }), /<Subsidiary> needs ownership/);
  assert.equal("subsidiaries" in (declaredDocument({ default: jsx(Company, { name: "X" }) }).document as object), false, "a field the file names none of is absent");
});

test("a <Round> with its <Investment>s is the company's rounds, in the order written; its sources by path", () => {
  const tree = jsx(Company, {
    __source: 0,
    name: "Kite Works",
    children: [
      jsx(CapTable, { __source: 1, ocf: "Kite Works/captable/" }),
      jsx(Round, {
        __source: 2,
        name: "Series A",
        date: "2027-03-01",
        preMoney: "20000000",
        currency: "USD",
        poolTarget: "0.10",
        children: [jsx(Investment, { __source: 3, stakeholder: "Lead Fund", amount: "5000000" }), jsx(Investment, { __source: 4, stakeholder: "Ada Lovelace", amount: 250000 })],
      }),
    ],
  });
  const d = declaredDocument({ default: tree });
  assert.deepEqual((d.document as { rounds: unknown }).rounds, [
    { name: "Series A", date: "2027-03-01", preMoney: "20000000", currency: "USD", poolTarget: "0.10", investments: [{ stakeholder: "Lead Fund", amount: "5000000" }, { stakeholder: "Ada Lovelace", amount: 250000 }] },
  ]);
  assert.deepEqual(d.sources, { "": 0, captable: 1, "rounds/0": 2, "rounds/0/investments/0": 3, "rounds/0/investments/1": 4 });
  assert.equal("rounds" in (declaredDocument({ default: jsx(Company, { name: "Bare" }) }).document as object), false, "no round: no rounds field");
  assert.throws(() => declaredDocument({ default: jsx(Company, { name: "X", children: jsx(Round, { name: "Seed" }) }) }), /<Round> needs preMoney/);
  assert.throws(() => declaredDocument({ default: jsx(Company, { name: "X", children: jsx(Round, { name: "Seed", preMoney: "1", children: jsx(Investment, { stakeholder: "A", amount: "1", shares: 2 }) }) }) }), /<Investment> has no attribute shares/);
});
