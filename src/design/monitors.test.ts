// A monitor in JSX declares the MonitorDoc of docs/monitors.md (the CommandAGI repository): one `<monitor>` per file.
// Pinned here: a class is a component (its instance is one element with props); a monitor is its body both ways; what
// the file does not say stays absent, and `monitorWithDefaults` fills it as the platform reads it; what the vocabulary
// has no words for, or a value out of its range, is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, MONITORS, monitorWithDefaults, durationSeconds } from "./index.js";

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag as string, { ...props, ...(children.length ? { children } : {}) });

const Corporation = ({ cik, ticker, name }: { cik: string; ticker: string; name: string }) =>
  el(
    "monitor",
    { title: `${name} (${ticker})`, class: "corporation", about: `cik:${cik}`, __source: 0 },
    el("source", { id: "filings", adapter: "sec-filings", params: { cik }, every: "15m", __source: 1 }),
    el("follows", { monitor: "../../central-banks/fed", match: "fomc.*", __source: 2 }),
    el("wake", { match: "sec.filing.8-k*", prompt: "Say what the report changes." }),
  );

test("a monitor in JSX: a class is a component, an instance is one element, and the run gives the contract's MonitorDoc", () => {
  const { graph, document } = declarationOf({ default: () => el(Corporation, { cik: "0001045810", ticker: "NVDA", name: "NVIDIA" }) });
  assert.deepEqual(graph.nodes, {}, "a monitor leaves beside an empty graph");
  assert.equal(document!.format, "monitor");
  assert.deepEqual(document!.sources, { "": 0, "source#filings": 1, "follows#../../central-banks/fed": 2 });
  const doc = document!.document;
  assert.deepEqual(doc, {
    title: "NVIDIA (NVDA)",
    class: "corporation",
    about: "cik:0001045810",
    sources: [{ id: "filings", adapter: "sec-filings", params: { cik: "0001045810" }, every: "15m" }],
    follows: [{ monitor: "../../central-banks/fed", match: "fomc.*" }],
    derives: [],
    wakes: [{ match: "sec.filing.8-k*", prompt: "Say what the report changes." }],
  });
  assert.deepEqual(MONITORS.monitor.fromTree(MONITORS.monitor.toTree(doc as never)), doc, "both ways");
  assert.deepEqual(monitorWithDefaults(doc as never), {
    title: "NVIDIA (NVDA)",
    class: "corporation",
    about: "cik:0001045810",
    readme: null,
    sources: [{ id: "filings", adapter: "sec-filings", params: { cik: "0001045810" }, every: "15m", via: "worker", exit: null, host: null, mode: "poll", retain: null, since: null }],
    follows: [{ monitor: "../../central-banks/fed", match: "fomc.*" }],
    derives: [],
    wakes: [{ match: "sec.filing.8-k*", prompt: "Say what the report changes." }],
  });
});

test("an empty monitor and the empty file's first form", () => {
  const { document } = declarationOf({ default: el("monitor") });
  assert.deepEqual(document!.document, { sources: [], follows: [], derives: [], wakes: [] });
  assert.deepEqual(MONITORS.monitor.empty!("monitor"), { sources: [], follows: [], derives: [], wakes: [] });
});

