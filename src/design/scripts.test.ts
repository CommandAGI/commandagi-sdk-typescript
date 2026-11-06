// A script in JSX declares the ScriptDoc of docs/scripts.md (the CommandAGI repository): one `<script>` per file.
// Pinned here: a class is a component (its instance is one element with props); a script is its body both ways; what
// the file does not say stays absent, and `scriptWithDefaults` fills it as the platform reads it; a tail names a file,
// never a folder; what the vocabulary has no words for, or a value out of its range, is refused by name.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { declarationOf, jsx, SCRIPTS, scriptWithDefaults, SCRIPT_FILE, tailRefProblem } from "./index.js";

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag as string, { ...props, ...(children.length ? { children } : {}) });

const Corporation = ({ cik, ticker, name }: { cik: string; ticker: string; name: string }) =>
  el(
    "script",
    { title: `${name} (${ticker})`, class: "corporation", about: `cik:${cik}`, sameAs: [`ticker:${ticker}`], __source: 0 },
    el("source", { id: "filings", adapter: "sec-filings", params: { cik }, every: "30m", __source: 1 }),
    el("tail", { of: "../../central-banks/fed/fed.script.tsx", when: { class: "fomc.*" }, __source: 2 }),
    el("wake", { when: { class: "sec.filing.8-k*" }, prompt: "Say what the report changes." }),
  );

test("a script in JSX: a class is a component, an instance is one element, and the run gives the contract's ScriptDoc", () => {
  const { graph, document } = declarationOf({ default: () => el(Corporation, { cik: "0001045810", ticker: "NVDA", name: "NVIDIA" }) });
  assert.deepEqual(graph.nodes, {}, "a script leaves beside an empty graph");
  assert.equal(document!.format, "script");
  assert.deepEqual(document!.sources, { "": 0, "source#filings": 1, "tail#../../central-banks/fed/fed.script.tsx": 2 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    title: "NVIDIA (NVDA)",
    class: "corporation",
    about: "cik:0001045810",
    sameAs: ["ticker:NVDA"],
    sources: [{ id: "filings", adapter: "sec-filings", params: { cik: "0001045810" }, every: "30m" }],
    tails: [{ of: "../../central-banks/fed/fed.script.tsx", when: { class: "fomc.*" } }],
    derives: [],
    wakes: [{ when: { class: "sec.filing.8-k*" }, prompt: "Say what the report changes." }],
    discovers: [],
    judges: [],
  });
  assert.deepEqual(SCRIPTS.script.fromTree(SCRIPTS.script.toTree(doc as never)), doc, "both ways");
  const full = scriptWithDefaults(doc as never);
  assert.deepEqual(full.sources[0], { id: "filings", adapter: "sec-filings", params: { cik: "0001045810" }, every: "30m", via: "worker", exit: null, host: null, mode: "poll", retain: null, since: null, session: null, snapshot: null, profile: null, keep: null, maxCostPerDay: null, unit: null, vantage: null, connection: null, stream: "records" });
  assert.deepEqual(full.tails, [{ of: "../../central-banks/fed/fed.script.tsx", when: { class: "fomc.*" }, stream: "records" }]);
  assert.deepEqual(full.wakes, [{ when: { class: "sec.filing.8-k*" }, every: null, prompt: "Say what the report changes.", agent: null, maxSpend: null }]);
});

test("an empty script, its file name, and a part that names another stream", () => {
  const { document } = declarationOf({ default: el("script") });
  assert.deepEqual(document!.document, { sources: [], tails: [], derives: [], wakes: [], discovers: [], judges: [] });
  assert.deepEqual(SCRIPTS.script.empty!("script"), { sources: [], tails: [], derives: [], wakes: [], discovers: [], judges: [] });
  for (const name of ["nvidia.script.tsx", "a.script.jsx", "b.script.py", "c.script.rs"]) assert.ok(SCRIPT_FILE.test(name), name);
  for (const name of ["monitor.tsx", "script.tsx", "nvidia.tsx"]) assert.ok(!SCRIPT_FILE.test(name), name);
  const ticks = declarationOf({ default: el("script", {}, el("source", { id: "q", adapter: "fred", every: "1h", stream: "ticks" })) });
  assert.equal(scriptWithDefaults(ticks.document!.document as never).sources[0]!.stream, "ticks");
  assert.throws(() => declarationOf({ default: el("script", {}, el("source", { id: "q", adapter: "fred", every: "1h", stream: "Ticks!" })) }), /stream is a word/);
});

