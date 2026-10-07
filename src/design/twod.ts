/**
 * 2D DOCUMENTS IN JSX — a drawing, a paint document, a photo and a nest, declared as the nodes the CommandAGI 2D
 * editors draw and edit (no second model). The root names the document:
 *
 *   <drawing>    layers of shapes                     (`.draw.tsx`)
 *   <painting>   a layer stack of brush strokes       (`.paint.tsx`)
 *   <photo>      pixel layers, adjustments, filters   (`.img.tsx`)
 *   <nest>       flat parts nested on a sheet         (`.nest.tsx`)
 *
 *   export default () => (
 *     <drawing name="Poster" width={800} height={600} background="#ffffff">
 *       <layer name="Layer 1">
 *         <rect x={40} y={40} w={200} h={120} fill="#3b82f6" />
 *         <group name="Badge">
 *           <ellipse cx={500} cy={300} rx={60} ry={60} fill="#f59e0b" />
 *           <path d="M 440 300 L 560 300" strokeColor="#111111" strokeWidth={2} />
 *         </group>
 *       </layer>
 *     </drawing>
 *   );
 *
 * ONE RULE FOR EVERY TAG: an element is one node, its attributes are the node's inputs by their own names, and its
 * children are the nodes it takes, in order. So a file says what the editor's document holds, and an edit in the
 * editor is one attribute or one element. The few encodings (each for a reason):
 *
 *   drawing   the drawing is its first artboard; each `<artboard name width height background>` after its layers is
 *             another, holding its own `<layer>`s (one `composite` each; `meta.pages` lists them in order). A
 *             top-level `<group>` is written `<layer>` (the editor's layers panel lists them); a path's `subpaths`
 *             is `d`, an SVG path (M L C Q Z, absolute); a brush stroke's points are `[x, y]` pairs; an `<image>`
 *             or a `<raster-layer>` names its image file by `src`. A modifier
 *             (`<blur>`, `<transform>`, `<fill>`, …) wraps the one node it takes; `<boolean>` its shapes; `<clip>` its
 *             content then its mask.
 *   painting  `<layer>`, `<fill>`, `<group>`, `<textLayer>`, the shape layers (`<rect>`, `<ellipse>`, `<polygon>`, `<line>`)
 *             and the photo's adjustment tags are the stack, bottom first; a layer's `<stroke>`, `<bucket>`,
 *             `<gradientFill>` and `<move>` children are what was painted, filled and moved on it, oldest first. A stroke's
 *             points are `[x, y, pressure, t]` (with tilt, `[x, y, pressure, t, tiltX, tiltY]`): free-hand data is a points
 *             array, written once. Each may hold a `selection` (`[{ rect: [x, y, w, h], feather }, { op: "subtract",
 *             polygon: [[x, y], …] }, …]`), the region it changed. `<textLayer text="Title" x y size font weight color
 *             align />` is a type layer (point text at the baseline anchor; with `width` and `height`, a paragraph box). A
 *             layer's `<fx>` holds its styles (`<dropShadow>`, `<innerShadow>`, `<outerGlow>`, `<stroke>`,
 *             `<colorOverlay>`, `<gradientOverlay>`), as its `fx`; a `<mask enabled={false}>` is a mask turned off.
 *   photo     `<raster>`, `<fill>`, `<gradient>`, `<group>` and one tag per adjustment (`<exposure ev={0.35} />`,
 *             `<hsl>`, `<levels>`, `<develop exposure={0.3} contrast={12} />`, …) are the stack; a raster's children are its filters (`<gaussianBlur radius={3} />`).
 *             In a painting or a photo, a `<mask>` child of a layer (or of a stroke or a filter) holds the one layer
 *             that masks it (`<mask><gradient /></mask>`).
 *   nest      `<sheet>`, `<stock>`, `<options>` and one `<part>` per part.
 *
 * PIXELS ARE NOT CODE: a raster layer, a placed image or a pixel layer names its image file by relative path
 * (`src="scan.png"`, the file beside the document). Nothing here holds encoded pixels. `label`, `disabled` and `id` set the
 * node's own fields. Each node carries the element's `source` in `meta.source`. A tag the vocabulary does not have
 * is refused by name.
 */
