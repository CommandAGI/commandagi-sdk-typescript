/**
 * A PRODUCT IN JSX — `<name>.product.tsx` (or `.jsx`, `.py`, `.rs`) declares one product a seller sells (docs/formats.md
 * § a product in code, in the CommandAGI repository): its variants (options, SKU, price, stock) and its discounts.
 *
 *   // Shop/Helmet files.product.tsx
 *   export default () => (
 *     <product name="Helmet files" kind="digital" status="active">
 *       <variant sku="helmet-stl" name="STL pack" priceCents={1500} file="./helmet.zip" />
 *     </product>
 *   );
 *
 *   // Shop/Desk assistant.product.tsx: a physical product, a pre-order deposit variant of it, and a launch discount
 *   export default () => (
 *     <product name="Desk assistant" kind="physical" shipping={{ zones: [{ rule: "included", countries: ["US"], allowanceCents: 2000 }] }}>
 *       <variant sku="da-1-black" name="Assembled, black" priceCents={349600} stock={12} weightGrams={4200} options={{ colour: "black" }} />
 *       <variant sku="da-1-preorder" name="Pre-order, 20% now" priceCents={349600} deposit={{ percent: 20 }} />
 *       <discount code="LAUNCH10" percent={10} startsAt="2026-11-08" endsAt="2026-12-01" usageLimit={100} />
 *     </product>
 *   );
 *
 * `kind` is `physical` (shipped: `shipping` is its policy, required) or `digital` (downloaded: each variant names the
 * `file` it sells, a path relative to this file's folder or an absolute address; no shipping, weight, stock or deposit).
 * A variant's `stock` is how many are on hand; a physical variant with no `stock` is made to order. A `deposit` makes a
 * variant a pre-order: `{ percent }` (1 to 99) or `{ cents }` (at least 50, less than the price) is paid now, and the
 * balance when the seller says the product is ready. A `<discount>` takes `percent` or `amountCents` off, between
 * `startsAt` and `endsAt` (ISO 8601; a date-time with no offset is UTC), for at most `usageLimit` orders. Each
 * `<variant>` is one record, by its `sku`; each `<discount>` one, by its `code`. The Python SDK's `products.py` and the
 * Rust SDK's `products.rs` declare the same document.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A product's file: `<name>.product.tsx` (or `.jsx`, `.py`, `.rs`). */
export const PRODUCT_FILE = /\.product\.(?:[jt]sx|py|rs)$/i;
export const PRODUCT_KINDS = ["physical", "digital"] as const;
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export const PRODUCT_FIELDS = ["name", "kind", "slug", "subtitle", "description", "images", "status", "shipping", "fulfilment", "quantityTerms", "embodimentKind", "taxCode"] as const;
export const VARIANT_FIELDS = ["sku", "name", "priceCents", "compareAtCents", "stock", "options", "weightGrams", "file", "deposit"] as const;
export const DISCOUNT_FIELDS = ["code", "percent", "amountCents", "startsAt", "endsAt", "usageLimit"] as const;

export type ProductDeposit = { percent: number } | { cents: number };
export interface ProductVariant {
  sku: string;
  name: string;
  priceCents: number;
  compareAtCents?: number;
  stock?: number;
  options?: Record<string, string | number | boolean>;
  weightGrams?: number;
  file?: string;
  deposit?: ProductDeposit;
}
export interface ProductDiscount {
  code: string;
  percent?: number;
  amountCents?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
}
export interface ProductDoc {
  name: string;
  kind: (typeof PRODUCT_KINDS)[number];
  slug?: string;
  subtitle?: string;
  description?: string;
  images?: string[];
  status?: (typeof PRODUCT_STATUSES)[number];
  shipping?: Record<string, unknown>;
  fulfilment?: Record<string, unknown>;
  quantityTerms?: Record<string, unknown>;
  embodimentKind?: string;
  taxCode?: string;
  variants: ProductVariant[];
  discounts: ProductDiscount[];
}

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const int = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const CODE = /^[A-Za-z0-9_-]{3,40}$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/** The instant an ISO 8601 date or date-time names, in ms (a date-time with no offset is UTC), or null. */
function instantOf(v: unknown): number | null {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return null;
  const m = ISO.exec(v);
  if (!m) return null;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1, 7).map((x) => (x === undefined ? undefined : Number(x))) as number[];
  const days = new Date(Date.UTC(y!, mo!, 0)).getUTCDate();
  if (mo! < 1 || mo! > 12 || d! < 1 || d! > days || h! > 23 || mi! > 59 || s! > 59) return null;
  const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0;
  const off = m[8] && m[8] !== "Z" ? (m[8][0] === "-" ? -1 : 1) * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(4, 6))) : 0;
  return Date.UTC(y!, mo! - 1, d!, h, mi, s, ms) - off * 60_000;
}

