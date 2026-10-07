// A PDF in JSX is the document the PDF app edits and a headless run builds: both ways, and what the vocabulary has no
// words for refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, PDF } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

test("a PDF in JSX: pages by ref and blank, marks with replies, fills, nested bookmarks, labels, attachments; both ways", () => {
  const file = el(
    "pdf",
    { title: "Signed", author: "Ada" },
    el("page", { src: "Contract.pdf", n: 1 }),
    el(
      "page",
      { src: "Contract.pdf", n: 3, rotate: 90 },
      el("highlight", { rects: [[72, 700, 300, 712]], author: "Ada", text: "Check" }),
      el("note", { at: [500, 700], text: "Why?" }, el("reply", { text: "Because.", author: "Bob" }), el("reply", { text: "Resolved", author: "Ada", state: "Completed" })),
      el("redact", { rect: [72, 500, 300, 520] }),
      el("field", { kind: "text", name: "Name", rect: [72, 100, 300, 120], required: true, readOnly: true, tooltip: "Your name", default: "Ada" }),
    ),
    el("page", { size: "a4" }),
    el("fill", { name: "Name", value: "Ada Lovelace" }),
    el("bookmark", { title: "Terms", page: 2 }, el("bookmark", { title: "Payment", page: 2, top: 500 })),
    el("label", { from: 1, style: "r" }),
    el("attach", { src: "data.csv" }),
    el("header", { right: "{file}", size: 8 }),
    el("footer", { center: "Page {page} of {pages}", pages: "2-" }),
    el("bates", { prefix: "ACME-", digits: 6, position: "bottom-right" }),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "pdf");
  assert.deepEqual(doc.document, {
    title: "Signed",
    author: "Ada",
    pages: [
      { src: "Contract.pdf", n: 1 },
      {
        src: "Contract.pdf",
        n: 3,
        rotate: 90,
        marks: [
          { type: "highlight", rects: [[72, 700, 300, 712]], author: "Ada", text: "Check" },
          { type: "note", at: [500, 700], text: "Why?", replies: [{ text: "Because.", author: "Bob" }, { text: "Resolved", author: "Ada", state: "Completed" }] },
          { type: "redact", rect: [72, 500, 300, 520] },
          { type: "field", kind: "text", name: "Name", rect: [72, 100, 300, 120], required: true, readOnly: true, tooltip: "Your name", default: "Ada" },
        ],
      },
      { size: "a4" },
    ],
    fill: [{ name: "Name", value: "Ada Lovelace" }],
    bookmarks: [{ title: "Terms", page: 2, children: [{ title: "Payment", page: 2, top: 500 }] }],
    labels: [{ from: 1, style: "r" }],
    attachments: [{ src: "data.csv" }],
    header: { right: "{file}", size: 8 },
    footer: { center: "Page {page} of {pages}", pages: "2-" },
    bates: { prefix: "ACME-", digits: 6, position: "bottom-right" },
  });
  assert.deepEqual(PDF.pdf.fromTree(PDF.pdf.toTree(doc.document as never)), doc.document, "both ways");
});

test("a PDF in JSX refuses what it cannot say", () => {
  const bad = (...children: unknown[]) => () => declarationOf({ default: el("pdf", {}, ...children) });
  assert.throws(bad(el("page", { src: "a.pdf" })), /n is the page's number/);
  assert.throws(bad(el("page", {})), /blank page/);
  assert.throws(bad(el("page", { size: "b9" })), /size is a3, a4/);
  assert.throws(bad(el("page", { size: "a4" }, el("highlight", { rects: [[1, 2, 3]] }))), /rects is a list/);
  assert.throws(bad(el("page", { size: "a4" }, el("stamp", { rect: [0, 0, 10, 10] }))), /<stamp> has a name/);
  assert.throws(bad(el("page", { size: "a4" }, el("signature", { rect: [0, 0, 10, 10], typed: "A", image: "s.png" }))), /one of typed, image or strokes/);
  assert.throws(bad(el("page", { size: "a4" }, el("bogus", {}))), /<bogus> is not a tag of a PDF/);
  assert.throws(bad(el("bookmark", { title: "x", page: 0 })), /page is a page number/);
  assert.throws(bad(el("footer", { size: 9 })), /<footer> has text in left, center or right/);
  assert.throws(bad(el("bates", { position: "middle" })), /<bates> position is top-left/);
  assert.throws(bad(el("header", { left: "a" }), el("header", { left: "b" })), /a PDF has one <header>/);
  assert.throws(bad(el("page", { size: "a4" }, el("note", { at: [1, 1] }, el("reply", { text: "x", state: "Done" })))), /<reply> state is "Accepted"/);
  assert.throws(bad(el("page", { size: "a4" }, el("field", { kind: "text", name: "A", rect: [0, 0, 9, 9], readOnly: "yes" }))), /readOnly is true or false/);
});
