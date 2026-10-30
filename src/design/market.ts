/**
 * A MARKET RECORDING IN JSX — a `.market.tsx`: quotes, trades, books, news, orders, fills and account read-backs, one
 * element per record, in time order. The market view shows it, and the host writes each order, outcome and
 * read-back into it as one element before the closing tag.
 *
 *   // Paper.market.tsx
 *   export default () => (
 *     <market>
 *       <quote t="2026-10-01T13:30:00.000Z" sym="NRTH" last="185.09" bid="185.05" ask="185.13" vol="400" />
 *       <book t="2026-10-01T13:30:01.000Z" sym="NRTH">
 *         <bid price="185.05" qty="300" />
 *         <ask price="185.13" qty="200" />
 *       </book>
 *       <trade t="2026-10-01T13:30:02.000Z" sym="NRTH" price="185.10" qty="25" side="buy" />
 *     </market>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim.
 * Every field is text. A price or a quantity is decimal text ("185.09"), never a number: a float loses cents. A
 * `t` is an ISO time. Records repeat, so no tag has a key. A book's `<bid>` and `<ask>` children are its `bids` and
 * `asks`, as [price, qty] pairs in order. An account's `<holding>`, `<open-order>` and `<problem>` children are its
 * `positions`, `open` and `problems`.
 *
 * Structure only. What a record means (a venue's modes, an id's shape, time order) is the application's to check.
 */
import { registerVocabulary, type DocTree, type TagRule, type Vocabulary } from "./documents.js";

/** Plain decimal text: no exponent, no `+`, no thousands separators. */
export const DECIMAL = /^-?\d+(\.\d+)?$/;
/** An ISO time with a zone, as the Python and Rust SDKs check it too. */
export const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;

interface MarketTag {
  parent: string;
  required: readonly string[];
  other?: readonly string[];
  decimal?: readonly string[];
}

/** Each tag of a market recording: where it stands, what it must say, what else it may say, and which fields are decimal. */
export const MARKET_TAGS: Readonly<Record<string, MarketTag>> = {
  note: { parent: "market", required: ["t", "text"] },
  quote: { parent: "market", required: ["t", "sym"], other: ["last", "bid", "ask", "vol"], decimal: ["last", "bid", "ask", "vol"] },
  trade: { parent: "market", required: ["t", "sym", "price", "qty"], other: ["side"], decimal: ["price", "qty"] },
  book: { parent: "market", required: ["t", "sym"] },
  bid: { parent: "book", required: ["price", "qty"], decimal: ["price", "qty"] },
  ask: { parent: "book", required: ["price", "qty"], decimal: ["price", "qty"] },
  news: { parent: "market", required: ["t", "headline"], other: ["sym", "source", "tone"] },
  position: { parent: "market", required: ["t", "sym", "qty", "avg"], decimal: ["qty", "avg"] },
  fill: { parent: "market", required: ["t", "sym", "side", "price", "qty"], other: ["by", "order", "mode", "ref", "at"], decimal: ["price", "qty"] },
  order: {
    parent: "market",
    required: ["t", "id", "sym", "side", "qty", "type", "tif", "venue", "mode", "by", "grant"],
    other: ["limit", "stop", "instrument", "account", "connection"],
    decimal: ["qty", "limit", "stop"],
  },
  "order-update": { parent: "market", required: ["t", "order", "state", "mode"], other: ["ref", "filled", "avg", "error", "src"], decimal: ["filled", "avg"] },
  cancel: { parent: "market", required: ["t", "id", "venue", "mode", "ref", "by", "grant"], other: ["order", "connection", "account"] },
  "cancel-update": { parent: "market", required: ["t", "cancel", "state", "mode"], other: ["error"] },
  amend: {
    parent: "market",
    required: ["t", "id", "order", "sym", "side", "qty", "type", "tif", "venue", "mode", "ref", "by", "grant"],
    other: ["limit", "stop", "connection", "account"],
    decimal: ["qty", "limit", "stop"],
  },
  "amend-update": { parent: "market", required: ["t", "amend", "state", "mode"], other: ["ref", "error"] },
  account: {
    parent: "market",
    required: ["t", "venue", "mode"],
    other: ["connection", "currency", "status", "value", "buyingPower", "cash", "equity", "dayChange", "dayChangePct"],
    decimal: ["value", "buyingPower", "cash", "equity", "dayChange", "dayChangePct"],
  },
  holding: { parent: "account", required: ["sym", "qty"], other: ["side", "avg", "price", "value", "pl", "plPct"], decimal: ["qty", "avg", "price", "value", "pl", "plPct"] },
  "open-order": {
    parent: "account",
    required: ["sym", "status"],
    other: ["ref", "client", "order", "side", "type", "tif", "state", "submitted", "qty", "filled", "avgPrice", "limit"],
    decimal: ["qty", "filled", "avgPrice", "limit"],
  },
  problem: { parent: "account", required: ["text"] },
};