/** A deposit as a variant declares it; throws with why it does not read. */
export function depositOf(v: unknown, priceCents: number, at: string): ProductDeposit {
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

/** One variant as its element declares it, for a product of `kind`; throws with why it does not read. */
export function variantOf(attrs: Record<string, unknown>, kind: ProductDoc["kind"]): ProductVariant {
  const { sku, name, priceCents, compareAtCents, stock, options, weightGrams, file, deposit } = attrs;
  if (!text(sku, 80)) throw new Error(`<variant> sku is a short text (at most 80), not ${said(sku)}`);
  const at = `<variant sku="${sku}">`;
  if (!text(name, 120)) throw new Error(`${at} name is a short text (at most 120), not ${said(name)}`);
  if (!int(priceCents, 50)) throw new Error(`${at} priceCents is a whole number of cents, at least 50, not ${said(priceCents)}`);
  const out: ProductVariant = { sku, name, priceCents };
  if (compareAtCents !== undefined) {
    if (!int(compareAtCents, priceCents + 1)) throw new Error(`${at} compareAtCents is a whole number of cents, more than the price (${priceCents}), not ${said(compareAtCents)}`);
    out.compareAtCents = compareAtCents;
  }
  if (options !== undefined) {
    const ok = isObject(options) && Object.keys(options).length <= 20 && Object.entries(options).every(([k, x]) => k.trim().length > 0 && (typeof x === "string" || typeof x === "number" || typeof x === "boolean"));
    if (!ok) throw new Error(`${at} options is an object of at most 20 names, each a text, a number or a boolean, not ${said(options)}`);
    out.options = { ...(options as Record<string, string | number | boolean>) };
  }
  if (kind === "digital") {
    if (stock !== undefined) throw new Error(`${at} is digital: it has no stock (a file does not run out)`);
    if (weightGrams !== undefined) throw new Error(`${at} is digital: it has no weightGrams`);
    if (deposit !== undefined) throw new Error(`${at} is digital: it takes no deposit (a deposit is a pre-order of a physical product)`);
    if (!text(file, 1000)) throw new Error(`${at} is digital: file names the file it sells (a path from this file's folder, or an address), not ${said(file)}`);
    out.file = file;
    return out;
  }
  if (file !== undefined) throw new Error(`${at} is physical: it ships, so it names no file`);
  if (stock !== undefined) {
    if (!int(stock, 0)) throw new Error(`${at} stock is a whole number, at least 0 (no stock: made to order), not ${said(stock)}`);
    out.stock = stock;
  }
  if (weightGrams !== undefined) {
    if (!int(weightGrams, 0)) throw new Error(`${at} weightGrams is a whole number of grams, not ${said(weightGrams)}`);
    out.weightGrams = weightGrams;
  }
  if (deposit !== undefined) out.deposit = depositOf(deposit, priceCents, at);
  return out;
}

/** One discount as its element declares it; throws with why it does not read. */
export function discountOf(attrs: Record<string, unknown>): ProductDiscount {
  const { code, percent, amountCents, startsAt, endsAt, usageLimit } = attrs;
  if (typeof code !== "string" || !CODE.test(code)) throw new Error(`<discount> code is letters, digits, - and _ (3 to 40), not ${said(code)}`);
  const at = `<discount code="${code}">`;
  const out: ProductDiscount = { code };
  if ((percent === undefined) === (amountCents === undefined)) throw new Error(`${at} takes off one of percent or amountCents, not ${percent === undefined ? "neither" : "both"}`);
  if (percent !== undefined) {
    if (!int(percent, 1) || (percent as number) > 100) throw new Error(`${at} percent is a whole number from 1 to 100, not ${said(percent)}`);
    out.percent = percent;
  }
  if (amountCents !== undefined) {
    if (!int(amountCents, 1)) throw new Error(`${at} amountCents is a whole number of cents, at least 1, not ${said(amountCents)}`);
    out.amountCents = amountCents;
  }
  let from: number | null = null;
  if (startsAt !== undefined) {
    from = instantOf(startsAt);
    if (from === null) throw new Error(`${at} startsAt is an ISO 8601 date or date-time ("2026-11-08", "2026-11-08T09:00:00Z"), not ${said(startsAt)}`);
    out.startsAt = startsAt as string;
  }
  if (endsAt !== undefined) {
    const to = instantOf(endsAt);
    if (to === null) throw new Error(`${at} endsAt is an ISO 8601 date or date-time ("2026-11-08", "2026-11-08T09:00:00Z"), not ${said(endsAt)}`);
    if (from !== null && to <= from) throw new Error(`${at} endsAt (${endsAt as string}) is after startsAt (${startsAt as string})`);
    out.endsAt = endsAt as string;
  }
  if (usageLimit !== undefined) {
    if (!int(usageLimit, 1)) throw new Error(`${at} usageLimit is a whole number, at least 1, not ${said(usageLimit)}`);
    out.usageLimit = usageLimit;
  }
  return out;
}

/** A product as its tree declares it; throws with why it does not read. */
export function productOf(t: DocTree): ProductDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.name, 120)) throw new Error(`<product> name is a short text (at most 120), not ${said(a.name)}`);
  const at = `<product name="${a.name}">`;
  if (!(PRODUCT_KINDS as readonly unknown[]).includes(a.kind)) throw new Error(`${at} kind is ${PRODUCT_KINDS.join(" or ")}, not ${said(a.kind)}`);
  const kind = a.kind as ProductDoc["kind"];
  const out: ProductDoc = { name: a.name, kind, variants: [], discounts: [] };
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
    if (!(PRODUCT_STATUSES as readonly unknown[]).includes(a.status)) throw new Error(`${at} status is ${PRODUCT_STATUSES.join(", ")}, not ${said(a.status)}`);
    out.status = a.status as ProductDoc["status"];
  }
  if (kind === "digital" && a.shipping !== undefined) throw new Error(`${at} is digital: it ships nothing, so it has no shipping`);
  if (kind === "physical") {
    if (!isObject(a.shipping)) throw new Error(`${at} is physical: shipping is its shipping policy ({ zones, from?, parcel? }), not ${said(a.shipping)}`);
    out.shipping = a.shipping;
  }
  if (a.fulfilment !== undefined) {
    if (!isObject(a.fulfilment)) throw new Error(`${at} fulfilment is an object (how a paid line is fulfilled), not ${said(a.fulfilment)}`);
    out.fulfilment = a.fulfilment;
  }
  if (a.quantityTerms !== undefined) {
    if (!isObject(a.quantityTerms)) throw new Error(`${at} quantityTerms is an object, not ${said(a.quantityTerms)}`);
    out.quantityTerms = a.quantityTerms;
  }
  if (a.embodimentKind !== undefined) {
    if (!text(a.embodimentKind, 80)) throw new Error(`${at} embodimentKind is a short text (at most 80), not ${said(a.embodimentKind)}`);
    out.embodimentKind = a.embodimentKind;
  }
  if (a.taxCode !== undefined) {
    if (typeof a.taxCode !== "string" || !/^txcd_[0-9]{8}$/.test(a.taxCode)) throw new Error(`${at} taxCode is a Stripe product tax code like txcd_99999999, not ${said(a.taxCode)}`);
    out.taxCode = a.taxCode;
  }
  const variants = t.children.filter((c) => c.tag === "variant");
  // A file not finished yet may hold none; the checkout refuses a product that sells nothing.
  if (variants.length > 50) throw new Error(`${at} sells at most 50 <variant>s, not ${variants.length}`);
  out.variants = variants.map((c) => variantOf(c.attrs as Record<string, unknown>, kind));
  const discounts = t.children.filter((c) => c.tag === "discount");
  if (discounts.length > 50) throw new Error(`${at} has at most 50 <discount>s, not ${discounts.length}`);
  out.discounts = discounts.map((c) => discountOf(c.attrs as Record<string, unknown>));
  // A buyer types a code in any case, so two codes that differ only in case are one code.
  const codes = new Map<string, string>();
  for (const { code } of out.discounts) {
    const was = codes.get(code.toLowerCase());
    if (was !== undefined) throw new Error(`${at} has two <discount>s with one code: "${was}" and "${code}" (a code is read in any case)`);
    codes.set(code.toLowerCase(), code);
  }
  return out;
}

