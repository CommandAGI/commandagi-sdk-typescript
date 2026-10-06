/**
 * OFFICE DOCUMENTS IN JSX — a workbook (`.sheet.tsx`), a page (`.page.tsx`) and a deck (`.deck.tsx`), declared as the very
 * document the CommandAGI sheets, docs and decks editors open. Nothing here is a second model: a `<workbook>` reads
 * to the workbook JSON the grid edits, a `<page>` to the page's block list, and a `<deck>` to the deck's own op graph
 * (`deck.doc`, `deck.slide`, `deck.text` …).
 *
 *   export default () => (
 *     <workbook title="Budget">
 *       <sheet name="Q1">
 *         <column at="A" width={160} />
 *         <cell at="A1" value="Item" bold />
 *         <cell at="B1" value={1200} numFmt="$#,##0" />
 *         <cell at="B2" formula="=B1*12" />
 *       </sheet>
 *     </workbook>
 *   );
 *
 *   export default () => (
 *     <page title="Notes">
 *       <h1>Launch notes</h1>
 *       <p>
 *         The first sentence of a paragraph.
 *         The second one, with <b>bold</b> and a <a href="https://commandagi.com">link</a>.
 *       </p>
 *       <bullet>a list item</bullet>
 *     </page>
 *   );
 *
 *   export default () => (
 *     <deck name="Pitch">
 *       <slide layout="Title">
 *         <text placeholder="title">Pitch</text>
 *       </slide>
 *       <slide layout="Blank">
 *         <shape shape="rect" x={100} y={120} w={400} h={200} fill="#dbeafe" />
 *       </slide>
 *     </deck>
 *   );
 *
 * The tags:
 *   <workbook title>                                        the workbook
 *   <sheet name rows cols frozenRows frozenCols color>      a grid sheet (200 rows and 26 columns unless it says)
 *   <cell at value formula numFmt bold italic align bg color wrap>
 *                                                           one cell: `value` (text, a number, true/false) or a
 *                                                           `formula` that starts with "="
 *   <column at width>  <row at height>                      a column's width or a row's height, in pixels
 *   <page title paper font>                                 the page; paper "letter" or "a4", font "sans", "serif"
 *                                                           or "mono" (a few typefaces, not a font menu)
 *   <h1> <h2> <h3> <p> <quote align>                        a text block; its children are its text; align "left",
 *                                                           "center", "right" or "justify"
 *   <bullet> <numbered>                                     a list item
 *   <todo checked>                                          a checklist item
 *   <pre lang>                                              a code block: its text as a string ({"…"})
 *   <divider />  <image src alt />                          a rule, a picture
 *   <b> <i> <u> <s> <code> <a href> <br />                  marks inside a text block
 *   <deck name width height style>                          the deck (1280 × 720 slide units unless it says); style
 *                                                           "plain", "ink", "editorial" or "signal" (plain unless it says)
 *   <slide layout name notes background hidden>             a slide on a layout, by the layout's name
 *   <text placeholder x y w h rotation fontSize color bold italic underline align valign>
 *                                                           a text box; its children are its text (a <p> per
 *                                                           paragraph, or text for one)
 *   <shape shape x y w h fill stroke strokeWidth cornerRadius>  <image src x y w h fit alt>
 *                                                           every element also takes opacity, label, locked (the
 *                                                           editor does not move it) and group (elements with one
 *                                                           group name select and move as one)
 *
 * THE TEXT OF A BLOCK IS ITS CHILDREN, never a prop: long prose stays readable, and an edit to one sentence changes
 * one line when each sentence is on a line of its own (the editors write it so). JSX joins the lines of a text with
 * one space, as HTML does.
 *
 * Each declared thing carries the element it came from (`source`, the sandbox's `__source`): a workbook's and a
 * page's in `sources` beside the document (keyed `sheet:<id>`, `cell:<id>!A1`, `block:<id>` …), a deck's in each
 * node's `meta.source`, as every graph's. Anything else is refused by name, never guessed.
 */
import { channels } from "./ir.js";
import type { DeclaredDocument, IRGraph, IRNode } from "./ir.js";
import { childElements, isElement, type DesignElement } from "./jsx-runtime.js";


const where = (el: DesignElement) => `<${el.type}${typeof el.props.name === "string" ? ` name="${el.props.name}"` : typeof el.props.at === "string" ? ` at="${el.props.at}"` : ""}>`;

