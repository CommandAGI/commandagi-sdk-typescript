/**
 * A CART IN JSX — `Carts/<seller>.cart.tsx` (or `.jsx`, `.py`, `.rs`) is a buyer's cart at one seller (docs/formats.md
 * § a cart in code, in the CommandAGI repository): one `<item>` for each product variant, by its SKU, and one `<offer>`
 * for each offer that is not a product, by its listing id.
 *
 *   // Carts/helmetworks.cart.tsx
 *   export default () => (
 *     <cart seller="acct:org:helmetworks">
 *       <item sku="helmet-stl" qty={1} />
 *       <offer listing="lst_print-farm-hour" qty={3} />
 *     </cart>
 *   );
 *
 * A cart names no price: the checkout prices each line from the seller's product files and listings when the buyer
 * pays, so a cart cannot say what a line costs. The Python SDK's `carts.py` and the Rust SDK's `carts.rs` declare the
 * same document.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A cart's file: `<seller>.cart.tsx` (or `.jsx`, `.py`, `.rs`), in the buyer's `Carts/` folder. */
export const CART_FILE = /\.cart\.(?:[jt]sx|py|rs)$/i;
export const CART_FIELDS = ["seller"] as const;
export const ITEM_FIELDS = ["sku", "qty"] as const;
export const OFFER_FIELDS = ["listing", "qty"] as const;

export interface CartItem {
  sku: string;
  qty: number;
}
export interface CartOffer {
  listing: string;
  qty: number;
}
export interface CartDoc {
  seller: string;
  items: CartItem[];
  offers: CartOffer[];
}

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const SELLER = /^acct:(user|org):[^\s]{1,200}$/;

const qtyOf = (qty: unknown, at: string): number => {
  if (!Number.isSafeInteger(qty) || (qty as number) < 1 || (qty as number) > 999) throw new Error(`${at} qty is a whole number from 1 to 999, not ${said(qty)}`);
  return qty as number;
};

/** A cart as its tree declares it; throws with why it does not read. */
export function cartOf(t: DocTree): CartDoc {
  const seller = t.attrs.seller;
  if (typeof seller !== "string" || !SELLER.test(seller)) throw new Error(`<cart> seller is an account, acct:user:<id> or acct:org:<id>, not ${said(seller)}`);
  const at = `<cart seller="${seller}">`;
  const lines = t.children.filter((c) => c.tag === "item" || c.tag === "offer");
  if (lines.length > 100) throw new Error(`${at} holds at most 100 lines (<item>s and <offer>s), not ${lines.length}`);
  const items: CartItem[] = [];
  const offers: CartOffer[] = [];
  for (const c of lines) {
    if (c.tag === "item") {
      const sku = c.attrs.sku;
      if (!text(sku, 80)) throw new Error(`<item> sku is a short text (at most 80), not ${said(sku)}`);
      items.push({ sku, qty: qtyOf(c.attrs.qty, `<item sku="${sku}">`) });
    } else {
      const listing = c.attrs.listing;
      if (!text(listing, 200)) throw new Error(`<offer> listing is a short text (at most 200), not ${said(listing)}`);
      offers.push({ listing, qty: qtyOf(c.attrs.qty, `<offer listing="${listing}">`) });
    }
  }
  return { seller, items, offers };
}

export const cartVocabulary: Vocabulary<CartDoc> = {
  format: "cart",
  noun: "a cart",
  root: "cart",
  tags: {
    // A line names no price (priceCents, amountCents …): it is not read, so the file cannot hold one.
    cart: { parents: [], required: ["seller"], attrs: CART_FIELDS },
    item: { parents: ["cart"], key: "sku", required: ["sku", "qty"], attrs: ITEM_FIELDS },
    offer: { parents: ["cart"], key: "listing", required: ["listing", "qty"], attrs: OFFER_FIELDS },
  },
  fromTree: cartOf,
  toTree(d) {
    return {
      tag: "cart",
      attrs: { seller: d.seller },
      children: [
        ...(d.items ?? []).map((i) => ({ tag: "item", attrs: { sku: i.sku, qty: i.qty }, children: [] })),
        ...(d.offers ?? []).map((o) => ({ tag: "offer", attrs: { listing: o.listing, qty: o.qty }, children: [] })),
      ],
    };
  },
  // The first edit (adding a line) writes the seller with it.
  empty: () => ({ seller: "", items: [], offers: [] }),
};

registerVocabulary(cartVocabulary);

/** The vocabulary of a cart, by format. */
export const CARTS = { cart: cartVocabulary } as const;
