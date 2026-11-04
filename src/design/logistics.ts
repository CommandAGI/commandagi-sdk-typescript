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
 * A supplier's `<service id>` is a way to buy through it (JLCPCB's pre-order, global sourcing, consignment): its review
 * and buying days and its `<fee amount currency per each?>`s (per order, per line, per unit, in groups of `each`); an
 * offer names it (`service`). A plan's `build` is the day every part must be at the builder, and a `<source part
 * strategy>` says how one line is filled for this order: `single`, `fill` (in order, each up to its stock), `split`
 * (each `<use qty>`; one with none takes the rest) or `dual` (each `<use share>`, on purpose). A `<use offer mpn?>`
 * names an offer of the part, or of its alternate by MPN. A service whose days are `businessDays` counts Monday to
 * Friday only.
 *
 * A plan may buy ahead for a later plan: `<ahead qty for>` in a `<source>` buys `qty` more than this order needs, by
 * the same offers, for the plan `for` names (a ref). That plan counts them as stock on hand: `<stock from>` names the
 * earlier plan and takes what it bought ahead for this one (`part` narrows it to one line). Stock held otherwise (left
 * from a build, consigned) is `<stock part qty arrives?>`; `arrives` is the day it is there (with `from`, the earlier
 * plan's build date). A `<source>` with only an `<ahead>` keeps the default fill and needs no strategy.
 *
 *   <logistics name="helmet, 10" quantity={10} build="2027-01-15">
 *     <source part="FT2232HL-REEL" strategy="fill">
 *       <use offer="JLCPCB parts library" /><use offer="JLCPCB parts library" mpn="FT2232HL-TRAY" />
 *       <ahead qty={157} for="Helmet 100.logistics.tsx" />
 *     </source>
 *   </logistics>
 *   <logistics name="helmet, 100" quantity={100} build="2027-06-01">
 *     <stock from="Helmet 10.logistics.tsx" />
 *   </logistics>
 *
 *   <supplier name="JLCPCB" …>
 *     <service id="global-sourcing" name="Global sourcing" reviewDays={1} reviewDaysHigh={3} leadTimeDays={9} leadTimeDaysHigh={20}>
 *       <fee amount={20} currency="USD" per="line" note="connectors, switches, fuses and batteries" />
 *     </service>
 *   </supplier>
 *   <logistics name="helmet" quantity={10} build="2027-01-15">
 *     <source part="KH-205580-DZ" strategy="fill"><use offer="JLCPCB parts library" /><use offer="LCSC" /></source>
 *   </logistics>
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
  /** The postal code a carrier rates by (a ZIP code in the US). */
  postal?: string;
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
/** One fee of a service: per order, per line (a part type) or per unit, in groups of `each`. */
export interface ServiceFee {
  amount: number;
  currency: string;
  per: "order" | "line" | "unit";
  each?: number;
  note?: string;
}
/** A way to buy through a supplier: its review and buying days, and its fees. */
export interface SupplierService {
  id: string;
  name?: string;
  reviewDays?: number;
  reviewDaysHigh?: number;
  leadTimeDays?: number;
  leadTimeDaysHigh?: number;
  /** Its review and buying days are business days (Monday to Friday), not calendar days. */
  businessDays?: boolean;
  note?: string;
  fees: ServiceFee[];
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
  services: SupplierService[];
}
export interface LogisticsLeg {
  carrier: string;
  service?: string;
  transitDays?: number;
  cost?: number;
  currency?: string;
  /**
   * "Quote this": the shipping interface quotes the leg live (docs/shipping.md) and the plan's view shows the quote
   * beside the stated cost. `cheapest`, `fastest`, a carrier (`usps`), or a carrier and its service code
   * (`usps/PRIORITY_MAIL`). The parcel it rates is `kg` and `mm`; both ends state a country and a postal code.
   */
  quote?: string;
  /** The parcel's weight, kilograms. */
  kg?: number;
  /** The parcel's outside length, width and height, millimetres. */
  mm?: [number, number, number];
  /** Where the leg ends; absent: at the builder. */
  to?: Place;
}
export interface LogisticsRoute {
  /** A ref to a `.supplier.tsx`, by the plan's folder. */
  supplier: string;
  legs: LogisticsLeg[];
}
/** One offer a plan fills a line from: the part's own (`offer`), or its alternate's (`mpn`). */
export interface SourceUse {
  offer: string;
  mpn?: string;
  qty?: number;
  share?: number;
}
/** Units a plan buys past its own need, for a later plan (`for`, a ref by this plan's folder). */
export interface SourceAhead {
  qty: number;
  for: string;
  note?: string;
}
/**
 * How a plan fills one line (a part number, an MPN or a line's id) for its order. With no `uses` the line keeps its
 * default fill (a source that only buys ahead), and states no strategy.
 */
export interface LogisticsSource {
  part: string;
  strategy?: "single" | "fill" | "split" | "dual";
  uses: SourceUse[];
  ahead?: SourceAhead;
}
/**
 * Stock this order already holds: what an earlier plan bought ahead for it (`from`, a ref; `part` narrows it to one
 * line), or a stated `qty` of a `part`. `arrives`: the day it is there, YYYY-MM-DD.
 */
export interface LogisticsStock {
  part?: string;
  qty?: number;
  from?: string;
  arrives?: string;
  note?: string;
}
/** A logistics plan as its file declares it. */
export interface LogisticsDoc {
  name?: string;
  /** How many products the order builds. */
  quantity?: number;
  /** The day every part must be at the builder, YYYY-MM-DD: the orders' order-by dates count back from it. */
  build?: string;
  /** The designs whose roll-up is the bill of materials: a ref by the plan's folder, and how many per product. */
  boms: { ref: string; qty?: number }[];
  builder?: Place;
  routes: LogisticsRoute[];
  sources: LogisticsSource[];
  /** Stock on hand; absent when the plan holds none. */
  stocks?: LogisticsStock[];
}

export const PLACE_FIELDS = ["name", "lat", "lon", "country", "postal", "address"] as const;
export const SUPPLIER_FIELDS = ["name", "url", "leadTimeDays", "note"] as const;
export const SHIPS_FIELDS = ["carrier", "service", "transitDays", "note"] as const;
export const CONTACT_FIELDS = ["name", "role", "email", "phone"] as const;
export const LOGISTICS_FIELDS = ["name", "quantity", "build"] as const;
export const SERVICE_FIELDS = ["id", "name", "reviewDays", "reviewDaysHigh", "leadTimeDays", "leadTimeDaysHigh", "businessDays", "note"] as const;
export const FEE_FIELDS = ["amount", "currency", "per", "each", "note"] as const;
export const SOURCING_FIELDS = ["part", "strategy"] as const;
export const SOURCING_USE_FIELDS = ["offer", "mpn", "qty", "share"] as const;
export const AHEAD_FIELDS = ["qty", "for", "note"] as const;
export const STOCK_FIELDS = ["part", "qty", "from", "arrives", "note"] as const;
const STRATEGIES = ["single", "fill", "split", "dual"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const BOM_FIELDS = ["ref", "qty"] as const;
export const LEG_FIELDS = ["carrier", "service", "transitDays", "cost", "currency", "quote", "kg", "mm", "to", "lat", "lon", "country", "postal"] as const;
/** What a leg's quote asks for: cheapest, fastest, a carrier, or a carrier and its service code. */
const WANT = /^(?:cheapest|fastest|[a-z][a-z0-9-]{1,31}(?:\/[A-Za-z0-9_.-]{1,64})?)$/;

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
  text(tag, a, ["postal", "address"]);
  return { name: a[name] as string, lat: a.lat, lon: a.lon, ...(a.country ? { country: a.country as string } : {}), ...(a.postal ? { postal: a.postal as string } : {}), ...(a.address ? { address: a.address as string } : {}) };
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
    service: { parents: ["supplier"], required: ["id"], attrs: SERVICE_FIELDS },
    fee: { parents: ["service"], required: ["amount", "currency", "per"], attrs: FEE_FIELDS },
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
    const services = t.children.filter((c) => c.tag === "service").map((c) => {
      text("service", c.attrs, ["id", "name", "note"]);
      count("service", c.attrs, ["reviewDays", "reviewDaysHigh", "leadTimeDays", "leadTimeDaysHigh"]);
      if (c.attrs.businessDays !== undefined && typeof c.attrs.businessDays !== "boolean") throw new Error("<service> businessDays is true or false");
      const fees = c.children.filter((f) => f.tag === "fee").map((f) => {
        const a = f.attrs;
        count("fee", a, ["amount"]);
        if (!(typeof a.currency === "string" && /^[A-Z]{3}$/.test(a.currency))) throw new Error('<fee> currency is ISO 4217 ("USD")');
        if (!["order", "line", "unit"].includes(a.per as string)) throw new Error("<fee> per is order, line or unit");
        if (a.each !== undefined && !(Number.isInteger(a.each) && (a.each as number) >= 1)) throw new Error("<fee> each is a whole number, 1 or more");
        text("fee", a, ["note"]);
        return fields(a, FEE_FIELDS) as unknown as ServiceFee;
      });
      return { ...(fields(c.attrs, SERVICE_FIELDS) as unknown as Omit<SupplierService, "fees">), fees };
    });
    return { ...(fields(t.attrs, SUPPLIER_FIELDS) as unknown as Pick<SupplierDoc, "name">), ...(location ? { location: place("location", location.attrs) } : {}), ships, contacts, services };
  },
  toTree(d) {
    const children: DocTree[] = [];
    if (d.location) children.push({ tag: "location", attrs: placeAttrs(d.location), children: [] });
    for (const s of d.ships ?? []) children.push({ tag: "ships", attrs: fields(s as unknown as Record<string, unknown>, SHIPS_FIELDS), children: [] });
    for (const c of d.contacts ?? []) children.push({ tag: "contact", attrs: fields(c as Record<string, unknown>, CONTACT_FIELDS), children: [] });
    for (const v of d.services ?? [])
      children.push({ tag: "service", attrs: fields(v as unknown as Record<string, unknown>, SERVICE_FIELDS), children: v.fees.map((f) => ({ tag: "fee", attrs: fields(f as unknown as Record<string, unknown>, FEE_FIELDS), children: [] })) });
    return { tag: "supplier", attrs: fields(d as unknown as Record<string, unknown>, SUPPLIER_FIELDS), children };
  },
  empty: (name) => ({ name, ships: [], contacts: [], services: [] }),
};

registerVocabulary(supplierVocabulary);

function leg(c: DocTree): LogisticsLeg {
  const a = c.attrs;
  text("leg", a, ["carrier", "service", "to"]);
  count("leg", a, ["transitDays", "cost"]);
  if (a.currency !== undefined && !(typeof a.currency === "string" && /^[A-Z]{3}$/.test(a.currency))) throw new Error('<leg> currency is ISO 4217 ("USD")');
  if (a.cost !== undefined && a.currency === undefined) throw new Error("<leg> cost states its currency");
  if (a.quote !== undefined && !(typeof a.quote === "string" && WANT.test(a.quote))) throw new Error("<leg> quote is cheapest, fastest, a carrier (usps), or a carrier and its service code (usps/PRIORITY_MAIL)");
  if (a.kg !== undefined && !(typeof a.kg === "number" && a.kg > 0)) throw new Error("<leg> kg is the parcel's weight in kilograms, above 0");
  if (a.mm !== undefined && !(Array.isArray(a.mm) && a.mm.length === 3 && a.mm.every((x) => typeof x === "number" && x > 0))) throw new Error("<leg> mm is the parcel's [length, width, height] in millimetres");
  if (a.quote !== undefined && (a.kg === undefined || a.mm === undefined)) throw new Error("<leg> quote needs its parcel: kg and mm");
  const somewhere = a.to !== undefined || a.lat !== undefined || a.lon !== undefined || a.country !== undefined;
  return { ...(fields(a, ["carrier", "service", "transitDays", "cost", "currency", "quote", "kg", "mm"]) as unknown as LogisticsLeg), ...(somewhere ? { to: place("leg", a, "to") } : {}) };
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
    source: { parents: ["logistics"], required: ["part"], attrs: SOURCING_FIELDS },
    use: { parents: ["source"], required: ["offer"], attrs: SOURCING_USE_FIELDS },
    ahead: { parents: ["source"], single: true, required: ["qty", "for"], attrs: AHEAD_FIELDS },
    stock: { parents: ["logistics"], attrs: STOCK_FIELDS },
  },
  fromTree(t) {
    text("logistics", t.attrs, ["name"]);
    if (t.attrs.build !== undefined && !(typeof t.attrs.build === "string" && DATE.test(t.attrs.build))) throw new Error("<logistics> build is a date, YYYY-MM-DD");
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
    const sources = t.children.filter((c) => c.tag === "source").map((c) => {
      text("source", c.attrs, ["part"]);
      const named = c.children.some((u) => u.tag === "use");
      if ((named || c.attrs.strategy !== undefined) && !STRATEGIES.includes(c.attrs.strategy as string)) throw new Error("<source> strategy is single, fill, split or dual");
      const uses = c.children.filter((u) => u.tag === "use").map((u) => {
        text("use", u.attrs, ["offer", "mpn"]);
        if (u.attrs.qty !== undefined && !(typeof u.attrs.qty === "number" && u.attrs.qty > 0)) throw new Error("<use> qty is a number above 0");
        if (u.attrs.share !== undefined && !(typeof u.attrs.share === "number" && u.attrs.share > 0 && u.attrs.share <= 1)) throw new Error("<use> share is a fraction above 0, at most 1");
        return fields(u.attrs, SOURCING_USE_FIELDS) as unknown as SourceUse;
      });
      const a = c.children.find((x) => x.tag === "ahead");
      if (a) {
        if (!(Number.isInteger(a.attrs.qty) && (a.attrs.qty as number) >= 1)) throw new Error("<ahead> qty is a whole number, 1 or more");
        text("ahead", a.attrs, ["for", "note"]);
      }
      if (!named && !a) throw new Error(`<source part="${c.attrs.part}"> names no <use> and no <ahead>`);
      return { part: c.attrs.part as string, ...(c.attrs.strategy !== undefined ? { strategy: c.attrs.strategy as LogisticsSource["strategy"] } : {}), uses, ...(a ? { ahead: fields(a.attrs, AHEAD_FIELDS) as unknown as SourceAhead } : {}) };
    });
    const stocks = t.children.filter((c) => c.tag === "stock").map((c) => {
      const a = c.attrs;
      text("stock", a, ["part", "from", "note"]);
      if (a.arrives !== undefined && !(typeof a.arrives === "string" && DATE.test(a.arrives))) throw new Error("<stock> arrives is a date, YYYY-MM-DD");
      if (a.from !== undefined && a.qty !== undefined) throw new Error("<stock from> takes what that plan bought ahead for this one: it states no qty");
      if (a.from === undefined && (a.part === undefined || a.qty === undefined)) throw new Error("<stock> names the part and its qty, or the plan it is from (from)");
      if (a.qty !== undefined && !(typeof a.qty === "number" && a.qty > 0)) throw new Error("<stock> qty is a number above 0");
      return fields(a, STOCK_FIELDS) as LogisticsStock;
    });
    return { ...(fields(t.attrs, LOGISTICS_FIELDS) as Pick<LogisticsDoc, "name" | "quantity" | "build">), boms, ...(builder ? { builder: place("builder", builder.attrs) } : {}), routes, sources, ...(stocks.length ? { stocks } : {}) };
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
          attrs: { ...fields(l as unknown as Record<string, unknown>, ["carrier", "service"]), ...(l.to ? { to: l.to.name, lat: l.to.lat, lon: l.to.lon, ...(l.to.country ? { country: l.to.country } : {}), ...(l.to.postal ? { postal: l.to.postal } : {}) } : {}), ...fields(l as unknown as Record<string, unknown>, ["transitDays", "cost", "currency", "quote", "kg", "mm"]) },
          children: [],
        })),
      });
    for (const src of d.sources ?? [])
      children.push({
        tag: "source",
        attrs: fields(src as unknown as Record<string, unknown>, SOURCING_FIELDS),
        children: [
          ...src.uses.map((u) => ({ tag: "use", attrs: fields(u as unknown as Record<string, unknown>, SOURCING_USE_FIELDS), children: [] })),
          ...(src.ahead ? [{ tag: "ahead", attrs: fields(src.ahead as unknown as Record<string, unknown>, AHEAD_FIELDS), children: [] }] : []),
        ],
      });
    for (const st of d.stocks ?? []) children.push({ tag: "stock", attrs: fields(st as unknown as Record<string, unknown>, STOCK_FIELDS), children: [] });
    return { tag: "logistics", attrs: fields(d as unknown as Record<string, unknown>, LOGISTICS_FIELDS), children };
  },
  empty: (name) => ({ name, boms: [], routes: [], sources: [] }),
};

registerVocabulary(logisticsVocabulary);

/** The vocabularies of a supply chain, by format. */
export const LOGISTICS = { supplier: supplierVocabulary, logistics: logisticsVocabulary } as const;
