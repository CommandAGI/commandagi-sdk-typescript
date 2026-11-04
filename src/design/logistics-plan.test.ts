// A supplier and a logistics plan in JSX are the documents the logistics view reads: both ways, a leg with no place
// ends at the builder, and what the vocabulary has no words for refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, LOGISTICS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

test("a supplier in JSX: its location, the carriers it ships with and its contacts; both ways", () => {
  const file = el(
    "supplier",
    { name: "JLCPCB", url: "https://jlcpcb.com", leadTimeDays: 8 },
    el("location", { name: "JLCPCB, Shenzhen", lat: 22.543, lon: 114.058, country: "CN" }),
    el("ships", { carrier: "DHL", service: "Express Worldwide", transitDays: 5 }),
    el("contact", { role: "sales", email: "support@jlcpcb.com" }),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "supplier");
  assert.deepEqual(doc.document, {
    name: "JLCPCB", url: "https://jlcpcb.com", leadTimeDays: 8,
    location: { name: "JLCPCB, Shenzhen", lat: 22.543, lon: 114.058, country: "CN" },
    ships: [{ carrier: "DHL", service: "Express Worldwide", transitDays: 5 }],
    contacts: [{ role: "sales", email: "support@jlcpcb.com" }],
    services: [],
  });
  assert.deepEqual(LOGISTICS.supplier.fromTree(LOGISTICS.supplier.toTree(doc.document as never)), doc.document, "both ways");
  assert.throws(() => declarationOf({ default: el("supplier", { name: "X" }, el("location", { name: "Y", lat: 95, lon: 0 })) }), /lat is degrees north/);
  assert.throws(() => declarationOf({ default: el("supplier", {}) }), /name/);
});

test("a logistics plan in JSX: its BOM designs, the builder, and each supplier's legs; both ways", () => {
  const file = el(
    "logistics",
    { name: "tile kit", quantity: 10 },
    el("bom", { ref: "Tile kit.3d.tsx" }),
    el("builder", { name: "Austin", lat: 30.267, lon: -97.743, country: "US" }),
    el(
      "route",
      { supplier: "suppliers/jlcpcb.supplier.tsx" },
      el("leg", { carrier: "DHL", service: "Express pickup", to: "DHL hub, Hong Kong", lat: 22.308, lon: 113.918, country: "HK", transitDays: 1, cost: 6, currency: "USD" }),
      el("leg", { carrier: "DHL", service: "Express Worldwide", transitDays: 4, cost: 32, currency: "USD" }),
    ),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "logistics");
  assert.deepEqual(doc.document, {
    name: "tile kit", quantity: 10,
    boms: [{ ref: "Tile kit.3d.tsx" }],
    builder: { name: "Austin", lat: 30.267, lon: -97.743, country: "US" },
    routes: [{
      supplier: "suppliers/jlcpcb.supplier.tsx",
      legs: [
        { carrier: "DHL", service: "Express pickup", transitDays: 1, cost: 6, currency: "USD", to: { name: "DHL hub, Hong Kong", lat: 22.308, lon: 113.918, country: "HK" } },
        { carrier: "DHL", service: "Express Worldwide", transitDays: 4, cost: 32, currency: "USD" },
      ],
    }],
    sources: [],
  });
  assert.deepEqual(LOGISTICS.logistics.fromTree(LOGISTICS.logistics.toTree(doc.document as never)), doc.document, "both ways");
  const bad = (leg: Record<string, unknown>) => () => declarationOf({ default: el("logistics", {}, el("route", { supplier: "s.supplier.tsx" }, el("leg", { carrier: "UPS", ...leg }))) });
  assert.throws(bad({ cost: 5 }), /cost states its currency/);
  assert.throws(bad({ to: "hub" }), /lat is degrees north/);
  assert.throws(bad({ currency: "usd" }), /ISO 4217/);
  assert.throws(() => declarationOf({ default: el("logistics", { quantity: 2.5 }) }), /whole number/);
});

test("a supplier's services and a plan's sources: how a part is bought through a supplier, and how one line is filled", () => {
  const supplier = declarationOf({
    default: el(
      "supplier",
      { name: "JLCPCB" },
      el("service", { id: "global-sourcing", name: "Global sourcing", reviewDays: 1, reviewDaysHigh: 3, leadTimeDays: 9, leadTimeDaysHigh: 20 },
        el("fee", { amount: 20, currency: "USD", per: "line", note: "connectors and batteries" })),
      el("service", { id: "consignment" }, el("fee", { amount: 70, currency: "USD", per: "line", each: 50 }), el("fee", { amount: 15, currency: "USD", per: "order" })),
    ),
  }).document!.document as never as { services: unknown[] };
  assert.deepEqual(supplier.services, [
    { id: "global-sourcing", name: "Global sourcing", reviewDays: 1, reviewDaysHigh: 3, leadTimeDays: 9, leadTimeDaysHigh: 20, fees: [{ amount: 20, currency: "USD", per: "line", note: "connectors and batteries" }] },
    { id: "consignment", fees: [{ amount: 70, currency: "USD", per: "line", each: 50 }, { amount: 15, currency: "USD", per: "order" }] },
  ]);
  assert.deepEqual(LOGISTICS.supplier.fromTree(LOGISTICS.supplier.toTree(supplier as never)), supplier, "both ways");
  const plan = declarationOf({
    default: el("logistics", { quantity: 10, build: "2027-01-15" },
      el("source", { part: "KH-205580-DZ", strategy: "split" }, el("use", { offer: "JLCPCB parts library", qty: 1984 }), el("use", { offer: "LCSC" })),
      el("source", { part: "TLV333IDCKR", strategy: "dual" }, el("use", { offer: "JLCPCB", share: 0.6 }), el("use", { offer: "LCSC", mpn: "TP5531U-CR", share: 0.4 }))),
  }).document!.document as never as { build: string; sources: unknown[] };
  assert.equal(plan.build, "2027-01-15");
  assert.deepEqual(plan.sources, [
    { part: "KH-205580-DZ", strategy: "split", uses: [{ offer: "JLCPCB parts library", qty: 1984 }, { offer: "LCSC" }] },
    { part: "TLV333IDCKR", strategy: "dual", uses: [{ offer: "JLCPCB", share: 0.6 }, { offer: "LCSC", mpn: "TP5531U-CR", share: 0.4 }] },
  ]);
  assert.deepEqual(LOGISTICS.logistics.fromTree(LOGISTICS.logistics.toTree(plan as never)), plan, "both ways");
  assert.throws(() => declarationOf({ default: el("logistics", {}, el("source", { part: "X", strategy: "cheapest" })) }), /strategy is single, fill, split or dual/);
  assert.throws(() => declarationOf({ default: el("logistics", { build: "next June" }) }), /YYYY-MM-DD/);
  assert.throws(() => declarationOf({ default: el("supplier", { name: "X" }, el("service", { id: "s" }, el("fee", { amount: 1, per: "order" }))) }), /currency/);
});
