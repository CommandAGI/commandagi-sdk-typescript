/**
 * A COMPANY'S FORMATION PARTS, in JSX (docs/company-substrate.md § formation and filings): its registered agent in each
 * place (`<RegisteredAgent>`, a child of `<Company>`), what a `<Paper kind="filing">` says about the filing it is, and
 * the day its dissolution was authorized (`<Entity dissolved>`):
 *
 *   <Company name="Acme">
 *     <Entity jurisdiction="US-DE" form="corporation" formed="2026-01-05" operatesIn={["US-CA"]} />
 *     <RegisteredAgent jurisdiction="US-DE" name="Agent Co." address="1 Main St, Dover, DE 19901" since="2026-01-05" />
 *     <Paper kind="filing" title="Certificate of Incorporation" file="Acme/legal/filings/US-DE Certificate of Incorporation.md"
 *            jurisdiction="US-DE" rule="de-certificate-of-incorporation" status="accepted"
 *            submitted="2026-01-04" accepted="2026-01-05" confirmation="7654321" />
 *   </Company>
 *
 * A filing's `rule` names the jurisdiction catalog's filing it follows, `period` the year an annual filing reports,
 * `due` its day. Its status goes `draft` → `submitted` (a person submitted it, on `submitted`) → `accepted` or
 * `rejected`. An agent drafts and never submits. The company document holds the agents as `registeredAgents`, absent
 * when the file writes none (a `<RegisteredAgent>` is a child of `<Company>`, not of `<Entity>`: Rust's `entity()` is
 * a leaf, and a constructor that took children would break every Rust company file).
 */
import type { BusinessNode } from "./business.js";

export const RegisteredAgent = "RegisteredAgent";

/** The tags this part adds. */
export const FORMATION_TAGS = {
  RegisteredAgent: { props: { jurisdiction: "text", name: "text", address: "text", since: "text" }, required: ["jurisdiction", "name"] },
} as const;
/** The lists of `<Company>` they fill. */
export const FORMATION_LISTS = { registeredAgents: "RegisteredAgent" } as const;
/** What a `<Paper kind="filing">` says beside every paper's attributes. */
export const FILING_PAPER_PROPS = { rule: "text", period: "text", due: "text", submitted: "text", accepted: "text", confirmation: "text" } as const;

/** The company document's `registeredAgents`, only when the file writes one. */
export function formationOf(node: BusinessNode): Record<string, unknown> {
  const list = node.many.registeredAgents ?? [];
  return list.length ? { registeredAgents: list.map((n) => ({ ...n.props })) } : {};
}
