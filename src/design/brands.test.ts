// A brand in JSX is the brand the company app's brands pane edits: both ways, each list in the file's order, and what
// the vocabulary has no words for refused by name. A company names each brand file with <Brand file>.
import assert from "node:assert/strict";
import { test } from "node:test";

import { BRANDS, declarationOf, jsx } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

test("a brand in JSX: its names, voice, logos, domains, sites, handles and marks; both ways", () => {
  const file = el(
    "BrandSurface",
    { name: "Northwind", tagline: "Drone surveys.", voice: ["plain", "warm"], designSystem: "../design/brand-book.json" },
    el("Alias", { name: "Northwind Survey", kind: "legal" }),
    el("Logo", { file: "../design/logo.svg", kind: "mark", background: "light" }),
    el("Domain", { name: "northwind.example", registrar: "Porkbun LLC", expires: "2027-05-18", autoRenew: true, site: "../sites/northwind/", mail: true }),
    el("Site", { folder: "../sites/northwind/" }),
    el("Handle", { platform: "x", handle: "northwindsurvey", connection: "x" }),
    el("Mark", { title: "NORTHWIND", jurisdiction: "US", number: "99123456" }),
  );
  const doc = declarationOf({ default: file }).document!;
  assert.equal(doc.format, "brand");
  assert.deepEqual(doc.document, {
    name: "Northwind",
    tagline: "Drone surveys.",
    voice: ["plain", "warm"],
    designSystem: "../design/brand-book.json",
    aliases: [{ name: "Northwind Survey", kind: "legal" }],
    logos: [{ file: "../design/logo.svg", kind: "mark", background: "light" }],
    domains: [{ name: "northwind.example", registrar: "Porkbun LLC", expires: "2027-05-18", autoRenew: true, site: "../sites/northwind/", mail: true }],
    sites: [{ folder: "../sites/northwind/" }],
    handles: [{ platform: "x", handle: "northwindsurvey", connection: "x" }],
    marks: [{ title: "NORTHWIND", jurisdiction: "US", number: "99123456" }],
  });
  assert.deepEqual(BRANDS.brand.fromTree(BRANDS.brand.toTree(doc.document as never)), doc.document, "both ways");
});

test("a brand refuses what it has no words for, by name", () => {
  const brand = (...children: unknown[]) => () => declarationOf({ default: el("BrandSurface", { name: "N" }, ...children) });
  assert.throws(() => declarationOf({ default: el("BrandSurface", {}) }), /<BrandSurface> needs name/);
  assert.throws(brand(el("Domain", { name: "n.example", dns: "1.2.3.4" })), /dns is not read/);
  assert.throws(brand(el("Domain", { name: "n.example", mail: "yes" })), /<Domain> mail is true or false/);
  assert.throws(() => declarationOf({ default: el("BrandSurface", { name: "N", voice: "warm" }) }), /voice is a list of words/);
  assert.throws(brand(el("Mark", { jurisdiction: "US" })), /needs title/);
  assert.throws(brand(el("Domain", { name: "n.example" }), el("Domain", { name: "n.example" })), /two <Domain> in <BrandSurface> have name "n.example"/);
  assert.throws(brand(el("Registration", { kind: "tax-id" })), /not a tag of a brand/);
});

test("a company names each brand file; without <Brand> it names none", () => {
  const company = (...children: unknown[]) => declarationOf({ default: el("Company", { name: "Northwind", files: ["Northwind/"] }, ...children) }).document!.document as Record<string, unknown>;
  assert.deepEqual(company(el("Brand", { file: "Northwind/brands/Northwind.brand.tsx" }), el("Brand", { file: "Northwind/brands/Skyline.brand.tsx" })).brands, [
    { file: "Northwind/brands/Northwind.brand.tsx" },
    { file: "Northwind/brands/Skyline.brand.tsx" },
  ]);
  assert.ok(!("brands" in company()));
  assert.deepEqual((company(el("Brand", { file: "N.brand.tsx" })).standard as Record<string, unknown>).enabled, false, "a brand is not a part of the standard");
});
