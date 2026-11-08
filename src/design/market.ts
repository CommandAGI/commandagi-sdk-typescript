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
 * `positions`, `open` and `problems`. A bracket is an `<order>` with `takeProfit` and `stopLoss`; what became of one of
 * its two exits is an `<order-update>` or a `<fill>` with `leg` (`take-profit` or `stop-loss`).
 *
 * An option contract is one `sym` in one spelling, `<underlying> <expiry> <C|P> <strike>[ x<multiplier>]`
 * (`AAPL 2026-12-18 C 200`): an ISO date, C or P, the strike as decimal text with no trailing zeros, and the multiplier
 * only when it is not 100. `optionSymbol` writes it and `parseOption` reads it; a `sym` with a space in any record must
 * be a contract in that spelling. An option `<order>` may say `effect` (`open` or `close`).
 *
 * Structure only. What a record means (a venue's modes, an id's shape, time order) is the application's to check.
 */
import { registerVocabulary, type DocTree, type TagRule, type Vocabulary } from "./documents.js";

/** Plain decimal text: no exponent, no `+`, no thousands separators. */
export const DECIMAL = /^-?\d+(\.\d+)?$/;
/** An ISO time with a zone, as the Python and Rust SDKs check it too. */
export const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/;

/** An option contract's parts, as text: the expiry an ISO date, the right C or P, the strike and multiplier decimal text. */
export interface OptionContract {
  underlying: string;
  expiry: string;
  right: "C" | "P";
  strike: string;
  multiplier: string;
}

/** The multiplier a contract has when its symbol writes none: the standard US equity option. */
export const STANDARD_MULTIPLIER = "100";
const UNDERLYING = /^[A-Za-z0-9._/-]{1,24}$/;
const OPTION_FORM = '<underlying> <expiry YYYY-MM-DD> <C|P> <strike>[ x<multiplier>], for example "AAPL 2026-12-18 C 200"';

/** Decimal text without leading or trailing zeros ("0200.50" → "200.5"), or null. */
function canonical(v: string | number): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v.trim());
  if (!m) return null;
  const whole = m[1]!.replace(/^0+(?=\d)/, "");
  const frac = (m[2] ?? "").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * The contract a symbol names, or null for a plain symbol (one with no space). A symbol with a space is a contract and
 * must be spelled as one: anything else throws one sentence that names the part and the spelling to write.
 */
export function parseOption(sym: string): OptionContract | null {
  if (!sym.includes(" ")) return null;
  const parts = sym.split(" ");
  if (parts.length < 4 || parts.length > 5 || parts.some((p) => !p)) throw new Error(`an option contract is ${OPTION_FORM}, not ${JSON.stringify(sym)}`);
  const [underlying, expiry, right, strike, mult] = parts as [string, string, string, string, string | undefined];
  if (!UNDERLYING.test(underlying)) throw new Error(`an option's underlying is letters, digits and . _ / - (at most 24), not ${JSON.stringify(underlying)}`);
  if (!isDate(expiry)) throw new Error(`an option's expiry is a date, YYYY-MM-DD, not ${JSON.stringify(expiry)}`);
  if (right !== "C" && right !== "P") throw new Error(`an option's right is C (a call) or P (a put), not ${JSON.stringify(right)}`);
  const k = canonical(strike);
  if (k === null || /^0(\.0*)?$/.test(k)) throw new Error(`an option's strike is decimal text above 0, not ${JSON.stringify(strike)}`);
  if (k !== strike) throw new Error(`an option's strike is written ${k}, not ${strike} (one spelling for each contract)`);
  let multiplier = STANDARD_MULTIPLIER;
  if (mult !== undefined) {
    if (!/^x[1-9]\d*$/.test(mult)) throw new Error(`an option's multiplier is x and a whole number above 0 ("x10"), not ${JSON.stringify(mult)}`);
    if (mult.slice(1) === STANDARD_MULTIPLIER) throw new Error(`a multiplier of ${STANDARD_MULTIPLIER} is not written: ${parts.slice(0, 4).join(" ")} is that contract`);
    multiplier = mult.slice(1);
  }
  return { underlying, expiry, right, strike, multiplier };
}

/** A contract's one spelling, from its parts: `right` is C, P, call or put. Throws as `parseOption` does. */
export function optionSymbol(c: { underlying: string; expiry: string; right: string; strike: string | number; multiplier?: string | number }): string {
  const r = ({ c: "C", call: "C", p: "P", put: "P" } as Record<string, string>)[c.right.toLowerCase()] ?? c.right;
  const k = canonical(c.strike) ?? String(c.strike);
  const m = canonical(c.multiplier ?? STANDARD_MULTIPLIER) ?? String(c.multiplier);
  const sym = `${c.underlying} ${c.expiry} ${r} ${k}${m === STANDARD_MULTIPLIER ? "" : ` x${m}`}`;
  parseOption(sym);
  return sym;
}

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
  fill: { parent: "market", required: ["t", "sym", "side", "price", "qty"], other: ["by", "order", "leg", "mode", "ref", "at"], decimal: ["price", "qty"] },
  order: {
    parent: "market",
    required: ["t", "id", "sym", "side", "qty", "type", "tif", "venue", "mode", "by", "grant"],
    other: ["limit", "stop", "takeProfit", "stopLoss", "effect", "instrument", "account", "connection"],
    decimal: ["qty", "limit", "stop", "takeProfit", "stopLoss"],
  },
  "order-update": { parent: "market", required: ["t", "order", "state", "mode"], other: ["leg", "ref", "filled", "avg", "error", "src"], decimal: ["filled", "avg"] },
  cancel: { parent: "market", required: ["t", "id", "venue", "mode", "ref", "by", "grant"], other: ["order", "leg", "connection", "account"] },
  "cancel-update": { parent: "market", required: ["t", "cancel", "state", "mode"], other: ["error"] },
  amend: {
    parent: "market",
    required: ["t", "id", "order", "sym", "side", "qty", "type", "tif", "venue", "mode", "ref", "by", "grant"],
    other: ["limit", "stop", "effect", "connection", "account"],
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
    if (k === "sym") {
      try {
        parseOption(v);
      } catch (e) {
        throw new Error(`<${t.tag}> sym: ${(e as Error).message}`);
      }
    }
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
