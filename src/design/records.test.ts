// Signed records in JSX declare the plain bodies of a `.contract` and a `.instance`. Pinned here: a contract's terms
// are one attribute and come back byte-for-byte (nulls and empty strings kept), parties and events are children in
// order, both ways; an event chain out of order and a field with no attribute are refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, RECORDS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const TERMS = {
  subject: { kind: "data_stream", resourceType: "device", resourceId: "dev-1" },
  title: "Bench camera",
  description: "",
  price: { type: "metered", rate: 1, unit: "minute" },
  schedule: null,
  takeRateBps: 1000,
  channels: ["screen"],
};

test("a contract record in JSX is its body: terms verbatim, parties in order, each __source by its path", () => {
  const file = el(
    "contract",
    { id: "c-1", terms: TERMS, createdAt: 1780765664000, __source: 0 },
    el("party", { principal: "u-1", role: "offeror", sig: "ed25519:k:abc", signedAt: 1780765664000, __source: 1 }),
    el("party", { principal: "acct:org:o-2", role: "acceptor", actedBy: "u-3" }),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "contract");
  assert.deepEqual(document!.sources, { "": 0, "party@0": 1 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    id: "c-1",
    terms: TERMS,
    parties: [
      { principal: "u-1", role: "offeror", sig: "ed25519:k:abc", signedAt: 1780765664000 },
      { principal: "acct:org:o-2", role: "acceptor", actedBy: "u-3" },
    ],
    createdAt: 1780765664000,
  });
  assert.equal(JSON.stringify((doc as { terms: unknown }).terms), JSON.stringify(TERMS), "the signed object, null and \"\" kept");
  assert.deepEqual(RECORDS.contract.fromTree(RECORDS.contract.toTree(doc as never)), doc, "both ways");

  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS }) }), /<contract> needs createdAt/);
  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS, createdAt: 1, title: "x" }) }), /title is not read/);
  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS, createdAt: "today" }) }), /createdAt is epoch milliseconds/);
  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS, createdAt: 1 }, el("party", { role: "offeror" })) }), /<party> needs principal/);
});

test("a product instance in JSX is its body: the chain's events oldest first, each by its seq", () => {
  const file = el(
    "instance",
    { serial: "SN-1", productId: "fleet-unit", __source: 0 },
    el("event", { seq: 0, kind: "manufacture", at: 1, prev: null, by: "org-acme", data: { plate: "P-1" }, sig: "ed25519:k:s0", __source: 1 }),
    el("event", { seq: 1, kind: "transfer", at: 2, prev: "h0", by: "org-acme", to: "u-2", contractRef: "c-1", sig: "ed25519:k:s1" }),
  );
  const { document } = declarationOf({ default: file });
  assert.equal(document!.format, "instance");
  assert.deepEqual(document!.sources, { "": 0, "event#0": 1 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    serial: "SN-1",
    productId: "fleet-unit",
    events: [
      { seq: 0, kind: "manufacture", at: 1, prev: null, by: "org-acme", data: { plate: "P-1" }, sig: "ed25519:k:s0" },
      { seq: 1, kind: "transfer", at: 2, prev: "h0", by: "org-acme", to: "u-2", contractRef: "c-1", sig: "ed25519:k:s1" },
    ],
  });
  assert.deepEqual(RECORDS.instance.fromTree(RECORDS.instance.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("instance", { serial: "S", productId: "p" }, el("event", { seq: 1, kind: "service", at: 1, by: "x" })) }), /events are written oldest first/);
  assert.throws(() => declarationOf({ default: el("instance", { serial: "S", productId: "p" }, el("event", { seq: 0, kind: "service", at: 1, by: "x", note: "n" })) }), /note is not read/);
});
