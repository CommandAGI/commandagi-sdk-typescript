// A product in JSX declares a seller's product: its variants and its discounts. Pinned here: a digital product, and a
// physical product with options, stock, a pre-order deposit and a discount, both ways; each refusal by name. The Python
// SDK's tests/test_products.py and the Rust SDK's tests/products.rs declare the same examples.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, PRODUCTS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const SHIPPING = { zones: [{ rule: "included", countries: ["US"], allowanceCents: 2000 }] };
const DIGITAL = { name: "Helmet files", kind: "digital", status: "active", variants: [{ sku: "helmet-stl", name: "STL pack", priceCents: 1500, file: "./helmet.zip" }], discounts: [] };
const PREORDER = {
  name: "Desk assistant",
  kind: "physical",
  shipping: SHIPPING,
  variants: [
    { sku: "da-1-black", name: "Assembled, black", priceCents: 349600, compareAtCents: 399600, stock: 12, options: { colour: "black", assembled: true }, weightGrams: 4200 },
    { sku: "da-1-preorder", name: "Pre-order, 20% now", priceCents: 349600, deposit: { percent: 20 } },
  ],
  discounts: [{ code: "Launch10", percent: 10, startsAt: "2026-11-08", endsAt: "2026-12-01T00:00:00Z", usageLimit: 100 }],
};

test("a product in JSX: its attributes, each <variant> by its sku and each <discount> by its code", () => {
  const file = el("product", { name: "Helmet files", kind: "digital", status: "active", __source: 0 }, el("variant", { sku: "helmet-stl", name: "STL pack", priceCents: 1500, file: "./helmet.zip", __source: 1 }));
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "product");
  assert.deepEqual(document!.sources, { "": 0, "variant#helmet-stl": 1 });
  assert.deepEqual(document!.document, DIGITAL);
  for (const d of [DIGITAL, PREORDER]) assert.deepEqual(PRODUCTS.product.fromTree(PRODUCTS.product.toTree(d as never)), d, "both ways");
  const pre = declarationOf({
    default: el("product", { name: "Desk assistant", kind: "physical", shipping: SHIPPING }, ...PREORDER.variants.map((v) => el("variant", v)), ...PREORDER.discounts.map((d) => el("discount", { ...d, __source: 2 }))),
  });
  assert.deepEqual(pre.document!.document, PREORDER);
  assert.equal((pre.document!.sources as Record<string, unknown>)["discount#Launch10"], 2);
});

test("a subscription: each variant a plan paid again each interval; the quantity bought is its seats", () => {
  const PLAN = { name: "Team", kind: "subscription", status: "active", variants: [{ sku: "team-seat-month", name: "Team, a seat a month", priceCents: 8900, interval: "month" }], discounts: [] };
  const { document } = declarationOf({ default: el("product", { name: "Team", kind: "subscription", status: "active" }, el("variant", PLAN.variants[0]!)) });
  assert.deepEqual(document!.document, PLAN);
  assert.deepEqual(PRODUCTS.product.fromTree(PRODUCTS.product.toTree(PLAN as never)), PLAN, "both ways");
  const bad = (attrs: Record<string, unknown>, k: Record<string, unknown>) => () => declarationOf({ default: el("product", attrs, el("variant", k)) });
  const sub = { name: "x", kind: "subscription" }, v = { sku: "a", name: "b", priceCents: 1900 };
  assert.throws(bad(sub, v), /is a subscription: interval is month or year, not undefined/);
  assert.throws(bad(sub, { ...v, interval: "week" }), /interval is month or year, not "week"/);
  assert.throws(bad(sub, { ...v, interval: "month", stock: 3 }), /is a subscription: it has no stock/);
  assert.throws(bad(sub, { ...v, interval: "month", file: "f.zip" }), /is a subscription: it has no file/);
  assert.throws(bad({ ...sub, shipping: SHIPPING }, { ...v, interval: "month" }), /is subscription: it ships nothing/);
  assert.throws(bad({ name: "x", kind: "physical", shipping: SHIPPING }, { ...v, interval: "month" }), /is physical: it is paid once, so it has no interval/);
});

