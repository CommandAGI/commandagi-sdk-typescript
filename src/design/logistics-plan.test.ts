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

test("a leg that says \"quote this\": its want, its parcel, and the postal codes the carriers rate by; both ways", () => {
  const file = el(
    "logistics",
    { name: "helmet" },
    el("builder", { name: "the builder, San Francisco", lat: 37.72, lon: -122.44, country: "US", postal: "94112" }),
    el("route", { supplier: "suppliers/x.supplier.tsx" }, el("leg", { carrier: "USPS", quote: "cheapest", kg: 2.5, mm: [300, 250, 220], to: "a buyer, Berlin", lat: 52.52, lon: 13.4, country: "DE", postal: "10115" })),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.deepEqual((doc.document as never as { builder: unknown }).builder, { name: "the builder, San Francisco", lat: 37.72, lon: -122.44, country: "US", postal: "94112" });
  assert.deepEqual((doc.document as never as { routes: { legs: unknown[] }[] }).routes[0]!.legs[0], { carrier: "USPS", quote: "cheapest", kg: 2.5, mm: [300, 250, 220], to: { name: "a buyer, Berlin", lat: 52.52, lon: 13.4, country: "DE", postal: "10115" } });
  assert.deepEqual(LOGISTICS.logistics.fromTree(LOGISTICS.logistics.toTree(doc.document as never)), doc.document, "both ways");
  const bad = (leg: Record<string, unknown>) => () => declarationOf({ default: el("logistics", {}, el("route", { supplier: "s.supplier.tsx" }, el("leg", { carrier: "UPS", ...leg }))) });
  assert.throws(bad({ quote: "the cheap one" }), /quote is cheapest, fastest/);
  assert.throws(bad({ quote: "ups/03" }), /quote needs its parcel/);
  assert.throws(bad({ quote: "fastest", kg: 2, mm: [300, 250] }), /mm is the parcel/);
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

test("buying ahead and stock on hand: a plan buys past its need for a later plan, which counts it; a service counted in business days; both ways", () => {
  const ten = declarationOf({
    default: el("logistics", { quantity: 10, build: "2027-01-15" },
      el("source", { part: "FT2232HL-REEL", strategy: "fill" }, el("use", { offer: "JLCPCB parts library" }), el("use", { offer: "JLCPCB parts library", mpn: "FT2232HL-TRAY" }), el("ahead", { qty: 157, for: "Helmet 100.logistics.tsx" })),
      el("source", { part: "TLV333IDCKR" }, el("ahead", { qty: 500, for: "Helmet 100.logistics.tsx", note: "the reel's rest" }))),
  }).document!.document as never as { sources: unknown[]; stocks?: unknown };
  assert.deepEqual(ten.sources, [
    { part: "FT2232HL-REEL", strategy: "fill", uses: [{ offer: "JLCPCB parts library" }, { offer: "JLCPCB parts library", mpn: "FT2232HL-TRAY" }], ahead: { qty: 157, for: "Helmet 100.logistics.tsx" } },
    { part: "TLV333IDCKR", uses: [], ahead: { qty: 500, for: "Helmet 100.logistics.tsx", note: "the reel's rest" } },
  ]);
  assert.equal(ten.stocks, undefined, "a plan that holds no stock states none");
  assert.deepEqual(LOGISTICS.logistics.fromTree(LOGISTICS.logistics.toTree(ten as never)), ten, "both ways");
  const hundred = declarationOf({
    default: el("logistics", { quantity: 100 }, el("stock", { from: "Helmet 10.logistics.tsx" }), el("stock", { part: "KH-205580-DZ", qty: 2000, arrives: "2027-03-01", note: "consigned at JLCPCB" })),
  }).document!.document as never as { stocks: unknown[] };
  assert.deepEqual(hundred.stocks, [{ from: "Helmet 10.logistics.tsx" }, { part: "KH-205580-DZ", qty: 2000, arrives: "2027-03-01", note: "consigned at JLCPCB" }]);
  assert.deepEqual(LOGISTICS.logistics.fromTree(LOGISTICS.logistics.toTree(hundred as never)), hundred, "both ways");
  const plan = (...c: unknown[]) => () => declarationOf({ default: el("logistics", {}, ...c) });
  assert.throws(plan(el("stock", { from: "a.logistics.tsx", qty: 3 })), /<stock from> takes what that plan bought ahead/);
  assert.throws(plan(el("stock", { part: "X" })), /names the part and its qty, or the plan it is from/);
  assert.throws(plan(el("stock", { part: "X", qty: 3, arrives: "soon" })), /arrives is a date/);
  assert.throws(plan(el("source", { part: "X" }, el("ahead", { qty: 1.5, for: "b.logistics.tsx" }))), /<ahead> qty is a whole number/);
  assert.throws(plan(el("source", { part: "X" })), /names no <use> and no <ahead>/);
  assert.throws(plan(el("source", { part: "X" }, el("use", { offer: "A" }))), /strategy is single, fill, split or dual/);
  const jlc = declarationOf({ default: el("supplier", { name: "JLCPCB" }, el("service", { id: "global-sourcing", reviewDays: 1, reviewDaysHigh: 3, leadTimeDays: 9, leadTimeDaysHigh: 20, businessDays: true })) }).document!.document as never as { services: unknown[] };
  assert.deepEqual(jlc.services, [{ id: "global-sourcing", reviewDays: 1, reviewDaysHigh: 3, leadTimeDays: 9, leadTimeDaysHigh: 20, businessDays: true, fees: [] }]);
  assert.deepEqual(LOGISTICS.supplier.fromTree(LOGISTICS.supplier.toTree(jlc as never)), jlc, "both ways");
  assert.throws(() => declarationOf({ default: el("supplier", { name: "X" }, el("service", { id: "s", businessDays: "yes" })) }), /businessDays is true or false/);
});
