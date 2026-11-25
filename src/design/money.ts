/**
 * A MONEY ACCOUNT IN JSX — `<name>.money.tsx` (or `.jsx`, `.py`, `.rs`) declares one account a person or a company
 * holds at a financial institution: checking, savings, a card, a loan, a credit line, a brokerage account, a
 * processor's balance or a wallet (CommandAGI's docs/financial-accounts.md, docs/formats.md § money accounts):
 *
 *   // money/Operating.money.tsx
 *   import { MoneyAccount, Connection, Counterparty, At, Recurring } from "commandagi/design";
 *   export default () => (
 *     <MoneyAccount name="Operating" kind="checking" institution="Mercury" last4="0000" currency="USD"
 *                   ledger="Assets:Cash:Operating" books="../books/main.journal" statements="statements/">
 *       <Connection id="direct" provider="mercury" account="acc_test_operating" />
 *       <Counterparty id="landlord" name="Harbor Properties LLC">
 *         <At connection="direct" recipient="rcp_test_landlord" />
 *       </Counterparty>
 *       <Recurring id="rent" to="landlord" amount="4200.00" rail="ach" every="month" day={1} by="person:jacob"
 *                  starts="2027-01-01" memo="Rent" />
 *     </MoneyAccount>
 *   );
 *
 * The file holds no bank or card number and no credential: `last4` is the most it says of a number, `account` is the
 * provider's own id of the account, `recipient` the provider's id of a payee made on the provider's own page, and the
 * sign-in is a connection of the holder. A `<Connection>` is one way to reach the account (`mode` live or sandbox; the
 * order is the order reads try them). A `<Counterparty>` is reached through `<At>`s, or is another money account of
 * the holder (`file`). A `<Recurring>` payment repeats every week, month, quarter or year; each occurrence is its own
 * transfer, made under the grant of the principal `by`. The CommandAGI reader (`packages/domain/world/money.js`
 * `validateMoneyAccount`) holds the rest of the rules. The Python SDK's `money.py` and the Rust SDK's `money.rs`
 * declare the same document.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A money account's file: `<name>.money.tsx` (or `.jsx`, `.py`, `.rs`). */
export const MONEY_FILE = /\.money\.(?:[jt]sx|py|rs)$/i;
export const MoneyAccount = "MoneyAccount";
export const Connection = "Connection";
export const Counterparty = "Counterparty";
export const At = "At";
export const Recurring = "Recurring";

export const MONEY_KINDS = ["checking", "savings", "money-market", "card", "loan", "credit-line", "brokerage", "payments", "wallet", "other"] as const;
/** A provider is named by its id; the platform's catalog names the providers (docs/financial-accounts.md), so a new one needs no SDK release. */
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,39}$/;
export const MONEY_RAILS = ["ach", "wire", "book", "rtp", "check"] as const;
export const MONEY_EVERY = ["week", "month", "quarter", "year"] as const;
export const MONEY_ACCOUNT_FIELDS = ["name", "kind", "institution", "last4", "currency", "ledger", "books", "statements", "opened", "closed", "holder"] as const;
export const MONEY_CONNECTION_FIELDS = ["id", "provider", "account", "mode"] as const;
export const MONEY_COUNTERPARTY_FIELDS = ["id", "name", "kind", "file"] as const;
export const MONEY_AT_FIELDS = ["connection", "recipient"] as const;
export const MONEY_RECURRING_FIELDS = ["id", "to", "amount", "rail", "every", "day", "by", "starts", "ends", "memo"] as const;

export interface MoneyConnection { id: string; provider: string; account: string; mode?: "live" | "sandbox" }
export interface MoneyAt { connection: string; recipient: string }
export interface MoneyCounterparty { id: string; name: string; kind?: string; file?: string; at?: MoneyAt[] }
export interface MoneyRecurring {
  id: string; to: string; amount: string; rail: (typeof MONEY_RAILS)[number]; every: (typeof MONEY_EVERY)[number];
  day?: number; by: string; starts: string; ends?: string; memo?: string;
}
export interface MoneyAccountDoc {
  name: string;
  kind: (typeof MONEY_KINDS)[number];
  institution?: string; last4?: string; currency?: string; ledger?: string; books?: string; statements?: string;
  opened?: string; closed?: string; holder?: string;
  connections: MoneyConnection[];
  counterparties: MoneyCounterparty[];
  recurring: MoneyRecurring[];
}

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d{1,15}(?:\.\d{1,4})?$/;
const PRINCIPAL = /^(?:person|agent):[A-Za-z0-9._@-]{1,64}$/;
const one = (v: unknown, list: readonly string[]) => typeof v === "string" && list.includes(v);