test("a product that does not read is refused with why", () => {
  const bad = (attrs: Record<string, unknown>, ...kids: Record<string, unknown>[]) => () =>
    declarationOf({ default: el("product", attrs, ...kids.map((k) => ("code" in k ? el("discount", k) : el("variant", k)))) });
  const dig = { name: "x", kind: "digital" }, phys = { name: "x", kind: "physical", shipping: SHIPPING };
  const v = { sku: "a", name: "b", priceCents: 100 };
  const d = { code: "SAVE5", amountCents: 500 };
  assert.throws(bad({ name: "x", kind: "service" }, v), /kind is physical or digital or subscription/);
  assert.throws(bad({ ...phys, taxCode: "txcd_1" }, v), /taxCode is a Stripe product tax code like txcd_99999999/);
  assert.equal(declarationOf({ default: el("product", { ...phys, taxCode: "txcd_99999999" }, el("variant", v)) }).document!.document.taxCode, "txcd_99999999");
  // Classification (docs/formats.md § classification): product schemes only, tags as they are kept.
  assert.throws(bad({ ...phys, codes: ["naics:541511"] }, v), /"naics:541511" is a business code; here a code is of unspsc, gs1, hs/);
  assert.throws(bad({ ...phys, codes: ["unspsc:432"] }, v), /a UNSPSC code is 2, 4, 6 or 8 digits/);
  assert.throws(bad({ ...phys, tags: ["3D Printing"] }, v), /write the tag as "3d printing"/);
  const classified = declarationOf({ default: el("product", { ...phys, codes: ["unspsc:43232100", "hs:847989"], tags: ["robotics"] }, el("variant", v)) }).document!.document;
  assert.deepEqual([classified.codes, classified.tags], [["unspsc:43232100", "hs:847989"], ["robotics"]]);
  assert.throws(bad({ ...dig, shipping: SHIPPING }, { ...v, file: "f.zip" }), /is digital: it ships nothing/);
  assert.throws(bad(dig, v), /is digital: file names the file it sells/);
  assert.throws(bad(dig, { ...v, file: "f.zip", deposit: { percent: 10 } }), /is digital: it takes no deposit/);
  assert.throws(bad(dig, { ...v, file: "f.zip", weightGrams: 10 }), /is digital: it has no weightGrams/);
  assert.throws(bad(dig, { ...v, file: "f.zip", stock: 3 }), /is digital: it has no stock/);
  assert.throws(bad({ name: "x", kind: "physical" }, v), /is physical: shipping is its shipping policy/);
  assert.throws(bad(phys, { ...v, file: "f.zip" }), /is physical: it ships, so it names no file/);
  assert.throws(bad(phys, { ...v, stock: -1 }), /stock is a whole number, at least 0/);
  assert.throws(bad(phys, { ...v, inventoryQty: 3 }), /inventoryQty is not read/);
  assert.throws(bad(phys, { ...v, compareAtCents: 100 }), /compareAtCents is .* more than the price \(100\)/);
  assert.throws(bad(phys, { ...v, options: { colour: ["red"] } }), /options is an object of at most 20 names/);
  assert.throws(bad(phys, { ...v, deposit: { percent: 100 } }), /deposit.percent is a whole number from 1 to 99/);
  assert.throws(bad(phys, { ...v, deposit: { cents: 100 } }), /deposit.cents is .* less than the price \(100\)/);
  assert.throws(bad(phys, { ...v, deposit: { percent: 10, cents: 60 } }), /deposit is \{ percent \} or \{ cents \}/);
  assert.throws(bad(phys, { ...v, priceCents: 10 }), /priceCents is a whole number of cents, at least 50/);
  assert.throws(bad({ ...phys, fulfilment: "ship" }, v), /fulfilment is an object/);
  assert.throws(bad({ ...phys, colour: "red" }, v), /colour/);
  assert.throws(bad(phys, v, v), /two <variant> in <product> have sku "a"/);
  assert.throws(bad(phys, v, { code: "a b c", percent: 5 }), /code is letters, digits, - and _ \(3 to 40\)/);
  assert.throws(bad(phys, v, { code: "SAVE5" }), /takes off one of percent or amountCents, not neither/);
  assert.throws(bad(phys, v, { ...d, percent: 5 }), /takes off one of percent or amountCents, not both/);
  assert.throws(bad(phys, v, { code: "SAVE5", percent: 101 }), /percent is a whole number from 1 to 100/);
  assert.throws(bad(phys, v, { code: "SAVE5", amountCents: 0 }), /amountCents is a whole number of cents, at least 1/);
  assert.throws(bad(phys, v, { ...d, startsAt: "next week" }), /startsAt is an ISO 8601 date or date-time/);
  assert.throws(bad(phys, v, { ...d, endsAt: "2026-02-30" }), /endsAt is an ISO 8601 date or date-time/);
  assert.throws(bad(phys, v, { ...d, startsAt: "2026-12-01", endsAt: "2026-11-30T23:00:00+02:00" }), /endsAt \(.*\) is after startsAt/);
  assert.throws(bad(phys, v, { ...d, usageLimit: 0 }), /usageLimit is a whole number, at least 1/);
  assert.throws(bad(phys, v, d, { ...d, code: "save5" }), /two <discount>s with one code: "SAVE5" and "save5"/);
  assert.doesNotThrow(bad(phys, v, { ...d, startsAt: "2026-12-01", endsAt: "2026-11-30T23:00:00-03:00" }), "the offset moves the end past the start");
});
