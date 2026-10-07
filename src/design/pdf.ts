/**
 * A PDF ASSEMBLED IN JSX — a `.pdf.tsx`: pages taken from PDFs by ref, blank pages, comments, stamps, signatures,
 * redactions and form fields on them, form values, bookmarks, page labels, attachments and metadata. The PDF app edits
 * it (each gesture writes the file); a headless run builds the `.pdf` it declares (docs/creative-apps.md § pdf in
 * the CommandAGI repository).
 *
 *   // Contracts/Signed.pdf.tsx
 *   export default () => (
 *     <pdf title="Signed contract" author="Ada Lovelace">
 *       <page src="Contract.pdf" n={1} />
 *       <page src="Contract.pdf" n={3} rotate={90}>
 *         <highlight rects={[[72, 700, 300, 712]]} author="Ada" text="Check this" />
 *         <note at={[500, 700]} text="Why?" author="Ada">
 *           <reply text="Because." author="Bob" />
 *           <reply text="Resolved" author="Ada" state="Completed" />
 *         </note>
 *         <stamp rect={[400, 40, 560, 90]} name="Approved" />
 *         <redact rect={[72, 500, 300, 520]} />
 *         <field kind="text" name="Name" rect={[72, 100, 300, 120]} />
 *       </page>
 *       <page size="a4" />
 *       <fill name="Name" value="Ada Lovelace" />
 *       <bookmark title="Terms" page={2}>
 *         <bookmark title="Payment" page={2} top={500} />
 *       </bookmark>
 *       <label from={1} style="r" />
 *       <attach src="data.csv" description="The figures" />
 *       <header right="{file}" size={8} />
 *       <footer center="Page {page} of {pages}" pages="2-" />
 *       <bates prefix="ACME-" digits={6} position="bottom-right" />
 *     </pdf>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim.
 * Pages and page numbers are 1-based, as a person counts them. A header or footer is drawn on every page (or
 * `pages`, "2-10"): text in the left, center and right slots, with `{page}`, `{pages}`, `{date}` and `{file}` in it;
 * `margin` is from its edge of the shown page, `inset` from the sides. Bates numbers run from `start` on every page. Coordinates are PDF points (1/72 inch) from the
 * page's lower-left corner; a colour is [r, g, b], each 0..1. A `src` is a ref: a path relative to this file's
 * folder, or an address. Nothing adds a default: what the file does not say, the PDF does not have.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** Blank page sizes in points (portrait). */
export const PAGE_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
  tabloid: [792, 1224],
};

const COMMON = ["id", "author", "text", "color", "opacity", "date"] as const;
/** The marks a page holds, with the attributes each reads. */
export const PDF_MARKS: Readonly<Record<string, readonly string[]>> = {
  highlight: [...COMMON, "rects"],
  underline: [...COMMON, "rects"],
  strikeout: [...COMMON, "rects"],
  squiggly: [...COMMON, "rects"],
  note: [...COMMON, "at", "icon", "open"],
  textbox: [...COMMON, "rect", "size", "textColor", "border", "fill", "align"],
  ink: [...COMMON, "strokes", "width"],
  rectangle: [...COMMON, "rect", "width", "fill"],
  ellipse: [...COMMON, "rect", "width", "fill"],
  line: [...COMMON, "from", "to", "width", "arrow"],
  polygon: [...COMMON, "points", "width", "fill"],
  polyline: [...COMMON, "points", "width"],
  stamp: [...COMMON, "rect", "name", "label", "image"],
  signature: ["id", "author", "rect", "typed", "style", "image", "strokes", "color", "width"],
  redact: ["id", "rect", "fill", "overlay"],
  field: ["id", "kind", "name", "rect", "rects", "value", "options", "checked", "multiline", "maxLength", "required", "readOnly", "tooltip", "default", "editable", "size"],
};
const REQUIRED: Readonly<Record<string, readonly string[]>> = {
  highlight: ["rects"],
  underline: ["rects"],
  strikeout: ["rects"],
  squiggly: ["rects"],
  note: ["at"],
  textbox: ["rect", "text"],
  ink: ["strokes"],
  rectangle: ["rect"],
  ellipse: ["rect"],
  line: ["from", "to"],
  polygon: ["points"],
  polyline: ["points"],
  stamp: ["rect"],
  signature: ["rect"],
  redact: ["rect"],
  field: ["kind", "name"],
};

