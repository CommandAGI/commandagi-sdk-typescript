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
    { title: `${name} (${ticker})`, class: "corporation", about: `cik:${cik}`, sameAs: [`ticker:${ticker}`], __source: 0 },
    el("source", { id: "filings", adapter: "sec-filings", params: { cik }, every: "15m", __source: 1 }),
    el("follows", { monitor: "../../central-banks/fed", when: { class: "fomc.*" }, __source: 2 }),
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
    sameAs: ["ticker:NVDA"],
    sources: [{ id: "filings", adapter: "sec-filings", params: { cik: "0001045810" }, every: "15m" }],
    follows: [{ monitor: "../../central-banks/fed", when: { class: "fomc.*" } }],
    derives: [],
    wakes: [{ match: "sec.filing.8-k*", prompt: "Say what the report changes." }],
    discovers: [],
  });
  assert.deepEqual(MONITORS.monitor.fromTree(MONITORS.monitor.toTree(doc as never)), doc, "both ways");
  assert.deepEqual(monitorWithDefaults(doc as never), {
    title: "NVIDIA (NVDA)",
    class: "corporation",
    about: "cik:0001045810",
    readme: null,
    sameAs: ["ticker:NVDA"],
    sources: [{ id: "filings", adapter: "sec-filings", params: { cik: "0001045810" }, every: "15m", via: "worker", exit: null, host: null, mode: "poll", retain: null, since: null, session: null, snapshot: null, profile: null, keep: null, maxCostPerDay: null, unit: null, vantage: null, connection: null }],
    follows: [{ monitor: "../../central-banks/fed", when: { class: "fomc.*" } }],
    derives: [],
    wakes: [{ match: "sec.filing.8-k*", prompt: "Say what the report changes." }],
    discovers: [],
  });
});

test("an empty monitor and the empty file's first form", () => {
  const { document } = declarationOf({ default: el("monitor") });
  assert.deepEqual(document!.document, { sources: [], follows: [], derives: [], wakes: [], discovers: [] });
  assert.deepEqual(MONITORS.monitor.empty!("monitor"), { sources: [], follows: [], derives: [], wakes: [], discovers: [] });
});

test("a monitor refuses by name what it has no words for, and values out of range", () => {
  const one = (...children: unknown[]) => () => declarationOf({ default: el("monitor", {}, ...children) });
  const src = (props: Record<string, unknown>) => el("source", { id: "s", adapter: "fred", every: "1h", ...props });
  assert.throws(one(src({}), src({})), /two <source> in <monitor> have id "s"/);
  assert.throws(() => declarationOf({ default: el("monitor", { sameAs: ["NVDA"] }) }), /sameAs is a list of subjects/);
  assert.throws(() => declarationOf({ default: el("monitor", { sameAs: "ticker:NVDA" }) }), /sameAs is a list of subjects/);
  assert.throws(one(el("source", { id: "s", adapter: "fred" })), /<source id="s"> needs every/);
  assert.throws(one(src({ every: "6 hours" })), /every is a duration/);
  assert.throws(one(src({ every: "10s" })), /every is from 30s to 7d/);
  assert.throws(one(src({ every: "8d" })), /every is from 30s to 7d/);
  assert.throws(one(src({ via: "ftp" })), /via is "worker", "host", "vpn", "browser", "vm", "android-vm", "phone"/);
  assert.throws(one(src({ exit: "DE" })), /exit names an exit country \("DE"\) or an exit \("fsn-1"\), for via="vpn" only/);
  assert.throws(one(src({ host: "studio" })), /host names the host that reads it, for via="host", "browser", "phone", "vm" or "android-vm" only/);
  assert.throws(one(src({ mode: "stream" })), /mode="stream" holds a connection open, which runs on a host/);
  assert.throws(one(src({ via: "host", mode: "push" })), /mode is "poll", "stream"/);
  assert.throws(one(src({ via: "host", retain: "all" })), /retain is for mode="stream" only/);
  assert.throws(one(src({ via: "host", mode: "stream", retain: "sample:soon" })), /retain is "all", "derived" or "sample:<duration>"/);
  const stream = declarationOf({ default: el("monitor", {}, src({ via: "host", host: "studio", mode: "stream", retain: "sample:1m" })) });
  assert.deepEqual(monitorWithDefaults(stream.document!.document as never).sources[0], { id: "s", adapter: "fred", params: {}, every: "1h", via: "host", exit: null, host: "studio", mode: "stream", retain: "sample:1m", since: null, session: null, snapshot: null, profile: null, keep: null, maxCostPerDay: null, unit: null, vantage: null, connection: null });
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
  // A derive may fold its own monitor's records (an exploit's lifecycle from its own reads).
  assert.doesNotThrow(one({ inputs: { own: "./" } }));
  assert.throws(one({ inputs: { "bad port": "../x" } }), /a port is a word/);
  assert.throws(one({ params: [1] }), /params is an object/);
  assert.throws(one({ since: "soon" }), /since is a day/);
  assert.throws(one({ id: "a.b" }), /id is a word/);
  assert.throws(() => declarationOf({ default: el("monitor", {}, el("derive", { id: "d", inputs: { a: "../x" } })) }), /<derive id="d"> needs op/);
});