import { Declaration, Scope, channels, slug, withScope, type IRNode, type NodeRef } from "./ir.js";
import { childElements, isElement, type DesignElement } from "./jsx-runtime.js";

/** The roots of a 2D document in JSX. */
export const TWOD_ROOTS = ["drawing", "painting", "photo", "nest"] as const;

export function isTwoD(value: unknown): value is DesignElement {
  return isElement(value) && (TWOD_ROOTS as readonly string[]).includes(value.type);
}

const meta = (el: DesignElement) => (el.source === undefined ? undefined : { source: el.source });
const where = (el: DesignElement) => `<${el.type}${typeof el.props.name === "string" ? ` name="${el.props.name}"` : ""}>`;

function plainData(v: unknown, what: string): unknown {
  if (v === null || v === undefined || ["string", "number", "boolean"].includes(typeof v)) {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`${what}: ${v} is not a finite number`);
    return v;
  }
  if (Array.isArray(v)) return v.map((x, i) => plainData(x, `${what}[${i}]`));
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plainData(x, `${what}.${k}`)]));
  throw new Error(`${what} is plain data (numbers, strings, arrays, objects)`);
}

/** An element's attributes as plain data, without `children`, `key` and the node fields (`id`, `label`, `disabled`). */
function attrs(el: DesignElement, skip: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children" || k === "key" || k === "id" || k === "label" || k === "disabled" || skip.includes(k) || v === undefined) continue;
    out[k] = plainData(v, `${where(el)} ${k}`);
  }
  return out;
}

/** Declare `el` as one node of `type`. */
function add(s: Scope, el: DesignElement, type: string, inputs: Record<string, unknown>): NodeRef {
  const id = el.props.id;
  if (id !== undefined && typeof id !== "string") throw new Error(`${where(el)}: id is a string`);
  const label = el.props.label;
  const ref = s.add(type, inputs, {
    ...(id ? { id } : {}),
    ...(typeof label === "string" ? { label } : {}),
    meta: meta(el),
  });
  if (el.props.disabled === true) (ref.node as IRNode).disabled = true;
  return ref;
}

const kids = (el: DesignElement) => childElements(el.props.children);

// ── Drawing ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Shapes and modifiers a drawing declares: the draw editor's op types. */
const DRAW_SOURCES = new Set(["rect", "ellipse", "polygon", "path", "text", "brush-stroke"]);
/** Modifiers: the one node each takes is its child, on port `in`. */
const DRAW_MODIFIERS = new Set(["transform", "offset", "array", "mirror", "stroke", "fill", "blur", "levels", "threshold", "adjust", "crop", "bucket-fill"]);
/** Pixels a drawing places: each names its image file (`src`). */
const DRAW_PIXELS = new Set(["image", "raster-layer"]);
const DRAW_LATER = new Set(["sketch", "connector", "draw.instance"]);

/** An SVG path's `d` (absolute M L H V C Q Z) as the editor's subpaths. */
export function subpathsOf(d: string, what: string): unknown[] {
  const tokens = d.match(/[MLHVCQZmlhvcqz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const out: { start: { x: number; y: number }; segs: Record<string, unknown>[]; closed?: boolean }[] = [];
  let i = 0, cmd = "", cur = { x: 0, y: 0 };
  const n = () => {
    const t = tokens[i++];
    if (t === undefined || /[A-Za-z]/.test(t)) throw new Error(`${what}: d ends where a number is needed`);
    return Number(t);
  };
  const pt = () => ({ x: n(), y: n() });
  const sub = () => {
    const s = out.at(-1);
    if (!s) throw new Error(`${what}: d starts with M`);
    return s;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (cmd !== cmd.toUpperCase()) throw new Error(`${what}: d is written in absolute commands (M L H V C Q Z), not ${cmd}`);
    switch (cmd) {
      case "M":
        cur = pt();
        out.push({ start: cur, segs: [] });
        cmd = "L";
        break;
      case "L":
        cur = pt();
        sub().segs.push({ to: cur });
        break;
      case "H":
        cur = { x: n(), y: cur.y };
        sub().segs.push({ to: cur });
        break;
      case "V":
        cur = { x: cur.x, y: n() };
        sub().segs.push({ to: cur });
        break;
      case "C": {
        const c1 = pt(), c2 = pt();
        cur = pt();
        sub().segs.push({ c1, c2, to: cur });
        break;
      }
      case "Q": {
        const c1 = pt();
        cur = pt();
        sub().segs.push({ c1, to: cur });
        break;
      }
      case "Z":
        sub().closed = true;
        cur = sub().start;
        break;
      default:
        throw new Error(`${what}: d has no command before ${tokens[i]}`);
    }
  }
  return out;
}

function pairs(v: unknown, what: string): { x: number; y: number }[] {
  if (!Array.isArray(v)) throw new Error(`${what} is a list of [x, y] points`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((c) => typeof c === "number")) throw new Error(`${what}[${i}] is [x, y]`);
    return { x: p[0] as number, y: p[1] as number };
  });
}