const attrsOf = (fields: readonly string[], r: Record<string, unknown>) => Object.fromEntries(fields.filter((k) => r[k] !== undefined).map((k) => [k, r[k]]));

export const productVocabulary: Vocabulary<ProductDoc> = {
  format: "product",
  noun: "a product",
  root: "product",
  tags: {
    product: { parents: [], required: ["name", "kind"], attrs: PRODUCT_FIELDS },
    variant: { parents: ["product"], key: "sku", required: ["sku", "name", "priceCents"], attrs: VARIANT_FIELDS },
    discount: { parents: ["product"], key: "code", required: ["code"], attrs: DISCOUNT_FIELDS },
  },
  fromTree: productOf,
  toTree(d) {
    return {
      tag: "product",
      attrs: attrsOf(PRODUCT_FIELDS, d as unknown as Record<string, unknown>),
      children: [
        ...(d.variants ?? []).map((v) => ({ tag: "variant", attrs: attrsOf(VARIANT_FIELDS, v as unknown as Record<string, unknown>), children: [] })),
        ...(d.discounts ?? []).map((v) => ({ tag: "discount", attrs: attrsOf(DISCOUNT_FIELDS, v as unknown as Record<string, unknown>), children: [] })),
      ],
    };
  },
  empty: (name) => ({ name: name || "Product", kind: "physical", status: "draft", shipping: { zones: [] }, variants: [], discounts: [] }),
};

registerVocabulary(productVocabulary);

/** The vocabulary of a product, by format. */
export const PRODUCTS = { product: productVocabulary } as const;
