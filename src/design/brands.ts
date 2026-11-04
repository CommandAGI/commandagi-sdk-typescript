/**
 * A BRAND IN JSX — a `<Name>.brand.tsx`, one brand of a company (docs/company-substrate.md § the brand surface in the
 * CommandAGI repository): the names it goes by, its tagline and voice, its logos, the design system it is drawn with,
 * its domains, its sites, its social handles and the marks that protect it. A company names each of its brand files
 * with `<Brand file>` in its `.company.tsx`; the CommandAGI company app's brands pane opens each one, checks it, and
 * writes each edit back here.
 *
 *   import { Alias, BrandSurface, Domain, Handle, Logo, Mark, Site } from "commandagi/design";
 *
 *   // Northwind Survey/brands/Northwind.brand.tsx
 *   export default () => (
 *     <BrandSurface name="Northwind" tagline="Drone surveys for farms." voice={["plain", "warm"]} designSystem="../design/brand-book.json">
 *       <Alias name="Northwind Survey" kind="legal" />
 *       <Logo file="../design/logo.svg" kind="mark" background="light" />
 *       <Domain name="northwind.example" registrar="Porkbun LLC" expires="2027-05-18" autoRenew site="../site/" mail />
 *       <Site folder="../site/" />
 *       <Handle platform="x" handle="northwindsurvey" connection="x" />
 *       <Mark title="NORTHWIND" jurisdiction="US" number="99123456" />
 *     </BrandSurface>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim.
 * Every path is a ref (a path from the brand file's folder, or an address): a logo, a design system, a site's folder
 * are files that stay where they are. A `<Mark>` refs a trademark the company records as an IP asset; the brand holds
 * none of them. Nothing adds a default: what the file does not say, the brand does not have. The shape is checked
 * here; what the values mean (a date, a host name, a code) is checked by the app that reads it
 * (`packages/domain/world/company-brand.js` `validateBrand`).
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const BrandSurface = "BrandSurface";
export const Alias = "Alias";
export const Logo = "Logo";
export const Domain = "Domain";
export const Site = "Site";
export const Handle = "Handle";
export const Mark = "Mark";

export const BRAND_FIELDS = ["name", "tagline", "about", "voice", "designSystem"] as const;
export const ALIAS_FIELDS = ["name", "kind", "locale"] as const;
export const LOGO_FIELDS = ["file", "kind", "background"] as const;
export const DOMAIN_FIELDS = ["name", "registrar", "expires", "autoRenew", "site", "mail"] as const;
export const SITE_FIELDS = ["folder"] as const;
export const HANDLE_FIELDS = ["platform", "handle", "url", "connection"] as const;
export const MARK_FIELDS = ["title", "jurisdiction", "number"] as const;

/** A brand as the company app's brands pane edits it. Each list is in the file's order. */
export interface BrandDoc {
  name: string;
  tagline?: string;
  about?: string;
  /** The voice's words (plain, warm). */
  voice?: string[];
  /** A ref to the design system the brand is drawn with: a brand book, a tokens file, a folder. */
  designSystem?: string;
  aliases: { name: string; kind?: string; locale?: string }[];
  logos: { file: string; kind?: string; background?: string }[];
  domains: { name: string; registrar?: string; expires?: string; autoRenew?: boolean; site?: string; mail?: boolean }[];
  sites: { folder: string }[];
  /** `connection`: the connected app that posts as it, by its name in the account's connections. */
  handles: { platform: string; handle: string; url?: string; connection?: string }[];
  /** A trademark the company records (an IP asset), named by its title and, where it has them, its place and number. */
  marks: { title: string; jurisdiction?: string; number?: string }[];
}

/** Each list, the tag of its elements and the fields they take. */
export const BRAND_LISTS = [
  ["aliases", Alias, ALIAS_FIELDS],
  ["logos", Logo, LOGO_FIELDS],
  ["domains", Domain, DOMAIN_FIELDS],
  ["sites", Site, SITE_FIELDS],
  ["handles", Handle, HANDLE_FIELDS],
  ["marks", Mark, MARK_FIELDS],
] as const;
const FLAGS = new Set(["autoRenew", "mail"]);

const fields = (o: Record<string, unknown>, keys: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== "") out[k] = o[k];
  return out;
};

/** Each attribute's type: text, a flag (`autoRenew`, `mail`), or the voice's words. */
function check(t: DocTree): void {
  for (const node of [t, ...t.children])
    for (const [k, v] of Object.entries(node.attrs)) {
      if (FLAGS.has(k)) {
        if (typeof v !== "boolean") throw new Error(`<${node.tag}> ${k} is true or false`);
      } else if (k === "voice") {
        if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`<${node.tag}> voice is a list of words`);
      } else if (typeof v !== "string") throw new Error(`<${node.tag}> ${k} is text`);
    }
}

export const brandVocabulary: Vocabulary<BrandDoc> = {
  format: "brand",
  noun: "a brand",
  root: BrandSurface,
  tags: {
    [BrandSurface]: { parents: [], required: ["name"], attrs: BRAND_FIELDS },
    [Alias]: { parents: [BrandSurface], required: ["name"], attrs: ALIAS_FIELDS },
    [Logo]: { parents: [BrandSurface], key: "file", required: ["file"], attrs: LOGO_FIELDS },
    [Domain]: { parents: [BrandSurface], key: "name", required: ["name"], attrs: DOMAIN_FIELDS },
    [Site]: { parents: [BrandSurface], key: "folder", required: ["folder"], attrs: SITE_FIELDS },
    [Handle]: { parents: [BrandSurface], required: ["platform", "handle"], attrs: HANDLE_FIELDS },
    [Mark]: { parents: [BrandSurface], required: ["title"], attrs: MARK_FIELDS },
  },
  fromTree(t) {
    check(t);
    const doc = fields(t.attrs, BRAND_FIELDS) as unknown as BrandDoc;
    for (const [list, tag, keys] of BRAND_LISTS)
      (doc as unknown as Record<string, unknown>)[list] = t.children.filter((c) => c.tag === tag).map((c) => fields(c.attrs, keys));
    return doc;
  },
  toTree(d) {
    const children: DocTree[] = [];
    for (const [list, tag, keys] of BRAND_LISTS)
      for (const r of ((d as unknown as Record<string, unknown>)[list] as Record<string, unknown>[] | undefined) ?? [])
        children.push({ tag, attrs: fields(r, keys), children: [] });
    return { tag: BrandSurface, attrs: fields(d as unknown as Record<string, unknown>, BRAND_FIELDS), children };
  },
  empty: (name) => ({ name, aliases: [], logos: [], domains: [], sites: [], handles: [], marks: [] }),
};

registerVocabulary(brandVocabulary);

/** The vocabulary of a brand, by format. */
export const BRANDS = { brand: brandVocabulary } as const;
