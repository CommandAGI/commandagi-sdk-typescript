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
    el("Domain", { name: "northwind.example", registrar: "Porkbun LLC", expires: "2027-05-18", autoRenew: true, site: "../sites/northwind/", transferLock: { about: "2026-12-30" } }),
    el("Site", { folder: "../sites/northwind/" }),
    el("Site", { host: "cloudflare-pages", project: "northwind-www", url: "https://www.northwind.example" }),
    el("Mailbox", { address: "support@northwind.example", kind: "support" }),
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
    domains: [{ name: "northwind.example", registrar: "Porkbun LLC", expires: "2027-05-18", autoRenew: true, site: "../sites/northwind/", transferLock: { about: "2026-12-30" } }],
    sites: [{ folder: "../sites/northwind/" }, { url: "https://www.northwind.example", host: "cloudflare-pages", project: "northwind-www" }],
    mailboxes: [{ address: "support@northwind.example", kind: "support" }],
    handles: [{ platform: "x", handle: "northwindsurvey", connection: "x" }],
    marks: [{ title: "NORTHWIND", jurisdiction: "US", number: "99123456" }],
  });
  assert.deepEqual(BRANDS.brand.fromTree(BRANDS.brand.toTree(doc.document as never)), doc.document, "both ways");
});

test("a brand refuses what it has no words for, by name", () => {
  const brand = (...children: unknown[]) => () => declarationOf({ default: el("BrandSurface", { name: "N" }, ...children) });
  assert.throws(() => declarationOf({ default: el("BrandSurface", {}) }), /<BrandSurface> needs name/);
  assert.throws(brand(el("Domain", { name: "n.example", dns: "1.2.3.4" })), /dns is not read/);
  assert.throws(brand(el("Domain", { name: "n.example", autoRenew: "yes" })), /<Domain> autoRenew is true or false/);
  assert.throws(brand(el("Domain", { name: "n.example", mail: true })), /mail is not read/);
  assert.throws(brand(el("Site", {})), /<Site> names its folder, or the url or project/);
  assert.throws(brand(el("Domain", { name: "n.example", registrar: { unknown: "" } })), /an unknown fact is \{ unknown: "<why>" \}/);
  assert.throws(brand(el("Domain", { name: "n.example", expires: { about: 2027 } })), /<Domain> expires is text/);
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

test("a brand states an unknown fact and an approximate one as they are written", () => {
  const doc = declarationOf({
    default: el("BrandSurface", { name: "exocortex", voice: { unknown: "no brand book yet" } }, el("Domain", { name: "my-exocortex.com", registrar: { unknown: "not read: an RDAP read settles it" }, transferLock: { about: "2026-12-30" } }), el("Alias", { name: "EXOCORTEX", kind: "statement-descriptor" })),
  }).document!.document as Record<string, unknown>;
  assert.deepEqual(doc.voice, { unknown: "no brand book yet" });
  assert.deepEqual(doc.domains, [{ name: "my-exocortex.com", registrar: { unknown: "not read: an RDAP read settles it" }, transferLock: { about: "2026-12-30" } }]);
});