function declareDrawn(s: Scope, el: DesignElement, top: boolean): NodeRef {
  const t = el.type;
  if (t === "layer" && !top) throw new Error(`${where(el)}: a <layer> is a child of the <drawing>; inside it, group with <group>`);
  if (t !== "layer" && top) throw new Error(`<${t}> is inside a <layer> (a drawing's children are its layers)`);
  if (t === "layer" || t === "group") {
    const children = kids(el).map((c) => declareDrawn(s, c, false));
    return add(s, el, "group", { ...attrs(el), ...channels("children", children) });
  }
  if (DRAW_SOURCES.has(t)) {
    if (kids(el).length) throw new Error(`${where(el)} takes no children`);
    const a = attrs(el);
    if (t === "path") {
      if ("subpaths" in a) throw new Error(`${where(el)}: a path is written with d (an SVG path), not subpaths`);
      if (a.d !== undefined) {
        if (typeof a.d !== "string") throw new Error(`${where(el)}: d is an SVG path string`);
        a.subpaths = subpathsOf(a.d, where(el));
        delete a.d;
      }
    }
    if (t === "brush-stroke" && a.points !== undefined) a.points = pairs(a.points, `${where(el)} points`);
    return add(s, el, t, a);
  }
  if (DRAW_PIXELS.has(t)) {
    if (kids(el).length) throw new Error(`${where(el)} takes no children`);
    if (el.props.src === undefined) throw new Error(`${where(el)}: src names its image file by relative path ("photo.png")`);
    return add(s, el, t, { ...attrs(el, ["src"]), __asset: asset(el.props.src, el) });
  }
  if (DRAW_MODIFIERS.has(t)) {
    const [input, ...rest] = kids(el);
    if (!input || rest.length) throw new Error(`${where(el)} wraps the one node it changes`);
    return add(s, el, t, { ...attrs(el), in: declareDrawn(s, input, false) });
  }
  if (t === "boolean") return add(s, el, t, { ...attrs(el), ...channels("shapes", kids(el).map((c) => declareDrawn(s, c, false))) });
  if (t === "clip") {
    const [content, mask, ...rest] = kids(el);
    if (!content || !mask || rest.length) throw new Error(`${where(el)} takes its content, then its mask`);
    return add(s, el, t, { ...attrs(el), content: declareDrawn(s, content, false), mask: declareDrawn(s, mask, false) });
  }
  if (DRAW_LATER.has(t)) throw new Error(`<${t}> is not declared in code yet (a drawing in code holds shapes, images, groups and modifiers)`);
  throw new Error(`<${t}> is not read in a drawing (see commandagi/design twod)`);
}

/** An artboard's own fields, and a drawing's (the drawing is its first artboard). */
const BOARD = ["name", "width", "height", "background"] as const;

