/**
 * A PART'S FIELDS: what a part states beyond its value, each one KiCad `property` form on the part (`foreign`, the form
 * the board editor writes), so the BOM, the KiCad board, a 3D body's join and the checks read one thing. A schematic's
 * part (`./sheet.ts`) and a circuit's part (`./eda.ts`, `component(…)`) take the same arguments.
 *
 *   partNumber manufacturer mpn rating attrs={{ Tolerance: "1%" }}           its engineering data (CommandAGI IPN,
 *                                                                           Manufacturer, MPN, Rating, attrs by name)
 *   pinoutVerified footprintVerified                                        how its symbol's pin numbers and names,
 *                                                                           and its footprint's pads, are known:
 *                                                                           "memory", "datasheet <url> p. <page>,
 *                                                                           <YYYY-MM-DD>" or "measured <YYYY-MM-DD>[, <how>]"
 *   packageDimensions                                                       the datasheet's package: "<n> pins, pitch
 *                                                                           <mm> mm, body <l> x <w> mm"
 *   suppliers={[{ name, sku, url, currency, priceBreaks, moq, orderMultiple, leadTimeDays, stock, source, date }]}
 *   alternates={[{ manufacturer, mpn, note }]}  datasheet="https://…"
 *   lifecycle={{ status, lastTimeBuy, onHand, reorderPoint, source, date }}
 *   compliance={{ rohs, rohsExemption, reach, conflictMinerals, eccn, certifications }}
 *   shipping={{ hsCode, origin, hazmat, packaging }}                        its logistics (docs/formats.md § logistics)
 *
 * `datasheet` says where the part's datasheet is (KiCad's own `Datasheet` field, for people and the BOM); it claims
 * nothing. `pinoutVerified` and `footprintVerified` claim that a page of a datasheet (or a measurement) was checked
 * against the symbol or the footprint, on a date. `<check kind="pinout">` and `<check kind="footprint">` read those
 * claims and `packageDimensions` (docs/eda-authoring.md § datasheet-checked parts); the sourcing check reads
 * `datasheet` (docs/formats.md § logistics).
 *
 * A supplier is two properties: `<name> Part` (its sku; `LCSC Part` is what JLCPCB's assembly BOM reads) and
 * `<name> Terms` (the rest as compact JSON, a price break as [quantity, unitPrice]). `Alternates` is JSON; a facet's
 * fields are one property each (`Lifecycle`, `RoHS`, `HS Code` …). The repository's decoder is
 * `packages/domain/world/logistics.js`; the Python and Rust SDKs write and read the same forms.
 */

/** The text fields named by an argument, by the KiCad property each writes. */
export const PART_FIELDS: Readonly<Record<string, string>> = {
  partNumber: "CommandAGI IPN",
  manufacturer: "Manufacturer",
  mpn: "MPN",
  rating: "Rating",
  pinoutVerified: "Pinout Verified",
  footprintVerified: "Footprint Verified",
  packageDimensions: "Package Dimensions",
};
const FIELD_EXAMPLES: Record<string, string> = {
  partNumber: "MF-R-3K",
  manufacturer: "Yageo",
  mpn: "RC0805FR-073KL",
  rating: "0.125 W",
  pinoutVerified: "datasheet https://www.ti.com/lit/ds/symlink/sn74lvc1t45.pdf p. 3, 2026-10-15",
  footprintVerified: "measured 2026-10-15, calipers on the reel's part",
  packageDimensions: "6 pins, pitch 0.95 mm, body 2.9 x 1.6 mm",
};
/** How a pinout or a footprint is known (`pinoutVerified`, `footprintVerified`). */
export const VERIFIED = /^(?:memory|datasheet https?:\/\/\S+ p\. \d+, \d{4}-\d{2}-\d{2}|measured \d{4}-\d{2}-\d{2}(?:, .+)?)$/;
/** A datasheet's package numbers (`packageDimensions`). */
export const PACKAGE = /^\d+ pins, pitch \d+(?:\.\d+)? mm, body \d+(?:\.\d+)? x \d+(?:\.\d+)? mm$/;
const GRAMMAR: Record<string, RegExp> = { pinoutVerified: VERIFIED, footprintVerified: VERIFIED, packageDimensions: PACKAGE };