function only(el: DesignElement, allowed: readonly string[]): void {
  for (const k of Object.keys(el.props))
    if (k !== "children" && k !== "key" && !allowed.includes(k)) throw new Error(`${where(el)}: ${k} is not read on a <${el.type}> (it takes ${allowed.join(", ") || "nothing"})`);
}
function str(el: DesignElement, prop: string): string | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new Error(`${where(el)}: ${prop} is text, not ${JSON.stringify(v)}`);
  return v;
}
function num(el: DesignElement, prop: string): number | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${where(el)}: ${prop} is a number, not ${JSON.stringify(v)}`);
  return v;
}
function bool(el: DesignElement, prop: string): boolean | undefined {
  const v = el.props[prop];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw new Error(`${where(el)}: ${prop} is true or false, not ${JSON.stringify(v)}`);
  return v;
}
function oneOf<T extends string>(el: DesignElement, prop: string, values: readonly T[]): T | undefined {
  const v = str(el, prop);
  if (v !== undefined && !values.includes(v as T)) throw new Error(`${where(el)}: ${prop} is one of ${values.join(", ")}`);
  return v as T | undefined;
}
const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** The document roots this file reads. */
export const OFFICE_ROOTS = ["workbook", "page", "deck"] as const;

/** Whether a declared value is an office document's root element. */
export function isOfficeRoot(value: unknown): value is DesignElement {
  return isElement(value) && (OFFICE_ROOTS as readonly string[]).includes(value.type);
}

// ── Workbook ───────────────────────────────────────────────────────────────────────────────────────────────────

const A1 = /^([A-Z]{1,3})([1-9]\d{0,6})$/;
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const ALIGN = ["left", "center", "right"] as const;

/** A `<workbook>` as the workbook JSON the sheets editor opens, with where each part was written. */
export function readWorkbook(root: DesignElement): DeclaredDocument {
  only(root, ["title"]);
  const sources: Record<string, unknown> = { workbook: root.source };
  const names = new Set<string>();
  const sheets = childElements(root.props.children).map((el, i) => {
    if (el.type !== "sheet") throw new Error(`<${el.type}> is not read in a <workbook> (it holds <sheet>s)`);
    only(el, ["name", "rows", "cols", "frozenRows", "frozenCols", "color"]);
    const id = `sheet-${i + 1}`;
    const name = str(el, "name") ?? `Sheet ${i + 1}`;
    if (names.has(name.toLowerCase())) throw new Error(`two sheets are called ${name}`);
    names.add(name.toLowerCase());
    sources[`sheet:${id}`] = el.source;
    const cells: Record<string, Record<string, unknown>> = {};
    const colWidths: Record<number, number> = {};
    const rowHeights: Record<number, number> = {};
    let rows = num(el, "rows") ?? 200, cols = num(el, "cols") ?? 26;
    for (const c of childElements(el.props.children)) {
      if (c.type === "column" || c.type === "row") {
        only(c, ["at", c.type === "column" ? "width" : "height"]);
        const at = c.props.at;
        const index = c.type === "column" ? (typeof at === "string" && /^[A-Z]{1,3}$/.test(at) ? colIndex(at) : NaN) : typeof at === "number" && Number.isInteger(at) && at >= 1 ? at - 1 : NaN;
        if (Number.isNaN(index)) throw new Error(`${where(c)}: at is ${c.type === "column" ? 'a column\'s letters ("B")' : "a row's number (1 is the first)"}`);
        const size = num(c, c.type === "column" ? "width" : "height");
        if (size === undefined || size <= 0) throw new Error(`${where(c)}: ${c.type === "column" ? "width" : "height"} is a number of pixels`);
        const key = c.type === "column" ? String(at) : String(index + 1);
        (c.type === "column" ? colWidths : rowHeights)[index] = size;
        sources[`${c.type}:${id}!${key}`] = c.source;
        continue;
      }
      if (c.type !== "cell") throw new Error(`<${c.type}> is not read in a <sheet> (it holds <cell>, <column> and <row>)`);
      only(c, ["at", "value", "formula", "numFmt", "bold", "italic", "align", "bg", "color", "wrap"]);
      const at = str(c, "at")?.toUpperCase();
      const m = at ? A1.exec(at) : null;
      if (!at || !m) throw new Error(`<cell>: at is an A1 reference ("B4"), not ${JSON.stringify(c.props.at)}`);
      if (cells[at]) throw new Error(`two cells of ${name} are at ${at}`);
      if (c.props.children !== undefined) throw new Error(`${where(c)}: a cell's value is its value prop, not its children`);
      const v = c.props.value;
      if (v !== undefined && v !== null && !["string", "number", "boolean"].includes(typeof v)) throw new Error(`${where(c)}: value is text, a number or true/false`);
      const f = str(c, "formula");
      if (f !== undefined && !f.startsWith("=")) throw new Error(`${where(c)}: a formula starts with = ("=SUM(B2:B4)")`);
      if (f !== undefined && v !== undefined) throw new Error(`${where(c)}: a cell has a value or a formula, not both`);
      const fmt = defined({ numFmt: str(c, "numFmt"), bold: bool(c, "bold"), italic: bool(c, "italic"), align: oneOf(c, "align", ALIGN), bg: str(c, "bg"), color: str(c, "color"), wrap: bool(c, "wrap") });
      cells[at] = defined({ v: f === undefined ? v : undefined, f, fmt: Object.keys(fmt).length ? fmt : undefined });
      rows = Math.max(rows, Number(m[2]));
      cols = Math.max(cols, colIndex(m[1]!) + 1);
      sources[`cell:${id}!${at}`] = c.source;
    }
    const fr = num(el, "frozenRows"), fc = num(el, "frozenCols");
    return defined({
      id,
      name,
      color: str(el, "color"),
      kind: "grid",
      rows,
      cols,
      cells,
      colWidths: Object.keys(colWidths).length ? colWidths : undefined,
      rowHeights: Object.keys(rowHeights).length ? rowHeights : undefined,
      frozen: fr !== undefined || fc !== undefined ? { rows: fr ?? 0, cols: fc ?? 0 } : undefined,
    });
  });
  if (!sheets.length) throw new Error("a <workbook> holds at least one <sheet>");
  const title = str(root, "title");
  return { format: "workbook", document: { format: "workbook", version: 1, sheets, ...(title !== undefined ? { meta: { title } } : {}) }, sources };
}

