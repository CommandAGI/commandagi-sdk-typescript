// A cart in JSX declares a buyer's lines at one seller, by SKU and by listing, and never a price. The Python SDK's
// tests/test_carts.py and the Rust SDK's tests/carts.rs declare the same examples.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, CARTS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const CART = { seller: "acct:org:helmetworks", items: [{ sku: "helmet-stl", qty: 1 }], offers: [{ listing: "lst_print-farm-hour", qty: 3 }] };

test("a cart in JSX: one <item> by its sku and one <offer> by its listing", () => {
  const file = el("cart", { seller: "acct:org:helmetworks", __source: 0 }, el("item", { sku: "helmet-stl", qty: 1, __source: 1 }), el("offer", { listing: "lst_print-farm-hour", qty: 3, __source: 2 }));
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "cart");
  assert.deepEqual(document!.sources, { "": 0, "item#helmet-stl": 1, "offer#lst_print-farm-hour": 2 });
  assert.deepEqual(document!.document, CART);
  assert.deepEqual(CARTS.cart.fromTree(CARTS.cart.toTree(CART)), CART, "both ways");
});

test("a cart that does not read is refused with why", () => {
  const bad = (attrs: Record<string, unknown>, ...lines: Record<string, unknown>[]) => () =>
    declarationOf({ default: el("cart", attrs, ...lines.map((l) => ("listing" in l ? el("offer", l) : el("item", l)))) });
  const at = { seller: "acct:user:jacob" };
  assert.throws(bad({ seller: "helmetworks" }), /seller is an account, acct:user:<id> or acct:org:<id>/);
  assert.throws(bad(at, { sku: "a", qty: 0 }), /qty is a whole number from 1 to 999/);
  assert.throws(bad(at, { listing: "l", qty: 1000 }), /qty is a whole number from 1 to 999/);
  assert.throws(bad(at, { sku: "a", qty: 1, priceCents: 100 }), /priceCents is not read/);
  assert.throws(bad(at, { listing: "l", qty: 1, amountCents: 100 }), /amountCents is not read/);
  assert.throws(bad({ ...at, totalCents: 100 }), /totalCents is not read/);
  assert.throws(bad(at, { sku: "a", qty: 1 }, { sku: "a", qty: 2 }), /two <item> in <cart> have sku "a"/);
  assert.throws(bad(at, { listing: "l", qty: 1 }, { listing: "l", qty: 2 }), /two <offer> in <cart> have listing "l"/);
  assert.throws(bad(at, ...Array.from({ length: 101 }, (_, i) => ({ sku: `s${i}`, qty: 1 }))), /at most 100 lines/);
});