/** The logistics facets that are objects of fields: field → KiCad property. */
export const FACET_FIELDS: Readonly<Record<"lifecycle" | "compliance" | "shipping", Readonly<Record<string, string>>>> = {
  lifecycle: { status: "Lifecycle", lastTimeBuy: "Last Time Buy", onHand: "On Hand", reorderPoint: "Reorder Point", source: "Lifecycle Source", date: "Lifecycle Date" },
  compliance: { rohs: "RoHS", rohsExemption: "RoHS Exemption", reach: "REACH", conflictMinerals: "Conflict Minerals", eccn: "ECCN", certifications: "Certifications" },
  shipping: { hsCode: "HS Code", origin: "Country of Origin", hazmat: "Hazmat", packaging: "Packaging" },
};
const CHOICES: Record<string, readonly string[]> = {
  "lifecycle.status": ["active", "nrnd", "eol", "obsolete"],
  "compliance.rohs": ["compliant", "exempt", "non-compliant"],
  "compliance.reach": ["compliant", "svhc", "non-compliant"],
  "compliance.conflictMinerals": ["none", "reported", "unknown"],
};
const COUNTS = new Set(["lifecycle.onHand", "lifecycle.reorderPoint"]);
const DATES = new Set(["lifecycle.lastTimeBuy", "lifecycle.date"]);
const OFFER_TERMS = ["currency", "priceBreaks", "moq", "orderMultiple", "leadTimeDays", "stock", "url", "source", "date"] as const;
const OFFER_KEYS = new Set(["name", "sku", ...OFFER_TERMS]);
/** The arguments a part's fields take, in the order their forms are written. */
export const FIELD_ARGUMENTS: readonly string[] = [...Object.keys(PART_FIELDS), "attrs", "suppliers", "alternates", "datasheet", "lifecycle", "compliance", "shipping"];
/** Fields a part holds otherwise: its reference, its value, its footprint. */
const OWN_FIELDS = new Set(["Reference", "Value", "Footprint"]);

export interface SupplierOffer {
  name: string;
  sku?: string;
  url?: string;
  currency?: string;
  priceBreaks?: { quantity: number; unitPrice: number }[];
  moq?: number;
  orderMultiple?: number;
  leadTimeDays?: number;
  stock?: number;
  source?: string;
  date?: string;
}
export interface PartFields {
  partNumber?: string;
  manufacturer?: string;
  mpn?: string;
  rating?: string;
  pinoutVerified?: string;
  footprintVerified?: string;
  packageDimensions?: string;
  attrs?: Record<string, string>;
  suppliers?: SupplierOffer[];
  alternates?: { manufacturer: string; mpn: string; note?: string }[];
  datasheet?: string;
  lifecycle?: Record<string, string | number>;
  compliance?: Record<string, string | string[]>;
  shipping?: Record<string, string>;
}

