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

test("a <sheet> with a source is a data sheet: a file beside the workbook, an http(s) URL or surface:<id>", () => {
  const sheet = (props: Record<string, unknown>, ...kids: unknown[]) => declarationOf({ default: () => el("workbook", {}, el("sheet", props, ...kids)) });
  const s = (props: Record<string, unknown>) => (sheet(props).document?.document as { sheets: Record<string, unknown>[] }).sheets[0]!;
  assert.deepEqual(s({ name: "Sales", source: "sales.parquet", format: "parquet", query: "select * from sales" }), {
    id: "sheet-1",
    name: "Sales",
    kind: "data",
    source: { kind: "file", ref: "sales.parquet", format: "parquet" },
    query: "select * from sales",
  });
  assert.deepEqual(s({ name: "Prices", source: "https://example.test/prices.csv" }).source, { kind: "remote", engine: "http", url: "https://example.test/prices.csv" });
  assert.deepEqual(s({ name: "Devices", source: "surface:devices" }).source, { kind: "surface", surface: "devices" });
  // A data sheet reads a table: it holds no children, and a grid sheet reads no source.
  assert.throws(() => sheet({ name: "Sales", source: "sales.parquet" }, el("cell", { at: "A1", value: 1 })), /a data sheet holds nothing/);
  assert.throws(() => sheet({ name: "Sales", source: "sales.parquet", rows: 10 }), /a data sheet reads a table, so it has no rows/);
  assert.throws(() => sheet({ name: "Sales", query: "select 1" }), /a grid sheet reads no source/);
  assert.throws(() => sheet({ name: "Sales", source: "self" }), /source is a file beside the workbook, an http\(s\) URL or surface:<id>/);
  assert.throws(() => sheet({ name: "Sales", source: "ftp://example.test/x.csv" }), /source is a file beside the workbook/);
  assert.throws(() => sheet({ name: "Sales", source: "surface:planets" }), /source is surface:<id>/);
  assert.throws(() => sheet({ name: "Sales", source: "sales.parquet", format: "csvz" }), /format is one of/);
});

test("a sheet's <chart>, <pivot> and <filter> are checked against the workbook schema and read into the sheet", () => {
  const sheet = (...kids: unknown[]) => declarationOf({ default: () => el("workbook", {}, el("sheet", { name: "Sales" }, el("cell", { at: "A1", value: "Region" }), ...kids)) });
  const { document } = sheet(
    el("chart", { name: "Sales", range: "A1:C5", kind: "bar", category: "Region", series: ["Q1", "Q2"], at: "E2" }),
    el("pivot", { name: "By region", range: "A1:C5", rows: "Region", value: "Q1", aggregate: "sum" }),
    el("filter", { range: "A1:C5" }, el("criterion", { column: "b", test: "greater", value: 100 }), el("criterion", { column: "A", test: "notBlank" })),
  );
  const s = (document?.document as { sheets: Record<string, unknown>[] }).sheets[0]!;
  assert.deepEqual(s.charts, [{ id: "chart-1", name: "Sales", range: "A1:C5", kind: "bar", category: "Region", series: ["Q1", "Q2"], at: "E2" }]);
  assert.deepEqual(s.pivots, [{ id: "pivot-1", name: "By region", range: "A1:C5", rows: "Region", value: "Q1", aggregate: "sum" }]);
  assert.deepEqual(s.filter, { range: "A1:C5", criteria: [{ column: "B", test: "greater", value: 100 }, { column: "A", test: "notBlank" }] });
  assert.deepEqual(Object.keys(document!.sources).filter((k) => !/^(workbook|sheet|cell)/.test(k)), ["chart:sheet-1!chart-1", "pivot:sheet-1!pivot-1", "filter:sheet-1", "criterion:sheet-1!B", "criterion:sheet-1!A"]);

  // The refusals are the schema's sentences, the ones an op panel shows under a field.
  assert.throws(() => sheet(el("chart", { name: "C", range: "A1:C5", kind: "donut", series: ["Q1"] })), /<chart name="C">: kind: must be one of bar, line, area, scatter, pie \(got "donut"\)/);
  assert.throws(() => sheet(el("chart", { name: "C", range: "A1:C5", kind: "bar", series: [] })), /series: needs at least 1 items/);
  assert.throws(() => sheet(el("pivot", { name: "P", range: "nowhere", rows: "Region", value: "Q1", aggregate: "sum" })), /range is an A1 range \("A1:C20"\), not "nowhere"/);
  assert.throws(() => sheet(el("pivot", { name: "P", range: "A1:C5", rows: "Region", aggregate: "sum" })), /value: is required/);
  assert.throws(() => sheet(el("chart", { name: "C", range: "A1:B2", kind: "bar", series: ["Q1"] }), el("chart", { name: "c", range: "A1:B2", kind: "bar", series: ["Q1"] })), /two charts are called c/);
  assert.throws(() => sheet(el("filter", { range: "A1:C5" }), el("filter", { range: "A1:C5" })), /Sales has two filters/);
  assert.throws(() => sheet(el("filter", { range: "A1:C5" }, el("criterion", { column: "B", test: "blank" }), el("criterion", { column: "B", test: "notBlank" }))), /two criteria for column B/);
  assert.throws(() => sheet(el("filter", { range: "A1:C5" }, el("criterion", { column: "B", test: "sometimes" }))), /test: must be one of/);
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