export const PDF_FIELDS = ["title", "author", "subject", "keywords", "creator"] as const;
export const PAGE_FIELDS = ["id", "src", "n", "rotate", "size", "width", "height"] as const;
export const BOOKMARK_FIELDS = ["id", "title", "page", "top", "open", "bold", "italic", "color", "url"] as const;
export const BAND_FIELDS = ["left", "center", "right", "size", "color", "family", "margin", "inset", "pages", "start", "date"] as const;
export const BATES_FIELDS = ["prefix", "suffix", "start", "digits", "position", "size", "color", "family", "margin", "inset"] as const;
export const BATES_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center", "bottom-right"] as const;

export type PdfRect = [number, number, number, number];
export type PdfColor = [number, number, number];

/** A review state a reply sets on its thread: "Completed" is resolved, "None" reopens it. */
export const REVIEW_STATES = ["Accepted", "Rejected", "Cancelled", "Completed", "None"] as const;
const REPLY_FIELDS = ["text", "author", "date", "state"] as const;
export interface PdfReply {
  text: string;
  author?: string;
  date?: string;
  state?: (typeof REVIEW_STATES)[number];
}
/** A mark on a page: its tag as `type`, its attributes verbatim, a note's replies. */
export interface PdfMark {
  type: string;
  replies?: PdfReply[];
  [attr: string]: unknown;
}
export interface PdfPage {
  id?: string;
  /** A page of another PDF (ref) and its 1-based number, or a blank page (size, or width and height). */
  src?: string;
  n?: number;
  rotate?: number;
  size?: string;
  width?: number;
  height?: number;
  marks?: PdfMark[];
}
export interface PdfBookmark {
  id?: string;
  title: string;
  page?: number;
  top?: number;
  open?: boolean;
  bold?: boolean;
  italic?: boolean;
  color?: PdfColor;
  url?: string;
  children?: PdfBookmark[];
}
export interface PdfLabel {
  from: number;
  style?: "D" | "r" | "R" | "a" | "A";
  prefix?: string;
  start?: number;
}
export interface PdfAttachment {
  src: string;
  name?: string;
  description?: string;
  mimeType?: string;
}
/** A header or footer: its slots' text (with `{page}`, `{pages}`, `{date}`, `{file}`) and how it is set. */
export interface PdfBand {
  left?: string;
  center?: string;
  right?: string;
  size?: number;
  color?: PdfColor;
  family?: "sans" | "serif" | "mono";
  /** Points from its edge of the shown page (the top for a header, the bottom for a footer). */
  margin?: number;
  /** Points from the left and right edges. */
  inset?: number;
  /** Which pages ("2-10, 12"); every page when absent. */
  pages?: string;
  /** What `{page}` says on the first page it is drawn on. */
  start?: number;
  /** What `{date}` says. */
  date?: string;
}
export interface PdfBates {
  prefix?: string;
  suffix?: string;
  start?: number;
  digits?: number;
  position?: (typeof BATES_POSITIONS)[number];
  size?: number;
  color?: PdfColor;
  family?: "sans" | "serif" | "mono";
  margin?: number;
  inset?: number;
}

/** A PDF in code as the PDF app edits it. */
export interface PdfDoc {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  pages: PdfPage[];
  fill?: { name: string; value: string | boolean | string[] }[];
  bookmarks?: PdfBookmark[];
  labels?: PdfLabel[];
  attachments?: PdfAttachment[];
  header?: PdfBand;
  footer?: PdfBand;
  bates?: PdfBates;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRect = (v: unknown) => Array.isArray(v) && v.length === 4 && v.every(isNum);
const isPoint = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isColor = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => isNum(x) && x >= 0 && x <= 1);
const own = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

