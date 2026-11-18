/**
 * CLASSIFICATION — what kind of business, product or service a thing is, said on purpose by its account
 * (CommandAGI's docs/formats.md § classification). A `<Company>`, a `<Product>`, a `<product>` and a storefront's
 * `<Offer>` take two attributes:
 *
 *   codes={["naics:541511", "unspsc:43232100"]}   standard codes as scheme:code
 *   tags={["robotics", "3d printing"]}             free words: lower case, trimmed, single spaces, at most 40 characters
 *
 * Business schemes classify what a company does (naics, nace, isic, sic, anzsic, jsic); product schemes what is sold
 * (unspsc, gs1, hs). A shorter code of a scheme is the group of the longer codes it starts (`naics:54` holds
 * `naics:541511`). The same grammar as CommandAGI's `packages/domain/world/classification.js`, the Python SDK's
 * `classification.py` and the Rust SDK's `classification.rs`.
 */

export interface Scheme {
  kind: "business" | "product";
  name: string;
  pattern: RegExp;
  example: string;
  grammar: string;
}

export const SCHEMES: Readonly<Record<string, Scheme>> = Object.freeze({
  naics: { kind: "business", name: "NAICS", pattern: /^\d{2,6}$/, example: "naics:541511", grammar: "2 to 6 digits" },
  nace: { kind: "business", name: "NACE", pattern: /^(?:[A-U]|\d{2}(?:\.\d{1,2})?)$/, example: "nace:28.41", grammar: "a section letter A-U, or a division, group or class (28, 28.4, 28.41)" },
  isic: { kind: "business", name: "ISIC", pattern: /^(?:[A-U]|\d{2,4})$/, example: "isic:2822", grammar: "a section letter A-U, or 2 to 4 digits" },
  sic: { kind: "business", name: "SIC", pattern: /^\d{2,4}$/, example: "sic:3569", grammar: "2 to 4 digits" },
  anzsic: { kind: "business", name: "ANZSIC", pattern: /^(?:[A-S]|\d{2,4})$/, example: "anzsic:2469", grammar: "a division letter A-S, or 2 to 4 digits" },
  jsic: { kind: "business", name: "JSIC", pattern: /^(?:[A-T]|\d{2,4})$/, example: "jsic:2694", grammar: "a division letter A-T, or 2 to 4 digits" },
  unspsc: { kind: "product", name: "UNSPSC", pattern: /^(?:\d{2}){1,4}$/, example: "unspsc:43232100", grammar: "2, 4, 6 or 8 digits" },
  gs1: { kind: "product", name: "GS1 GPC", pattern: /^\d{8}$/, example: "gs1:10001234", grammar: "8 digits (a GPC brick or a level above it)" },
  hs: { kind: "product", name: "HS", pattern: /^(?:\d{2}){1,5}$/, example: "hs:847989", grammar: "2, 4, 6, 8 or 10 digits" },
});

export const SCHEME_NAMES: readonly string[] = Object.freeze(Object.keys(SCHEMES));
export const BUSINESS_SCHEMES: readonly string[] = Object.freeze(SCHEME_NAMES.filter((s) => SCHEMES[s]!.kind === "business"));
export const PRODUCT_SCHEMES: readonly string[] = Object.freeze(SCHEME_NAMES.filter((s) => SCHEMES[s]!.kind === "product"));
export const MAX_CODES = 20;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

const said = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : String(v));

/** Why `raw` is not a code, or null when it is one. */
export function codeProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return `a code is a "scheme:code" text, not ${said(raw)}`;
  const i = raw.indexOf(":");
  if (i <= 0) return `${said(raw)} is not a code: write it as scheme:code (${SCHEMES.naics!.example})`;
  const scheme = raw.slice(0, i);
  const s = Object.hasOwn(SCHEMES, scheme) ? SCHEMES[scheme]! : null;
  if (!s) return `${said(raw)}: "${scheme}" is not a known scheme (${SCHEME_NAMES.join(", ")})`;
  if (!s.pattern.test(raw.slice(i + 1))) return `${said(raw)}: a ${s.name} code is ${s.grammar} (${s.example})`;
  return null;
}

/** A tag as a file writes it: trimmed, lower case, single spaces. */
export const normalizeTag = (raw: unknown): string => String(raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Why `raw` is not a tag, or null. */
export function tagProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return `a tag is a text, not ${said(raw)}`;
  const norm = normalizeTag(raw);
  if (!norm) return "a tag is not empty";
  if (norm.length > MAX_TAG_LENGTH) return `${said(raw)}: a tag is at most ${MAX_TAG_LENGTH} characters`;
  if (norm !== raw) return `${said(raw)}: write the tag as ${said(norm)} (lower case, trimmed, single spaces)`;
  return null;
}

/** The first problem of a thing's `codes` and `tags` (absent is none), or null; `schemes` narrows the schemes allowed. */
export function classificationProblem(codes: unknown, tags: unknown, schemes: readonly string[] | null = null): string | null {
  if (codes !== undefined) {
    if (!Array.isArray(codes)) return `codes is a list of "scheme:code" texts, not ${said(codes)}`;
    if (codes.length > MAX_CODES) return `codes holds at most ${MAX_CODES} codes, not ${codes.length}`;
    const seen = new Set<string>();
    for (const c of codes) {
      const p = codeProblem(c);
      if (p) return `codes: ${p}`;
      const scheme = (c as string).slice(0, (c as string).indexOf(":"));
      if (schemes && !schemes.includes(scheme)) return `codes: ${said(c)} is a ${SCHEMES[scheme]!.kind} code; here a code is of ${schemes.join(", ")}`;
      if (seen.has(c as string)) return `codes: ${said(c)} is written twice`;
      seen.add(c as string);
    }
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags)) return `tags is a list of words, not ${said(tags)}`;
    if (tags.length > MAX_TAGS) return `tags holds at most ${MAX_TAGS} tags, not ${tags.length}`;
    const seen = new Set<string>();
    for (const t of tags) {
      const p = tagProblem(t);
      if (p) return `tags: ${p}`;
      if (seen.has(t as string)) return `tags: ${said(t)} is written twice`;
      seen.add(t as string);
    }
  }
  return null;
}

/** Whether `code` is under `prefix` (`naics:54` holds `naics:541511`; `naics` holds every NAICS code). */
export function matchesPrefix(code: string, prefix: string): boolean {
  if (codeProblem(code)) return false;
  const [scheme, digits] = [code.slice(0, code.indexOf(":")), code.slice(code.indexOf(":") + 1)];
  const i = prefix.indexOf(":");
  if (i < 0 || i === prefix.length - 1) return scheme === (i < 0 ? prefix : prefix.slice(0, i));
  return scheme === prefix.slice(0, i) && digits.startsWith(prefix.slice(i + 1));
}
