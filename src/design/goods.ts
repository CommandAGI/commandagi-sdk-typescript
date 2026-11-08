/**
 * A GOOD IN JSX — `<name>.good.tsx` (or `.jsx`, `.py`, `.rs`) declares one good a seller sells (docs/formats.md § a good
 * in code, in the CommandAGI repository). The document is the body of the platform's goods door, `POST /goods`, as it
 * is: the door reads the file (`POST /goods/declared { path }`) and passes it through.
 *
 *   // Shop/Helmet files.good.tsx
 *   export default () => (
 *     <good name="Helmet files" kind="digital" status="active">
 *       <variant sku="helmet-stl" name="STL pack" priceCents={1500} file="./helmet.zip" />
 *     </good>
 *   );
 *
 *   // Shop/Desk assistant.good.tsx: a physical good, and a pre-order deposit variant of it
 *   export default () => (
 *     <good name="Desk assistant" kind="physical" shipping={{ zones: [{ rule: "included", countries: ["US"], allowanceCents: 2000 }] }}>
 *       <variant sku="da-1" name="Assembled" priceCents={349600} inventoryQty={-1} weightGrams={4200} />
 *       <variant sku="da-1-preorder" name="Pre-order, 20% now" priceCents={349600} deposit={{ percent: 20 }} />
 *     </good>
 *   );
 *
 * `kind` is `physical` (shipped: `shipping` is its policy, required) or `digital` (downloaded: each variant names the
 * `file` it sells, a path relative to this file's folder or an absolute address; no shipping, weight or deposit). A
 * `deposit` makes a variant a pre-order: `{ percent }` (1 to 99) or `{ cents }` (at least 50, less than the price) is
 * paid now, and the balance when the seller says the good is ready. Each `<variant>` is one record, by its `sku`. The
 * Python SDK's `goods.py` and the Rust SDK's `goods.rs` declare the same document.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A good's file: `<name>.good.tsx` (or `.jsx`, `.py`, `.rs`). */
export const GOOD_FILE = /\.good\.(?:[jt]sx|py|rs)$/i;
export const GOOD_KINDS = ["physical", "digital"] as const;
export const GOOD_STATUSES = ["draft", "active", "archived"] as const;
export const GOOD_FIELDS = ["name", "kind", "slug", "subtitle", "description", "images", "status", "shipping"] as const;
export const VARIANT_FIELDS = ["sku", "name", "priceCents", "inventoryQty", "weightGrams", "file", "deposit"] as const;

export type GoodDeposit = { percent: number } | { cents: number };
export interface GoodVariant {
  sku: string;
  name: string;
  priceCents: number;
  inventoryQty?: number;
  weightGrams?: number;
  file?: string;
  deposit?: GoodDeposit;
}
export interface GoodDoc {
  name: string;
  kind: (typeof GOOD_KINDS)[number];
  slug?: string;
  subtitle?: string;
  description?: string;
  images?: string[];
  status?: (typeof GOOD_STATUSES)[number];
  shipping?: Record<string, unknown>;
  variants: GoodVariant[];
}

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const int = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A deposit as a variant declares it; throws with why it does not read. */
export function depositOf(v: unknown, priceCents: number, at: string): GoodDeposit {
  if (!isObject(v) || Object.keys(v).length !== 1) throw new Error(`${at} deposit is { percent } or { cents }, not ${said(v)}`);
  if ("percent" in v) {
    if (!int(v.percent, 1) || (v.percent as number) > 99) throw new Error(`${at} deposit.percent is a whole number from 1 to 99, not ${said(v.percent)}`);
    return { percent: v.percent as number };
  }
  if ("cents" in v) {
    if (!int(v.cents, 50) || (v.cents as number) >= priceCents) throw new Error(`${at} deposit.cents is a whole number of cents, at least 50 and less than the price (${priceCents}), not ${said(v.cents)}`);
    return { cents: v.cents as number };
  }
  throw new Error(`${at} deposit is { percent } or { cents }, not ${said(v)}`);
}