test("the paths with a browser, a machine launched from a snapshot, or a phone: each says what it reads through", () => {
  const one = (...children: unknown[]) => () => declarationOf({ default: el("monitor", {}, ...children) });
  const src = (props: Record<string, unknown>) => el("source", { id: "s", adapter: "x-profile", params: { handle: "nvidia" }, every: "1h", ...props });
  const doc = (props: Record<string, unknown>) => monitorWithDefaults(declarationOf({ default: el("monitor", {}, src(props)) }).document!.document as never).sources[0]!;
  assert.deepEqual(doc({ via: "browser", host: "studio", profile: "x-web" }), {
    id: "s", adapter: "x-profile", params: { handle: "nvidia" }, every: "1h", via: "browser", exit: null, host: "studio", mode: "poll", retain: null, since: null,
    session: null, snapshot: null, profile: "x-web", keep: null, maxCostPerDay: null, unit: null, vantage: null, connection: null,
  });
  assert.equal(doc({ via: "browser", session: "../../infra/sessions/x-web/session.tsx" }).session, "../../infra/sessions/x-web/session.tsx");
  const vm = doc({ via: "vm", snapshot: "genesis", keep: "10m", maxCostPerDay: 2.5 });
  assert.deepEqual([vm.snapshot, vm.keep, vm.maxCostPerDay], ["genesis", "10m", 2.5]);
  assert.equal(doc({ via: "android-vm", session: "../s/session.tsx", maxCostPerDay: 1 }).via, "android-vm");
  assert.equal(doc({ via: "phone", unit: "../../../worlds/fleet/world.tsx#android-01" }).unit, "../../../worlds/fleet/world.tsx#android-01");
  assert.equal(doc({ via: "phone", unit: "cloud://home/user-commandagi/worlds/fleet/world.tsx#android-01" }).via, "phone");
  // A connected account: the account's own connection, read by the api worker.
  assert.equal(doc({ connection: "gmail@jacobfv123@gmail.com" }).connection, "gmail@jacobfv123@gmail.com");
  assert.throws(one(src({ via: "host", connection: "gmail@jacobfv123@gmail.com" })), /connection names a connected account, which the api worker reads/);
  assert.throws(one(src({ via: "vm", snapshot: "genesis" })), /via="vm" costs money: it says maxCostPerDay/);
  assert.throws(one(src({ via: "vm", maxCostPerDay: 1 })), /via="vm" launches from a snapshot: it names a session or a snapshot/);
  assert.throws(one(src({ via: "vm", snapshot: "g", session: "../s.tsx", maxCostPerDay: 1 })), /names its state once: a session or a snapshot/);
  assert.throws(one(src({ via: "vm", snapshot: "g", maxCostPerDay: "2" })), /maxCostPerDay is a price in USD/);
  assert.throws(one(src({ via: "vm", snapshot: "g", maxCostPerDay: 0 })), /maxCostPerDay is a price in USD/);
  assert.throws(one(src({ via: "vm", snapshot: "g", maxCostPerDay: 1, keep: "forever" })), /keep is a duration from 30s to 7d/);
  assert.throws(one(src({ via: "browser", keep: "10m" })), /keep is how long a via="vm" or "android-vm" machine stays up/);
  assert.throws(one(src({ via: "browser", maxCostPerDay: 1 })), /maxCostPerDay bounds what a via="vm" or "android-vm" source spends/);
  assert.throws(one(src({ via: "browser", snapshot: "g" })), /snapshot is what a via="vm" or "android-vm" read launches from/);
  assert.throws(one(src({ via: "worker", profile: "x-web" })), /profile names a browser profile of the host, for via="browser" only/);
  assert.throws(one(src({ via: "browser", profile: "x", session: "../s.tsx" })), /names its state once: a session or a profile/);
  assert.throws(one(src({ via: "worker", session: "../s.tsx" })), /session names a logged-in state, for via="browser", "vm" or "android-vm" only/);
  assert.throws(one(src({ via: "phone" })), /via="phone" names its phone: unit=/);
  assert.throws(one(src({ via: "phone", unit: "android-01" })), /unit is "<world.tsx ref>#<uid>"/);
  assert.throws(one(src({ via: "browser", unit: "w/world.tsx#a" })), /unit names the phone a via="phone" read runs on/);
});

