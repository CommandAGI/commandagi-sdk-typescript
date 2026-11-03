/**
 * A SUPPLIER AND A LOGISTICS PLAN IN JSX — a `<name>.supplier.tsx` and a `<name>.logistics.tsx` (docs/formats.md §
 * logistics, in the CommandAGI repository). A design's offers name their supplier by ref; the supplier file says who it
 * is, where it ships from, with which carriers and how soon. A logistics plan is separate from the bill of materials:
 * it names the designs whose roll-up is the BOM, the builder's place, and the legs from each supplier to the builder.
 *
 *   // suppliers/jlcpcb.supplier.tsx
 *   export default () => (
 *     <supplier name="JLCPCB" url="https://jlcpcb.com" leadTimeDays={8}>
 *       <location name="JLCPCB, Shenzhen" lat={22.543} lon={114.058} country="CN" />
 *       <ships carrier="DHL" service="Express Worldwide" transitDays={5} />
 *       <contact role="sales" email="support@jlcpcb.com" />
 *     </supplier>
 *   );
 *
 *   // Tile kit.logistics.tsx
 *   export default () => (
 *     <logistics name="tile kit" quantity={10}>
 *       <bom ref="Tile kit.3d.tsx" />
 *       <builder name="the builder's bench, Austin" lat={30.267} lon={-97.743} country="US" />
 *       <route supplier="suppliers/jlcpcb.supplier.tsx">
 *         <leg carrier="DHL" service="Express pickup" to="DHL hub, Hong Kong" lat={22.308} lon={113.918} country="HK" transitDays={1} cost={6} currency="USD" />
 *         <leg carrier="DHL" service="Express Worldwide" transitDays={4} cost={32} currency="USD" />
 *       </route>
 *     </logistics>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes. A route's
 * legs run in order from the supplier's `<location>`; a leg that names a place (`to`, `lat`, `lon`) ends there, and a
 * leg that names none ends at the builder. A leg's `cost` is for the plan's order (`quantity` products), in its
 * `currency`. Refs (`<bom ref>`, `<route supplier>`) are by the plan's folder. Nothing adds a default.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A place on the Earth: a supplier's warehouse, a hub, the builder's bench. */
export interface Place {
  name: string;
  /** Degrees north. */
  lat: number;
  /** Degrees east. */
  lon: number;
  /** ISO 3166 alpha-2. */
  country?: string;
  address?: string;
}
export interface SupplierShips {
  carrier: string;
  service?: string;
  transitDays?: number;
  note?: string;
}
export interface SupplierContact {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
}
/** A supplier as its file declares it. */
export interface SupplierDoc {
  name: string;
  url?: string;
  /** Days from order to dispatch, when an offer states none. */
  leadTimeDays?: number;
  note?: string;
  location?: Place;
  ships: SupplierShips[];
  contacts: SupplierContact[];
}
export interface LogisticsLeg {
  carrier: string;
  service?: string;
  transitDays?: number;
  cost?: number;
  currency?: string;
  /** Where the leg ends; absent: at the builder. */
  to?: Place;
}
export interface LogisticsRoute {
  /** A ref to a `.supplier.tsx`, by the plan's folder. */
  supplier: string;
  legs: LogisticsLeg[];
}
/** A logistics plan as its file declares it. */
export interface LogisticsDoc {
  name?: string;
  /** How many products the order builds. */
  quantity?: number;
  /** The designs whose roll-up is the bill of materials: a ref by the plan's folder, and how many per product. */
  boms: { ref: string; qty?: number }[];
  builder?: Place;
  routes: LogisticsRoute[];
}

export const PLACE_FIELDS = ["name", "lat", "lon", "country", "address"] as const;
export const SUPPLIER_FIELDS = ["name", "url", "leadTimeDays", "note"] as const;
export const SHIPS_FIELDS = ["carrier", "service", "transitDays", "note"] as const;
export const CONTACT_FIELDS = ["name", "role", "email", "phone"] as const;
export const LOGISTICS_FIELDS = ["name", "quantity"] as const;
export const BOM_FIELDS = ["ref", "qty"] as const;
export const LEG_FIELDS = ["carrier", "service", "transitDays", "cost", "currency", "to", "lat", "lon", "country"] as const;