function drawing(root: DesignElement, name: string): Declaration {
  const a = attrs(root, [...BOARD]);
  if (Object.keys(a).length) throw new Error(`<drawing>: ${Object.keys(a)[0]} is not read (a drawing has name, width, height, background)`);
  // A drawing with no name of its own declares none; the file's name only names the graph.
  const own = typeof root.props.name === "string" ? root.props.name : undefined;
  const m: Record<string, unknown> = own !== undefined ? { name: own } : {};
  for (const k of ["width", "height", "background"] as const) if (root.props[k] !== undefined) m[k] = plainData(root.props[k], `<drawing> ${k}`);
  const s = new Scope(`draw:${slug(own ?? name)}`, m);
  withScope(s, () => {
    // The drawing is its first artboard: its layers are its own; each `<artboard>` after them is another artboard.
    const children = kids(root);
    const boards = children.filter((c) => c.type === "artboard");
    const firstBoard = children.findIndex((c) => c.type === "artboard");
    if (firstBoard >= 0 && children.slice(firstBoard).some((c) => c.type !== "artboard"))
      throw new Error(`<drawing>: its layers come before its <artboard>s (the drawing is the first artboard)`);
    const layers = children.filter((c) => c.type !== "artboard").map((c) => declareDrawn(s, c, true));
    const comp = s.add(
      "composite",
      { ...(m.background !== undefined ? { background: m.background } : {}), ...channels("layers", layers) },
      { id: "composite", label: "Output", meta: meta(root) },
    );
    s.output(comp);
    if (!boards.length) return;
    const page = (compositeId: string, name: string, fields: Record<string, unknown>) => ({ id: compositeId, name, ...fields, compositeId });
    const pages = [page("composite", own ?? "Artboard 1", { ...(m.width !== undefined ? { width: m.width } : {}), ...(m.height !== undefined ? { height: m.height } : {}), ...(m.background !== undefined ? { background: m.background } : {}) })];
    boards.forEach((b, i) => {
      const extra = attrs(b, [...BOARD]);
      if (Object.keys(extra).length) throw new Error(`${where(b)}: ${Object.keys(extra)[0]} is not read (an artboard has name, width, height, background)`);
      const boardName = typeof b.props.name === "string" ? b.props.name : `Artboard ${i + 2}`;
      const fields: Record<string, unknown> = {};
      for (const k of ["width", "height", "background"] as const) if (b.props[k] !== undefined) fields[k] = plainData(b.props[k], `${where(b)} ${k}`);
      const boardLayers = kids(b).map((c) => {
        if (c.type === "artboard") throw new Error(`${where(b)}: an <artboard> is a child of the <drawing>, not of another artboard`);
        return declareDrawn(s, c, true);
      });
      const id = b.props.id;
      if (id !== undefined && typeof id !== "string") throw new Error(`${where(b)}: id is a string`);
      const ref = s.add(
        "composite",
        { ...(fields.background !== undefined ? { background: fields.background } : {}), ...channels("layers", boardLayers) },
        { ...(id ? { id } : {}), label: boardName, meta: meta(b) },
      );
      s.output(ref);
      pages.push(page(ref.id, boardName, fields));
    });
    s.meta.pages = pages;
  });
  return new Declaration("drawing", s.build());
}

// ── Paint and photo: a layer stack ─────────────────────────────────────────────────────────────────────────────

/** The fields every layer of a stack carries (a chain's top stands in for its layer in the stack). */
const COMMON = ["name", "visible", "opacity", "blend", "clip", "locked"] as const;
const COMMON_DEFAULTS = { name: "Layer", visible: true, opacity: 1, blend: "normal" } as const;

export const PHOTO_ADJUSTMENTS = ["exposure", "levels", "curves", "hsl", "vibrance", "colorBalance", "blackWhite", "invert", "threshold", "posterize", "develop"] as const;
export const PHOTO_FILTERS = ["gaussianBlur", "unsharpMask", "sharpen", "noise"] as const;
/** A painting layer's styles, the tags of its `<fx>` (Photoshop's Layer Style). */
export const LAYER_STYLES = ["dropShadow", "innerShadow", "outerGlow", "stroke", "colorOverlay", "gradientOverlay"] as const;

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };

/** A pixel layer's `src`: the image file it names, as the document's own file names it. */
function asset(src: unknown, el: DesignElement): Record<string, unknown> {
  if (typeof src !== "string" || !src || src.startsWith("data:"))
    throw new Error(`${where(el)}: src names an image file by relative path ("scan.png"); pixels are not written in code`);
  if (src.startsWith("/") || /^[a-z]+:/i.test(src)) throw new Error(`${where(el)}: src is a path relative to this file, not ${src}`);
  const ext = src.split(".").pop()!.toLowerCase();
  return { kind: "file", $file: src, ...(MIME[ext] ? { mime: MIME[ext] } : {}) };
}

