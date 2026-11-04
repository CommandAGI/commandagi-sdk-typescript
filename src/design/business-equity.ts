/**
 * A COMPANY'S PRICED ROUND, PRO FORMA, IN JSX — the rounds a `<Company>` models before they close (docs/formats.md
 * § companies, "a round, pro forma"; docs/company-substrate.md § equity instruments):
 *
 *   <Company name="Kite Works">
 *     <CapTable ocf="Kite Works/captable/" />
 *     <Round name="Series A" date="2027-03-01" preMoney="20000000" currency="USD" poolTarget="0.10" stockClass="Series A Preferred">
 *       <Investment stakeholder="Lead Fund" amount="5000000" />
 *       <Investment stakeholder="Ada Lovelace" amount="250000" />
 *     </Round>
 *   </Company>
 *
 * A round is a model, not a record: the cap table (an Open Cap Table Format folder) holds what happened, and the company
 * app computes from it and the round the price, each SAFE's and note's conversion and every holder's part after the
 * round. `date` is the day it is to close; `raise` the new money (its investments add up to it, or it is one line);
 * `poolTarget` the unissued pool's part of the fully diluted total after the round (0.10 for 10%), or `poolTopUp` the
 * shares the pool grows by; `pricePlaces` the decimals the price is rounded down to (4 when absent). An investment's
 * `stakeholder` is a stakeholder's name or id, or a new investor's name; its `instrument` the class it buys, when not
 * the round's.
 */
import type { BusinessNode } from "./business.js";

export const Round = "Round";
export const Investment = "Investment";

/** The tags (the vocabulary of `business.ts`, which takes them in). */
export const EQUITY_TAGS = {
  Round: {
    props: { name: "text", date: "text", preMoney: "amount", raise: "amount", currency: "text", poolTarget: "amount", poolTopUp: "amount", pricePlaces: "amount", stockClass: "text" },
    required: ["name", "preMoney"],
    many: { investments: "Investment" },
  },
  Investment: { props: { stakeholder: "text", amount: "amount", instrument: "text" }, required: ["stakeholder", "amount"] },
} as const;

/** The company document's `rounds`: each round's attributes and its investments, in the order written. */
export function roundsOf(node: BusinessNode): Record<string, unknown>[] {
  return (node.many.rounds ?? []).map((r) => ({ ...r.props, investments: (r.many.investments ?? []).map((i) => ({ ...i.props })) }));
}
