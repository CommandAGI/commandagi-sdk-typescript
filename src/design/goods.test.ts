// A good in JSX declares the body of the platform's goods door. Pinned here: a digital good and a physical good with a
// pre-order deposit, both ways; each refusal by name. The Python SDK's tests/test_goods.py and the Rust SDK's
// tests/goods.rs declare the same examples.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, GOODS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const SHIPPING = { zones: [{ rule: "included", countries: ["US"], allowanceCents: 2000 }] };
const DIGITAL = { name: "Helmet files", kind: "digital", status: "active", variants: [{ sku: "helmet-stl", name: "STL pack", priceCents: 1500, file: "./helmet.zip" }] };
const PREORDER = {
  name: "Desk assistant",
  kind: "physical",
  shipping: SHIPPING,
  variants: [
    { sku: "da-1", name: "Assembled", priceCents: 349600, inventoryQty: -1, weightGrams: 4200 },
    { sku: "da-1-preorder", name: "Pre-order, 20% now", priceCents: 349600, deposit: { percent: 20 } },
  ],
};

test("a good in JSX: its attributes and each <variant> are the goods door's body, each __source by its sku", () => {
  const file = el("good", { name: "Helmet files", kind: "digital", status: "active", __source: 0 }, el("variant", { sku: "helmet-stl", name: "STL pack", priceCents: 1500, file: "./helmet.zip", __source: 1 }));
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "good");
  assert.deepEqual(document!.sources, { "": 0, "variant#helmet-stl": 1 });
  assert.deepEqual(document!.document, DIGITAL);
  for (const d of [DIGITAL, PREORDER]) assert.deepEqual(GOODS.good.fromTree(GOODS.good.toTree(d as never)), d, "both ways");
  const pre = declarationOf({ default: el("good", { name: "Desk assistant", kind: "physical", shipping: SHIPPING }, ...PREORDER.variants.map((v) => el("variant", v))) });
  assert.deepEqual(pre.document!.document, PREORDER);
});

test("a good that does not read is refused with why", () => {
  const bad = (attrs: Record<string, unknown>, ...variants: Record<string, unknown>[]) => () => declarationOf({ default: el("good", attrs, ...variants.map((v) => el("variant", v))) });
  const dig = { name: "x", kind: "digital" }, phys = { name: "x", kind: "physical", shipping: SHIPPING };
  const v = { sku: "a", name: "b", priceCents: 100 };
  assert.throws(bad({ name: "x", kind: "service" }, v), /kind is physical or digital/);
  assert.throws(bad({ ...dig, shipping: SHIPPING }, { ...v, file: "f.zip" }), /is digital: it ships nothing/);
  assert.throws(bad(dig, v), /is digital: file names the file it sells/);
  assert.throws(bad(dig, { ...v, file: "f.zip", deposit: { percent: 10 } }), /is digital: it takes no deposit/);
  assert.throws(bad(dig, { ...v, file: "f.zip", weightGrams: 10 }), /is digital: it has no weightGrams/);
  assert.throws(bad({ name: "x", kind: "physical" }, v), /is physical: shipping is its shipping policy/);
  assert.throws(bad(phys, { ...v, file: "f.zip" }), /is physical: it ships, so it names no file/);
  assert.throws(bad(phys, { ...v, deposit: { percent: 100 } }), /deposit.percent is a whole number from 1 to 99/);
  assert.throws(bad(phys, { ...v, deposit: { cents: 100 } }), /deposit.cents is .* less than the price \(100\)/);
  assert.throws(bad(phys, { ...v, deposit: { percent: 10, cents: 60 } }), /deposit is \{ percent \} or \{ cents \}/);
  assert.throws(bad(phys, { ...v, priceCents: 10 }), /priceCents is a whole number of cents, at least 50/);
  assert.throws(bad({ ...phys, colour: "red" }, v), /colour/);
  assert.throws(bad(phys, v, v), /two <variant> in <good> have sku "a"/);
});
