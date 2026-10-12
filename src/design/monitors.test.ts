// Monitor blueprints in JSX declare the MonitorsDoc of docs/monitors.md (the CommandAGI repository). Pinned here: a
// class is a component and its instances are data (a `.map`); a monitor is its body both ways; what the file does not
// say stays absent, and `monitorsWithDefaults` fills it as the platform reads it; what the vocabulary has no words
// for, or a value out of its range, is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, MONITORS, monitorsWithDefaults, durationSeconds } from "./index.js";

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag as string, { ...props, ...(children.length ? { children } : {}) });

const Series = ({ id, title, series, every = "6h" }: { id: string; title: string; series: string; every?: string }) =>
  el("monitor", { id: `economy/${id}`, title, class: "economic-series", about: `fred:${series}` }, el("source", { id: "fred", adapter: "fred", params: { series }, every }));

test("a blueprint in JSX: a class is a component, its instances are data, and the run gives the contract's MonitorsDoc", () => {
  const rows = [
    ["cpi", "CPI, all items", "CPIAUCSL"],
    ["unrate", "Unemployment rate", "UNRATE"],
  ];
  const file = () =>
    el(
      "monitors",
      { id: "economy", title: "Economy and monetary policy", __source: 0 },
      rows.map(([id, title, series]) => el(Series, { id, title, series })),
      el(
        "monitor",
        { id: "economy/fomc", title: "FOMC decisions and statements", class: "central-bank-committee", visibility: "unlisted", __source: 1 },
        el("source", { id: "press", adapter: "fed-press", params: { topic: "monetary" }, every: "15m", __source: 2 }),
        el("wake", { match: "fomc.statement", prompt: "Summarize what changed from the last statement." }),
      ),
      el(
        "monitor",
        { id: "economy/treasury-yields", title: "Treasury yields", class: "interest-rate" },
        el("source", { id: "dgs10", adapter: "fred", params: { series: "DGS10" }, every: "6h" }),
        el("follows", { monitor: "economy/fomc", match: "fomc.*", __source: 3 }),
      ),
    );
  const { graph, document } = declarationOf({ default: file });
  assert.deepEqual(graph.nodes, {}, "a blueprint leaves beside an empty graph");
  assert.equal(document!.format, "monitors");
  assert.deepEqual(document!.sources, {
    "": 0,
    "monitor#economy/fomc": 1,
    "monitor#economy/fomc/source#press": 2,
    "monitor#economy/treasury-yields/follows#economy/fomc": 3,
  });
  const doc = document!.document;
  assert.deepEqual(doc, {
    id: "economy",
    title: "Economy and monetary policy",
    monitors: [
      { id: "economy/cpi", title: "CPI, all items", class: "economic-series", about: "fred:CPIAUCSL", sources: [{ id: "fred", adapter: "fred", params: { series: "CPIAUCSL" }, every: "6h" }], follows: [], wakes: [] },
      { id: "economy/unrate", title: "Unemployment rate", class: "economic-series", about: "fred:UNRATE", sources: [{ id: "fred", adapter: "fred", params: { series: "UNRATE" }, every: "6h" }], follows: [], wakes: [] },
      {
        id: "economy/fomc",
        title: "FOMC decisions and statements",
        class: "central-bank-committee",
        visibility: "unlisted",
        sources: [{ id: "press", adapter: "fed-press", params: { topic: "monetary" }, every: "15m" }],
        follows: [],
        wakes: [{ match: "fomc.statement", prompt: "Summarize what changed from the last statement." }],
      },
      {
        id: "economy/treasury-yields",
        title: "Treasury yields",
        class: "interest-rate",
        sources: [{ id: "dgs10", adapter: "fred", params: { series: "DGS10" }, every: "6h" }],
        follows: [{ monitor: "economy/fomc", match: "fomc.*" }],
        wakes: [],
      },
    ],
  });
  assert.deepEqual(MONITORS.monitors.fromTree(MONITORS.monitors.toTree(doc as never)), doc, "both ways");

  const read = monitorsWithDefaults(doc as never);
  assert.deepEqual(read.monitors[0], {
    id: "economy/cpi",
    title: "CPI, all items",
    class: "economic-series",
    about: "fred:CPIAUCSL",
    visibility: "public",
    readme: null,
    sources: [{ id: "fred", adapter: "fred", params: { series: "CPIAUCSL" }, every: "6h", via: "worker", exit: null }],
    follows: [],
    wakes: [],
  });
  assert.equal(read.monitors[2]!.visibility, "unlisted", "a declared visibility stays");
});

test("an empty blueprint and the empty file's first form", () => {
  const { document } = declarationOf({ default: el("monitors", { id: "empty" }) });
  assert.deepEqual(document!.document, { id: "empty", monitors: [] });
  assert.deepEqual(MONITORS.monitors.empty!("Public companies"), { id: "public-companies", title: "Public companies", monitors: [] });
});

test("a blueprint refuses by name what it has no words for, and values out of range", () => {
  const one = (...children: unknown[]) => () => declarationOf({ default: el("monitors", { id: "b" }, el("monitor", { id: "m" }, ...children)) });
  const src = (props: Record<string, unknown>) => el("source", { id: "s", adapter: "fred", every: "1h", ...props });
  assert.throws(() => declarationOf({ default: el("monitors", { title: "no id" }) }), /<monitors> needs id/);
  assert.throws(() => declarationOf({ default: el("monitors", { id: "b" }, el("monitor", { id: "m" }), el("monitor", { id: "m" })) }), /two <monitor> in <monitors> have id "m"/);
  assert.throws(one(src({}), src({})), /two <source> in <monitor> have id "s"/);
  assert.throws(one(el("source", { id: "s", adapter: "fred" })), /<source id="s"> needs every/);
  assert.throws(one(src({ every: "6 hours" })), /every is a duration/);
  assert.throws(one(src({ every: "10s" })), /every is from 30s to 7d/);
  assert.throws(one(src({ every: "8d" })), /every is from 30s to 7d/);
  assert.throws(one(src({ via: "phone" })), /via is "worker", "host", "vpn"/);
  assert.throws(one(src({ exit: "DE" })), /exit names an exit country \("DE"\) or an exit \("fsn-1"\), for via="vpn" only/);
  assert.throws(one(src({ params: ["CPIAUCSL"] })), /params is an object/);
  assert.throws(one(src({ cron: "0 * * * *" })), /<source id="s">: cron is not read/);
  assert.throws(one(el("follows", { monitor: "m" })), /follows itself/);
  assert.throws(one(el("wake", { match: "x.*" })), /<wake> needs prompt/);
  assert.throws(() => declarationOf({ default: el("monitors", { id: "b" }, el("monitor", { id: "m", visibility: "secret" })) }), /visibility is "public", "unlisted", "private"/);
  assert.throws(() => declarationOf({ default: el("monitors", { id: "b" }, el("source", { id: "s", adapter: "fred", every: "1h" })) }), /<source> stands in <monitor>, not in <monitors>/);
  assert.equal(durationSeconds("6h"), 21600);
  assert.equal(durationSeconds("0m"), null);
});