// ── Page ───────────────────────────────────────────────────────────────────────────────────────────────────────

const TEXT_BLOCKS: Record<string, string> = { h1: "h1", h2: "h2", h3: "h3", p: "p", bullet: "ul", numbered: "ol", todo: "todo", quote: "quote" };
/** The blocks that take an alignment. */
const ALIGNED = new Set(["h1", "h2", "h3", "p", "quote"]);
const BLOCK_ALIGN = ["left", "center", "right", "justify"] as const;
/** The page's paper and its typefaces: a few, chosen once, not a font menu. */
export const PAPERS = ["letter", "a4"] as const;
export const PAGE_FONTS = ["sans", "serif", "mono"] as const;
const MARKS = new Set(["b", "i", "u", "s", "code"]);

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A text block's children as the block's inline HTML (the docs editor's subset: b, i, u, s, code, a, br). */
export function inlineHtml(children: unknown, at: string): string {
  let out = "";
  const walk = (c: unknown) => {
    if (c === null || c === undefined || typeof c === "boolean") return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (typeof c === "string" || typeof c === "number") return void (out += escapeHtml(String(c)));
    if (!isElement(c)) throw new Error(`${at}: a text holds text and marks`);
    if (c.type === "br") {
      only(c, []);
      out += "<br>";
      return;
    }
    if (c.type === "a") {
      only(c, ["href"]);
      const href = str(c, "href") ?? "";
      out += `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`;
      walk(c.props.children);
      out += "</a>";
      return;
    }
    if (!MARKS.has(c.type)) throw new Error(`${at}: <${c.type}> is not a mark (the marks are b, i, u, s, code, a and br)`);
    only(c, []);
    out += `<${c.type}>`;
    walk(c.props.children);
    out += `</${c.type}>`;
  };
  walk(children);
  return out;
}

/** The plain text of a `<pre>`'s children. */
function plainText(children: unknown, at: string): string {
  const parts: string[] = [];
  const walk = (c: unknown) => {
    if (c === null || c === undefined || typeof c === "boolean") return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (typeof c === "string" || typeof c === "number") return void parts.push(String(c));
    throw new Error(`${at}: a code block holds text ({"…"}), not elements`);
  };
  walk(children);
  return parts.join("");
}

/** A `<page>` as the page the docs editor opens, with where each block was written. */
export function readPage(root: DesignElement): DeclaredDocument {
  only(root, ["title", "paper", "font"]);
  const sources: Record<string, unknown> = { page: root.source };
  const blocks = childElements(root.props.children).map((el, i) => {
    const id = `block-${i + 1}`;
    sources[`block:${id}`] = el.source;
    const type = TEXT_BLOCKS[el.type];
    if (type) {
      only(el, type === "todo" ? ["checked"] : ALIGNED.has(el.type) ? ["align"] : []);
      return defined({ id, type, html: inlineHtml(el.props.children, `<${el.type}>`), checked: type === "todo" ? (bool(el, "checked") ?? false) : undefined, align: ALIGNED.has(el.type) ? oneOf(el, "align", BLOCK_ALIGN) : undefined });
    }
    switch (el.type) {
      case "pre":
        only(el, ["lang"]);
        return defined({ id, type: "code", html: escapeHtml(plainText(el.props.children, "<pre>")), lang: str(el, "lang") });
      case "divider":
        only(el, []);
        return { id, type: "divider", html: "" };
      case "image":
        only(el, ["src", "alt"]);
        return defined({ id, type: "image", html: "", src: str(el, "src") ?? "", alt: str(el, "alt") });
      default:
        throw new Error(`<${el.type}> is not a block of a <page> (the blocks are h1, h2, h3, p, bullet, numbered, todo, quote, pre, divider and image)`);
    }
  });
  const title = str(root, "title");
  const setup = defined({ paper: oneOf(root, "paper", PAPERS), font: oneOf(root, "font", PAGE_FONTS) });
  return { format: "page", document: { format: "page", version: 1, blocks, ...(title !== undefined ? { meta: { title } } : {}), ...(Object.keys(setup).length ? { page: setup } : {}) }, sources };
}

// ── Deck ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** The deck's node types (the decks editor's own). */
export const DECK_TYPES = { doc: "deck.doc", slide: "deck.slide", text: "deck.text", image: "deck.image", shape: "deck.shape" } as const;
const BOX = ["x", "y", "w", "h", "rotation"] as const;
const COMMON = [...BOX, "placeholder", "z", "visible", "opacity", "label", "locked", "group"];
/** The deck's styles: a few curated looks (the decks editor's own themes), not a theme editor. */
export const DECK_STYLES = ["plain", "ink", "editorial", "signal"] as const;

interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: string;
}

