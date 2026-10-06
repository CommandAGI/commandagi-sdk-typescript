/**
 * A LETTER IN JSX — a `.letter.tsx`, the paper letter that CommandAGI's postal mail prints and mails (docs/postal.md
 * in the CommandAGI repository). The file is the letter: the postal pane edits it, an agent writes it, and a send
 * names it.
 *
 *   // Letters/Welcome.letter.tsx
 *   export default () => (
 *     <letter color={false} doubleSided={false} mailClass="first">
 *       <to name="Ada Lovelace" line1="12 St James's Square" city="London" postalCode="SW1Y 4JH" country="GB" />
 *       <from name="Northwind Survey" line1="1 Main St" city="Portland" region="OR" postalCode="97201" country="US" />
 *       <paragraph text="Dear Ada," />
 *       <paragraph text="Thank you for your order. It ships on Monday." />
 *     </letter>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim.
 * The addresses are one `<to>` and one `<from>`; the body is `<paragraph text>` children, in order, one per
 * paragraph, so an edit to one paragraph changes one line. Nothing adds a default: what the file does not say, the
 * letter does not have (the postal code fills black-and-white, single-sided, first class when it sends).
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const ADDRESS_FIELDS = ["name", "company", "line1", "line2", "city", "region", "postalCode", "country"] as const;
export const LETTER_FIELDS = ["color", "doubleSided", "mailClass"] as const;

export interface LetterAddress {
  name?: string;
  company?: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

/** A letter as the postal pane edits it. */
export interface LetterDoc {
  color?: boolean;
  doubleSided?: boolean;
  mailClass?: "first" | "standard";
  to?: LetterAddress;
  from?: LetterAddress;
  paragraphs: string[];
}

const fields = (o: Record<string, unknown>, keys: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined && o[k] !== "") out[k] = o[k];
  return out;
};

function check(t: DocTree): void {
  const { color, doubleSided, mailClass } = t.attrs;
  if (color !== undefined && typeof color !== "boolean") throw new Error("<letter> color is true or false");
  if (doubleSided !== undefined && typeof doubleSided !== "boolean") throw new Error("<letter> doubleSided is true or false");
  if (mailClass !== undefined && mailClass !== "first" && mailClass !== "standard") throw new Error('<letter> mailClass is "first" or "standard"');
  for (const c of t.children) {
    if (c.tag === "paragraph" && typeof c.attrs.text !== "string") throw new Error("<paragraph> text is text");
    if (c.tag === "to" || c.tag === "from")
      for (const [k, v] of Object.entries(c.attrs)) if (typeof v !== "string") throw new Error(`<${c.tag}> ${k} is text`);
  }
}

export const letterVocabulary: Vocabulary<LetterDoc> = {
  format: "letter",
  noun: "a letter",
  root: "letter",
  tags: {
    letter: { parents: [], attrs: LETTER_FIELDS },
    to: { parents: ["letter"], single: true, attrs: ADDRESS_FIELDS },
    from: { parents: ["letter"], single: true, attrs: ADDRESS_FIELDS },
    paragraph: { parents: ["letter"], required: ["text"], attrs: ["text"] },
  },
  fromTree(t) {
    check(t);
    const to = t.children.find((c) => c.tag === "to");
    const from = t.children.find((c) => c.tag === "from");
    return {
      ...(fields(t.attrs, LETTER_FIELDS) as Partial<LetterDoc>),
      ...(to ? { to: { ...to.attrs } as LetterAddress } : {}),
      ...(from ? { from: { ...from.attrs } as LetterAddress } : {}),
      paragraphs: t.children.filter((c) => c.tag === "paragraph").map((c) => c.attrs.text as string),
    };
  },
  toTree(d) {
    const children: DocTree[] = [];
    if (d.to) children.push({ tag: "to", attrs: fields(d.to as Record<string, unknown>, ADDRESS_FIELDS), children: [] });
    if (d.from) children.push({ tag: "from", attrs: fields(d.from as Record<string, unknown>, ADDRESS_FIELDS), children: [] });
    for (const text of d.paragraphs ?? []) children.push({ tag: "paragraph", attrs: { text }, children: [] });
    return { tag: "letter", attrs: fields(d as unknown as Record<string, unknown>, LETTER_FIELDS), children };
  },
  empty: () => ({ paragraphs: [] }),
};

registerVocabulary(letterVocabulary);

/** The vocabulary of a letter, by format. */
export const POSTAL = { letter: letterVocabulary } as const;
