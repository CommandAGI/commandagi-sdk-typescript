// commandagi/design twod — a drawing, a paint document, a photo and a nest in JSX declare the 2D editors' own nodes:
// an element is one node whose inputs are its attributes; children are the nodes it takes, in order; `__source`
// becomes meta.source. Pinned here: the node shapes each editor reads (composite + layer groups; the paint stack with
// stroke chains carrying the layer's fields; photo adjustments by tag; the nest's one-of nodes and parts), the few
// encodings (d, point tuples, src → the image file), and the refusals by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, subpathsOf, PHOTO_FILTERS, TWOD_SCHEMA, type IRGraph } from "./index.js";

const h = (type: string, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  jsx(type, children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props);
const run = (root: unknown, name = "Doc"): IRGraph => declarationOf({ default: () => root }, {}, { name }).graph;
const wire = (node: string) => ({ wire: { node, port: "out" } });

test("a drawing declares the composite, its layers as groups, shapes with their inputs, and d as subpaths", () => {
  const g = run(
    h("drawing", { name: "Poster", width: 800, height: 600, background: "#ffffff", __source: 0 },
      h("layer", { name: "Layer 1", __source: 1 },
        h("rect", { x: 1, y: 2, w: 3, h: 4, fill: "#000000", __source: 2 }),
        h("group", { name: "Badge", __source: 3 },
          h("ellipse", { cx: 5, cy: 6, rx: 7, ry: 7, __source: 4 }),
          h("blur", { radius: 2, __source: 5 }, h("path", { d: "M 0 0 L 10 0 C 1 2 3 4 5 6 Q 7 8 9 9 Z", label: "Edge", __source: 6 })),
        ),
      ),
    ),
  );
  assert.deepEqual(g.meta, { name: "Poster", width: 800, height: 600, background: "#ffffff" });
  assert.deepEqual(g.outputs, ["composite"]);
  assert.deepEqual(g.nodes.composite, { id: "composite", type: "composite", label: "Output", inputs: { background: "#ffffff", "layers.1": wire("group_2") }, meta: { source: 0 } });
  assert.deepEqual(g.nodes.group_2!.inputs, { name: "Layer 1", "children.1": wire("rect"), "children.2": wire("group") });
  assert.deepEqual(g.nodes.group!.inputs, { name: "Badge", "children.1": wire("ellipse"), "children.2": wire("blur") });
  assert.deepEqual(g.nodes.blur!.inputs, { radius: 2, in: wire("Edge") });
  assert.equal(g.nodes.Edge!.label, "Edge");
  assert.deepEqual(g.nodes.Edge!.inputs.subpaths, [
    { start: { x: 0, y: 0 }, segs: [{ to: { x: 10, y: 0 } }, { c1: { x: 1, y: 2 }, c2: { x: 3, y: 4 }, to: { x: 5, y: 6 } }, { c1: { x: 7, y: 8 }, to: { x: 9, y: 9 } }], closed: true },
  ]);
  assert.deepEqual(g.nodes.rect!.meta, { source: 2 });
});

test("a drawing is its first artboard; each <artboard> after its layers is another, with its own composite and page", () => {
  const g = run(
    h("drawing", { name: "Card", width: 400, height: 300, background: "#ffffff" },
      h("layer", { name: "Front" }, h("rect", { x: 1, y: 2, w: 3, h: 4 })),
      h("artboard", { name: "Back", width: 400, height: 300, background: "#eeeeee", __source: 9 },
        h("layer", { name: "Text" }, h("ellipse", { cx: 5, cy: 6, rx: 7, ry: 7 })),
      ),
      h("artboard", { width: 200, height: 100 }),
    ),
  );
  assert.deepEqual(g.outputs, ["composite", "Back", "Artboard_3"]);
  assert.deepEqual(g.meta!.pages, [
    { id: "composite", name: "Card", width: 400, height: 300, background: "#ffffff", compositeId: "composite" },
    { id: "Back", name: "Back", width: 400, height: 300, background: "#eeeeee", compositeId: "Back" },
    { id: "Artboard_3", name: "Artboard 3", width: 200, height: 100, compositeId: "Artboard_3" },
  ]);
  assert.deepEqual(g.nodes.Back, { id: "Back", type: "composite", label: "Back", inputs: { background: "#eeeeee", "layers.1": wire("group_2") }, meta: { source: 9 } });
  assert.deepEqual(g.nodes.group_2!.inputs, { name: "Text", "children.1": wire("ellipse") });
  assert.equal(run(h("drawing", {}, h("layer", {}))).meta!.pages, undefined, "one artboard: no pages");
  assert.throws(() => run(h("drawing", {}, h("artboard", {}), h("layer", {}))), /its layers come before its <artboard>s/);
  assert.throws(() => run(h("drawing", {}, h("artboard", { x: 4 }))), /x is not read \(an artboard has name, width, height, background\)/);
  assert.throws(() => run(h("drawing", {}, h("layer", {}, h("artboard", {})))), /<artboard> is not read in a drawing/);
});

test("a drawing's placed image and raster layer name their image files by src", () => {
  const g = run(
    h("drawing", { width: 100, height: 80 },
      h("layer", { name: "Pictures" },
        h("image", { src: "photos/harbour.jpg", x: 10, y: 20, w: 40, h: 30 }),
        h("raster-layer", { src: "scan.png" }),
      ),
    ),
  );
  assert.deepEqual(g.nodes.image!.inputs, { x: 10, y: 20, w: 40, h: 30, __asset: { kind: "file", $file: "photos/harbour.jpg", mime: "image/jpeg" } });
  assert.deepEqual(g.nodes["raster-layer"]!.inputs, { __asset: { kind: "file", $file: "scan.png", mime: "image/png" } });
  const drawn = (child: unknown) => () => run(h("drawing", {}, h("layer", {}, child)));
  assert.throws(drawn(h("image", { src: "data:image/png;base64,AAAA" })), /src names an image file by relative path/);
  assert.throws(drawn(h("raster-layer", { src: "/home/a.png" })), /src is a path relative to this file/);
  assert.throws(drawn(h("image", { x: 1 })), /src names its image file/);
});

test("a paint document's strokes chain onto their layer and carry its fields; a layer's pixels are its image file", () => {
  const g = run(
    h("painting", { name: "Sketch", width: 100, height: 80, background: [1, 1, 1, 1] },
      h("fill", { name: "Paper", color: [1, 1, 1, 1] }),
      h("layer", { name: "Ink", opacity: 0.5, x: 0, y: 0, width: 100, height: 80, src: "Sketch.assets/ink.png" },
        h("stroke", { points: [[1, 2, 0.5, 0], [3, 4, 0.5, 16, 10, 20]], brush: { kind: "round", size: 4 }, color: [0, 0, 0, 1] }),
        h("stroke", { points: [[5, 6, 1, 0]], color: [1, 0, 0, 1] }),
      ),
    ),
  );
  assert.deepEqual(g.nodes.doc!.inputs, { name: "Sketch", width: 100, height: 80, background: [1, 1, 1, 1], "layers.1": wire("paint.fill"), "layers.2": wire("paint.stroke_2") });
  assert.deepEqual(g.nodes["paint.layer"]!.inputs.__asset, { kind: "file", $file: "Sketch.assets/ink.png", mime: "image/png" });
  assert.deepEqual(g.nodes["paint.stroke"]!.inputs, {
    name: "Ink", visible: true, opacity: 0.5, blend: "normal",
    points: [{ x: 1, y: 2, pressure: 0.5, t: 0 }, { x: 3, y: 4, pressure: 0.5, t: 16, tiltX: 10, tiltY: 20 }],
    brush: { kind: "round", size: 4 }, color: [0, 0, 0, 1], src: wire("paint.layer"),
  });
  assert.deepEqual(g.nodes["paint.stroke_2"]!.inputs.src, wire("paint.stroke"));
  assert.deepEqual(g.meta, { domain: "paint", name: "Sketch" });
});

test("a painting's bucket, gradient and move chain on a layer beside its strokes; a shape is a layer; a selection is data", () => {
  const selection = [{ rect: [10, 10, 40, 30], feather: 4 }, { op: "subtract", polygon: [[20, 20], [30, 20], [25, 30]] }];
  const g = run(
    h("painting", { width: 100, height: 80 },
      h("layer", { name: "Paint" },
        h("stroke", { points: [[1, 2, 0.5, 0]], color: [0, 0, 0, 1], selection }),
        h("bucket", { x: 5, y: 6, tolerance: 20, contiguous: true, color: [1, 0, 0, 1] }),
        h("gradientFill", { shape: "linear", from: [0, 0], to: [100, 0], stops: [{ at: 0, color: [0, 0, 0, 1] }, { at: 1, color: [1, 1, 1, 1] }] }),
        h("move", { dx: 12, dy: -3, selection: [{ wand: [5, 6], tolerance: 32, contiguous: false }] }),
      ),
      h("rect", { name: "Rectangle 1", x: 4, y: 5, w: 30, h: 20, fill: [0, 0, 1, 1], stroke: [0, 0, 0, 1], strokeWidth: 2 }),
      h("line", { name: "Line 1", from: [0, 0], to: [10, 10], stroke: [1, 0, 0, 1], strokeWidth: 3 }),
    ),
  );
  assert.deepEqual(g.nodes["paint.stroke"]!.inputs.selection, selection);
  assert.deepEqual(g.nodes["paint.bucket"]!.inputs, { name: "Paint", visible: true, opacity: 1, blend: "normal", x: 5, y: 6, tolerance: 20, contiguous: true, color: [1, 0, 0, 1], src: wire("paint.stroke") });
  assert.deepEqual(g.nodes["paint.gradientFill"]!.inputs.src, wire("paint.bucket"));
  assert.deepEqual(g.nodes["paint.move"]!.inputs.dx, 12);
  assert.deepEqual(g.nodes.doc!.inputs["layers.1"], wire("paint.move"));
  assert.deepEqual(g.nodes["paint.shape"]!.inputs, { name: "Rectangle 1", x: 4, y: 5, w: 30, h: 20, fill: [0, 0, 1, 1], stroke: [0, 0, 0, 1], strokeWidth: 2, shape: "rect" });
  assert.equal(g.nodes["paint.shape_2"]!.inputs.shape, "line");
  assert.throws(() => run(h("painting", {}, h("layer", {}, h("bucket", { opacity: 0.5 })))), /opacity is the layer's/);
});

test("a photo's adjustments are tags whose attributes are the adjustment; a raster's children are its filters", () => {
  const g = run(
    h("photo", { name: "Harbour", width: 1280, height: 720 },
      h("raster", { name: "Photo", src: "Harbour.png" }, h("gaussianBlur", { radius: 3 })),
      h("exposure", { name: "Exposure", ev: 0.35, offset: 0, gamma: 1 }),
    ),
  );
  assert.deepEqual(g.nodes["photo.adjust"]!.inputs, { name: "Exposure", adjustment: { type: "exposure", ev: 0.35, offset: 0, gamma: 1 } });
  assert.deepEqual(g.nodes["photo.filter"]!.inputs, { name: "Photo", visible: true, opacity: 1, blend: "normal", filter: { type: "gaussianBlur", radius: 3 }, src: wire("photo.raster") });
  assert.deepEqual(g.nodes.doc!.inputs["layers.1"], wire("photo.filter"));
});

test("a <mask> is the one layer it holds, wired to the mask port of the node it masks (a layer or a chain member)", () => {
  const g = run(
    h("photo", {},
      h("exposure", { name: "Sky", ev: -0.5 }, h("mask", { __source: 9 }, h("gradient", {}))),
      h("raster", { src: "a.png" }, h("gaussianBlur", { radius: 2 }, h("mask", {}, h("fill", { color: [1, 1, 1, 1] })))),
    ),
  );
  assert.deepEqual(g.nodes["photo.adjust"]!.inputs.mask, wire("photo.gradient"));
  assert.deepEqual(g.nodes["photo.adjust"]!.meta, { sources: { mask: 9 } });
  assert.deepEqual(g.nodes["photo.filter"]!.inputs.mask, wire("photo.fill"));
  assert.equal(g.nodes["photo.raster"]!.inputs.mask, undefined);
  // The ten layer styles are the tags of a layer's <fx>, and each is a part in order.
  const styled = run(
    h("painting", { width: 100, height: 80 },
      h("layer", {}, h("fx", { __source: 3 },
        h("dropShadow", { distance: 4 }), h("innerShadow", {}), h("outerGlow", {}), h("innerGlow", { source: "center" }),
        h("bevelEmboss", { depth: 2 }), h("satin", { invert: true }), h("colorOverlay", {}), h("gradientOverlay", { align: "layer" }),
        h("patternOverlay", { pattern: "dots" }), h("stroke", { position: "inside" }),
      )),
    ),
  );
  assert.deepEqual(styled.nodes["paint.layer"]!.inputs.fx, [
    { type: "dropShadow", distance: 4 }, { type: "innerShadow" }, { type: "outerGlow" }, { type: "innerGlow", source: "center" },
    { type: "bevelEmboss", depth: 2 }, { type: "satin", invert: true }, { type: "colorOverlay" }, { type: "gradientOverlay", align: "layer" },
    { type: "patternOverlay", pattern: "dots" }, { type: "stroke", position: "inside" },
  ]);
  assert.equal((styled.nodes["paint.layer"]!.meta!.sources as Record<string, unknown>).fx, 3, "the <fx> block carries where it was written");
  assert.throws(() => run(h("painting", {}, h("layer", {}, h("fx", {}, h("blur", {}))))), /not a layer style/);
  assert.deepEqual(Object.keys(g.nodes.doc!.inputs).filter((k) => k.startsWith("layers.")), ["layers.1", "layers.2"]);
  assert.throws(() => run(h("photo", {}, h("exposure", {}, h("mask", {})))), /holds one layer/);
  const p = run(h("painting", {}, h("layer", {}, h("stroke", { points: [] }), h("mask", {}, h("fill", {})))));
  assert.deepEqual(p.nodes["paint.layer"]!.inputs.mask, wire("paint.fill"));
});

test("a nest declares its sheet, stock, options and parts", () => {
  const g = run(
    h("nest", { safeZMm: 5 },
      h("sheet", { widthMm: 600, heightMm: 400, marginMm: 5 }),
      h("stock", { materialId: "plywood", thicknessMm: 3, machine: { powerW: 40 } }),
      h("options", { resolutionMm: 1, spacingMm: 1, rotations: [0, 90], maxSheets: 8 }),
      h("part", { id: "tab", label: "Tab", quantity: 2, outline: [[0, 0], [10, 0], [10, 5]] }),
    ),
  );
  assert.deepEqual(g.nodes.nest!.inputs, { safeZMm: 5, sheet: wire("nest.sheet"), stock: wire("nest.stock"), options: wire("nest.options"), "parts.1": wire("tab") });
  assert.deepEqual(g.nodes.tab, { id: "tab", type: "nest.part", label: "Tab", inputs: { quantity: 2, outline: [[0, 0], [10, 0], [10, 5]] } });
});

test("a nest's <engrave> is a nest.engrave node on the engraves channel; it has an id", () => {
  const g = run(
    h("nest", { safeZMm: 5 },
      h("sheet", { widthMm: 300, heightMm: 200, marginMm: 5 }),
      h("stock", { materialId: "plywood", thicknessMm: 3, machine: { powerW: 40 } }),
      h("options", { resolutionMm: 1 }),
      h("engrave", { id: "logo", src: "logo.png", xMm: 20, yMm: 20, widthMm: 60, heightMm: 30, dpi: 254, dither: "ordered" }),
    ),
  );
  assert.deepEqual(g.nodes.nest!.inputs["engraves.1"], wire("logo"));
  assert.deepEqual(g.nodes.logo!.type, "nest.engrave");
  assert.deepEqual(g.nodes.logo!.inputs, { src: "logo.png", xMm: 20, yMm: 20, widthMm: 60, heightMm: 30, dpi: 254, dither: "ordered" });
  assert.throws(() => run(h("nest", {}, h("sheet", {}), h("stock", {}), h("options", {}), h("engrave", { src: "a.png" }))), /an engrave has an id/);
});

test("refused by name: pixels in code, a tag the vocabulary lacks, a stroke outside a layer, relative d", () => {
  const paint = (child: unknown) => () => run(h("painting", {}, child));
  assert.throws(paint(h("layer", { src: "data:image/png;base64,AAAA" })), /src names an image file by relative path/);
  assert.throws(paint(h("stroke", { points: [] })), /is painted on a layer: write it inside one/);
  assert.throws(() => run(h("drawing", {}, h("layer", {}, h("sketch", {})))), /<sketch> is not declared in code yet/);
  assert.throws(() => run(h("drawing", {}, h("rect", {}))), /<rect> is inside a <layer>/);
  assert.throws(() => subpathsOf("m 0 0 l 1 1", "<path>"), /absolute commands/);
  assert.throws(() => run(h("nest", {}, h("part", { id: "a" }))), /a nest needs its <sheet>/);
});

test("a <link> is a draw.instance node that names another drawing: a path from the file's folder, or an address", () => {
  const g = run(
    h("drawing", { width: 400, height: 300 },
      h("layer", { name: "Badge" },
        h("link", { label: "Badge", src: "parts/Badge.draw.tsx", x: 40, y: 60, inputs: { size: 48, tone: "warm", outlined: true } }),
        h("link", { src: "cloud://global/examples/2d/Badge.draw.tsx" }),
      ),
    ),
  );
  const [first, second] = ["children.1", "children.2"].map((port) => g.nodes[(g.nodes.group!.inputs[port] as { wire: { node: string } }).wire.node]!);
  assert.deepEqual({ type: first!.type, label: first!.label, inputs: first!.inputs }, { type: "draw.instance", label: "Badge", inputs: { __instance: { path: "parts/Badge.draw.tsx" }, x: 40, y: 60, inputs: { size: 48, tone: "warm", outlined: true } } });
  assert.deepEqual(second!.inputs, { __instance: { assetPath: "cloud://global/examples/2d/Badge.draw.tsx" } });
});

test("a <link> is checked against its schema, with the sentence an op panel shows", () => {
  const link = (props: Record<string, unknown>, ...children: unknown[]) => () => run(h("drawing", {}, h("layer", {}, h("link", props, ...children))));
  assert.throws(link({}), /<link>: src: is required/);
  assert.throws(link({ src: "a.draw.tsx", x: "40" }), /<link>: x: must be number \(got "string"\)/);
  assert.throws(link({ src: "a.draw.tsx", scale: 2 }), /<link>: scale: is not one of its fields/);
  assert.throws(link({ src: "a.draw.tsx", inputs: { size: [1] } }), /<link>: inputs\/size: does not match an allowed shape/);
  assert.throws(link({ src: " " }), /src names a drawing by its path/);
  assert.throws(link({ src: "a.draw.tsx" }, h("rect", {})), /<link> takes no children/);
});

test("a painting's filter chains among its strokes: it is the photo's filter, on what is painted under it", () => {
  const g = run(
    h("painting", { width: 100, height: 80 },
      h("layer", { name: "Paint", opacity: 0.8 },
        h("stroke", { points: [[1, 2, 0.5, 0]], color: [0, 0, 0, 1] }),
        h("gaussianBlur", { radius: 3 }),
        h("stroke", { points: [[5, 6, 0.5, 0]], color: [1, 0, 0, 1] }),
        h("noise", { amount: 0.1, monochrome: true, seed: 7 }, h("mask", {}, h("fill", { color: [1, 1, 1, 1] }))),
      ),
    ),
  );
  assert.deepEqual(g.nodes["paint.filter"]!.inputs, { name: "Paint", visible: true, opacity: 0.8, blend: "normal", filter: { type: "gaussianBlur", radius: 3 }, src: wire("paint.stroke") });
  assert.deepEqual(g.nodes["paint.stroke_2"]!.inputs.src, wire("paint.filter"));
  assert.deepEqual(g.nodes["paint.filter_2"]!.inputs.filter, { type: "noise", amount: 0.1, monochrome: true, seed: 7 });
  assert.deepEqual(g.nodes["paint.filter_2"]!.inputs.mask, wire("paint.fill"));
  assert.deepEqual(g.nodes.doc!.inputs["layers.1"], wire("paint.filter_2"));
  assert.throws(() => run(h("painting", {}, h("gaussianBlur", { radius: 3 }))), /is painted on a layer: write it inside one/);
  assert.throws(() => run(h("painting", {}, h("layer", {}, h("sharpen", { amount: 0.5, opacity: 0.5 })))), /opacity is the layer's/);
});

test("a filter is checked against its schema in a photo and in a painting, with one sentence", () => {
  const inPhoto = (props: Record<string, unknown>, tag = "gaussianBlur") => () => run(h("photo", {}, h("raster", { src: "a.png" }, h(tag, props))));
  const inPainting = (props: Record<string, unknown>, tag = "gaussianBlur") => () => run(h("painting", {}, h("layer", {}, h(tag, props))));
  for (const refuse of [inPhoto, inPainting]) {
    assert.throws(refuse({ radius: 300 }), /<gaussianBlur>: radius: must be at most 250 \(got 300\)/);
    // A required field with a declared default may be left out: a blur with no radius is the editor's 4 px blur.
    assert.deepEqual(Object.values(refuse({})().nodes).find((n) => n.type === "filter" || (n.inputs as { filter?: unknown }).filter)?.inputs.filter, { type: "gaussianBlur", radius: 4 });
    assert.throws(refuse({ radius: 3, strength: 1 }), /<gaussianBlur>: strength: is not one of its fields/);
    assert.throws(refuse({ amount: 0.1, monochrome: "yes" }, "noise"), /<noise>: monochrome: must be boolean \(got "string"\)/);
  }
});

test("the filter tags and the link are the schema's roots: one declaration for the photo and the painting", () => {
  assert.deepEqual([...PHOTO_FILTERS, "link"].sort(), Object.keys(TWOD_SCHEMA.roots).sort());
});
