// A letter in JSX is the letter the postal pane edits and the worker prints: both ways, paragraphs in order, and what
// the vocabulary has no words for refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, POSTAL } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

test("a letter in JSX: <to>, <from> and <paragraph text> children; both ways", () => {
  const file = el(
    "letter",
    { mailClass: "first" },
    el("to", { name: "Ada Lovelace", line1: "12 St James's Square", city: "London", postalCode: "SW1Y 4JH", country: "GB" }),
    el("from", { name: "Northwind", line1: "1 Main St", city: "Portland", region: "OR", postalCode: "97201", country: "US" }),
    el("paragraph", { text: "Dear Ada," }),
    el("paragraph", { text: "It ships on Monday." }),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "letter");
  assert.deepEqual(doc.document, {
    mailClass: "first",
    to: { name: "Ada Lovelace", line1: "12 St James's Square", city: "London", postalCode: "SW1Y 4JH", country: "GB" },
    from: { name: "Northwind", line1: "1 Main St", city: "Portland", region: "OR", postalCode: "97201", country: "US" },
    paragraphs: ["Dear Ada,", "It ships on Monday."],
  });
  assert.deepEqual(POSTAL.letter.fromTree(POSTAL.letter.toTree(doc.document as never)), doc.document, "both ways");
  assert.throws(() => declarationOf({ default: el("letter", {}, el("to", { street: "x" })) }), /<to>: street is not read/);
  assert.throws(() => declarationOf({ default: el("letter", { mailClass: "express" }) }), /mailClass is "first" or "standard"/);
  assert.throws(() => declarationOf({ default: el("letter", {}, el("to", {}), el("to", {})) }), /<letter> has one <to>/);
});

test("a postcard in JSX: <to>, <from>, one <front image>, its <paragraph>s and a size; both ways", () => {
  const file = el(
    "postcard",
    { size: "6x9" },
    el("to", { name: "Ada Lovelace", line1: "500 Elm St", city: "Austin", region: "TX", postalCode: "78702", country: "US" }),
    el("front", { image: "Austin.jpg" }),
    el("paragraph", { text: "Greetings from Austin!" }),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "postcard");
  assert.deepEqual(doc.document, {
    size: "6x9",
    to: { name: "Ada Lovelace", line1: "500 Elm St", city: "Austin", region: "TX", postalCode: "78702", country: "US" },
    front: "Austin.jpg",
    paragraphs: ["Greetings from Austin!"],
  });
  assert.deepEqual(POSTAL.postcard.fromTree(POSTAL.postcard.toTree(doc.document as never)), doc.document, "both ways");
  const plain = declarationOf({ default: el("postcard", {}, el("front", { image: "A.jpg" })) }).document!;
  assert.equal((plain.document as { size?: string }).size, undefined, "a card that names no size is 4x6");
  assert.throws(() => declarationOf({ default: el("postcard", {}, el("front", {})) }), /image/);
  assert.throws(() => declarationOf({ default: el("postcard", { color: true }) }), /color/);
});

test("a postcard's size is one Lob prints, and it is written back into the code", () => {
  const sized = declarationOf({ default: el("postcard", { size: "6x9" }, el("front", { image: "Austin.jpg" })) }).document!;
  assert.equal((sized.document as { size?: string }).size, "6x9");
  assert.deepEqual(POSTAL.postcard.toTree(sized.document as never), { tag: "postcard", attrs: { size: "6x9" }, children: [{ tag: "front", attrs: { image: "Austin.jpg" }, children: [] }] });
  assert.throws(() => declarationOf({ default: el("postcard", { size: "5x7" }) }), /size is "4x6", "6x9", "6x11"/);
});

test("a postcard's size round-trips in all three sizes, and a size no provider prints is refused by name", () => {
  for (const size of ["4x6", "6x9", "6x11"] as const) {
    const file = el("postcard", { size }, el("front", { image: "Austin.jpg" }), el("paragraph", { text: "Hi" }));
    const doc = declarationOf({ default: file }).document!;
    assert.equal((doc.document as { size?: string }).size, size);
    assert.deepEqual(POSTAL.postcard.fromTree(POSTAL.postcard.toTree(doc.document as never)), doc.document, "both ways");
  }
  assert.throws(
    () => declarationOf({ default: el("postcard", { size: "5x7" }) }),
    /size is "4x6", "6x9", "6x11"/,
  );
});
