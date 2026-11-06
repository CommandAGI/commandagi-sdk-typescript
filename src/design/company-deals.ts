/**
 * A COMPANY'S DEALS IN JSX — its sales pipeline, one `<Deal>` child of the `<Company>` for each deal, and the
 * `<Pipeline>` that says what each stage is worth as a chance (CommandAGI's docs/formats.md § companies, "deals"). The
 * same elements as the Python SDK's `company_deals.py` and the Rust SDK's `company_deals.rs`:
 *
 *   <Pipeline staleDays={30}>
 *     <DealStage id="lead" probability={0.1} />  <DealStage id="qualified" probability={0.25} />
 *     <DealStage id="proposal" probability={0.5} />  <DealStage id="negotiation" probability={0.75} />
 *   </Pipeline>
 *   <Deal id="acme-pilot" title="Pilot of ten units" counterparty="relationships/cards/acme.vcf" stage="proposal"
 *         value="120000" currency="USD" expected="2027-03-31" owner="ceo" since="2026-11-01"
 *         probability={0.3} probabilityReason="their budget is not approved" source="the call of 2026-10-30">
 *     <DealMove from="lead" to="proposal" at="2026-11-01T17:02:00Z" by="person:ada" />
 *   </Deal>
 *
 * `<Pipeline>` lists the open stages in order, each with its default win probability (0 to 1); `won` (1) and `lost`
 * (0) close every pipeline and are not listed. A company with no `<Pipeline>` has the stages `lead`, `qualified`,
 * `proposal` and `negotiation` at 0.1, 0.25, 0.5 and 0.75 (the app's defaults). `staleDays` is how many days a deal may
 * go with no change before the app calls it stale.
 *
 * `counterparty` names who the deal is with: a ref to a card (a `.vcf` of the company's people or relationships
 * folder) or the id of a row of `relationships/relationships.csv`. `stage` is one of the pipeline's stages, `won` or
 * `lost` (the app refuses another word). `value` is the deal's worth as the file states it (text or a number) in
 * `currency`; a deal with no value is one whose worth is unknown, never one worth nothing. `probability` overrides its
 * stage's, and `probabilityReason` says why (the app refuses one without the other). `expected` is the day it is
 * expected to close, `closed` the day it was won or lost, `owner` a role id of the team or a card ref, and `source`
 * says where the facts came from. Each `<DealMove>` is one recorded stage change: from, to, when (`at`, an ISO 8601
 * instant) and by whom (`by`, a principal). The company document gains `deals` and `pipeline` only when the file
 * writes them; every total, weight and rate is computed by the app and never written.
 */
import type { BusinessNode, TagSpec } from "./business.js";

export const Deal = "Deal";
export const DealMove = "DealMove";
export const Pipeline = "Pipeline";
export const DealStage = "DealStage";

/** The stages of a deal when the company declares no `<Pipeline>`, in the order a pipeline shows them. */
export const DEAL_STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

/** The tags' attributes and children, in business.ts's TagSpec shape. */
export const DEALS_TAGS: Readonly<Record<string, TagSpec>> = {
  Deal: {
    props: {
      id: "text", title: "text", counterparty: "text", stage: "text", value: "amount", currency: "text", expected: "text", closed: "text",
      owner: "text", since: "text", probability: "amount", probabilityReason: "text", source: "text", note: "text",
    },
    required: ["id", "title", "stage"],
    many: { moves: "DealMove" },
  },
  DealMove: { props: { from: "text", to: "text", at: "text", by: "text", note: "text" }, required: ["to", "at"] },
  Pipeline: { props: { staleDays: "amount" }, many: { stages: "DealStage" } },
  DealStage: { props: { id: "text", label: "text", probability: "amount" }, required: ["id", "probability"] },
};

/** The children of a `<Company>` these add, by the field each fills. */
export const COMPANY_DEALS_ONE = { pipeline: "Pipeline" } as const;
export const COMPANY_DEALS_MANY = { deals: "Deal" } as const;

/** What a `<Company>`'s deals add to the company document: `deals` and `pipeline`, only when the file writes them. */
export function dealsOf(node: BusinessNode): Record<string, unknown> {
  const list = node.many.deals ?? [], pipe = node.one.pipeline;
  const deal = (n: BusinessNode) => {
    const moves = n.many.moves ?? [];
    return { ...n.props, ...(moves.length ? { moves: moves.map((m) => ({ ...m.props })) } : {}) };
  };
  return {
    ...(pipe ? { pipeline: { ...pipe.props, stages: (pipe.many.stages ?? []).map((s) => ({ ...s.props })) } } : {}),
    ...(list.length ? { deals: list.map(deal) } : {}),
  };
}