function keep<T extends object>(out: T, a: Record<string, unknown>, fields: readonly string[]): T {
  for (const k of fields) if (a[k] !== undefined && (out as Record<string, unknown>)[k] === undefined) (out as Record<string, unknown>)[k] = a[k];
  return out;
}
function texts(a: Record<string, unknown>, at: string, fields: readonly string[], max: number) {
  for (const k of fields) if (a[k] !== undefined && !text(a[k], max)) throw new Error(`${at} ${k} is a short text (at most ${max}), not ${said(a[k])}`);
}

function connectionOf(a: Record<string, unknown>): MoneyConnection {
  if (typeof a.id !== "string" || !ID.test(a.id)) throw new Error(`<Connection> id is letters, digits, . _ - (at most 64), not ${said(a.id)}`);
  const at = `<Connection id="${a.id}">`;
  if (typeof a.provider !== "string" || !PROVIDER_ID.test(a.provider)) throw new Error(`${at} provider is a provider's id (lowercase letters, digits and -, as plaid or increase), not ${said(a.provider)}`);
  if (!text(a.account, 200)) throw new Error(`${at} account is the provider's own id of the account (not a bank number), not ${said(a.account)}`);
  if (a.mode !== undefined && a.mode !== "live" && a.mode !== "sandbox") throw new Error(`${at} mode is live or sandbox, not ${said(a.mode)}`);
  return keep({} as MoneyConnection, a, MONEY_CONNECTION_FIELDS);
}

function counterpartyOf(c: DocTree, connections: Set<string>): MoneyCounterparty {
  const a = c.attrs as Record<string, unknown>;
  if (typeof a.id !== "string" || !ID.test(a.id)) throw new Error(`<Counterparty> id is letters, digits, . _ - (at most 64), not ${said(a.id)}`);
  const at = `<Counterparty id="${a.id}">`;
  if (!text(a.name, 200)) throw new Error(`${at} name is a short text (at most 200), not ${said(a.name)}`);
  texts(a, at, ["kind"], 80);
  if (a.file !== undefined && !(text(a.file, 1000) && /\.money\.(?:[jt]sx|py|rs)$/i.test(a.file))) throw new Error(`${at} file is a ref to another money account (.money.tsx), not ${said(a.file)}`);
  const seen = new Set<string>();
  const ways = c.children.filter((x) => x.tag === "At").map((x) => {
    const w = x.attrs as Record<string, unknown>;
    if (!one(w.connection, [...connections])) throw new Error(`${at} <At> connection is the id of a <Connection> of the account, not ${said(w.connection)}`);
    if (!text(w.recipient, 200)) throw new Error(`${at} <At connection="${w.connection}"> recipient is the provider's id of the payee, not ${said(w.recipient)}`);
    if (seen.has(w.connection as string)) throw new Error(`${at} names the connection ${w.connection} in two <At>s`);
    seen.add(w.connection as string);
    return { connection: w.connection as string, recipient: w.recipient };
  });
  if (a.file !== undefined && ways.length) throw new Error(`${at} is another money account of the holder (file) or is reached through <At>, not both`);
  if (a.file === undefined && !ways.length) throw new Error(`${at} needs an <At connection recipient>, or the file of another money account`);
  const out = keep({} as MoneyCounterparty, a, MONEY_COUNTERPARTY_FIELDS);
  if (ways.length) out.at = ways;
  return out;
}

function recurringOf(a: Record<string, unknown>, parties: Set<string>): MoneyRecurring {
  if (typeof a.id !== "string" || !ID.test(a.id)) throw new Error(`<Recurring> id is letters, digits, . _ - (at most 64), not ${said(a.id)}`);
  const at = `<Recurring id="${a.id}">`;
  if (!one(a.to, [...parties])) throw new Error(`${at} to is the id of a <Counterparty> of the account, not ${said(a.to)}`);
  if (typeof a.amount !== "string" || !DECIMAL.test(a.amount)) throw new Error(`${at} amount is a decimal text ("4200.00"), not ${said(a.amount)}`);
  if (!one(a.rail, MONEY_RAILS)) throw new Error(`${at} rail is ${MONEY_RAILS.join(", ")}, not ${said(a.rail)}`);
  if (!one(a.every, MONEY_EVERY)) throw new Error(`${at} every is ${MONEY_EVERY.join(", ")}, not ${said(a.every)}`);
  const out = keep({} as MoneyRecurring, a, MONEY_RECURRING_FIELDS);
  if (a.day !== undefined) {
    const d = typeof a.day === "string" && /^\d{1,2}$/.test(a.day) ? Number(a.day) : a.day;
    const most = a.every === "week" ? 7 : 31;
    if (!(typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= most)) throw new Error(`${at} day is a whole number from 1 to ${most}, not ${said(a.day)}`);
    out.day = d;
  }
  if (typeof a.by !== "string" || !PRINCIPAL.test(a.by)) throw new Error(`${at} by is the principal whose grant makes each payment (person:<id> or agent:<id>), not ${said(a.by)}`);
  for (const k of ["starts", "ends"] as const) if (a[k] !== undefined && !(typeof a[k] === "string" && DAY.test(a[k] as string))) throw new Error(`${at} ${k} is a day (YYYY-MM-DD), not ${said(a[k])}`);
  if (a.starts === undefined) throw new Error(`${at} needs starts`);
  texts(a, at, ["memo"], 140);
  return out;
}