test("a mirror discovers its conversations: a source names its vantage, a follow filters, a discover writes one folder per conversation", () => {
  const Conversation = ({ conversation, title }: { conversation: string; title: string }) =>
    el("monitor", { title, class: "conversation" }, el("follows", { monitor: "../", when: { class: "message.*", "data.conversation": conversation } }));
  const mirror = declarationOf({
    default: el(
      "monitor",
      { title: "Telegram: commandagi", class: "mirror" },
      el("source", { id: "user-api", adapter: "telegram-user", params: { account: "commandagi" }, every: "1m", via: "host", vantage: "../../../infra/vantages/laptop-linux" }),
      el("discover", { when: { class: "message.*" }, slug: "conversation", class: "../../conversation.tsx#Conversation", props: { conversation: "conversation", title: "fromName" }, name: "fromName", max: 5 }),
    ),
  }).document!.document as never;
  assert.deepEqual(monitorWithDefaults(mirror).discovers, [
    { into: "./", of: [], when: { class: "message.*" }, slug: "conversation", class: "../../conversation.tsx#Conversation", props: { conversation: "conversation", title: "fromName" }, name: "fromName", max: 5 },
  ]);
  assert.equal(monitorWithDefaults(mirror).sources[0]!.vantage, "../../../infra/vantages/laptop-linux");
  assert.deepEqual(MONITORS.monitor.fromTree(MONITORS.monitor.toTree(mirror)), mirror, "both ways");
  const one = declarationOf({ default: () => el(Conversation, { conversation: "4412", title: "Alice" }) }).document!.document as { follows: unknown[] };
  assert.deepEqual(one.follows, [{ monitor: "../", when: { class: "message.*", "data.conversation": "4412" } }]);
  const refuse = (props: Record<string, unknown>) => () =>
    declarationOf({ default: el("monitor", {}, el("discover", { slug: "conversation", class: "../c.tsx#Conversation", ...props })) });
  assert.doesNotThrow(refuse({}));
  // An exploit's discover: it reads three feeds, takes a CVE id from whichever path holds one, and says when in data.
  assert.doesNotThrow(refuse({ of: ["./kev", "./cve-feed"], into: "./exploits", when: [{ class: "security.kev" }, { class: "security.cve", "data.cvss3": { gte: 9 } }], slug: { paths: ["data.cve", "data.id", "data.aliases"], pattern: "^CVE-" } }));
  assert.throws(refuse({ class: "../c.tsx#conversation" }), /class is the class file and its exported name/);
  assert.throws(refuse({ class: "../c.md#Conversation" }), /class is the class file and its exported name/);
  assert.throws(refuse({ slug: "data[0]" }), /slug is a data path/);
  assert.throws(refuse({ slug: { paths: [], pattern: "x" } }), /slug is a data path/);
  assert.throws(refuse({ when: { "cvss": 9 } }), /when: "cvss" is class, about, key, title or a data path/);
  assert.throws(refuse({ when: { "data.cvss": { above: 9 } } }), /when: data.cvss: above is not an operator/);
  assert.throws(refuse({ of: [] }), /of is a monitor's folder or a list of them/);
  assert.throws(refuse({ props: { title: "a b" } }), /props.title is a data path/);
  assert.throws(refuse({ max: 500 }), /max is a whole number from 1 to 50/);
  assert.throws(refuse({ delete: true }), /delete is not read/);
  assert.throws(refuse({ by: "conversation" }), /by is not read/);
  assert.throws(() => declarationOf({ default: el("monitor", {}, el("follows", { monitor: "../x", when: "conversation" })) }), /when: a condition is an object of terms/);
});
