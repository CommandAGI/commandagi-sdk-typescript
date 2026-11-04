// A company's finance in JSX read as the company document's `finance` (the Python and Rust SDKs pin the same
// document for the same elements); absent when the company names none of it; an unknown attribute refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { BankAccount, Budget, Company, DataRoom, Include, Payroll, declarationOf, jsx } from "./index.js";

const declared = (tree: unknown) => declarationOf({ default: () => tree }).document!;

test("<Budget>, <BankAccount>, <Payroll> and <DataRoom> are the company's finance; sources by path", () => {
  const d = declared(
    jsx(Company, {
      __source: 0,
      name: "Harbor",
      children: [
        jsx(Budget, { __source: 1, journal: "Harbor/books/budget.journal" }),
        jsx(BankAccount, { __source: 2, name: "Operating", provider: "First Bank", last4: "4321", currency: "USD", ledger: "Assets:Cash:Operating", kind: "checking", statements: "Harbor/bank/" }),
        jsx(Payroll, { __source: 3, provider: "Gusto", ledger: "Expenses:Payroll", register: "Harbor/payroll/", schedule: "semimonthly" }),
        jsx(DataRoom, { __source: 4, name: "Seed", expires: "2026-12-31", children: [jsx(Include, { __source: 5, document: "Harbor/Documents/Charter.pdf", section: "corporate" })] }),
      ],
    }),
  );
  assert.deepEqual((d.document as { finance: unknown }).finance, {
    budget: "Harbor/books/budget.journal",
    bankAccounts: [{ name: "Operating", provider: "First Bank", last4: "4321", currency: "USD", ledger: "Assets:Cash:Operating", kind: "checking", statements: "Harbor/bank/" }],
    payroll: [{ provider: "Gusto", ledger: "Expenses:Payroll", register: "Harbor/payroll/", schedule: "semimonthly" }],
    dataRooms: [{ name: "Seed", expires: "2026-12-31", include: [{ document: "Harbor/Documents/Charter.pdf", section: "corporate" }] }],
  });
  assert.deepEqual(Object.keys(d.sources!).sort(), ["", "bankAccounts/0", "budget", "dataRooms/0", "dataRooms/0/include/0", "payroll/0"]);
  assert.equal("finance" in (declared(jsx(Company, { name: "Bare" })).document as object), false, "no finance named: no field");
});

test("a finance element says only its own words", () => {
  assert.throws(() => declared(jsx(Company, { name: "X", children: jsx(BankAccount, { name: "Op", accountNumber: "000123" }) })), /<BankAccount> has no attribute accountNumber/);
  assert.throws(() => declared(jsx(Company, { name: "X", children: jsx(DataRoom, { name: "Seed", children: jsx(Include, {}) }) })), /<Include> needs document/);
  assert.throws(() => declared(jsx(Company, { name: "X", children: [jsx(Budget, { journal: "a" }), jsx(Budget, { journal: "b" })] })), /two <Budget>/);
});