function checkMark(c: DocTree): void {
  const a = c.attrs, t = c.tag, where = `<${t}>`;
  if (a.rect !== undefined && !isRect(a.rect)) throw new Error(`${where} rect is [x0, y0, x1, y1] in points`);
  if (a.rects !== undefined && !(Array.isArray(a.rects) && a.rects.length && a.rects.every(isRect))) throw new Error(`${where} rects is a list of [x0, y0, x1, y1]`);
  for (const k of ["at", "from", "to"]) if (a[k] !== undefined && !isPoint(a[k])) throw new Error(`${where} ${k} is [x, y] in points`);
  for (const k of ["color", "textColor"]) if (a[k] !== undefined && !isColor(a[k])) throw new Error(`${where} ${k} is [r, g, b], each 0 to 1`);
  for (const k of ["fill", "border"]) if (a[k] !== undefined && a[k] !== null && !isColor(a[k])) throw new Error(`${where} ${k} is [r, g, b], each 0 to 1, or null`);
  if (a.opacity !== undefined && !(isNum(a.opacity) && a.opacity >= 0 && a.opacity <= 1)) throw new Error(`${where} opacity is 0 to 1`);
  if (a.strokes !== undefined && !(Array.isArray(a.strokes) && a.strokes.every((s) => Array.isArray(s) && s.length >= 2 && s.length % 2 === 0 && s.every(isNum)))) throw new Error(`${where} strokes is a list of [x, y, x, y …]`);
  if (a.points !== undefined && !(Array.isArray(a.points) && a.points.length >= 4 && a.points.length % 2 === 0 && a.points.every(isNum))) throw new Error(`${where} points is [x, y, x, y …]`);
  if (a.arrow !== undefined && !["none", "start", "end", "both"].includes(a.arrow as string)) throw new Error(`${where} arrow is "none", "start", "end" or "both"`);
  if (a.date !== undefined && (typeof a.date !== "string" || Number.isNaN(Date.parse(a.date)))) throw new Error(`${where} date is an ISO date ("2026-10-06T12:00:00Z")`);
  if (t === "field" && !["text", "checkbox", "radio", "dropdown", "list", "signature"].includes(a.kind as string)) throw new Error('<field> kind is "text", "checkbox", "radio", "dropdown", "list" or "signature"');
  if (t === "field" && a.kind === "radio" && !(Array.isArray(a.options) && Array.isArray(a.rects) && a.options.length === a.rects.length)) throw new Error("<field kind=\"radio\"> has options and rects, one rect per option");
  if (t === "field" && a.kind !== "radio" && !isRect(a.rect)) throw new Error("<field> rect is [x0, y0, x1, y1] in points");
  if (t === "signature" && [a.typed, a.image, a.strokes].filter((x) => x !== undefined).length !== 1) throw new Error("<signature> is one of typed, image or strokes");
  if (t === "stamp" && a.name === undefined && a.image === undefined && a.label === undefined) throw new Error("<stamp> has a name (Approved, Draft …), a label or an image");
  for (const k of ["text", "author", "name", "label", "image", "typed", "overlay", "tooltip"]) if (a[k] !== undefined && typeof a[k] !== "string") throw new Error(`${where} ${k} is text`);
  for (const k of ["required", "readOnly", "multiline", "checked", "editable"]) if (a[k] !== undefined && typeof a[k] !== "boolean") throw new Error(`${where} ${k} is true or false`);
  if (a.default !== undefined && !(typeof a.default === "string" || (Array.isArray(a.default) && a.default.every((x) => typeof x === "string")))) throw new Error(`${where} default is text, or a list of texts`);
  for (const r of c.children) {
    const s = r.attrs.state;
    if (r.tag === "reply" && s !== undefined && !(REVIEW_STATES as readonly unknown[]).includes(s)) throw new Error(`<reply> state is ${REVIEW_STATES.map((x) => `"${x}"`).join(", ")}`);
  }
}

function checkPage(p: DocTree): void {
  const a = p.attrs;
  if (a.src !== undefined) {
    if (typeof a.src !== "string" || !a.src) throw new Error("<page> src is the ref of a PDF");
    if (!(Number.isInteger(a.n) && (a.n as number) >= 1)) throw new Error("<page src> n is the page's number in it, from 1");
    if (a.size !== undefined || a.width !== undefined || a.height !== undefined) throw new Error("<page> is a page of src, or a blank page of a size: not both");
  } else {
    if (a.n !== undefined) throw new Error("<page> n is the page number in src");
    if (a.size !== undefined && !PAGE_SIZES[a.size as string]) throw new Error(`<page> size is ${Object.keys(PAGE_SIZES).join(", ")}`);
    if (a.size === undefined && !(isNum(a.width) && isNum(a.height) && (a.width as number) > 0 && (a.height as number) > 0)) throw new Error("<page> is a page of a PDF (src and n) or a blank page (size, or width and height in points)");
  }
  if (a.rotate !== undefined && !(Number.isInteger(a.rotate) && (a.rotate as number) % 90 === 0)) throw new Error("<page> rotate is a multiple of 90");
  for (const c of p.children) checkMark(c);
}