test("a monitor refuses by name what it has no words for, and values out of range", () => {
  const one = (...children: unknown[]) => () => declarationOf({ default: el("monitor", {}, ...children) });
  const src = (props: Record<string, unknown>) => el("source", { id: "s", adapter: "fred", every: "1h", ...props });
  assert.throws(one(src({}), src({})), /two <source> in <monitor> have id "s"/);
  assert.throws(one(el("source", { id: "s", adapter: "fred" })), /<source id="s"> needs every/);
  assert.throws(one(src({ every: "6 hours" })), /every is a duration/);
  assert.throws(one(src({ every: "10s" })), /every is from 30s to 7d/);
  assert.throws(one(src({ every: "8d" })), /every is from 30s to 7d/);
  assert.throws(one(src({ via: "phone" })), /via is "worker", "host", "vpn"/);
  assert.throws(one(src({ exit: "DE" })), /exit names an exit country \("DE"\) or an exit \("fsn-1"\), for via="vpn" only/);
  assert.throws(one(src({ host: "studio" })), /host names a host for via="host" only/);
  assert.throws(one(src({ mode: "stream" })), /mode="stream" holds a connection open, which runs on a host/);
  assert.throws(one(src({ via: "host", mode: "push" })), /mode is "poll", "stream"/);
  assert.throws(one(src({ via: "host", retain: "all" })), /retain is for mode="stream" only/);
  assert.throws(one(src({ via: "host", mode: "stream", retain: "sample:soon" })), /retain is "all", "derived" or "sample:<duration>"/);
  const stream = declarationOf({ default: el("monitor", {}, src({ via: "host", host: "studio", mode: "stream", retain: "sample:1m" })) });
  assert.deepEqual(monitorWithDefaults(stream.document!.document as never).sources[0], { id: "s", adapter: "fred", params: {}, every: "1h", via: "host", exit: null, host: "studio", mode: "stream", retain: "sample:1m", since: null });
  assert.throws(one(src({ since: "2024-1-1" })), /since is a day/);
  assert.throws(one(src({ via: "host", mode: "stream", since: "2024-01-01" })), /since is for a polled source/);
  const started = declarationOf({ default: el("monitor", {}, src({ since: "2024-01-01" })) });
  assert.equal(monitorWithDefaults(started.document!.document as never).sources[0]!.since, "2024-01-01");
  assert.throws(one(src({ params: ["CPIAUCSL"] })), /params is an object/);
  assert.throws(one(src({ cron: "0 * * * *" })), /<source id="s">: cron is not read/);
  assert.throws(one(el("follows", { monitor: "." })), /names this monitor/);
  assert.throws(one(el("wake", { match: "x.*" })), /<wake> needs prompt/);
  // The id is the folder's path, and who reads the thread is the file's Drive visibility: neither is a word of the file.
  assert.throws(() => declarationOf({ default: el("monitor", { id: "economy/cpi" }) }), /<monitor>: id is not read/);
  assert.throws(() => declarationOf({ default: el("monitor", { visibility: "public" }) }), /<monitor>: visibility is not read/);
  assert.equal(durationSeconds("6h"), 21600);
  assert.equal(durationSeconds("0m"), null);
});

test("a derive names an operator, each port's input monitor by folder, its params and since; both ways and with defaults", () => {
  const { document } = declarationOf({
    default: el(
      "monitor",
      { title: "NVDA VWAP" },
      el("derive", { id: "vwap", op: "vwap", inputs: { trades: "../trades" }, params: { window: "1m" }, since: "2026-10-01", __source: 3 }),
      el("derive", { id: "mid", op: "midpoint", inputs: { quotes: "../quotes" } }),
    ),
  });
  const doc = document!.document as { derives: unknown[] };
  assert.deepEqual(doc.derives, [
    { id: "vwap", op: "vwap", inputs: { trades: "../trades" }, params: { window: "1m" }, since: "2026-10-01" },
    { id: "mid", op: "midpoint", inputs: { quotes: "../quotes" } },
  ]);
  assert.equal(document!.sources["derive#vwap"], 3);
  assert.deepEqual(MONITORS.monitor.fromTree(MONITORS.monitor.toTree(doc as never)), doc, "both ways");
  assert.deepEqual(monitorWithDefaults(doc as never).derives[1], { id: "mid", op: "midpoint", inputs: { quotes: "../quotes" }, params: {}, since: null });
  const one = (props: Record<string, unknown>) => () => declarationOf({ default: el("monitor", {}, el("derive", { id: "d", op: "last", inputs: { records: "../x" }, ...props })) });
  assert.throws(one({ inputs: {} }), /inputs maps each port to a monitor's folder/);
  assert.throws(one({ inputs: { records: "." } }), /names this monitor/);
  assert.throws(one({ inputs: { "bad port": "../x" } }), /a port is a word/);
  assert.throws(one({ params: [1] }), /params is an object/);
  assert.throws(one({ since: "soon" }), /since is a day/);
  assert.throws(one({ id: "a.b" }), /id is a word/);
  assert.throws(() => declarationOf({ default: el("monitor", {}, el("derive", { id: "d", inputs: { a: "../x" } })) }), /<derive id="d"> needs op/);
});
