/**
 * A LETTER OR A POSTCARD IN JSX — a `.letter.tsx` or a `.postcard.tsx`, the paper mail that CommandAGI's postal mail
 * prints and mails (docs/postal.md in the CommandAGI repository). The file is the piece: the postal pane edits it, an
 * agent writes it, and a send names it.
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
 *
 *   // Cards/Austin.postcard.tsx
 *   export default () => (
 *     <postcard>
 *       <to name="Ada Lovelace" line1="500 Elm St" city="Austin" region="TX" postalCode="78702" country="US" />
 *       <from name="Northwind Survey" line1="1 Main St" city="Portland" region="OR" postalCode="97201" country="US" />
 *       <front image="Austin.jpg" />
 *       <paragraph text="Greetings from Austin!" />
 *     </postcard>
 *   );
 *
 * A postcard is 4x6 inches (A6 in Europe), colour, first class. `<front image>` is a ref: a JPEG or PNG relative to
 * the postcard's folder (or an absolute address); it covers the front edge to edge. The `<paragraph>`s are the message
 * on the back, left of the address the provider prints.
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

/** A postcard as the postal pane edits it. `front` is the ref of its front image. */
export interface PostcardDoc {
  to?: LetterAddress;
  from?: LetterAddress;
  front?: string;
  paragraphs: string[];
}

export const postcardVocabulary: Vocabulary<PostcardDoc> = {
  format: "postcard",
  noun: "a postcard",
  root: "postcard",
  tags: {
    postcard: { parents: [], attrs: [] },
    to: { parents: ["postcard"], single: true, attrs: ADDRESS_FIELDS },
    from: { parents: ["postcard"], single: true, attrs: ADDRESS_FIELDS },
    front: { parents: ["postcard"], single: true, required: ["image"], attrs: ["image"] },
    paragraph: { parents: ["postcard"], required: ["text"], attrs: ["text"] },
  },
  fromTree(t) {
    check(t);
    const to = t.children.find((c) => c.tag === "to");
    const from = t.children.find((c) => c.tag === "from");
    const front = t.children.find((c) => c.tag === "front");
    if (front && typeof front.attrs.image !== "string") throw new Error("<front> image is the ref of a JPEG or PNG");
    return {
      ...(to ? { to: { ...to.attrs } as LetterAddress } : {}),
      ...(from ? { from: { ...from.attrs } as LetterAddress } : {}),
      ...(front ? { front: front.attrs.image as string } : {}),
      paragraphs: t.children.filter((c) => c.tag === "paragraph").map((c) => c.attrs.text as string),
    };
  },
  toTree(d) {
    const children: DocTree[] = [];
    if (d.to) children.push({ tag: "to", attrs: fields(d.to as Record<string, unknown>, ADDRESS_FIELDS), children: [] });
    if (d.from) children.push({ tag: "from", attrs: fields(d.from as Record<string, unknown>, ADDRESS_FIELDS), children: [] });
    if (d.front) children.push({ tag: "front", attrs: { image: d.front }, children: [] });
    for (const text of d.paragraphs ?? []) children.push({ tag: "paragraph", attrs: { text }, children: [] });
    return { tag: "postcard", attrs: {}, children };
  },
  empty: () => ({ paragraphs: [] }),
};

registerVocabulary(postcardVocabulary);

/** The vocabularies of postal mail, by format. */
export const POSTAL = { letter: letterVocabulary, postcard: postcardVocabulary } as const;