/** A stroke's point tuples as the editor's points. */
function strokePoints(v: unknown, what: string): Record<string, number>[] {
  if (!Array.isArray(v)) throw new Error(`${what} is a list of [x, y, pressure, t] points`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || (p.length !== 4 && p.length !== 6) || !p.every((c) => typeof c === "number"))
      throw new Error(`${what}[${i}] is [x, y, pressure, t] or [x, y, pressure, t, tiltX, tiltY]`);
    const [x, y, pressure, t, tiltX, tiltY] = p as number[];
    return { x: x!, y: y!, pressure: pressure!, t: t!, ...(p.length === 6 ? { tiltX: tiltX!, tiltY: tiltY! } : {}) };
  });
}

interface StackKind {
  root: "painting" | "photo";
  prefix: "paint" | "photo";
  /** Layer tag → node type and how its attributes become inputs. */
  layer(el: DesignElement): { type: string; inputs: Record<string, unknown> } | null;
  /** A chain member's tag (a stroke, a bucket fill, a filter) → its own inputs. */
  chain(el: DesignElement): Record<string, unknown> | null;
  /** A chain member's node type. */
  chainType(el: DesignElement): string;
}

/** An adjustment tag as a layer: the layer's own fields, and the rest as its `adjustment`. */
function adjustmentLayer(el: DesignElement, type: string): { type: string; inputs: Record<string, unknown> } {
  const common: Record<string, unknown> = {}, adjustment: Record<string, unknown> = { type: el.type };
  for (const [k, v] of Object.entries(attrs(el))) ((COMMON as readonly string[]).includes(k) ? common : adjustment)[k] = v;
  return { type, inputs: { ...common, adjustment } };
}

/** What a painting chains on a pixel layer besides its strokes: the Paint Bucket, the Gradient, the Move tool. */
export const PAINT_CHAIN = ["stroke", "bucket", "gradientFill", "move"] as const;
/** A painting's shape layers. */
export const PAINT_SHAPES = ["rect", "ellipse", "polygon", "line"] as const;

const PAINT: StackKind = {
  root: "painting",
  prefix: "paint",
  chainType: (el) => `paint.${el.type}`,
  layer(el) {
    if (el.type === "layer") {
      const a = attrs(el, ["src"]);
      return { type: "paint.layer", inputs: { ...a, ...(el.props.src !== undefined ? { __asset: asset(el.props.src, el) } : {}) } };
    }
    if (el.type === "fill") return { type: "paint.fill", inputs: attrs(el) };
    if (el.type === "group") return { type: "paint.group", inputs: attrs(el) };
    if (el.type === "textLayer") {
      if (typeof el.props.text !== "string") throw new Error(`${where(el)}: text is the layer's words (text="Title")`);
      return { type: "paint.text", inputs: attrs(el) };
    }
    if ((PHOTO_ADJUSTMENTS as readonly string[]).includes(el.type)) return adjustmentLayer(el, "paint.adjust");
    if ((PAINT_SHAPES as readonly string[]).includes(el.type)) return { type: "paint.shape", inputs: { ...attrs(el), shape: el.type } };
    return null;
  },
  chain(el) {
    if (!(PAINT_CHAIN as readonly string[]).includes(el.type)) return null;
    const a = attrs(el);
    for (const k of COMMON) if (k in a) throw new Error(`${where(el)}: ${k} is the layer's (write it on the layer it is painted on)`);
    if (el.type === "stroke" && a.points !== undefined) a.points = strokePoints(a.points, `${where(el)} points`);
    return a;
  },
};