/** A text box's children as the deck's rich text: a `<p>` per paragraph, or text and marks for one paragraph. */
export function richText(children: unknown, at: string): { paragraphs: { runs: Run[] }[] } {
  const kids = (Array.isArray(children) ? children.flat(Infinity) : [children]).filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
  const runsOf = (c: unknown, style: Omit<Run, "text">, out: Run[]) => {
    if (c === null || c === undefined || typeof c === "boolean") return;
    if (Array.isArray(c)) return c.forEach((x) => runsOf(x, style, out));
    if (typeof c === "string" || typeof c === "number") {
      const prev = out.at(-1);
      if (prev && JSON.stringify({ ...prev, text: "" }) === JSON.stringify({ text: "", ...style })) prev.text += String(c);
      else out.push({ text: String(c), ...style });
      return;
    }
    if (!isElement(c)) throw new Error(`${at}: a text holds text and marks`);
    const mark: Record<string, keyof Omit<Run, "text">> = { b: "bold", i: "italic", u: "underline", s: "strike" };
    if (c.type === "a") {
      only(c, ["href"]);
      return runsOf(c.props.children, { ...style, link: str(c, "href") ?? "" }, out);
    }
    if (!mark[c.type]) throw new Error(`${at}: <${c.type}> is not a mark of a text box (b, i, u, s, a; a <p> per paragraph)`);
    only(c, []);
    runsOf(c.props.children, { ...style, [mark[c.type]!]: true }, out);
  };
  const paragraphs = kids.some((c) => isElement(c) && c.type === "p")
    ? kids.map((c) => {
        if (!isElement(c) || c.type !== "p") throw new Error(`${at}: a text with paragraphs holds only <p>s`);
        only(c, []);
        const runs: Run[] = [];
        runsOf(c.props.children, {}, runs);
        return { runs };
      })
    : [{ runs: ((): Run[] => { const runs: Run[] = []; runsOf(kids, {}, runs); return runs; })() }];
  return { paragraphs: paragraphs.length ? paragraphs : [{ runs: [] }] };
}

/** A `<deck>` as the deck's op graph: `doc`, then `slide-N`, then `slide-N.M` for its elements. A slide names its
 *  layout by name (`layout`); the editor binds that name to its stock layouts. */
