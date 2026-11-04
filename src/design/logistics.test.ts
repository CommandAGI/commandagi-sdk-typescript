// A design's logistics in code (docs/formats.md § logistics): a schematic part's and a circuit component's suppliers
// and facets as KiCad property forms, read back by partFields; a circuit's logistics <check options>; a board's <fab>;
// a 3D document's <item>, <assemble> and the logistics fields of <body engineering>. The Python and Rust SDKs hold the
// same cases (their logistics tests).
import assert from "node:assert/strict";
import { test } from "node:test";

import { circuit, component, declarationOf, footprints, jsx, partFields } from "./index.js";

const prop = (form: unknown) => {
  const items = (form as { items: { v: string }[] }).items;
  return [items[1]!.v, items[2]!.v];
};
const props = (inputs: Record<string, unknown>) => (inputs.foreign as unknown[]).map(prop);

const LCSC = { name: "LCSC", sku: "C21264512", currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 9.4 }, { quantity: 10, unitPrice: 9.15, unitPriceHigh: 9.6 }], stock: 1, leadTimeDays: 3, source: "lcsc.com", date: "2026-10-15" };
const LOGISTICS = {
  suppliers: [LCSC, { name: "DigiKey", sku: "A7670G-ND" }],
  alternates: [{ manufacturer: "SIMCom", mpn: "A7670E-LASE" }],
  datasheet: "https://www.simcom.com/product/A7670X.html",
  lifecycle: { status: "active", onHand: 2, reorderPoint: 5 },
  compliance: { rohs: "compliant", reach: "compliant", eccn: "5A992.c", certifications: ["FCC ID 2AJYU-8BAE003", "CE"] },
  shipping: { hsCode: "8517.62", origin: "CN", hazmat: "none" },
};
const FORMS = [
  ["MPN", "A7670G-LLSE"],
  ["LCSC Part", "C21264512"],
  ["LCSC Terms", '{"currency":"USD","priceBreaks":[[1,9.4],[10,9.15,9.6]],"leadTimeDays":3,"stock":1,"source":"lcsc.com","date":"2026-10-15"}'],
  ["DigiKey Part", "A7670G-ND"],
  ["Alternates", '[{"manufacturer":"SIMCom","mpn":"A7670E-LASE"}]'],
  ["Datasheet", "https://www.simcom.com/product/A7670X.html"],
  ["Lifecycle", "active"],
  ["On Hand", "2"],
  ["Reorder Point", "5"],
  ["RoHS", "compliant"],
  ["REACH", "compliant"],
  ["ECCN", "5A992.c"],
  ["Certifications", "FCC ID 2AJYU-8BAE003, CE"],
  ["HS Code", "8517.62"],
  ["Country of Origin", "CN"],
  ["Hazmat", "none"],
];

test("a schematic part states its suppliers and facets as KiCad properties (LCSC Part, Datasheet, RoHS …), read back by partFields", () => {
  const { graph: g } = declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "U4", pins: ["1", "2"], mpn: "A7670G-LLSE", ...LOGISTICS })] }) });
  assert.deepEqual(props(g.nodes.U4!.inputs), FORMS);
  assert.deepEqual(partFields(g.nodes.U4!.inputs), { mpn: "A7670G-LLSE", ...LOGISTICS });
});

test("a circuit's component() takes the same fields, as the same forms", () => {
  const g = circuit("C", () => {
    component({ ref: "U4", footprint: footprints.chip("0603", "R"), mpn: "A7670G-LLSE", ...(LOGISTICS as object) });
  }).ir;
  const part = Object.values(g.nodes).find((n) => n.inputs.ref === "U4")!;
  assert.deepEqual(props(part.inputs), FORMS);
});

