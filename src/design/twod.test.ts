// commandagi/design twod — a drawing, a paint document, a photo and a nest in JSX declare the 2D editors' own nodes:
// an element is one node whose inputs are its attributes; children are the nodes it takes, in order; `__source`
// becomes meta.source. Pinned here: the node shapes each editor reads (composite + layer groups; the paint stack with
// stroke chains carrying the layer's fields; photo adjustments by tag; the nest's one-of nodes and parts), the few
// encodings (d, point tuples, src → the image file), and the refusals by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, subpathsOf, type IRGraph } from "./index.js";

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

test("refused by name: pixels in code, a tag the vocabulary lacks, a stroke outside a layer, relative d", () => {
  const paint = (child: unknown) => () => run(h("painting", {}, child));
  assert.throws(paint(h("layer", { src: "data:image/png;base64,AAAA" })), /src names an image file by relative path/);
  assert.throws(paint(h("stroke", { points: [] })), /is painted on a layer: write it inside one/);
  assert.throws(() => run(h("drawing", {}, h("layer", {}, h("sketch", {})))), /<sketch> is not declared in code yet/);
  assert.throws(() => run(h("drawing", {}, h("rect", {}))), /<rect> is inside a <layer>/);
  assert.throws(() => subpathsOf("m 0 0 l 1 1", "<path>"), /absolute commands/);
  assert.throws(() => run(h("nest", {}, h("part", { id: "a" }))), /a nest needs its <sheet>/);
});