const PHOTO: StackKind = {
  root: "photo",
  prefix: "photo",
  chainType: () => "photo.filter",
  layer(el) {
    if (el.type === "raster") {
      const a = attrs(el, ["src"]);
      return { type: "photo.raster", inputs: { ...a, ...(el.props.src !== undefined ? { __asset: asset(el.props.src, el) } : {}) } };
    }
    if (el.type === "fill") return { type: "photo.fill", inputs: attrs(el) };
    if (el.type === "gradient") return { type: "photo.gradient", inputs: attrs(el) };
    if (el.type === "group") return { type: "photo.group", inputs: attrs(el) };
    if ((PHOTO_ADJUSTMENTS as readonly string[]).includes(el.type)) return adjustmentLayer(el, "photo.adjust");
    return null;
  },
  chain(el) {
    if (!(PHOTO_FILTERS as readonly string[]).includes(el.type)) return null;
    const a = attrs(el);
    for (const k of COMMON) if (k in a) throw new Error(`${where(el)}: ${k} is the layer's (write it on the layer it filters)`);
    return { filter: { type: el.type, ...a } };
  },
};

/**
 * A layer's (or a stroke's, or a filter's) `<mask>`: the one stack layer it holds, declared outside the stack and
 * wired to the node's `mask` port. A mask is any layer the stack could hold (a `<gradient>`, a `<raster src>`, a
 * `<fill>`, a `<group>` …). The `<mask>` element is not a node: where it was written is the masked node's
 * `meta.sources.mask`.
 */
function maskOf(s: Scope, kind: StackKind, el: DesignElement): { inputs: { mask?: NodeRef }; at?: unknown } {
  const masks = kids(el).filter((c) => c.type === "mask");
  if (!masks.length) return { inputs: {} };
  if (masks.length > 1) throw new Error(`${where(el)} has one <mask>`);
  const m = masks[0]!;
  const ma = attrs(m);
  for (const k of Object.keys(ma))
    if (k !== "enabled" || typeof ma.enabled !== "boolean") throw new Error(`<mask> in ${where(el)} has one attribute, enabled (write the rest on the layer it holds)`);
  const held = kids(m);
  if (held.length !== 1) throw new Error(`<mask> in ${where(el)} holds one layer`);
  return { inputs: { mask: declareStack(s, kind, held)[0]!, ...(ma.enabled === false ? { maskEnabled: false } : {}) }, at: m.source };
}

/** A painting layer's `<fx>`: its styles, in order, as the layer's `fx`; where each was written goes in `meta.sources`. */
function stylesOf(kind: StackKind, el: DesignElement): { fx?: Record<string, unknown>[]; sources: Record<string, unknown> } {
  const blocks = kids(el).filter((c) => c.type === "fx");
  if (!blocks.length) return { sources: {} };
  if (kind.prefix !== "paint") throw new Error(`${where(el)}: <fx> (layer styles) is a painting's`);
  if (blocks.length > 1) throw new Error(`${where(el)} has one <fx>`);
  const block = blocks[0]!;
  if (Object.keys(attrs(block)).length) throw new Error(`<fx> in ${where(el)} has no attributes (write them on its styles)`);
  const sources: Record<string, unknown> = { fx: block.source };
  const fx = kids(block).map((c, i) => {
    if (!(LAYER_STYLES as readonly string[]).includes(c.type)) throw new Error(`<${c.type}> is not a layer style (${LAYER_STYLES.join(", ")})`);
    if (kids(c).length) throw new Error(`${where(c)} in <fx> takes no children`);
    sources[`fx.${i}`] = c.source;
    return { type: c.type, ...attrs(c) };
  });
  return { fx, sources };
}

/** Declare `el` as one node of `type`, masked by its `<mask>` when it has one. */
function addMasked(s: Scope, kind: StackKind, el: DesignElement, type: string, inputs: Record<string, unknown>): NodeRef {
  const mask = maskOf(s, kind, el);
  const styles = stylesOf(kind, el);
  const ref = add(s, el, type, { ...inputs, ...mask.inputs, ...(styles.fx ? { fx: styles.fx } : {}) });
  const sources = { ...styles.sources, ...(mask.at !== undefined ? { mask: mask.at } : {}) };
  if (Object.keys(sources).length) {
    const node = ref.node as IRNode;
    node.meta = { ...node.meta, sources };
  }
  return ref;
}