test("a wrong logistics field is refused by name, and attrs cannot say what an argument says", () => {
  const sheet = (p: Record<string, unknown>) => () => declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "U4", pins: ["1"], ...p })] }) });
  assert.throws(sheet({ suppliers: [{ name: "LCSC", price: 3 }] }), /suppliers\[0\]: price is not a term of an offer/);
  assert.throws(sheet({ suppliers: [{ name: "LCSC", priceBreaks: [{ quantity: 0, unitPrice: 1 }] }] }), /priceBreaks is a list of \{ quantity, unitPrice, unitPriceHigh\? \}/);
  assert.throws(sheet({ suppliers: [{ name: "LCSC", currency: "usd" }] }), /currency is an ISO 4217 code/);
  assert.throws(sheet({ lifecycle: { onHand: 3 } }), /lifecycle needs its status/);
  assert.throws(sheet({ lifecycle: { status: "dead" } }), /lifecycle.status is one of active, nrnd, eol, obsolete/);
  assert.throws(sheet({ compliance: { rohs: "yes" } }), /compliance.rohs is one of compliant, exempt, non-compliant/);
  assert.throws(sheet({ shipping: { origin: "China" } }), /shipping.origin is an ISO 3166 alpha-2 code/);
  // A part not specified yet says so (PCBC-16): the host's check warns of each "unknown".
  assert.doesNotThrow(sheet({ shipping: { hsCode: "unknown", origin: "unknown", hazmat: "unknown" } }));
  assert.throws(sheet({ attrs: { "LCSC Part": "C1" } }), /attrs names LCSC Part: say it with suppliers=/);
  assert.throws(sheet({ attrs: { RoHS: "compliant" } }), /attrs names RoHS: say it with compliance=/);
  assert.throws(sheet({ attrs: { Datasheet: "x" } }), /attrs names Datasheet: say it with datasheet=/);
});

test("multi-supplier sourcing in a part's fields: an offer's kind, confidence, lead range, samples, tooling, service and supplier file, and an alternate with its differences and offers", () => {
  const sourcing = {
    suppliers: [
      { name: "JLCPCB parts library", sku: "C530677", currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 0.0957 }], stock: 1984, service: "pre-order", supplier: "suppliers/jlcpcb.supplier.tsx", source: "jlcpcb.com", date: "2026-11-03" },
      { name: "Kinghelm factory run", kind: "quote", confidence: "indication", currency: "USD", priceBreaks: [{ quantity: 5000, unitPrice: 0.07, unitPriceHigh: 0.1 }], moq: 5000, samplesDays: 21, leadTimeDays: 15, leadTimeDaysHigh: 20, tooling: "unknown", source: "maker's blog", date: "2026-11-03" },
    ],
    alternates: [{ manufacturer: "YIYUAN", mpn: "YTC1P-6020-01", approved: false, differences: ["rated stroke 1.5 mm, not 2.0 mm"], suppliers: [{ name: "LCSC", sku: "C5221290", stock: 885 }] }],
  };
  const { graph: g } = declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "P1", pins: ["1"], mpn: "KH-205580-DZ", ...sourcing })] }) });
  assert.deepEqual(props(g.nodes.P1!.inputs).slice(1, 4), [
    ["JLCPCB parts library Part", "C530677"],
    ["JLCPCB parts library Terms", '{"currency":"USD","priceBreaks":[[1,0.0957]],"stock":1984,"service":"pre-order","supplier":"suppliers/jlcpcb.supplier.tsx","source":"jlcpcb.com","date":"2026-11-03"}'],
    ["Kinghelm factory run Terms", '{"currency":"USD","priceBreaks":[[5000,0.07,0.1]],"moq":5000,"leadTimeDays":15,"leadTimeDaysHigh":20,"kind":"quote","confidence":"indication","samplesDays":21,"tooling":"unknown","source":"maker\'s blog","date":"2026-11-03"}'],
  ]);
  assert.deepEqual(partFields(g.nodes.P1!.inputs), { mpn: "KH-205580-DZ", ...sourcing });
  const sheet = (p: Record<string, unknown>) => () => declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "U4", pins: ["1"], ...p })] }) });
  assert.throws(sheet({ suppliers: [{ name: "X", kind: "auction" }] }), /kind is stock, quote, listing or broker/);
  assert.throws(sheet({ suppliers: [{ name: "X", tooling: "a lot" }] }), /tooling is a cost/);
  assert.throws(sheet({ suppliers: [{ name: "X", leadTimeDays: 9, leadTimeDaysHigh: 3 }] }), /not under leadTimeDays/);
  assert.throws(sheet({ alternates: [{ manufacturer: "Y", mpn: "Z", pinout: "same" }] }), /pinout is not a field of an alternate/);
  assert.throws(sheet({ alternates: [{ manufacturer: "Y", mpn: "Z", suppliers: [{ name: "L", stock: -1 }] }] }), /alternates\[0\]: suppliers\[0\]: stock is a whole number/);
});