const fields = (o: Record<string, unknown>, keys: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== "") out[k] = o[k];
  return out;
};
const text = (tag: string, a: Record<string, unknown>, keys: readonly string[]) => {
  for (const k of keys) if (a[k] !== undefined && typeof a[k] !== "string") throw new Error(`<${tag}> ${k} is text`);
};
const count = (tag: string, a: Record<string, unknown>, keys: readonly string[]) => {
  for (const k of keys)
    if (a[k] !== undefined && !(typeof a[k] === "number" && Number.isFinite(a[k]) && (a[k] as number) >= 0)) throw new Error(`<${tag}> ${k} is a number, 0 or more`);
};
function place(tag: string, a: Record<string, unknown>, name = "name"): Place {
  if (typeof a[name] !== "string" || !(a[name] as string).trim()) throw new Error(`<${tag}> ${name} is the place's name`);
  if (typeof a.lat !== "number" || a.lat < -90 || a.lat > 90) throw new Error(`<${tag}> lat is degrees north, -90 to 90`);
  if (typeof a.lon !== "number" || a.lon < -180 || a.lon > 180) throw new Error(`<${tag}> lon is degrees east, -180 to 180`);
  if (a.country !== undefined && !(typeof a.country === "string" && /^[A-Z]{2}$/.test(a.country))) throw new Error(`<${tag}> country is ISO 3166 alpha-2 ("CN")`);
  text(tag, a, ["address"]);
  return { name: a[name] as string, lat: a.lat, lon: a.lon, ...(a.country ? { country: a.country as string } : {}), ...(a.address ? { address: a.address as string } : {}) };
}
const placeAttrs = (p: Place): Record<string, unknown> => fields(p as unknown as Record<string, unknown>, PLACE_FIELDS);

export const supplierVocabulary: Vocabulary<SupplierDoc> = {
  format: "supplier",
  noun: "a supplier",
  root: "supplier",
  tags: {
    supplier: { parents: [], required: ["name"], attrs: SUPPLIER_FIELDS },
    location: { parents: ["supplier"], single: true, required: ["name", "lat", "lon"], attrs: PLACE_FIELDS },
    ships: { parents: ["supplier"], required: ["carrier"], attrs: SHIPS_FIELDS },
    contact: { parents: ["supplier"], attrs: CONTACT_FIELDS },
  },
  fromTree(t) {
    text("supplier", t.attrs, ["name", "url", "note"]);
    count("supplier", t.attrs, ["leadTimeDays"]);
    const location = t.children.find((c) => c.tag === "location");
    const ships = t.children.filter((c) => c.tag === "ships").map((c) => {
      text("ships", c.attrs, ["carrier", "service", "note"]);
      count("ships", c.attrs, ["transitDays"]);
      return fields(c.attrs, SHIPS_FIELDS) as unknown as SupplierShips;
    });
    const contacts = t.children.filter((c) => c.tag === "contact").map((c) => {
      text("contact", c.attrs, CONTACT_FIELDS);
      return fields(c.attrs, CONTACT_FIELDS) as SupplierContact;
    });
    return { ...(fields(t.attrs, SUPPLIER_FIELDS) as unknown as Pick<SupplierDoc, "name">), ...(location ? { location: place("location", location.attrs) } : {}), ships, contacts };
  },
  toTree(d) {
    const children: DocTree[] = [];
    if (d.location) children.push({ tag: "location", attrs: placeAttrs(d.location), children: [] });
    for (const s of d.ships ?? []) children.push({ tag: "ships", attrs: fields(s as unknown as Record<string, unknown>, SHIPS_FIELDS), children: [] });
    for (const c of d.contacts ?? []) children.push({ tag: "contact", attrs: fields(c as Record<string, unknown>, CONTACT_FIELDS), children: [] });
    return { tag: "supplier", attrs: fields(d as unknown as Record<string, unknown>, SUPPLIER_FIELDS), children };
  },
  empty: (name) => ({ name, ships: [], contacts: [] }),
};

