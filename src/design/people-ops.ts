/**
 * A COMPANY'S TEAM IN JSX — the people operations a `<Company>` declares in one `<Team>` (docs/formats.md § companies,
 * "people operations", in the CommandAGI repository):
 *
 *   <Company name="Northwind Survey" …>
 *     <People folder="Northwind Survey/people/" />
 *     <Team hiring="Northwind Survey/hiring/">
 *       <Role id="ceo" title="Managing member" />
 *       <Role id="pilot" title="Drone pilot" reportsTo="ceo" band="ic-2" headcount={2} kind="employee" />
 *       <Band id="ic-2" title="Individual contributor 2" currency="USD" per="year" min="80000" mid="95000" max="110000" />
 *       <Benefit id="health" kind="health" name="Health plan" provider="Kaiser" renews="2027-01-01" waitingDays={30} />
 *       <Checklist id="onboarding" when="start" steps={["Sign the offer", "Collect the forms"]} />
 *     </Team>
 *   </Company>
 *
 * The team holds what the company decides: the roles and reporting lines (the org chart), the bands, the benefit
 * plans, the checklists, and where hiring keeps its files. The payroll provider is the company's finance
 * (`<Payroll>`, `business-finance.ts`): a payroll run the team records posts to its ledger.
 * The people stay vCards with engagement files, the payroll runs stay journal transactions, the grants stay Open Cap
 * Table Format: the team only names them. No element takes a tax id, a bank number or a date of birth.
 */
import type { BusinessNode, TagSpec } from "./business.js";

export const Team = "Team";
export const Role = "Role";
export const Band = "Band";
export const Benefit = "Benefit";
export const Checklist = "Checklist";

/** The team's tags, as the company vocabulary reads them (`business.ts` `BUSINESS_TAGS`). */
export const PEOPLE_OPS_TAGS: Readonly<Record<string, TagSpec>> = {
  Team: {
    props: { hiring: "text", offerLetter: "text" },
    many: { roles: "Role", bands: "Band", benefits: "Benefit", checklists: "Checklist" },
  },
  Role: { props: { id: "text", title: "text", department: "text", reportsTo: "text", band: "text", headcount: "amount", kind: "text" }, required: ["id", "title"] },
  Band: { props: { id: "text", title: "text", level: "text", currency: "text", per: "text", min: "amount", mid: "amount", max: "amount" }, required: ["id", "currency", "per", "min", "max"] },
  Benefit: {
    props: { id: "text", kind: "text", name: "text", provider: "text", policy: "text", starts: "text", renews: "text", file: "text", eligible: "texts", waitingDays: "amount", employerShare: "amount" },
    required: ["kind"],
  },
  Checklist: { props: { id: "text", title: "text", when: "text", kinds: "texts", steps: "texts" }, required: ["id", "when", "steps"] },
};

/** A company's `team` from its `<Team>`: each list in the file's order. */
export function teamOf(node: BusinessNode): Record<string, unknown> {
  const p = node.props, list = (f: string) => node.many[f]!.map((n) => ({ ...n.props }));
  return {
    hiring: p.hiring ?? null,
    ...(p.offerLetter !== undefined ? { offerLetter: p.offerLetter } : {}),
    roles: list("roles"),
    bands: list("bands"),
    benefits: list("benefits"),
    checklists: list("checklists"),
  };
}