test("a shared stock, a pre-order count, an offer through another supplier's service, stock on its way, per-term dates, a single price, and a part's need", () => {
  const sourcing = {
    suppliers: [
      { name: "JLCPCB parts library", sku: "C530677", currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 0.1114 }], stock: 1984, preorder: 1816, pool: "LCSC warehouse", supplier: "suppliers/jlcpcb.supplier.tsx", source: "JLC parts API", date: "2026-11-03", dates: { priceBreaks: "2026-11-02" } },
      { name: "LCSC", sku: "C530677", currency: "USD", priceBreaks: [{ quantity: 5, unitPrice: 0.1105 }], stock: 1675, pool: "LCSC warehouse", source: "LCSC product API", date: "2026-11-03" },
      { name: "DigiKey", currency: "USD", priceBreaks: [{ unitPrice: 0.66 }], stock: 0, incoming: [{ quantity: 3000, date: "2026-11-05" }], supplier: "suppliers/digikey.supplier.tsx", via: "suppliers/jlcpcb.supplier.tsx", service: "global-sourcing", source: "digikey.com, the quantity of the price not read", date: "2026-11-03" },
    ],
    need: { spares: 334, attrition: 0.05 },
  };
  const { graph: g } = declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "P1", pins: ["1"], mpn: "KH-205580-DZ", ...sourcing })] }) });
  assert.deepEqual(props(g.nodes.P1!.inputs).slice(1), [
    ["JLCPCB parts library Part", "C530677"],
    ["JLCPCB parts library Terms", '{"currency":"USD","priceBreaks":[[1,0.1114]],"stock":1984,"preorder":1816,"pool":"LCSC warehouse","supplier":"suppliers/jlcpcb.supplier.tsx","source":"JLC parts API","date":"2026-11-03","dates":{"priceBreaks":"2026-11-02"}}'],
    ["LCSC Part", "C530677"],
    ["LCSC Terms", '{"currency":"USD","priceBreaks":[[5,0.1105]],"stock":1675,"pool":"LCSC warehouse","source":"LCSC product API","date":"2026-11-03"}'],
    ["DigiKey Terms", '{"currency":"USD","priceBreaks":[[null,0.66]],"stock":0,"incoming":[{"quantity":3000,"date":"2026-11-05"}],"service":"global-sourcing","via":"suppliers/jlcpcb.supplier.tsx","supplier":"suppliers/digikey.supplier.tsx","source":"digikey.com, the quantity of the price not read","date":"2026-11-03"}'],
    ["Need", '{"spares":334,"attrition":0.05}'],
  ]);
  assert.deepEqual(partFields(g.nodes.P1!.inputs), { mpn: "KH-205580-DZ", ...sourcing });
  const sheet = (p: Record<string, unknown>) => () => declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "U4", pins: ["1"], ...p })] }) });
  assert.throws(sheet({ suppliers: [{ name: "X", preorder: 1.5 }] }), /preorder is a whole number/);
  assert.doesNotThrow(sheet({ suppliers: [{ name: "X", preorder: -3898 }] }), "more promised than held");
  assert.throws(sheet({ suppliers: [{ name: "X", via: "suppliers/jlcpcb.supplier.tsx" }] }), /names that supplier's service/);
  assert.throws(sheet({ suppliers: [{ name: "X", incoming: [{ quantity: 3000, date: "soon" }] }] }), /incoming is a list of \{ quantity, date \}/);
  assert.throws(sheet({ suppliers: [{ name: "X", dates: { colour: "2026-11-03" } }] }), /dates is \{ <term>: YYYY-MM-DD \}/);
  assert.throws(sheet({ suppliers: [{ name: "X", priceBreaks: [{ unitPrice: 1 }, { quantity: 10, unitPrice: 0.9 }] }] }), /one break with no quantity is a single price/);
  assert.throws(sheet({ need: { spares: 1.5 } }), /need.spares is a whole number/);
  assert.throws(sheet({ need: { attrition: 5 } }), /need.attrition is a rate/);
  assert.throws(sheet({ need: { panel: 3 } }), /need.panel is not read/);
  // A pack (a bag of 100 sold as one) is a term of the offer, written after the multiple.
  const { graph: bag } = declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("part", { name: "R1", pins: ["1"], suppliers: [{ name: "Bossard", currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 4.5 }], orderMultiple: 2, pack: 100 }] })] }) });
  assert.deepEqual(props(bag.nodes.R1!.inputs).at(-1), ["Bossard Terms", '{"currency":"USD","priceBreaks":[[1,4.5]],"orderMultiple":2,"pack":100}']);
  assert.throws(sheet({ suppliers: [{ name: "X", pack: 0 }] }), /pack is what one unit sold holds/);
});

