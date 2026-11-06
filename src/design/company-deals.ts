/**
 * A COMPANY'S DEALS IN JSX — its sales pipeline, one `<Deal>` child of the `<Company>` for each deal (CommandAGI's
 * docs/formats.md § companies, "deals"). The same element as the Python SDK's `company_deals.py` and the Rust SDK's
 * `company_deals.rs`:
 *
 *   <Deal id="acme-pilot" title="Pilot of ten units" counterparty="relationships/cards/acme.vcf" stage="proposal"
 *         value="120000" currency="USD" expected="2027-03-31" owner="ceo" since="2026-11-01"
 *         source="the call of 2026-10-30" note="ten units, a year of support" />
 *
 * `counterparty` names who the deal is with: a ref to a card (a `.vcf` of the company's people or relationships
 * folder) or the id of a row of `relationships/relationships.csv`. `stage` is `lead`, `qualified`, `proposal`,
 * `negotiation`, `won` or `lost` (the app refuses another word). `value` is the deal's worth as the file states it
 * (text or a number) in `currency`; a deal with no value is one whose worth is unknown, never one worth nothing.
 * `expected` is the day it is expected to close, `closed` the day it was won or lost, `owner` a role id of the team
 * or a card ref, and `source` says where the facts came from. The company document gains `deals` only when the file
 * writes one; every total is computed by the app and never written.
 */
import type { BusinessNode, TagSpec } from "./business.js";

export const Deal = "Deal";

/** The stages of a deal, in the order a pipeline shows them. */
export const DEAL_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

/** The tag's attributes, in business.ts's TagSpec shape. */
export const DEALS_TAGS: Readonly<Record<string, TagSpec>> = {
  Deal: {
    props: { id: "text", title: "text", counterparty: "text", stage: "text", value: "amount", currency: "text", expected: "text", closed: "text", owner: "text", since: "text", source: "text", note: "text" },
    required: ["id", "title", "stage"],
  },
};

/** The children of a `<Company>` this adds, by the field it fills. */
export const COMPANY_DEALS_MANY = { deals: "Deal" } as const;

/** What a `<Company>`'s deals add to the company document: `deals`, only when the file writes one. */
export function dealsOf(node: BusinessNode): Record<string, unknown> {
  const list = node.many.deals ?? [];
  return list.length ? { deals: list.map((n) => ({ ...n.props })) } : {};
}