test("a tail names a file: a script, a run's records file or a series, never a folder", () => {
  const one = (of: string) => () => declarationOf({ default: el("script", {}, el("tail", { of })) });
  for (const of of ["../nvidia/nvidia.script.tsx", "cloud://home/user-commandagi/entities/fed/fed.script.tsx", "../x/runs/thread-1/streams/records@cloud/records.jsonl", "fred:DGS10", "ecb:FM.D.U2.EUR.4F.KR.DFR.LEV"])
    assert.doesNotThrow(one(of), of);
  assert.throws(one("../nvidia"), /<tail of="..\/nvidia"> names a file: a script \("..\/nvidia\/nvidia.script.tsx"\)/);
  assert.throws(one("./"), /names this script's folder/);
  assert.throws(one("../nvidia/monitor.tsx"), /names a file/);
  assert.equal(tailRefProblem("fred:DGS10"), null);
  assert.throws(() => declarationOf({ default: el("script", {}, el("tail", { of: "../x/x.script.tsx", match: "a.*" })) }), /match is not read \(of, when, stream\)/);
  assert.throws(() => declarationOf({ default: el("script", {}, el("follows", { monitor: "../x" })) }), /follows/);
  assert.throws(() => declarationOf({ default: el("script", {}, el("tail", { of: "../x/x.script.tsx", when: { "data.n": { above: 1 } } })) }), /when: data\.n: above is not an operator/);
});

test("a source refuses by name what it has no words for, and values out of range", () => {
  const one = (...children: unknown[]) => () => declarationOf({ default: el("script", {}, ...children) });
  const src = (props: Record<string, unknown>) => el("source", { id: "s", adapter: "fred", every: "1h", ...props });
  assert.throws(one(src({}), src({})), /two <source> in <script> have id "s"/);
  assert.throws(() => declarationOf({ default: el("script", { sameAs: ["NVDA"] }) }), /sameAs is a list of subjects/);
  assert.throws(one(el("source", { id: "s", adapter: "fred" })), /<source id="s"> needs every/);
  assert.throws(one(src({ every: "10s" })), /every is from 30s to 7d/);
  assert.throws(one(src({ via: "ftp" })), /via is "worker", "host", "vpn", "browser", "vm", "android-vm", "phone"/);
  assert.throws(one(src({ mode: "stream" })), /mode="stream" holds a connection open, which runs on a host/);
  assert.throws(one(src({ via: "vm", snapshot: "genesis" })), /via="vm" costs money: it says maxCostPerDay/);
  assert.throws(one(src({ via: "phone" })), /via="phone" names its phone: unit=/);
  assert.throws(one(src({ via: "host", connection: "gmail@jacobfv123@gmail.com" })), /connection names a connected account, which the api worker reads/);
  // The id is the file's path, and who reads the run is the file's Drive visibility: neither is a word of the file.
  assert.throws(() => declarationOf({ default: el("script", { id: "economy/cpi" }) }), /<script>: id is not read/);
  assert.throws(() => declarationOf({ default: el("script", { visibility: "public" }) }), /<script>: visibility is not read/);
});

test("a derive names an operator and each port's file; a discover names the files it reads and writes scripts", () => {
  const { document } = declarationOf({
    default: el(
      "script",
      { title: "SOFR minus IORB" },
      el("derive", { id: "spread", op: "spread", inputs: { a: "fred:SOFR", b: "fred:IORB" } }),
      el("derive", { id: "own", op: "last", inputs: { records: "./" }, since: "2026-10-01", stream: "derived" }),
      el("discover", { of: "./kev/kev.script.tsx", into: "./exploits", when: { class: "security.kev" }, slug: "data.cve", class: "./exploit.tsx#Exploit", props: { cve: "data.cve" }, max: 20, visibility: "public" }),
    ),
  });
  const doc = document!.document as never;
  assert.deepEqual(SCRIPTS.script.fromTree(SCRIPTS.script.toTree(doc)), doc, "both ways");
  const full = scriptWithDefaults(doc);
  assert.deepEqual(full.derives, [
    { id: "spread", op: "spread", inputs: { a: "fred:SOFR", b: "fred:IORB" }, params: {}, since: null, stream: "records" },
    { id: "own", op: "last", inputs: { records: "./" }, params: {}, since: "2026-10-01", stream: "derived" },
  ]);
  assert.deepEqual(full.discovers[0], { into: "./exploits", of: ["./kev/kev.script.tsx"], when: { class: "security.kev" }, slug: "data.cve", class: "./exploit.tsx#Exploit", props: { cve: "data.cve" }, name: null, max: 20, visibility: "public" });
  const derive = (inputs: unknown) => () => declarationOf({ default: el("script", {}, el("derive", { id: "d", op: "last", inputs })) });
  assert.throws(derive({}), /inputs maps each port to a file it tails/);
  assert.throws(derive({ a: "../quotes" }), /inputs.a names a file/);
  const discover = (props: Record<string, unknown>) => () => declarationOf({ default: el("script", {}, el("discover", { slug: "cve", class: "../c.tsx#Exploit", ...props })) });
  assert.doesNotThrow(discover({}));
  assert.throws(discover({ of: "./kev" }), /of names a file/);
  assert.throws(discover({ of: [] }), /of is a script file or a list of them/);
  assert.throws(discover({ max: 500 }), /max is a whole number from 1 to 50/);
});

test("a judge names what it judges, its rubric and its model", () => {
  const { document } = declarationOf({ default: el("script", {}, el("judge", { id: "claims", of: "task", rubric: "./rubric.md", model: "fireworks/glm-5p3" })) });
  assert.deepEqual(scriptWithDefaults(document!.document as never).judges, [{ id: "claims", of: "task", rubric: "./rubric.md", model: "fireworks/glm-5p3" }]);
  assert.throws(() => declarationOf({ default: el("script", {}, el("judge", { id: "j", of: "thread", rubric: "r.md", model: "m" })) }), /of is "turn", "task"/);
});

// script-wake.golden.json is the golden of the three SDKs (sdk/python/tests/script_wake.json, sdk/rust/tests/script_wake.json).
test("a wake: on the script's own records (when) or on a clock (every), as the Python and Rust SDKs read it", () => {
  const golden = JSON.parse(readFileSync(new URL("./script-wake.golden.json", import.meta.url), "utf8")) as {
    valid: { attrs: Record<string, unknown>; document: unknown }[];
    invalid: { attrs: Record<string, unknown>; error: string }[];
  };
  for (const row of golden.valid) {
    const d = declarationOf({ default: el("script", {}, el("wake", row.attrs)) });
    assert.deepEqual(scriptWithDefaults(d.document!.document as never).wakes, [row.document]);
  }
  for (const row of golden.invalid)
    assert.throws(() => declarationOf({ default: el("script", {}, el("wake", row.attrs)) }), new RegExp(row.error), JSON.stringify(row.attrs));
});