test("a circuit's logistics <check> keeps its options; a board's <fab> is one board fact, checked by name", () => {
  const { graph: s } = declarationOf({ default: () => jsx("group", { name: "L", children: [jsx("check", { id: "cost", kind: "cost", options: { quantities: [10, 100] } })] }) });
  assert.deepEqual(s.meta?.checks, [{ id: "cost", kind: "cost", options: { quantities: [10, 100] } }]);
  const board = (...children: unknown[]) => () => declarationOf({ default: jsx("board", { schematic: "L.sch.tsx", width: 20, height: 20, children }) }).graph;
  const fab = { suppliers: [{ name: "JLCPCB", currency: "USD", priceBreaks: [{ quantity: 5, unitPrice: 2 }], leadTimeDays: 7, source: "jlcpcb.com quote", date: "2026-10-15" }], finish: "ENIG", mask: "green", silk: "white", minTrack: 0.09, minSpace: 0.09, minDrill: 0.15, minAnnularRing: 0.13, maxLayers: 6, thicknesses: [1.6], assembly: { house: "JLCPCB", sides: ["top"] }, inspection: { electrical: "flying-probe", acceptance: "boots" }, compliance: { rohs: "compliant", reach: "compliant", eccn: "EAR99" }, shipping: { hsCode: "8534.00", origin: "CN", hazmat: "none" } };
  const g = board(jsx("fab", fab))();
  const facts = Object.values(g.nodes).filter((n) => n.type === "eda.boardfact" && n.inputs.fact === "fab");
  assert.equal(facts.length, 1);
  assert.deepEqual(facts[0]!.inputs, { fact: "fab", ...fab });
  assert.throws(board(jsx("fab", {}), jsx("fab", {})), /a board has one <fab>/);
  assert.throws(board(jsx("fab", { layers: 4 })), /prop layers is not read on a board/);
  assert.throws(board(jsx("fab", { assembly: { house: "JLCPCB", sides: ["left"] } })), /assembly.sides is a list of "top", "bottom"/);
  assert.throws(board(jsx("fab", { inspection: { electrical: "x-ray" } })), /inspection.electrical is one of flying-probe, fixture, none/);
});

