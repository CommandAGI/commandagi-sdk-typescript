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
  });
  assert.deepEqual(LOGISTICS.logistics.fromTree(LOGISTICS.logistics.toTree(doc.document as never)), doc.document, "both ways");
  const bad = (leg: Record<string, unknown>) => () => declarationOf({ default: el("logistics", {}, el("route", { supplier: "s.supplier.tsx" }, el("leg", { carrier: "UPS", ...leg }))) });
  assert.throws(bad({ cost: 5 }), /cost states its currency/);
  assert.throws(bad({ to: "hub" }), /lat is degrees north/);
  assert.throws(bad({ currency: "usd" }), /ISO 4217/);
  assert.throws(() => declarationOf({ default: el("logistics", { quantity: 2.5 }) }), /whole number/);
});