/** A money account as its tree declares it; throws with why it does not read. */
export function moneyAccountOf(t: DocTree): MoneyAccountDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.name, 120)) throw new Error(`<MoneyAccount> name is a short text (at most 120), not ${said(a.name)}`);
  const at = `<MoneyAccount name="${a.name}">`;
  if (!one(a.kind, MONEY_KINDS)) throw new Error(`${at} kind is ${MONEY_KINDS.join(", ")}, not ${said(a.kind)}`);
  if (a.last4 !== undefined && !(typeof a.last4 === "string" && /^\d{4}$/.test(a.last4))) throw new Error(`${at} last4 is the last four digits and no more, not ${said(a.last4)}`);
  if (a.currency !== undefined && !(typeof a.currency === "string" && /^[A-Z]{3}$/.test(a.currency))) throw new Error(`${at} currency is three capitals (ISO 4217), not ${said(a.currency)}`);
  for (const k of ["opened", "closed"] as const) if (a[k] !== undefined && !(typeof a[k] === "string" && DAY.test(a[k] as string))) throw new Error(`${at} ${k} is a day (YYYY-MM-DD), not ${said(a[k])}`);
  texts(a, at, ["institution", "ledger", "books", "statements", "holder"], 500);
  const out = keep({ name: a.name, kind: a.kind } as MoneyAccountDoc, a, MONEY_ACCOUNT_FIELDS);
  out.connections = t.children.filter((c) => c.tag === "Connection").map((c) => connectionOf(c.attrs as Record<string, unknown>));
  const connections = new Set(out.connections.map((c) => c.id));
  out.counterparties = t.children.filter((c) => c.tag === "Counterparty").map((c) => counterpartyOf(c, connections));
  const parties = new Set(out.counterparties.map((c) => c.id));
  out.recurring = t.children.filter((c) => c.tag === "Recurring").map((c) => recurringOf(c.attrs as Record<string, unknown>, parties));
  return out;
}

const attrsOf = (fields: readonly string[], r: object) => Object.fromEntries(fields.filter((k) => (r as Record<string, unknown>)[k] !== undefined).map((k) => [k, (r as Record<string, unknown>)[k]]));
const leaf = (tag: string, fields: readonly string[], r: object): DocTree => ({ tag, attrs: attrsOf(fields, r), children: [] });

export const moneyAccountVocabulary: Vocabulary<MoneyAccountDoc> = {
  format: "money",
  noun: "a money account",
  root: "MoneyAccount",
  tags: {
    MoneyAccount: { parents: [], required: ["name", "kind"], attrs: MONEY_ACCOUNT_FIELDS },
    Connection: { parents: ["MoneyAccount"], key: "id", required: ["id", "provider", "account"], attrs: MONEY_CONNECTION_FIELDS },
    Counterparty: { parents: ["MoneyAccount"], key: "id", required: ["id", "name"], attrs: MONEY_COUNTERPARTY_FIELDS },
    // An <At> is named by its counterparty and its connection: no key of its own is unique in the whole document.
    At: { parents: ["Counterparty"], required: ["connection", "recipient"], attrs: MONEY_AT_FIELDS },
    Recurring: { parents: ["MoneyAccount"], key: "id", required: ["id", "to", "amount", "rail", "every", "by", "starts"], attrs: MONEY_RECURRING_FIELDS },
  },
  fromTree: moneyAccountOf,
  toTree(d) {
    return {
      tag: "MoneyAccount",
      attrs: attrsOf(MONEY_ACCOUNT_FIELDS, d),
      children: [
        ...(d.connections ?? []).map((c) => leaf("Connection", MONEY_CONNECTION_FIELDS, c)),
        ...(d.counterparties ?? []).map((c) => ({ tag: "Counterparty", attrs: attrsOf(MONEY_COUNTERPARTY_FIELDS, c), children: (c.at ?? []).map((w) => leaf("At", MONEY_AT_FIELDS, w)) })),
        ...(d.recurring ?? []).map((r) => leaf("Recurring", MONEY_RECURRING_FIELDS, r)),
      ],
    };
  },
  empty: (name) => ({ name: name || "Account", kind: "checking", connections: [], counterparties: [], recurring: [] }),
};

registerVocabulary(moneyAccountVocabulary);

/** The vocabulary of a money account, by format. */
export const MONEY = { money: moneyAccountVocabulary } as const;
