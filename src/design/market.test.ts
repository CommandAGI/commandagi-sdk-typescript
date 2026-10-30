// A market recording in JSX is the recording the market view reads: one record per element in order, both ways,
// prices and quantities as decimal text, and what the vocabulary has no words for refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, MARKET } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const declared = (root: unknown) => declarationOf({ default: () => root }).document!;

// The elements of seed/user-commandagi/examples/market/code/Paper.market.tsx in the CommandAGI repository.
const paper = () =>
  el(
    "market",
    {},
    el("note", { t: "2026-10-01T13:30:00.000Z", text: "Example data: a fictional instrument and a paper account. Not a market, not advice." }),
    el("quote", { t: "2026-10-01T13:30:00.000Z", sym: "NRTH", last: "185.09", bid: "185.05", ask: "185.13", vol: "400" }),
    el(
      "book",
      { t: "2026-10-01T13:30:01.000Z", sym: "NRTH" },
      el("bid", { price: "185.05", qty: "300" }),
      el("bid", { price: "185.00", qty: "120" }),
      el("ask", { price: "185.13", qty: "200" }),
    ),
    el("trade", { t: "2026-10-01T13:30:02.000Z", sym: "NRTH", price: "185.10", qty: "25", side: "buy" }),
    el("news", { t: "2026-10-01T13:30:03.000Z", sym: "NRTH", headline: "Northwind opens a second plant", tone: "good" }),
    el("position", { t: "2026-10-01T13:30:04.000Z", sym: "NRTH", qty: "120", avg: "181.5" }),
    el("order", { t: "2026-10-01T13:31:00.000Z", id: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", qty: "10", type: "limit", limit: "184.50", tif: "day", venue: "alpaca-paper", mode: "paper", by: "person:ada", grant: "g-paper", connection: "conn-1" }),
    el("order-update", { t: "2026-10-01T13:31:01.000Z", order: "o-a1b2c3d4e5f6", state: "accepted", mode: "paper", ref: "alp-1001" }),
    el("amend", { t: "2026-10-01T13:32:00.000Z", id: "m-a1b2c3d4e5f6", order: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", qty: "10", type: "limit", limit: "184.80", tif: "day", venue: "alpaca-paper", mode: "paper", ref: "alp-1001", by: "person:ada", grant: "g-paper", connection: "conn-1" }),
    el("amend-update", { t: "2026-10-01T13:32:01.000Z", amend: "m-a1b2c3d4e5f6", state: "requested", mode: "paper", ref: "alp-1002" }),
    el("fill", { t: "2026-10-01T13:33:00.000Z", sym: "NRTH", side: "buy", price: "184.80", qty: "4", by: "person:ada", order: "o-a1b2c3d4e5f6", mode: "paper", ref: "fill-1", at: "2026-10-01T13:32:40.000Z" }),
    el("order-update", { t: "2026-10-01T13:33:00.000Z", order: "o-a1b2c3d4e5f6", state: "partial", mode: "paper", ref: "alp-1002", filled: "4", avg: "184.80", src: "venue" }),
    el(
      "account",
      { t: "2026-10-01T13:33:00.000Z", venue: "alpaca-paper", mode: "paper", connection: "conn-1", currency: "USD", status: "ACTIVE", value: "100739.20", buyingPower: "198521.60", cash: "99260.80", dayChange: "-12.40", dayChangePct: "-0.000123" },
      el("holding", { sym: "NRTH", side: "long", qty: "4", avg: "184.80", price: "185.10", value: "740.40", pl: "1.20", plPct: "0.0016" }),
      el("open-order", { ref: "alp-1002", client: "o-a1b2c3d4e5f6", order: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", type: "limit", tif: "day", status: "partially_filled", state: "partial", qty: "10", filled: "4", avgPrice: "184.80", limit: "184.80" }),
      el("problem", { text: "Example: one page of executions was read." }),
    ),
    el("cancel", { t: "2026-10-01T13:34:00.000Z", id: "x-a1b2c3d4e5f6", venue: "alpaca-paper", mode: "paper", ref: "alp-1002", order: "o-a1b2c3d4e5f6", connection: "conn-1", by: "person:ada", grant: "g-paper" }),
    el("cancel-update", { t: "2026-10-01T13:34:01.000Z", cancel: "x-a1b2c3d4e5f6", state: "requested", mode: "paper" }),
    el("order-update", { t: "2026-10-01T13:35:00.000Z", order: "o-a1b2c3d4e5f6", state: "cancelled", mode: "paper", ref: "alp-1002", filled: "4", avg: "184.80", src: "venue" }),
    el("order", { t: "2026-10-01T13:36:00.000Z", id: "o-0f1e2d3c4b5a", sym: "NRTH", side: "sell", qty: "2", type: "market", tif: "ioc", venue: "sim", mode: "sim", by: "agent:trader", grant: "g-sim" }),
    el("fill", { t: "2026-10-01T13:36:00.000Z", sym: "NRTH", side: "sell", price: "185.05", qty: "2", by: "agent:trader", order: "o-0f1e2d3c4b5a", mode: "sim" }),
    el("order-update", { t: "2026-10-01T13:36:00.000Z", order: "o-0f1e2d3c4b5a", state: "filled", mode: "sim" }),
  );

// The document the Python and Rust twins of Paper declare too.
const PAPER = {
  records: [
    { kind: "note", t: "2026-10-01T13:30:00.000Z", text: "Example data: a fictional instrument and a paper account. Not a market, not advice." },
    { kind: "quote", t: "2026-10-01T13:30:00.000Z", sym: "NRTH", last: "185.09", bid: "185.05", ask: "185.13", vol: "400" },
    { kind: "book", t: "2026-10-01T13:30:01.000Z", sym: "NRTH", bids: [["185.05", "300"], ["185.00", "120"]], asks: [["185.13", "200"]] },
    { kind: "trade", t: "2026-10-01T13:30:02.000Z", sym: "NRTH", price: "185.10", qty: "25", side: "buy" },
    { kind: "news", t: "2026-10-01T13:30:03.000Z", sym: "NRTH", headline: "Northwind opens a second plant", tone: "good" },
    { kind: "position", t: "2026-10-01T13:30:04.000Z", sym: "NRTH", qty: "120", avg: "181.5" },
    { kind: "order", t: "2026-10-01T13:31:00.000Z", id: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", qty: "10", type: "limit", limit: "184.50", tif: "day", venue: "alpaca-paper", mode: "paper", by: "person:ada", grant: "g-paper", connection: "conn-1" },
    { kind: "order-update", t: "2026-10-01T13:31:01.000Z", order: "o-a1b2c3d4e5f6", state: "accepted", mode: "paper", ref: "alp-1001" },
    { kind: "amend", t: "2026-10-01T13:32:00.000Z", id: "m-a1b2c3d4e5f6", order: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", qty: "10", type: "limit", limit: "184.80", tif: "day", venue: "alpaca-paper", mode: "paper", ref: "alp-1001", by: "person:ada", grant: "g-paper", connection: "conn-1" },
    { kind: "amend-update", t: "2026-10-01T13:32:01.000Z", amend: "m-a1b2c3d4e5f6", state: "requested", mode: "paper", ref: "alp-1002" },
    { kind: "fill", t: "2026-10-01T13:33:00.000Z", sym: "NRTH", side: "buy", price: "184.80", qty: "4", by: "person:ada", order: "o-a1b2c3d4e5f6", mode: "paper", ref: "fill-1", at: "2026-10-01T13:32:40.000Z" },
    { kind: "order-update", t: "2026-10-01T13:33:00.000Z", order: "o-a1b2c3d4e5f6", state: "partial", mode: "paper", ref: "alp-1002", filled: "4", avg: "184.80", src: "venue" },
    {
      kind: "account",
      t: "2026-10-01T13:33:00.000Z",
      venue: "alpaca-paper",
      mode: "paper",
      connection: "conn-1",
      currency: "USD",
      status: "ACTIVE",
      value: "100739.20",
      buyingPower: "198521.60",
      cash: "99260.80",
      dayChange: "-12.40",
      dayChangePct: "-0.000123",
      positions: [{ sym: "NRTH", side: "long", qty: "4", avg: "184.80", price: "185.10", value: "740.40", pl: "1.20", plPct: "0.0016" }],
      open: [{ ref: "alp-1002", client: "o-a1b2c3d4e5f6", order: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", type: "limit", tif: "day", status: "partially_filled", state: "partial", qty: "10", filled: "4", avgPrice: "184.80", limit: "184.80" }],
      problems: ["Example: one page of executions was read."],
    },
    { kind: "cancel", t: "2026-10-01T13:34:00.000Z", id: "x-a1b2c3d4e5f6", venue: "alpaca-paper", mode: "paper", ref: "alp-1002", order: "o-a1b2c3d4e5f6", connection: "conn-1", by: "person:ada", grant: "g-paper" },
    { kind: "cancel-update", t: "2026-10-01T13:34:01.000Z", cancel: "x-a1b2c3d4e5f6", state: "requested", mode: "paper" },
    { kind: "order-update", t: "2026-10-01T13:35:00.000Z", order: "o-a1b2c3d4e5f6", state: "cancelled", mode: "paper", ref: "alp-1002", filled: "4", avg: "184.80", src: "venue" },
    { kind: "order", t: "2026-10-01T13:36:00.000Z", id: "o-0f1e2d3c4b5a", sym: "NRTH", side: "sell", qty: "2", type: "market", tif: "ioc", venue: "sim", mode: "sim", by: "agent:trader", grant: "g-sim" },
    { kind: "fill", t: "2026-10-01T13:36:00.000Z", sym: "NRTH", side: "sell", price: "185.05", qty: "2", by: "agent:trader", order: "o-0f1e2d3c4b5a", mode: "sim" },
    { kind: "order-update", t: "2026-10-01T13:36:00.000Z", order: "o-0f1e2d3c4b5a", state: "filled", mode: "sim" },
  ],
};

test("Paper in JSX declares the recording its Python and Rust twins declare; both ways", () => {
  const doc = declared(paper());
  assert.equal(doc.format, "market");
  assert.deepEqual(doc.document, PAPER);
  assert.deepEqual(MARKET.market.fromTree(MARKET.market.toTree(doc.document as never)), doc.document, "both ways");
});

test("an empty <market> declares no records, as empty() does", () => {
  assert.deepEqual(declared(el("market")).document, { records: [] });
  assert.deepEqual(MARKET.market.empty!("Paper"), { records: [] });
  assert.deepEqual(declared(el("market", {}, el("book", { t: "2026-10-01T13:30:01Z", sym: "NRTH" }))).document, { records: [{ kind: "book", t: "2026-10-01T13:30:01Z", sym: "NRTH", bids: [], asks: [] }] });
});

test("what a market recording does not say is refused by name", () => {
  const t = "2026-10-01T13:30:00.000Z";
  const refused = (root: unknown, message: RegExp) => assert.throws(() => declared(root), message);
  refused(el("market", {}, el("quote", { t, sym: "NRTH", last: 185.09 })), /<quote> last is decimal text \("185\.09"\), not a number/);
  refused(el("market", {}, el("trade", { t, sym: "NRTH", price: "1e3", qty: "1" })), /<trade> price is decimal text \("185\.09"\), not "1e3"/);
  refused(el("market", {}, el("note", { t, text: 5 })), /<note> text is text, not a number/);
  refused(el("market", {}, el("quote", { t, sym: "NRTH", price: "1" })), /<quote>: price is not read \(t, sym, last, bid, ask, vol\)/);
  refused(el("market", {}, el("trade", { t, sym: "NRTH", qty: "1" })), /<trade> needs price/);
  refused(el("market", {}, el("bid", { price: "1", qty: "1" })), /<bid> stands in <book>, not in <market>/);
  refused(el("market", {}, el("account", { t, venue: "sim", mode: "sim" }, el("bid", { price: "1", qty: "1" }))), /<bid> stands in <book>, not in <account>/);
  refused(el("market", {}, el("note", { t: "yesterday", text: "x" })), /<note> t is an ISO time/);
  refused(el("market", { venue: "sim" }), /<market>: venue is not read/);
});

test("a bracket is an <order> with takeProfit and stopLoss; each exit's outcome names its leg; its prices are decimal text", () => {
  const t = "2026-10-01T13:30:00.000Z";
  const order = { t, id: "o-a1b2c3d4e5f6", sym: "NRTH", side: "buy", qty: "10", type: "limit", limit: "184.50", takeProfit: "190.25", stopLoss: "180", tif: "gtc", venue: "alpaca-paper", mode: "paper", by: "person:ada", grant: "g-paper" };
  const exit = { t, order: "o-a1b2c3d4e5f6", leg: "take-profit", state: "filled", mode: "paper", ref: "alp-1003", filled: "10", avg: "190.25", src: "venue" };
  const fill = { t, sym: "NRTH", side: "sell", price: "190.25", qty: "10", by: "person:ada", order: "o-a1b2c3d4e5f6", leg: "take-profit", mode: "paper", ref: "fill-2" };
  const doc = declared(el("market", {}, el("order", order), el("order-update", exit), el("fill", fill)));
  assert.deepEqual(doc.document, { records: [{ kind: "order", ...order }, { kind: "order-update", ...exit }, { kind: "fill", ...fill }] });
  assert.throws(() => declared(el("market", {}, el("order", { ...order, stopLoss: 180 }))), /<order> stopLoss is decimal text \("185\.09"\), not a number/);
  assert.throws(() => declared(el("market", {}, el("order", { ...order, takeProfit: "1.9e2" }))), /<order> takeProfit is decimal text \("185\.09"\), not "1\.9e2"/);
});