/** The fields each tag may have, required ones first. */
export const MARKET_FIELDS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(MARKET_TAGS).map(([tag, r]) => [tag, [...r.required, ...(r.other ?? [])]]),
);

/** One record: its tag as `kind`, its fields as text, and a book's or an account's children folded in. */
export interface MarketRecord {
  kind: string;
  bids?: [string, string][];
  asks?: [string, string][];
  positions?: Record<string, string>[];
  open?: Record<string, string>[];
  problems?: string[];
  [field: string]: unknown;
}

/** A market recording as the market view reads it. */
export interface MarketDoc {
  records: MarketRecord[];
}

const tags: Record<string, TagRule> = { market: { parents: [], attrs: [] } };
for (const [tag, r] of Object.entries(MARKET_TAGS)) tags[tag] = { parents: [r.parent], required: r.required, attrs: MARKET_FIELDS[tag]! };

function check(t: DocTree): void {
  const rule = MARKET_TAGS[t.tag]!;
  for (const [k, v] of Object.entries(t.attrs)) {
    const decimal = rule.decimal?.includes(k);
    // A float would lose cents and a boolean says nothing a venue reads: every field is text.
    if (typeof v !== "string") throw new Error(`<${t.tag}> ${k} is ${decimal ? 'decimal text ("185.09")' : "text"}, not ${typeof v === "number" ? "a number" : JSON.stringify(v)}`);
    if (decimal && !DECIMAL.test(v)) throw new Error(`<${t.tag}> ${k} is decimal text ("185.09"), not ${JSON.stringify(v)}`);
    if (k === "t" && !ISO_TIME.test(v)) throw new Error(`<${t.tag}> ${k} is an ISO time ("2026-10-01T13:30:00.000Z"), not ${JSON.stringify(v)}`);
  }
  for (const c of t.children) check(c);
}

const pair = (c: DocTree): [string, string] => [c.attrs.price as string, c.attrs.qty as string];
const of = (t: DocTree, tag: string) => t.children.filter((c) => c.tag === tag);

function recordOf(t: DocTree): MarketRecord {
  check(t);
  const rec: MarketRecord = { kind: t.tag, ...(t.attrs as Record<string, string>) };
  if (t.tag === "book") {
    rec.bids = of(t, "bid").map(pair);
    rec.asks = of(t, "ask").map(pair);
  }
  if (t.tag === "account") {
    const holdings = of(t, "holding");
    const open = of(t, "open-order");
    const problems = of(t, "problem");
    if (holdings.length) rec.positions = holdings.map((c) => ({ ...(c.attrs as Record<string, string>) }));
    if (open.length) rec.open = open.map((c) => ({ ...(c.attrs as Record<string, string>) }));
    if (problems.length) rec.problems = problems.map((c) => c.attrs.text as string);
  }
  return rec;
}

const leaf = (tag: string, attrs: Record<string, unknown>): DocTree => ({ tag, attrs, children: [] });

function treeOfRecord(rec: MarketRecord): DocTree {
  const { kind, bids, asks, positions, open, problems, ...attrs } = rec;
  const children: DocTree[] = [];
  for (const [price, qty] of bids ?? []) children.push(leaf("bid", { price, qty }));
  for (const [price, qty] of asks ?? []) children.push(leaf("ask", { price, qty }));
  for (const h of positions ?? []) children.push(leaf("holding", { ...h }));
  for (const o of open ?? []) children.push(leaf("open-order", { ...o }));
  for (const text of problems ?? []) children.push(leaf("problem", { text }));
  return { tag: kind, attrs, children };
}

export const marketVocabulary: Vocabulary<MarketDoc> = {
  format: "market",
  noun: "a market recording",
  root: "market",
  tags,
  fromTree: (t) => ({ records: t.children.map(recordOf) }),
  toTree: (d) => ({ tag: "market", attrs: {}, children: (d.records ?? []).map(treeOfRecord) }),
  empty: () => ({ records: [] }),
};

registerVocabulary(marketVocabulary);

/** The vocabulary of a market recording, by format. */
export const MARKET = { market: marketVocabulary } as const;
