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
  assert.throws(sheet({ attrs: { "LCSC Part": "C1" } }), /attrs names LCSC Part: say it with suppliers=/);
  assert.throws(sheet({ attrs: { RoHS: "compliant" } }), /attrs names RoHS: say it with compliance=/);
  assert.throws(sheet({ attrs: { Datasheet: "x" } }), /attrs names Datasheet: say it with datasheet=/);
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
});