test("a 3D document's <item> and <assemble> are lists of the document; <body engineering> takes the logistics fields", () => {
  const { graph: g } = declarationOf({
    default: () =>
      jsx("part", {
        name: "P",
        children: [
          jsx("box", { id: "b", center: [0, 0, 5], size: [10, 10, 10], operation: "new" }),
          jsx("body", { id: "b", engineering: { process: "fdm-printing", make: { device: "devices/ender/definition.tsx", cycleMinutes: 30, ratePerHour: 2, currency: "USD" }, inspection: { procedure: "look", acceptance: "flat" } } }),
          jsx("item", { id: "tape", name: "Foam tape", qty: 2, engineering: { process: "purchased", suppliers: [{ name: "DigiKey", sku: "3M4026-ND" }] } }),
          jsx("assemble", { id: "s1", order: 1, parts: ["b", "tape"], by: "in-house", minutes: 2 }),
        ],
      }),
  });
  assert.deepEqual(g.nodes.items!.inputs.value, [{ id: "tape", name: "Foam tape", qty: 2, engineering: { process: "purchased", suppliers: [{ name: "DigiKey", sku: "3M4026-ND" }] } }]);
  assert.deepEqual(g.nodes.assemblySteps!.inputs.value, [{ id: "s1", order: 1, parts: ["b", "tape"], by: "in-house", minutes: 2 }]);
  const bad = (el: unknown) => () => declarationOf({ default: () => jsx("part", { name: "P", children: [el] }) });
  assert.throws(bad(jsx("body", { id: "b", engineering: { vendor: { name: "X" } } })), /vendor/);
  assert.throws(bad(jsx("item", { id: "t", name: "T", qty: 0 })), /qty/);
  assert.throws(bad(jsx("body", { id: "b", engineering: { lifecycle: { status: "dead" } } })), /status/);
  // A part's need and an offer's shared stock, through another supplier's service, are engineering fields too.
  const pin = { process: "purchased", need: { spares: 334, attrition: 0.05, multiple: 3 }, suppliers: [{ name: "DigiKey", via: "suppliers/jlcpcb.supplier.tsx", service: "global-sourcing", pool: "DigiKey", preorder: -5, incoming: [{ quantity: 3000, date: "2026-11-05" }], dates: { stock: "2026-11-03" }, priceBreaks: [{ unitPrice: 0.66 }] }] };
  assert.doesNotThrow(bad(jsx("item", { id: "pin", name: "Pin", qty: 1128, engineering: pin })));
  assert.throws(bad(jsx("item", { id: "pin", name: "Pin", engineering: { need: { multiple: 0 } } })), /multiple/);
  assert.throws(bad(jsx("item", { id: "pin", name: "Pin", engineering: { need: { panels: 2 } } })), /panels/);
  // A bulk quantity: 0.64 m of webbing a product, a third of a strip, an offer that sells it in 2 m strips.
  const strip = { process: "purchased", need: { attrition: 0.05, spares: 0.5 }, suppliers: [{ name: "eBay", pack: 2, currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 2.23 }] }] };
  assert.doesNotThrow(bad(jsx("item", { id: "web", name: "Webbing", qty: 0.64, unit: "m", engineering: strip })));
  assert.doesNotThrow(bad(jsx("item", { id: "foam", name: "Foam strip", qty: 0.3333 })));
  assert.throws(bad(jsx("item", { id: "web", name: "Webbing", qty: 0.64, unit: "yd" })), /unit/);
  assert.throws(bad(jsx("item", { id: "web", name: "Webbing", engineering: { suppliers: [{ name: "eBay", pack: 0 }] } })), /pack/);
});

test("a 3D document's <product> is a list of the document; a made part's stock and a gas's shutoff are engineering fields", () => {
  const product = { id: "kit", name: "Sensor kit", compliance: { eccn: "EAR99", certifications: ["CE"] }, shipping: { hsCode: "9026.80", packaged: { size: [120, 90, 60], grams: 240 }, packaging: "carton" } };
  const stock = { name: "PETG, 1 kg spool", perPart: 0.05, suppliers: [{ name: "S", currency: "USD", priceBreaks: [{ quantity: 1, unitPrice: 20 }] }] };
  const { graph: g } = declarationOf({
    default: () =>
      jsx("part", {
        name: "P",
        children: [
          jsx("product", product),
          jsx("item", { id: "base", name: "Base", engineering: { process: "fdm-printing", make: { shop: "S", stock } } }),
          jsx("item", { id: "sih4", name: "Silane", engineering: { process: "purchased", chemical: { substance: "silane", shutoff: "a detector closes the valve" } } }),
        ],
      }),
  });
  assert.deepEqual(g.nodes.products!.inputs.value, [product]);
  const bad = (el: unknown) => () => declarationOf({ default: () => jsx("part", { name: "P", children: [el] }) });
  assert.throws(bad(jsx("product", { id: "kit" })), /name/);
  assert.throws(bad(jsx("item", { id: "b", name: "B", engineering: { make: { stock: { name: "S", perPart: 0 } } } })), /perPart/);
  // A stock in grams: 88 g of PETG a part, sold in 1 kg spools.
  assert.doesNotThrow(bad(jsx("item", { id: "b", name: "B", engineering: { process: "fdm-printing", make: { shop: "S", stock: { name: "PETG", perPart: 88, unit: "g", suppliers: [{ name: "Prusa", pack: 1000 }] } } } })));
  assert.throws(bad(jsx("item", { id: "b", name: "B", engineering: { make: { stock: { name: "S", perPart: 88, unit: "lb" } } } })), /unit/);
});