function checkBand(t: DocTree): void {
  const a = t.attrs, where = `<${t.tag}>`;
  if (t.tag !== "bates" && !["left", "center", "right"].some((k) => typeof a[k] === "string" && (a[k] as string).trim())) throw new Error(`${where} has text in left, center or right`);
  for (const k of ["left", "center", "right", "pages", "date", "prefix", "suffix"]) if (a[k] !== undefined && typeof a[k] !== "string") throw new Error(`${where} ${k} is text`);
  for (const k of ["size", "margin", "inset"]) if (a[k] !== undefined && !(isNum(a[k]) && (a[k] as number) >= 0)) throw new Error(`${where} ${k} is points, 0 or more`);
  if (a.color !== undefined && !isColor(a.color)) throw new Error(`${where} color is [r, g, b], each 0 to 1`);
  if (a.family !== undefined && !["sans", "serif", "mono"].includes(a.family as string)) throw new Error(`${where} family is "sans", "serif" or "mono"`);
  if (a.start !== undefined && !(Number.isInteger(a.start) && (a.start as number) >= 0)) throw new Error(`${where} start is a whole number`);
  if (a.digits !== undefined && !(Number.isInteger(a.digits) && (a.digits as number) >= 1 && (a.digits as number) <= 15)) throw new Error("<bates> digits is 1 to 15");
  if (a.position !== undefined && !(BATES_POSITIONS as readonly string[]).includes(a.position as string)) throw new Error(`<bates> position is ${BATES_POSITIONS.join(", ")}`);
}

function bookmarkOf(t: DocTree): PdfBookmark {
  const b = own(t.attrs, BOOKMARK_FIELDS) as unknown as PdfBookmark;
  if (typeof b.title !== "string") throw new Error("<bookmark> title is text");
  if (b.page !== undefined && !(Number.isInteger(b.page) && b.page >= 1)) throw new Error("<bookmark> page is a page number, from 1");
  const kids = t.children.filter((c) => c.tag === "bookmark").map(bookmarkOf);
  return { ...b, ...(kids.length ? { children: kids } : {}) };
}
function bookmarkTree(b: PdfBookmark): DocTree {
  return { tag: "bookmark", attrs: own(b as unknown as Record<string, unknown>, BOOKMARK_FIELDS), children: (b.children ?? []).map(bookmarkTree) };
}

const markTags = Object.keys(PDF_MARKS);
const tags: Vocabulary["tags"] = {
  pdf: { parents: [], attrs: PDF_FIELDS },
  page: { parents: ["pdf"], key: "id", attrs: PAGE_FIELDS },
  ...Object.fromEntries(markTags.map((t) => [t, { parents: ["page"], key: "id", required: REQUIRED[t] ?? [], attrs: PDF_MARKS[t]! }])),
  reply: { parents: ["note"], required: ["text"], attrs: REPLY_FIELDS },
  fill: { parents: ["pdf"], key: "name", required: ["name", "value"], attrs: ["name", "value"] },
  bookmark: { parents: ["pdf", "bookmark"], key: "id", required: ["title"], attrs: BOOKMARK_FIELDS },
  label: { parents: ["pdf"], required: ["from"], attrs: ["from", "style", "prefix", "start"] },
  attach: { parents: ["pdf"], required: ["src"], attrs: ["src", "name", "description", "mimeType"] },
  header: { parents: ["pdf"], attrs: BAND_FIELDS },
  footer: { parents: ["pdf"], attrs: BAND_FIELDS },
  bates: { parents: ["pdf"], attrs: BATES_FIELDS },
};

