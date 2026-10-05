// Office documents in JSX declare the editors' own documents: a workbook's cells, a page's blocks, a deck's graph.
import assert from "node:assert/strict";
import { test } from "node:test";
import { declarationOf, jsx } from "./index.js";

const el = (type: string, props: Record<string, unknown> = {}, ...children: unknown[]) =>
  jsx(type, children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props);

test("a <workbook> declares the workbook JSON: cells by A1 reference, formats, sizes", () => {
  const { graph, document } = declarationOf({
    default: () =>
      el("workbook", { title: "Budget" }, el("sheet", { name: "Q1", frozenRows: 1 }, el("column", { at: "B", width: 120 }), el("cell", { at: "a1", value: "Item", bold: true }), el("cell", { at: "B2", formula: "=1+1" }))),
  });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document?.format, "workbook");
  assert.deepEqual(document?.document, {
    format: "workbook",
    version: 1,
    sheets: [{ id: "sheet-1", name: "Q1", kind: "grid", rows: 200, cols: 26, cells: { A1: { v: "Item", fmt: { bold: true } }, B2: { f: "=1+1" } }, colWidths: { 1: 120 }, frozen: { rows: 1, cols: 0 } }],
    meta: { title: "Budget" },
  });
  assert.throws(() => declarationOf({ default: () => el("workbook", {}, el("sheet", {}, el("cell", { at: "A1", formula: "SUM(B1)" }))) }), /a formula starts with =/);
  assert.throws(() => declarationOf({ default: () => el("workbook", {}, el("sheet", {}, el("cell", { at: "A1", font: "x" }))) }), /font is not read on a <cell>/);
});

test("a <page> declares blocks; a block's text is its children, with marks as inline HTML", () => {
  const { document } = declarationOf({
    default: () => el("page", { title: "Notes" }, el("h1", {}, "Notes"), el("p", {}, "One < two & ", el("b", {}, "bold"), " ", el("a", { href: "https://x.test" }, "link")), el("todo", { checked: true }, "done"), el("pre", { lang: "ts" }, "a { }"), el("divider")),
  });
  assert.deepEqual((document?.document as { blocks: unknown[] }).blocks, [
    { id: "block-1", type: "h1", html: "Notes" },
    { id: "block-2", type: "p", html: 'One &lt; two &amp; <b>bold</b> <a href="https://x.test">link</a>' },
    { id: "block-3", type: "todo", html: "done", checked: true },
    { id: "block-4", type: "code", html: "a { }", lang: "ts" },
    { id: "block-5", type: "divider", html: "" },
  ]);
  assert.throws(() => declarationOf({ default: () => el("page", {}, el("table")) }), /<table> is not a block of a <page>/);
});

test("a <deck> declares the deck's own graph: doc, slides by layout name, elements with boxes and rich text", () => {
  const { graph } = declarationOf({
    default: () =>
      el("deck", { name: "Pitch" }, el("slide", { layout: "Title" }, el("text", { placeholder: "title" }, "Hello ", el("b", {}, "world"))), el("slide", { layout: "Blank" }, el("shape", { shape: "ellipse", x: 1, y: 2, w: 3, h: 4 }))),
  });
  assert.deepEqual(Object.keys(graph.nodes), ["slide-1.1", "slide-1", "slide-2.1", "slide-2", "doc"]);
  assert.deepEqual(graph.nodes.doc!.inputs, { name: "Pitch", width: 1280, height: 720, "slides.1": { wire: { node: "slide-1", port: "out" } }, "slides.2": { wire: { node: "slide-2", port: "out" } } });
  assert.deepEqual(graph.nodes["slide-1"]!.inputs, { layout: "Title", "elements.1": { wire: { node: "slide-1.1", port: "out" } } });
  assert.deepEqual(graph.nodes["slide-1.1"]!.inputs, { placeholder: "title", text: { paragraphs: [{ runs: [{ text: "Hello " }, { text: "world", bold: true }] }] } });
  assert.deepEqual(graph.nodes["slide-2.1"]!.inputs, { box: { x: 1, y: 2, w: 3, h: 4 }, shape: "ellipse" });
  assert.throws(() => declarationOf({ default: () => el("deck", {}, el("slide", {}, el("shape", { x: 1 }))) }), /needs x, y, w and h/);
});
