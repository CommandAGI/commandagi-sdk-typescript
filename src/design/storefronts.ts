/**
 * A STOREFRONT IN JSX — `<name>.storefront.tsx` (or `.jsx`, `.py`, `.rs`) declares one storefront that its holder lists
 * (docs/formats.md § a storefront in code, in the CommandAGI repository): the store, who sells there, and what it offers.
 * The holder is the account whose Drive holds the file, never an attribute. Publishing the file is the holder's
 * recorded act of accepting liability for the listing; when the holder is not the seller (a relisted store), the
 * holder is the booking agent and the seller stays the seller.
 *
 *   // relisting/digikey/digikey.storefront.tsx: a mirrored store, its listings kept by a script
 *   import { Storefront, Offers } from "commandagi/design";
 *   export default () => (
 *     <Storefront name="DigiKey" venue="digikey" seller="DigiKey" url="https://www.digikey.com" hold="10 minutes">
 *       <Offers listings="Inventory/listings.csv" read="Inventory/read.mjs" />
 *     </Storefront>
 *   );
 *
 *   // a service store: each offer by its name
 *   import { Storefront, Offer } from "commandagi/design";
 *   export default () => (
 *     <Storefront name="Uber" venue="uber" seller="Uber Technologies">
 *       <Offer name="Ride" kind="service" unit="ride" codes={["unspsc:78111804"]} tags={["transport"]} />
 *       <Offer name="Courier, one hour" kind="service" price="25.00 USD" unit="hour" />
 *     </Storefront>
 *   );
 *
 * `venue` is the platform the store is on (`amazon`, `ebay`, `aliexpress`, `digikey`, `mouser`, `lcsc`, `alibaba`,
 * `uber`, `commandagi` …), `seller` the seller's name, `sellerRecord` a ref to its record, `sellerId` its id at the
 * venue, `hold` how long a quoted price holds at checkout (`"10 minutes"`). `<Offers listings read?>` names the
 * store's mirrored listings (a CSV) and the script that keeps them; each `<Offer>` is one offer, by its `name`:
 * `kind` `service` or `good`, `price` (`"25.00 USD"`), `unit`, classification `codes` (product schemes, `./classification.ts`) and `tags`.
 * The Python SDK's `storefronts.py` and the Rust SDK's `storefronts.rs` declare the same document.
 */
import { PRODUCT_SCHEMES, classificationProblem } from "./classification.js";
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A storefront's file: `<name>.storefront.tsx` (or `.jsx`, `.py`, `.rs`). */
export const STOREFRONT_FILE = /\.storefront\.(?:[jt]sx|py|rs)$/i;
export const Storefront = "Storefront";
export const Offers = "Offers";
export const Offer = "Offer";
export const STOREFRONT_FIELDS = ["name", "venue", "seller", "sellerRecord", "sellerId", "url", "source", "hold"] as const;
export const STOREFRONT_MIRROR_FIELDS = ["listings", "read"] as const;
export const STOREFRONT_OFFER_FIELDS = ["name", "kind", "price", "unit", "codes", "tags"] as const;
export const STOREFRONT_OFFER_KINDS = ["service", "good"] as const;

export interface StorefrontOffer {
  name: string;
  kind: (typeof STOREFRONT_OFFER_KINDS)[number];
  price?: string;
  unit?: string;
  codes?: string[];
  tags?: string[];
}
export interface StorefrontMirror {
  listings: string;
  read?: string;
}
export interface StorefrontDoc {
  name: string;
  venue: string;
  seller: string;
  sellerRecord?: string;
  sellerId?: string;
  url?: string;
  source?: string;
  hold?: string;
  mirror?: StorefrontMirror;
  offers: StorefrontOffer[];
}

export const STOREFRONT_VENUE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const STOREFRONT_HOLD = /^[1-9]\d{0,3} (second|minute|hour|day)s?$/;
export const STOREFRONT_PRICE = /^\d+(\.\d+)? [A-Z]{3}$/;

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function optionalText(a: Record<string, unknown>, k: string, max: number, at: string, out: Record<string, unknown>): void {
  if (a[k] === undefined) return;
  if (!text(a[k], max)) throw new Error(`${at} ${k} is a short text (at most ${max}), not ${said(a[k])}`);
  out[k] = a[k];
}

/** One offer as its element declares it; throws with why it does not read. */
export function storefrontOfferOf(a: Record<string, unknown>): StorefrontOffer {
  if (!text(a.name, 200)) throw new Error(`<Offer> name is a short text (at most 200), not ${said(a.name)}`);
  const at = `<Offer name="${a.name}">`;
  if (!(STOREFRONT_OFFER_KINDS as readonly unknown[]).includes(a.kind)) throw new Error(`${at} kind is ${STOREFRONT_OFFER_KINDS.join(" or ")}, not ${said(a.kind)}`);
  const out: StorefrontOffer = { name: a.name, kind: a.kind as StorefrontOffer["kind"] };
  if (a.price !== undefined) {
    if (typeof a.price !== "string" || !STOREFRONT_PRICE.test(a.price)) throw new Error(`${at} price is an amount and an ISO currency ("25.00 USD"), not ${said(a.price)}`);
    out.price = a.price;
  }
  optionalText(a, "unit", 40, at, out as unknown as Record<string, unknown>);
  // What kind of offer it is (./classification.ts): product schemes and free tags, by the one grammar.
  const classification = classificationProblem(a.codes, a.tags, PRODUCT_SCHEMES);
  if (classification) throw new Error(`${at} ${classification}`);
  if (a.codes !== undefined) out.codes = [...(a.codes as string[])];
  if (a.tags !== undefined) out.tags = [...(a.tags as string[])];
  return out;
}

