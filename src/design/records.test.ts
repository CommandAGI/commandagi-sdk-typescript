// Signed records in JSX declare a contract record and a product instance. Pinned here: a contract's terms
// are one attribute and come back byte-for-byte (nulls and empty strings kept), parties and events are children in
// order, both ways; an event chain out of order and a field with no attribute are refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, RECORDS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const TERMS = {
  subject: { kind: "data_stream", resourceType: "device", resourceId: "dev-1" },
  title: "Bench camera",
  description: "",
  price: { type: "metered", rate: 1, unit: "minute" },
  schedule: null,
  takeRateBps: 1000,
  channels: ["screen"],
};

test("a contract record in JSX is its body: terms verbatim, parties in order, each __source by its path", () => {
  const file = el(
    "contract",
    { id: "c-1", terms: TERMS, createdAt: 1780765664000, __source: 0 },
    el("party", { principal: "u-1", role: "offeror", sig: "ed25519:k:abc", signedAt: 1780765664000, __source: 1 }),
    el("party", { principal: "acct:org:o-2", role: "acceptor", actedBy: "u-3" }),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "contract");
  assert.deepEqual(document!.sources, { "": 0, "party@0": 1 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    id: "c-1",
    terms: TERMS,
    parties: [
      { principal: "u-1", role: "offeror", sig: "ed25519:k:abc", signedAt: 1780765664000 },
      { principal: "acct:org:o-2", role: "acceptor", actedBy: "u-3" },
    ],
    createdAt: 1780765664000,
  });
  assert.equal(JSON.stringify((doc as { terms: unknown }).terms), JSON.stringify(TERMS), "the signed object, null and \"\" kept");
  assert.deepEqual(RECORDS.contract.fromTree(RECORDS.contract.toTree(doc as never)), doc, "both ways");

  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS }) }), /<contract> needs createdAt/);
  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS, createdAt: 1, title: "x" }) }), /title is not read/);
  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS, createdAt: "today" }) }), /createdAt is epoch milliseconds/);
  assert.throws(() => declarationOf({ default: el("contract", { id: "c", terms: TERMS, createdAt: 1 }, el("party", { role: "offeror" })) }), /<party> needs principal/);
});

test("a product instance in JSX is its body: the chain's events oldest first, each by its seq", () => {
  const file = el(
    "instance",
    { serial: "SN-1", productId: "fleet-unit", __source: 0 },
    el("event", { seq: 0, kind: "manufacture", at: 1, prev: null, by: "org-acme", data: { plate: "P-1" }, sig: "ed25519:k:s0", __source: 1 }),
    el("event", { seq: 1, kind: "transfer", at: 2, prev: "h0", by: "org-acme", to: "u-2", contractRef: "c-1", sig: "ed25519:k:s1" }),
  );
  const { document } = declarationOf({ default: file });
  assert.equal(document!.format, "instance");
  assert.deepEqual(document!.sources, { "": 0, "event#0": 1 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    serial: "SN-1",
    productId: "fleet-unit",
    events: [
      { seq: 0, kind: "manufacture", at: 1, prev: null, by: "org-acme", data: { plate: "P-1" }, sig: "ed25519:k:s0" },
      { seq: 1, kind: "transfer", at: 2, prev: "h0", by: "org-acme", to: "u-2", contractRef: "c-1", sig: "ed25519:k:s1" },
    ],
  });
  assert.deepEqual(RECORDS.instance.fromTree(RECORDS.instance.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("instance", { serial: "S", productId: "p" }, el("event", { seq: 1, kind: "service", at: 1, by: "x" })) }), /events are written oldest first/);
  assert.throws(() => declarationOf({ default: el("instance", { serial: "S", productId: "p" }, el("event", { seq: 0, kind: "service", at: 1, by: "x", note: "n" })) }), /note is not read/);
  assert.equal(declarationOf({ default: el("instance", { serial: "S", productId: "p", release: "../releases/A/A.release.tsx" }) }).document!.document.release, "../releases/A/A.release.tsx", "an instance names the release it was built from");
});

test("a hardware release in JSX: its files, check verdicts and outputs in order, digests checked", () => {
  const D = (c: string) => c.repeat(64);
  const file = el(
    "release",
    { id: "plate-A", rev: "A", of: "../..", frozen: "files", product: "Sensor plate", createdAt: 1792000000000, by: "person:local", note: "README.md", __source: 0 },
    el("file", { path: "cad/Plate.3d.tsx", digest: D("a"), __source: 1 }),
    el("check", { file: "cad/Plate.3d.tsx", id: "interference", kind: "interference", status: "passed" }),
    el("check", { file: "ee/Divider.sch.tsx", id: "erc", kind: "erc", status: "accepted", accepted: 1 }),
    el("output", { path: "outputs/Plate.step", digest: D("b"), from: "cad/Plate.3d.tsx", kind: "step" }),
  );
  const { document } = declarationOf({ default: file });
  assert.equal(document!.format, "release");
  assert.deepEqual(document!.sources, { "": 0, "file#cad/Plate.3d.tsx": 1 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    id: "plate-A", rev: "A", of: "../..", frozen: "files", product: "Sensor plate", createdAt: 1792000000000, by: "person:local", note: "README.md",
    files: [{ path: "cad/Plate.3d.tsx", digest: D("a") }],
    checks: [
      { file: "cad/Plate.3d.tsx", id: "interference", kind: "interference", status: "passed" },
      { file: "ee/Divider.sch.tsx", id: "erc", kind: "erc", status: "accepted", accepted: 1 },
    ],
    outputs: [{ path: "outputs/Plate.step", digest: D("b"), from: "cad/Plate.3d.tsx", kind: "step" }],
  });
  assert.deepEqual(RECORDS.release.fromTree(RECORDS.release.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("release", { id: "r", rev: "A", of: ".", frozen: "files" }, el("file", { path: "a.3d.tsx", digest: "abc" })) }), /digest is its content's SHA-256/);
  assert.throws(() => declarationOf({ default: el("release", { id: "r", rev: "A", of: ".", frozen: "files" }, el("check", { file: "a", id: "i", kind: "k", status: "ok" })) }), /status is passed, failed, skipped, accepted/);
  assert.throws(() => declarationOf({ default: el("release", { id: "r", rev: "A", frozen: "files" }) }), /<release> needs of/);
  // A release's designs read a file outside its folder: the frozen copy stands one level down, and never above the record.
  assert.equal(declarationOf({ default: el("release", { id: "r", rev: "A", of: "../..", frozen: "files/product" }) }).document!.document.frozen, "files/product");
  assert.throws(() => declarationOf({ default: el("release", { id: "r", rev: "A", of: ".", frozen: "../files" }) }), /frozen is a folder beside the record/);
});