function declareStack(s: Scope, kind: StackKind, children: DesignElement[]): NodeRef[] {
  const slots: NodeRef[] = [];
  for (const el of children) {
    const layer = kind.layer(el);
    if (!layer) {
      if (kind.chain(el)) throw new Error(`${where(el)} is painted on a layer: write it inside one`);
      throw new Error(`<${el.type}> is not read in a ${kind.root} (see commandagi/design twod)`);
    }
    const stack: DesignElement[] = [], chain: DesignElement[] = [];
    for (const c of kids(el)) if (c.type !== "mask" && c.type !== "fx") (kind.chain(c) ? chain : stack).push(c);
    if (stack.length && layer.type !== `${kind.prefix}.group`) throw new Error(`${where(el)}: only a <group> holds layers`);
    const inner = layer.type === `${kind.prefix}.group` ? declareStack(s, kind, stack) : [];
    let top = addMasked(s, kind, el, layer.type, { ...layer.inputs, ...channels("layers", inner) });
    // Each chain member carries the layer's fields: the stack reads them off whichever member is on top.
    const carried: Record<string, unknown> = { ...COMMON_DEFAULTS };
    for (const k of COMMON) if (layer.inputs[k] !== undefined) carried[k] = layer.inputs[k];
    for (const c of chain) top = addMasked(s, kind, c, kind.chainType(c), { ...carried, ...kind.chain(c)!, src: top });
    slots.push(top);
  }
  return slots;
}

function stackDocument(kind: StackKind, root: DesignElement, name: string): Declaration {
  const a = attrs(root);
  for (const k of Object.keys(a))
    if (!["name", "width", "height", "background", "dpi"].includes(k)) throw new Error(`<${kind.root}>: ${k} is not read (it has name, width, height, background, dpi)`);
  const title = typeof a.name === "string" ? a.name : name;
  const s = new Scope(`${kind.prefix}:${slug(title)}`, { domain: kind.prefix, name: title });
  withScope(s, () => {
    const layers = declareStack(s, kind, kids(root));
    const doc = s.add(`${kind.prefix}.doc`, { ...a, ...channels("layers", layers) }, { id: "doc", meta: meta(root) });
    s.output(doc);
  });
  return new Declaration(kind.prefix, s.build());
}

// ── Nest ───────────────────────────────────────────────────────────────────────────────────────────────────────

const NEST_ONE = ["sheet", "stock", "options"] as const;

function nestDocument(root: DesignElement, name: string): Declaration {
  const a = attrs(root, ["name"]);
  for (const k of Object.keys(a)) if (!["safeZMm", "overrides"].includes(k)) throw new Error(`<nest>: ${k} is not read (it has safeZMm, overrides)`);
  const title = typeof root.props.name === "string" ? root.props.name : name;
  const s = new Scope(`nest:${slug(title)}`, { domain: "nest", name: title });
  withScope(s, () => {
    const one: Record<string, NodeRef> = {};
    const parts: NodeRef[] = [];
    for (const el of kids(root)) {
      if ((NEST_ONE as readonly string[]).includes(el.type)) {
        if (one[el.type]) throw new Error(`a nest has one <${el.type}>`);
        one[el.type] = add(s, el, `nest.${el.type}`, attrs(el));
      } else if (el.type === "part") {
        if (typeof el.props.id !== "string") throw new Error(`${where(el)}: a part has an id (the name its placements and overrides use)`);
        parts.push(add(s, el, "nest.part", attrs(el)));
      } else throw new Error(`<${el.type}> is not read in a nest (it has <sheet>, <stock>, <options>, <part>)`);
    }
    for (const k of NEST_ONE) if (!one[k]) throw new Error(`a nest needs its <${k}>`);
    const doc = s.add("nest.doc", { ...a, ...one, ...channels("parts", parts) }, { id: "nest", meta: meta(root) });
    s.output(doc);
  });
  return new Declaration("nest", s.build());
}

/** Declare a 2D document from its root element. */
export function fromTwoD(root: DesignElement, name = "Drawing"): Declaration {
  switch (root.type) {
    case "drawing":
      return drawing(root, name);
    case "painting":
      return stackDocument(PAINT, root, name);
    case "photo":
      return stackDocument(PHOTO, root, name);
    case "nest":
      return nestDocument(root, name);
  }
  throw new Error(`<${root.type}> is not a 2D document (${TWOD_ROOTS.join(", ")})`);
}