export const pdfVocabulary: Vocabulary<PdfDoc> = {
  format: "pdf",
  noun: "a PDF",
  root: "pdf",
  tags,
  fromTree(t) {
    for (const k of PDF_FIELDS) if (t.attrs[k] !== undefined && typeof t.attrs[k] !== "string") throw new Error(`<pdf> ${k} is text`);
    const pages: PdfPage[] = [];
    const fill: NonNullable<PdfDoc["fill"]> = [];
    const bookmarks: PdfBookmark[] = [];
    const labels: PdfLabel[] = [];
    const attachments: PdfAttachment[] = [];
    const bands: Pick<PdfDoc, "header" | "footer" | "bates"> = {};
    for (const c of t.children) {
      if (c.tag === "page") {
        checkPage(c);
        const marks = c.children.map((m) => {
          const replies = m.children.filter((r) => r.tag === "reply").map((r) => ({ ...r.attrs }) as unknown as PdfReply);
          return { type: m.tag, ...m.attrs, ...(replies.length ? { replies } : {}) } as PdfMark;
        });
        pages.push({ ...(own(c.attrs, PAGE_FIELDS) as PdfPage), ...(marks.length ? { marks } : {}) });
      } else if (c.tag === "fill") {
        const v = c.attrs.value;
        if (!(typeof v === "string" || typeof v === "boolean" || (Array.isArray(v) && v.every((x) => typeof x === "string")))) throw new Error("<fill> value is text, true or false, or a list of texts");
        fill.push({ name: c.attrs.name as string, value: v as string });
      } else if (c.tag === "bookmark") bookmarks.push(bookmarkOf(c));
      else if (c.tag === "label") {
        const l = own(c.attrs, ["from", "style", "prefix", "start"]) as unknown as PdfLabel;
        if (!(Number.isInteger(l.from) && l.from >= 1)) throw new Error("<label> from is a page number, from 1");
        if (l.style !== undefined && !["D", "r", "R", "a", "A"].includes(l.style)) throw new Error('<label> style is "D" (1 2 3), "r" (i ii), "R" (I II), "a" (a b) or "A" (A B)');
        labels.push(l);
      } else if (c.tag === "attach") attachments.push(own(c.attrs, ["src", "name", "description", "mimeType"]) as unknown as PdfAttachment);
      else if (c.tag === "header" || c.tag === "footer" || c.tag === "bates") {
        if (bands[c.tag]) throw new Error(`a PDF has one <${c.tag}>`);
        checkBand(c);
        bands[c.tag] = own(c.attrs, c.tag === "bates" ? BATES_FIELDS : BAND_FIELDS) as never;
      }
    }
    return {
      ...(own(t.attrs, PDF_FIELDS) as Partial<PdfDoc>),
      pages,
      ...(fill.length ? { fill } : {}),
      ...(bookmarks.length ? { bookmarks } : {}),
      ...(labels.length ? { labels } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...bands,
    };
  },
  toTree(d) {
    const children: DocTree[] = [];
    for (const p of d.pages ?? []) {
      const marks = (p.marks ?? []).map((m): DocTree => {
        const { type, replies, ...attrs } = m;
        return { tag: type, attrs: own(attrs, PDF_MARKS[type] ?? Object.keys(attrs)), children: (replies ?? []).map((r) => ({ tag: "reply", attrs: own(r as unknown as Record<string, unknown>, REPLY_FIELDS), children: [] })) };
      });
      children.push({ tag: "page", attrs: own(p as unknown as Record<string, unknown>, PAGE_FIELDS), children: marks });
    }
    for (const f of d.fill ?? []) children.push({ tag: "fill", attrs: { name: f.name, value: f.value }, children: [] });
    for (const b of d.bookmarks ?? []) children.push(bookmarkTree(b));
    for (const l of d.labels ?? []) children.push({ tag: "label", attrs: own(l as unknown as Record<string, unknown>, ["from", "style", "prefix", "start"]), children: [] });
    for (const a of d.attachments ?? []) children.push({ tag: "attach", attrs: own(a as unknown as Record<string, unknown>, ["src", "name", "description", "mimeType"]), children: [] });
    for (const tag of ["header", "footer", "bates"] as const) {
      const b = d[tag];
      if (b) children.push({ tag, attrs: own(b as unknown as Record<string, unknown>, tag === "bates" ? BATES_FIELDS : BAND_FIELDS), children: [] });
    }
    return { tag: "pdf", attrs: own(d as unknown as Record<string, unknown>, PDF_FIELDS), children };
  },
  empty: () => ({ pages: [] }),
};

registerVocabulary(pdfVocabulary);

/** The vocabulary of a PDF in code, by format. */
export const PDF = { pdf: pdfVocabulary } as const;