registerVocabulary(supplierVocabulary);

function leg(c: DocTree): LogisticsLeg {
  const a = c.attrs;
  text("leg", a, ["carrier", "service", "to"]);
  count("leg", a, ["transitDays", "cost"]);
  if (a.currency !== undefined && !(typeof a.currency === "string" && /^[A-Z]{3}$/.test(a.currency))) throw new Error('<leg> currency is ISO 4217 ("USD")');
  if (a.cost !== undefined && a.currency === undefined) throw new Error("<leg> cost states its currency");
  const somewhere = a.to !== undefined || a.lat !== undefined || a.lon !== undefined || a.country !== undefined;
  return { ...(fields(a, ["carrier", "service", "transitDays", "cost", "currency"]) as unknown as LogisticsLeg), ...(somewhere ? { to: place("leg", a, "to") } : {}) };
}

export const logisticsVocabulary: Vocabulary<LogisticsDoc> = {
  format: "logistics",
  noun: "a logistics plan",
  root: "logistics",
  tags: {
    logistics: { parents: [], attrs: LOGISTICS_FIELDS },
    bom: { parents: ["logistics"], required: ["ref"], attrs: BOM_FIELDS },
    builder: { parents: ["logistics"], single: true, required: ["name", "lat", "lon"], attrs: PLACE_FIELDS },
    route: { parents: ["logistics"], required: ["supplier"], attrs: ["supplier"] },
    leg: { parents: ["route"], required: ["carrier"], attrs: LEG_FIELDS },
  },
  fromTree(t) {
    text("logistics", t.attrs, ["name"]);
    if (t.attrs.quantity !== undefined && !(Number.isInteger(t.attrs.quantity) && (t.attrs.quantity as number) > 0)) throw new Error("<logistics> quantity is a whole number, 1 or more");
    const builder = t.children.find((c) => c.tag === "builder");
    const boms = t.children.filter((c) => c.tag === "bom").map((c) => {
      text("bom", c.attrs, ["ref"]);
      if (c.attrs.qty !== undefined && !(typeof c.attrs.qty === "number" && c.attrs.qty > 0)) throw new Error("<bom> qty is a number above 0");
      return fields(c.attrs, BOM_FIELDS) as unknown as { ref: string; qty?: number };
    });
    const routes = t.children.filter((c) => c.tag === "route").map((r) => {
      text("route", r.attrs, ["supplier"]);
      return { supplier: r.attrs.supplier as string, legs: r.children.filter((c) => c.tag === "leg").map(leg) };
    });
    return { ...(fields(t.attrs, LOGISTICS_FIELDS) as Pick<LogisticsDoc, "name" | "quantity">), boms, ...(builder ? { builder: place("builder", builder.attrs) } : {}), routes };
  },
  toTree(d) {
    const children: DocTree[] = [];
    for (const b of d.boms ?? []) children.push({ tag: "bom", attrs: fields(b as unknown as Record<string, unknown>, BOM_FIELDS), children: [] });
    if (d.builder) children.push({ tag: "builder", attrs: placeAttrs(d.builder), children: [] });
    for (const r of d.routes ?? [])
      children.push({
        tag: "route",
        attrs: { supplier: r.supplier },
        children: r.legs.map((l) => ({
          tag: "leg",
          attrs: { ...fields(l as unknown as Record<string, unknown>, ["carrier", "service"]), ...(l.to ? { to: l.to.name, lat: l.to.lat, lon: l.to.lon, ...(l.to.country ? { country: l.to.country } : {}) } : {}), ...fields(l as unknown as Record<string, unknown>, ["transitDays", "cost", "currency"]) },
          children: [],
        })),
      });
    return { tag: "logistics", attrs: fields(d as unknown as Record<string, unknown>, LOGISTICS_FIELDS), children };
  },
  empty: (name) => ({ name, boms: [], routes: [] }),
};

registerVocabulary(logisticsVocabulary);

/** The vocabularies of a supply chain, by format. */
export const LOGISTICS = { supplier: supplierVocabulary, logistics: logisticsVocabulary } as const;