export function readDeck(root: DesignElement): IRGraph {
  only(root, ["name", "width", "height", "dpi", "style"]);
  const nodes: Record<string, IRNode> = {};
  const meta = (el: DesignElement) => (el.source === undefined ? {} : { meta: { source: el.source } });
  const slides = childElements(root.props.children).map((el, i) => {
    if (el.type !== "slide") throw new Error(`<${el.type}> is not read in a <deck> (it holds <slide>s)`);
    only(el, ["layout", "name", "notes", "background", "hidden"]);
    const id = `slide-${i + 1}`;
    const elements = childElements(el.props.children).map((c, k) => {
      const eid = `${id}.${k + 1}`;
      const box = defined(Object.fromEntries(BOX.map((p) => [p, num(c, p)])));
      const common = defined({ box: Object.keys(box).length ? box : undefined, placeholder: str(c, "placeholder"), z: num(c, "z"), visible: bool(c, "visible"), opacity: num(c, "opacity"), label: str(c, "label"), locked: bool(c, "locked"), group: str(c, "group") });
      let type: string, inputs: Record<string, unknown>;
      switch (c.type) {
        case "text":
          only(c, [...COMMON, "fontSize", "color", "bold", "italic", "underline", "align", "valign", "fontFamily", "lineHeight", "overflow"]);
          type = DECK_TYPES.text;
          inputs = defined({ ...common, text: richText(c.props.children, `<text> of ${id}`), fontSizePx: num(c, "fontSize"), color: str(c, "color"), bold: bool(c, "bold"), italic: bool(c, "italic"), underline: bool(c, "underline"), align: oneOf(c, "align", ["left", "center", "right", "justify"]), valign: oneOf(c, "valign", ["top", "middle", "bottom"]), fontFamily: str(c, "fontFamily"), lineHeight: num(c, "lineHeight"), overflow: oneOf(c, "overflow", ["visible", "clip", "ellipsis"]) });
          break;
        case "shape":
          only(c, [...COMMON, "shape", "fill", "stroke", "strokeWidth", "cornerRadius"]);
          type = DECK_TYPES.shape;
          inputs = defined({ ...common, shape: oneOf(c, "shape", ["rect", "ellipse", "triangle", "line"]) ?? "rect", fill: str(c, "fill"), stroke: str(c, "stroke"), strokeWidth: num(c, "strokeWidth"), cornerRadius: num(c, "cornerRadius") });
          break;
        case "image":
          only(c, [...COMMON, "src", "fit", "alt"]);
          type = DECK_TYPES.image;
          inputs = defined({ ...common, src: str(c, "src") ?? "", fit: oneOf(c, "fit", ["fill", "contain", "cover", "none"]), alt: str(c, "alt") });
          break;
        default:
          throw new Error(`<${c.type}> is not an element of a <slide> (text, shape, image)`);
      }
      if (!common.placeholder && ["x", "y", "w", "h"].some((p) => (box as Record<string, unknown>)[p] === undefined))
        throw new Error(`the <${c.type}> ${k + 1} of ${id} needs x, y, w and h (or a placeholder to take them from)`);
      nodes[eid] = { id: eid, type, inputs, ...meta(c) };
      return { wire: { node: eid, port: "out" } };
    });
    const hidden = bool(el, "hidden");
    nodes[id] = {
      id,
      type: DECK_TYPES.slide,
      inputs: defined({ layout: str(el, "layout") ?? "Title and body", name: str(el, "name"), notes: str(el, "notes"), background: str(el, "background"), hidden, ...channels("elements", elements) }),
      ...meta(el),
    };
    return { wire: { node: id, port: "out" } };
  });
  const name = str(root, "name") ?? "Deck";
  nodes.doc = { id: "doc", type: DECK_TYPES.doc, inputs: defined({ name, width: num(root, "width") ?? 1280, height: num(root, "height") ?? 720, dpi: num(root, "dpi"), style: oneOf(root, "style", DECK_STYLES), ...channels("slides", slides) }), ...meta(root) };
  return { id: `deck:${name}`, nodes, outputs: ["doc"], meta: { domain: "deck", name } };
}

/** What an office root declares: a native document (a workbook, a page), or a deck's graph. */
export function readOffice(root: DesignElement): { document: DeclaredDocument } | { graph: IRGraph } {
  if (root.type === "workbook") return { document: readWorkbook(root) };
  if (root.type === "page") return { document: readPage(root) };
  return { graph: readDeck(root) };
}
