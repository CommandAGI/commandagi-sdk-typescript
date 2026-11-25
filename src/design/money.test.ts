// A money account in JSX declares one account at an institution: its connections, its counterparties and their
// payees, and its recurring payments. The Python SDK's tests/test_money.py and the Rust SDK's tests/money.rs declare
// the same examples.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, MONEY, MoneyAccount, Connection, Counterparty, At, Recurring } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const OPERATING = {
  name: "Operating",
  kind: "checking",
  institution: "Mercury",
  last4: "0000",
  currency: "USD",
  ledger: "Assets:Cash:Operating",
  books: "../books/main.journal",
  connections: [
    { id: "direct", provider: "mercury", account: "acc_test_operating" },
    { id: "view", provider: "plaid", account: "acc_test_plaid", mode: "sandbox" },
  ],
  counterparties: [
    { id: "landlord", name: "Harbor Properties LLC", at: [{ connection: "direct", recipient: "rcp_test_landlord" }] },
    { id: "reserve", name: "Reserve", file: "Reserve.money.tsx" },
  ],
  recurring: [{ id: "rent", to: "landlord", amount: "4200.00", rail: "ach", every: "month", day: 1, by: "person:mock-founder", starts: "2027-01-01", memo: "Rent" }],
};

const operating = (recurring: Record<string, unknown> = {}) =>
  el(
    MoneyAccount,
    { name: "Operating", kind: "checking", institution: "Mercury", last4: "0000", currency: "USD", ledger: "Assets:Cash:Operating", books: "../books/main.journal", __source: 0 },
    el(Connection, { id: "direct", provider: "mercury", account: "acc_test_operating", __source: 1 }),
    el(Connection, { id: "view", provider: "plaid", account: "acc_test_plaid", mode: "sandbox" }),
    el(Counterparty, { id: "landlord", name: "Harbor Properties LLC" }, el(At, { connection: "direct", recipient: "rcp_test_landlord", __source: 2 })),
    el(Counterparty, { id: "reserve", name: "Reserve", file: "Reserve.money.tsx" }),
    el(Recurring, { id: "rent", to: "landlord", amount: "4200.00", rail: "ach", every: "month", day: "1", by: "person:mock-founder", starts: "2027-01-01", memo: "Rent", ...recurring }),
  );

test("a money account in JSX: its connections, counterparties with their payees, and a recurring payment", () => {
  const { graph, document } = declarationOf({ default: () => operating() });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "money");
  assert.deepEqual(document!.sources, { "": 0, "Connection#direct": 1, "Counterparty#landlord/At@0": 2 });
  assert.deepEqual(document!.document, OPERATING);
  assert.deepEqual(MONEY.money.fromTree(MONEY.money.toTree(OPERATING as never)), OPERATING, "both ways");
});

test("a money account that does not read is refused with why", () => {
  const why = (file: unknown) => assert.throws(() => declarationOf({ default: file }));
  const refused = (file: unknown, re: RegExp) => assert.throws(() => declarationOf({ default: file }), re);
  refused(el(MoneyAccount, { name: "Operating", kind: "piggy-bank" }), /kind is checking/);
  refused(el(MoneyAccount, { name: "Operating", kind: "checking", last4: "123456" }), /last4 is the last four digits/);
  refused(el(MoneyAccount, { name: "Operating", kind: "checking", routingNumber: "000000000" }), /routingNumber is not read/);
  refused(el(MoneyAccount, { name: "Operating", kind: "checking" }, el(Connection, { id: "x", provider: "Acme Bank", account: "a" })), /provider is a provider's id/);
  refused(el(MoneyAccount, { name: "Operating", kind: "checking" }, el(Connection, { id: "x", provider: "plaid", account: "a", accessToken: "t" })), /accessToken is not read/);
  refused(el(MoneyAccount, { name: "Operating", kind: "checking" }, el(Counterparty, { id: "a", name: "A" })), /needs an <At connection recipient>/);
  refused(el(MoneyAccount, { name: "Operating", kind: "checking" }, el(Counterparty, { id: "a", name: "A" }, el(At, { connection: "nowhere", recipient: "r" }))), /<At> connection is the id of a <Connection>/);
  refused(operating({ to: "nobody" }), /to is the id of a <Counterparty>/);
  refused(operating({ amount: 4200 }), /amount is a decimal text/);
  refused(operating({ rail: "swift" }), /rail is ach/);
  refused(operating({ every: "week", day: 9 }), /day is a whole number from 1 to 7/);
  refused(operating({ by: "jacob" }), /by is the principal/);
  why(el(Connection, { id: "x", provider: "plaid", account: "a" }));
});
