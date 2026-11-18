// A storefront in JSX declares the store its holder lists: a mirrored store's listings, or offers by name. The Python
// SDK's tests/test_storefronts.py and the Rust SDK's tests/storefronts.rs declare the same examples.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, STOREFRONTS, Storefront, Offers, Offer } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const DIGIKEY = {
  name: "DigiKey",
  venue: "digikey",
  seller: "DigiKey",
  url: "https://www.digikey.com",
  checkout: "agent",
  hold: "10 minutes",
  mirror: { listings: "Inventory/listings.csv", read: "Inventory/read.mjs" },
  offers: [],
};

test("a relisted store in JSX: <Storefront> with its <Offers>", () => {
  const file = el(Storefront, { name: "DigiKey", venue: "digikey", seller: "DigiKey", url: "https://www.digikey.com", checkout: "agent", hold: "10 minutes", __source: 0 }, el(Offers, { listings: "Inventory/listings.csv", read: "Inventory/read.mjs", __source: 1 }));
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "storefront");
  assert.deepEqual(document!.sources, { "": 0, Offers: 1 });
  assert.deepEqual(document!.document, DIGIKEY);
  assert.deepEqual(STOREFRONTS.storefront.fromTree(STOREFRONTS.storefront.toTree(DIGIKEY)), DIGIKEY, "both ways");
});

test("a service store in JSX: one <Offer> by its name, with its price, unit, codes and tags", () => {
  const file = el(
    Storefront,
    { name: "Uber", venue: "uber", seller: "Uber Technologies", sellerRecord: "cloud://home/user-commandagi/records/companies/uber-technologies-inc-de/" },
    el(Offer, { name: "Ride", kind: "service", unit: "ride", codes: ["unspsc:78111804"], tags: ["transport"] }),
    el(Offer, { name: "Courier, one hour", kind: "service", price: "25.00 USD", unit: "hour" }),
  );
  const doc = declarationOf({ default: file }).document!.document;
  const want = {
    name: "Uber",
    venue: "uber",
    seller: "Uber Technologies",
    sellerRecord: "cloud://home/user-commandagi/records/companies/uber-technologies-inc-de/",
    offers: [
      { name: "Ride", kind: "service", unit: "ride", codes: ["unspsc:78111804"], tags: ["transport"] },
      { name: "Courier, one hour", kind: "service", price: "25.00 USD", unit: "hour" },
    ],
  };
  assert.deepEqual(doc, want);
  assert.deepEqual(STOREFRONTS.storefront.fromTree(STOREFRONTS.storefront.toTree(want as never)), want, "both ways");
});

test("a storefront that does not read is refused with why", () => {
  const at = { name: "Shop", venue: "ebay", seller: "A seller" };
  const bad = (attrs: Record<string, unknown>, ...kids: unknown[]) => () => declarationOf({ default: el(Storefront, attrs, ...kids) });
  assert.throws(bad({ ...at, holder: "acct:org:org-commandagi" }), /holder is not read/);
  assert.throws(bad({ ...at, venue: "eBay" }), /venue is the platform's word/);
  assert.throws(bad({ ...at, checkout: "cart" }), /checkout is agent or seller/);
  assert.throws(bad({ ...at, hold: "ten minutes" }), /hold is a term like "10 minutes"/);
  assert.throws(bad({ ...at, url: "http://x" }), /url is an https:\/\/ address/);
  assert.throws(bad(at, el(Offer, { name: "A", kind: "service", price: "25 dollars" })), /price is an amount and an ISO currency/);
  assert.throws(bad(at, el(Offer, { name: "A", kind: "thing" })), /kind is service or good/);
  assert.throws(bad(at, el(Offer, { name: "A", kind: "good", codes: ["43211500"] })), /codes: "43211500" is not a code: write it as scheme:code/);
  assert.throws(bad(at, el(Offer, { name: "A", kind: "good" }), el(Offer, { name: "A", kind: "good" })), /two <Offer> in <Storefront> have name "A"/);
  assert.throws(bad(at, el(Offers, { listings: "a.csv" }), el(Offers, { listings: "b.csv" })), /<Storefront> has one <Offers>/);
  assert.throws(bad({ name: "Shop", venue: "ebay" }), /needs seller/);
});