/** One variant as its element declares it, for a good of `kind`; throws with why it does not read. */
export function variantOf(attrs: Record<string, unknown>, kind: GoodDoc["kind"]): GoodVariant {
  const { sku, name, priceCents, inventoryQty, weightGrams, file, deposit } = attrs;
  if (!text(sku, 80)) throw new Error(`<variant> sku is a short text (at most 80), not ${said(sku)}`);
  const at = `<variant sku="${sku}">`;
  if (!text(name, 120)) throw new Error(`${at} name is a short text (at most 120), not ${said(name)}`);
  if (!int(priceCents, 50)) throw new Error(`${at} priceCents is a whole number of cents, at least 50, not ${said(priceCents)}`);
  const out: GoodVariant = { sku, name, priceCents };
  if (inventoryQty !== undefined) {
    if (!int(inventoryQty, -1)) throw new Error(`${at} inventoryQty is a whole number (-1: made to order), not ${said(inventoryQty)}`);
    out.inventoryQty = inventoryQty;
  }
  if (kind === "digital") {
    if (weightGrams !== undefined) throw new Error(`${at} is digital: it has no weightGrams`);
    if (deposit !== undefined) throw new Error(`${at} is digital: it takes no deposit (a deposit is a pre-order of a physical good)`);
    if (!text(file, 1000)) throw new Error(`${at} is digital: file names the file it sells (a path from this file's folder, or an address), not ${said(file)}`);
    out.file = file;
    return out;
  }
  if (file !== undefined) throw new Error(`${at} is physical: it ships, so it names no file`);
  if (weightGrams !== undefined) {
    if (!int(weightGrams, 0)) throw new Error(`${at} weightGrams is a whole number of grams, not ${said(weightGrams)}`);
    out.weightGrams = weightGrams;
  }
  if (deposit !== undefined) out.deposit = depositOf(deposit, priceCents, at);
  return out;
}

/** A good as its tree declares it; throws with why it does not read. */
export function goodOf(t: DocTree): GoodDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.name, 120)) throw new Error(`<good> name is a short text (at most 120), not ${said(a.name)}`);
  const at = `<good name="${a.name}">`;
  if (!(GOOD_KINDS as readonly unknown[]).includes(a.kind)) throw new Error(`${at} kind is ${GOOD_KINDS.join(" or ")}, not ${said(a.kind)}`);
  const kind = a.kind as GoodDoc["kind"];
  const out: GoodDoc = { name: a.name, kind, variants: [] };
  if (a.slug !== undefined) {
    if (typeof a.slug !== "string" || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(a.slug)) throw new Error(`${at} slug is lower-case letters, digits and dashes (2 to 80), not ${said(a.slug)}`);
    out.slug = a.slug;
  }
  if (a.subtitle !== undefined) {
    if (!text(a.subtitle, 200)) throw new Error(`${at} subtitle is a short text (at most 200), not ${said(a.subtitle)}`);
    out.subtitle = a.subtitle;
  }
  if (a.description !== undefined) {
    if (typeof a.description !== "string" || a.description.length > 8000) throw new Error(`${at} description is a text (at most 8000)`);
    out.description = a.description;
  }
  if (a.images !== undefined) {
    if (!Array.isArray(a.images) || a.images.length > 20 || !a.images.every((i) => text(i, 500))) throw new Error(`${at} images is a list of at most 20 paths or URLs`);
    out.images = [...(a.images as string[])];
  }
  if (a.status !== undefined) {
    if (!(GOOD_STATUSES as readonly unknown[]).includes(a.status)) throw new Error(`${at} status is ${GOOD_STATUSES.join(", ")}, not ${said(a.status)}`);
    out.status = a.status as GoodDoc["status"];
  }
  if (kind === "digital" && a.shipping !== undefined) throw new Error(`${at} is digital: it ships nothing, so it has no shipping`);
  if (kind === "physical") {
    if (!isObject(a.shipping)) throw new Error(`${at} is physical: shipping is its shipping policy ({ zones, from?, parcel? }), not ${said(a.shipping)}`);
    out.shipping = a.shipping;
  }
  const variants = t.children.filter((c) => c.tag === "variant");
  // A file not finished yet may hold none; the goods door refuses a good that sells nothing (`variants_required`).
  if (variants.length > 50) throw new Error(`${at} sells at most 50 <variant>s, not ${variants.length}`);
  out.variants = variants.map((c) => variantOf(c.attrs as Record<string, unknown>, kind));
  return out;
}

export const goodVocabulary: Vocabulary<GoodDoc> = {
  format: "good",
  noun: "a good",
  root: "good",
  tags: {
    good: { parents: [], required: ["name", "kind"], attrs: GOOD_FIELDS },
    variant: { parents: ["good"], key: "sku", required: ["sku", "name", "priceCents"], attrs: VARIANT_FIELDS },
  },
  fromTree: goodOf,
  toTree(d) {
    return {
      tag: "good",
      attrs: Object.fromEntries(GOOD_FIELDS.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])),
      children: (d.variants ?? []).map((v) => ({
        tag: "variant",
        attrs: Object.fromEntries(VARIANT_FIELDS.filter((k) => v[k] !== undefined).map((k) => [k, v[k]])),
        children: [],
      })),
    };
  },
  empty: (name) => ({ name: name || "Good", kind: "physical", status: "draft", shipping: { zones: [] }, variants: [] }),
};

registerVocabulary(goodVocabulary);

/** The vocabulary of a good, by format. */
export const GOODS = { good: goodVocabulary } as const;