const atomOf = (v: string, q: boolean) => ({ kind: "atom", v, q });
const listOf = (...items: unknown[]) => ({ kind: "list", items });
/** One field as the part carries it: `(property "MPN" "…" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))`. */
export function fieldForm(name: string, value: string) {
  const sym = (v: string) => atomOf(v, false);
  return listOf(sym("property"), atomOf(name, true), atomOf(value, true), listOf(sym("at"), sym("0"), sym("0"), sym("0")),
    listOf(sym("effects"), listOf(sym("font"), listOf(sym("size"), sym("1.27"), sym("1.27"))), listOf(sym("hide"), sym("yes"))));
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const whole = (v: unknown, min: number) => typeof v === "number" && Number.isInteger(v) && v >= min;

/** The argument that says a KiCad property, or null when `attrs` may hold it. */
function argumentOf(name: string): string | null {
  const p3 = Object.entries(PART_FIELDS).find(([, n]) => n === name)?.[0];
  if (p3) return p3;
  if (name === "Datasheet") return "datasheet";
  if (name === "Alternates") return "alternates";
  for (const [arg, fields] of Object.entries(FACET_FIELDS)) if (Object.values(fields).includes(name)) return arg;
  return /. (Part|Terms)$/.test(name) ? "suppliers" : null;
}

/** Suppliers' offers, each term checked; a wrong one is refused by name. A board's `<fab suppliers>` reads them too. */
export function checkOffers(where: string, v: unknown): SupplierOffer[] {
  if (!Array.isArray(v) || !v.length) throw new Error(`${where}: suppliers is a list of offers ([{ name: "LCSC", sku: "C25744", … }])`);
  const names = new Set<string>();
  return v.map((s, i) => {
    const at = `${where}: suppliers[${i}]`;
    if (!isObject(s)) throw new Error(`${at} is an offer ({ name, sku, currency, priceBreaks, … })`);
    for (const k of Object.keys(s)) if (!OFFER_KEYS.has(k)) throw new Error(`${at}: ${k} is not a term of an offer (it takes ${[...OFFER_KEYS].join(", ")})`);
    if (!isText(s.name) || /[{}"]/.test(s.name)) throw new Error(`${at}: name is the supplier's name ("LCSC")`);
    if (names.has(s.name)) throw new Error(`${at}: two offers of ${s.name}`);
    names.add(s.name);
    if (s.sku !== undefined && !isText(s.sku)) throw new Error(`${at}: sku is the supplier's part number, text`);
    for (const k of ["url", "source"] as const) if (s[k] !== undefined && !isText(s[k])) throw new Error(`${at}: ${k} is text`);
    if (s.currency !== undefined && !(typeof s.currency === "string" && /^[A-Z]{3}$/.test(s.currency))) throw new Error(`${at}: currency is an ISO 4217 code ("USD")`);
    if (s.date !== undefined && !(typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date))) throw new Error(`${at}: date is YYYY-MM-DD`);
    if (s.moq !== undefined && !whole(s.moq, 1)) throw new Error(`${at}: moq is a whole number, 1 or more`);
    if (s.orderMultiple !== undefined && !whole(s.orderMultiple, 1)) throw new Error(`${at}: orderMultiple is a whole number, 1 or more`);
    if (s.stock !== undefined && !whole(s.stock, 0)) throw new Error(`${at}: stock is a whole number`);
    if (s.leadTimeDays !== undefined && !(typeof s.leadTimeDays === "number" && s.leadTimeDays >= 0)) throw new Error(`${at}: leadTimeDays is a number of days`);
    if (s.priceBreaks !== undefined) {
      const ok = Array.isArray(s.priceBreaks) && s.priceBreaks.every((b) => isObject(b) && whole(b.quantity, 1) && typeof b.unitPrice === "number" && b.unitPrice >= 0 && Object.keys(b).length === 2);
      if (!ok) throw new Error(`${at}: priceBreaks is a list of { quantity, unitPrice } (quantity a whole number from 1, unitPrice 0 or more)`);
    }
    return JSON.parse(JSON.stringify(s)) as SupplierOffer;
  });
}

function offerForms(where: string, v: unknown): ReturnType<typeof fieldForm>[] {
  return checkOffers(where, v).flatMap((s) => {
    const terms: Record<string, unknown> = {};
    for (const k of OFFER_TERMS) if (s[k] !== undefined) terms[k] = k === "priceBreaks" ? (s[k] as { quantity: number; unitPrice: number }[]).map((b) => [b.quantity, b.unitPrice]) : s[k];
    return [
      ...(s.sku !== undefined ? [fieldForm(`${s.name} Part`, s.sku as string)] : []),
      ...(Object.keys(terms).length || s.sku === undefined ? [fieldForm(`${s.name} Terms`, JSON.stringify(terms))] : []),
    ];
  });
}

/**
 * The `property` forms of a part's fields, from its arguments (`props`): the text fields, `attrs`, then its logistics. A wrong
 * argument is refused by name, with `where` (the element or the call) first.
 */
export function partFieldForms(where: string, props: Readonly<Record<string, unknown>>): unknown[] {
  const forms: unknown[] = [];
  for (const [prop, name] of Object.entries(PART_FIELDS)) {
    const v = props[prop];
    if (v === undefined) continue;
    if (!isText(v) || (GRAMMAR[prop] && !GRAMMAR[prop]!.test(v))) throw new Error(`${where}: ${prop} is text ("${FIELD_EXAMPLES[prop]}")`);
    forms.push(fieldForm(name, v));
  }
  const attrs = props.attrs;
  if (attrs !== undefined) {
    if (!isObject(attrs) || !Object.values(attrs).every(isText)) throw new Error(`${where}: attrs is an object of text ({ Tolerance: "1%" })`);
    for (const [name, v] of Object.entries(attrs as Record<string, string>)) {
      const named = argumentOf(name);
      if (named) throw new Error(`${where}: attrs names ${name}: say it with ${named}=`);
      if (OWN_FIELDS.has(name) || !name.trim()) throw new Error(`${where}: attrs names ${name}, which is the part's own (its name, value or footprint)`);
      forms.push(fieldForm(name, v));
    }
  }
  if (props.suppliers !== undefined) forms.push(...offerForms(where, props.suppliers));
  if (props.alternates !== undefined) {
    const v = props.alternates;
    if (!Array.isArray(v) || !v.length || !v.every((a) => isObject(a) && isText(a.manufacturer) && isText(a.mpn) && (a.note === undefined || isText(a.note)) && Object.keys(a).every((k) => ["manufacturer", "mpn", "note"].includes(k))))
      throw new Error(`${where}: alternates is a list of { manufacturer, mpn, note? }`);
    forms.push(fieldForm("Alternates", JSON.stringify(v)));
  }
  if (props.datasheet !== undefined) {
    if (!isText(props.datasheet)) throw new Error(`${where}: datasheet is a URL or a path`);
    forms.push(fieldForm("Datasheet", props.datasheet));
  }
  for (const [arg, fields] of Object.entries(FACET_FIELDS)) {
    const v = props[arg];
    if (v === undefined) continue;
    const facet = checkFacet(where, arg as keyof typeof FACET_FIELDS, v);
    for (const [k, prop] of Object.entries(fields)) {
      const x = facet[k];
      if (x !== undefined) forms.push(fieldForm(prop, Array.isArray(x) ? x.join(", ") : String(x)));
    }
  }
  return forms;
}

/** One facet's fields (`lifecycle`, `compliance`, `shipping`), each checked; a board's `<fab>` reads them too. */
export function checkFacet(where: string, arg: keyof typeof FACET_FIELDS, v: unknown): Record<string, string | number | string[]> {
  const fields = FACET_FIELDS[arg];
  if (!isObject(v)) throw new Error(`${where}: ${arg} is an object ({ ${Object.keys(fields).join(", ")} })`);
  for (const k of Object.keys(v)) if (!(k in fields)) throw new Error(`${where}: ${arg}.${k} is not read (it takes ${Object.keys(fields).join(", ")})`);
  if (arg === "lifecycle" && v.status === undefined) throw new Error(`${where}: lifecycle needs its status (${CHOICES["lifecycle.status"]!.join(", ")})`);
  for (const k of Object.keys(fields)) {
    const x = v[k];
    if (x === undefined) continue;
    const key = `${arg}.${k}`;
    if (COUNTS.has(key)) {
      if (!whole(x, 0)) throw new Error(`${where}: ${key} is a whole number`);
    } else if (k === "certifications") {
      if (!Array.isArray(x) || !x.every((c) => isText(c) && !c.includes(","))) throw new Error(`${where}: ${key} is a list of text, each with no comma`);
    } else {
      if (!isText(x)) throw new Error(`${where}: ${key} is text`);
      if (CHOICES[key] && !CHOICES[key]!.includes(x)) throw new Error(`${where}: ${key} is one of ${CHOICES[key]!.join(", ")} (got "${x}")`);
      if (DATES.has(key) && !/^\d{4}-\d{2}-\d{2}$/.test(x)) throw new Error(`${where}: ${key} is YYYY-MM-DD`);
      if (key === "shipping.origin" && !/^[A-Z]{2}$/.test(x)) throw new Error(`${where}: ${key} is an ISO 3166 alpha-2 code ("CN")`);
    }
  }
  return JSON.parse(JSON.stringify(v));
}

/**
 * A part's fields read back from its node's inputs (the `property` forms it carries): the named ones by their
 * argument, the logistics by theirs, any other in `attrs`. A part with none gives `{}`.
 */
export function partFields(inputs: Readonly<Record<string, unknown>>): PartFields {
  const out: Record<string, unknown> = {};
  const attrs: Record<string, string> = {};
  const suppliers = new Map<string, SupplierOffer>();
  const supplier = (name: string) => suppliers.get(name) ?? suppliers.set(name, { name }).get(name)!;
  for (const form of (Array.isArray(inputs.foreign) ? inputs.foreign : []) as { kind?: string; items?: { kind?: string; v?: string }[] }[]) {
    const [head, nameAtom, valueAtom] = form?.items ?? [];
    const name = nameAtom?.v, value = valueAtom?.v;
    if (form?.kind !== "list" || head?.v !== "property" || typeof name !== "string" || typeof value !== "string" || OWN_FIELDS.has(name)) continue;
    const arg = argumentOf(name);
    if (arg && arg in PART_FIELDS) out[arg] = value;
    else if (arg === "suppliers" && name.endsWith(" Part")) supplier(name.slice(0, -5)).sku = value;
    else if (arg === "suppliers") {
      const terms = JSON.parse(value) as Record<string, unknown>;
      const s = supplier(name.slice(0, -6)) as unknown as Record<string, unknown>;
      for (const k of OFFER_TERMS) if (terms[k] !== undefined) s[k] = k === "priceBreaks" ? (terms[k] as [number, number][]).map(([quantity, unitPrice]) => ({ quantity, unitPrice })) : terms[k];
    } else if (arg === "alternates") out.alternates = JSON.parse(value);
    else if (arg === "datasheet") out.datasheet = value;
    else if (arg) {
      const fields = FACET_FIELDS[arg as keyof typeof FACET_FIELDS];
      const key = Object.entries(fields).find(([, p]) => p === name)![0];
      const facet = ((out[arg] as Record<string, unknown>) ??= {});
      facet[key] = key === "certifications" ? value.split(",").map((c) => c.trim()).filter(Boolean) : COUNTS.has(`${arg}.${key}`) ? Number(value) : value;
    } else attrs[name] = value;
  }
  if (suppliers.size) out.suppliers = [...suppliers.values()];
  return { ...out, ...(Object.keys(attrs).length ? { attrs } : {}) } as PartFields;
}