/** A storefront as its tree declares it; throws with why it does not read. */
export function storefrontOf(t: DocTree): StorefrontDoc {
  const a = t.attrs;
  if (!text(a.name, 120)) throw new Error(`<Storefront> name is a short text (at most 120), not ${said(a.name)}`);
  const at = `<Storefront name="${a.name}">`;
  if (typeof a.venue !== "string" || !STOREFRONT_VENUE.test(a.venue)) throw new Error(`${at} venue is the platform's word, lower-case letters, digits and dashes ("digikey", "amazon"), not ${said(a.venue)}`);
  if (!text(a.seller, 200)) throw new Error(`${at} seller is the seller's name, a short text (at most 200), not ${said(a.seller)}`);
  const out: StorefrontDoc = { name: a.name, venue: a.venue, seller: a.seller, offers: [] };
  const rec = out as unknown as Record<string, unknown>;
  optionalText(a, "sellerRecord", 500, at, rec);
  optionalText(a, "sellerId", 200, at, rec);
  if (a.url !== undefined) {
    if (!text(a.url, 500) || !a.url.startsWith("https://")) throw new Error(`${at} url is an https:// address (at most 500), not ${said(a.url)}`);
    out.url = a.url;
  }
  optionalText(a, "source", 500, at, rec);
  if (a.hold !== undefined) {
    if (typeof a.hold !== "string" || !STOREFRONT_HOLD.test(a.hold)) throw new Error(`${at} hold is a term like "10 minutes" (seconds, minutes, hours or days), not ${said(a.hold)}`);
    out.hold = a.hold;
  }
  const mirrors = t.children.filter((c) => c.tag === "Offers");
  if (mirrors.length > 1) throw new Error(`${at} has one <Offers>, not ${mirrors.length}`);
  if (mirrors[0]) {
    const m = mirrors[0].attrs;
    if (!text(m.listings, 500)) throw new Error(`${at} <Offers> listings is a ref to the listings file ("Inventory/listings.csv"), not ${said(m.listings)}`);
    out.mirror = { listings: m.listings };
    if (m.read !== undefined) {
      if (!text(m.read, 500)) throw new Error(`${at} <Offers> read is a ref to the script that reads the store ("Inventory/read.mjs"), not ${said(m.read)}`);
      out.mirror.read = m.read;
    }
  }
  const offers = t.children.filter((c) => c.tag === "Offer");
  if (offers.length > 500) throw new Error(`${at} has at most 500 <Offer>s, not ${offers.length}`);
  out.offers = offers.map((c) => storefrontOfferOf(c.attrs));
  const names = new Set<string>();
  for (const o of out.offers) {
    if (names.has(o.name)) throw new Error(`${at} has two <Offer>s named "${o.name}"`);
    names.add(o.name);
  }
  return out;
}

const attrsOf = (fields: readonly string[], r: Record<string, unknown>) => Object.fromEntries(fields.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));

export const storefrontVocabulary: Vocabulary<StorefrontDoc> = {
  format: "storefront",
  noun: "a storefront",
  root: "Storefront",
  tags: {
    Storefront: { parents: [], required: ["name", "venue", "seller"], attrs: STOREFRONT_FIELDS },
    Offers: { parents: ["Storefront"], single: true, required: ["listings"], attrs: STOREFRONT_MIRROR_FIELDS },
    Offer: { parents: ["Storefront"], key: "name", required: ["name", "kind"], attrs: STOREFRONT_OFFER_FIELDS },
  },
  fromTree: storefrontOf,
  toTree(d) {
    return {
      tag: "Storefront",
      attrs: attrsOf(STOREFRONT_FIELDS, d as unknown as Record<string, unknown>),
      children: [
        ...(d.mirror ? [{ tag: "Offers", attrs: attrsOf(STOREFRONT_MIRROR_FIELDS, d.mirror as unknown as Record<string, unknown>), children: [] }] : []),
        ...(d.offers ?? []).map((o) => ({ tag: "Offer", attrs: attrsOf(STOREFRONT_OFFER_FIELDS, o as unknown as Record<string, unknown>), children: [] })),
      ],
    };
  },
  empty: (name) => ({ name: name || "Storefront", venue: "commandagi", seller: name || "Storefront", offers: [] }),
};

registerVocabulary(storefrontVocabulary);

/** The vocabulary of a storefront, by format. */
export const STOREFRONTS = { storefront: storefrontVocabulary } as const;
