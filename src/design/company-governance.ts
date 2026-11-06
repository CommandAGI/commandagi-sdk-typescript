/**
 * A COMPANY'S GOVERNANCE, COMPLIANCE, IP AND INSURANCE IN JSX — the children of a `<Company>` that hold them
 * (CommandAGI's docs/company-substrate.md § governance, compliance, IP and insurance). The same elements as the Python
 * SDK's `company_governance.py` and the Rust SDK's `company_governance.rs`:
 *
 *   <Seat body="board" title="director" holder="Northwind/people/Lin Chen.vcf" start="2024-01-31" end="2027-01-31"
 *         appointedBy="Northwind/Documents/Organizational consent.pdf" />
 *   <Compliance industries={["naics:541370"]} horizon="18 months" />
 *   <Obligation id="soc2-report" name="SOC 2 report to customers" due="2026-09-30" every="year" />
 *   <Evidence obligation="US-DE:de-llc-lp-annual-tax" due="2026-06-01" done="2026-05-20" file="Northwind/filings/2026 DE tax.pdf" />
 *   <IpAsset kind="trademark" stage="registered" title="NORTHWIND" jurisdiction="US" number="7123456"
 *            filed="2024-03-01" registered="2025-02-11" owner="Northwind Survey LLC" file="Northwind/ip/7123456.pdf" />
 *   <IpAsset kind="copyright" stage="unregistered" title="the firmware" owner={{ unknown: "the files disagree" }}
 *            claimants={["CommandAGI Inc.", "Exocortex Labs"]} />                      two claimants: a disputed owner
 *   <Assignment person="Northwind/people/Lin Chen.vcf" signed="2024-02-01" file="Northwind/ip/Lin Chen PIIA.pdf" />
 *   <Policy kind="aviation" carrier="Skyward Mutual" number="AV-778812" start="2025-07-01" end="2026-07-01"
 *           limit={1000000} currency="USD" file="Northwind/legal/aviation-policy.pdf" />
 *
 * A vote is a `<Vote holder choice signed evidence>` child of the `<Paper>` (a board or stockholder consent, a
 * resolution, minutes) that records it; the paper says its `body`, `threshold` and, at a meeting, `quorum`.
 *
 * The company document gains `governance`, `compliance`, `ip` and `insurance` only when the file writes one of their
 * elements. Every document stays its own file and is named by a ref; tallies and statuses are computed by the app.
 */
import type { BusinessNode } from "./business.js";

export const Seat = "Seat";
export const Compliance = "Compliance";
export const Obligation = "Obligation";
export const Evidence = "Evidence";
export const IpAsset = "IpAsset";
export const Assignment = "Assignment";
export const Policy = "Policy";
export const Vote = "Vote";

/** The tags' attributes, in business.ts's TagSpec shape. */
export const GOVERNANCE_TAGS = {
  Seat: { props: { body: "text", title: "text", holder: "text", start: "text", end: "text", appointedBy: "text" }, required: ["body", "title", "holder"] },
  Compliance: { props: { industries: "texts", horizon: "text" } },
  Obligation: { props: { id: "text", name: "text", authority: "text", url: "text", due: "text", every: "text", note: "text" }, required: ["id", "name", "due"] },
  Evidence: { props: { obligation: "text", due: "text", done: "text", file: "text", note: "text" }, required: ["obligation", "due"] },
  IpAsset: {
    props: { kind: "text", stage: "text", title: "text", jurisdiction: "text", number: "text", filed: "text", registered: "text", expires: "text", owner: "text", claimants: "texts", classes: "texts", file: "text" },
    required: ["kind", "title"],
  },
  Assignment: { props: { person: "text", signed: "text", file: "text" }, required: ["person"] },
  Policy: {
    props: { kind: "text", carrier: "text", number: "text", start: "text", end: "text", limit: "amount", currency: "text", broker: "text", file: "text" },
    required: ["kind", "carrier", "start", "end"],
  },
  Vote: { props: { holder: "text", choice: "text", signed: "text", evidence: "text" }, required: ["holder", "choice"] },
} as const;

/** The children of a `<Company>` these add, by the field each fills. */
export const COMPANY_GOVERNANCE_ONE = { compliance: "Compliance" } as const;
export const COMPANY_GOVERNANCE_MANY = { seats: "Seat", obligations: "Obligation", evidence: "Evidence", ipAssets: "IpAsset", assignments: "Assignment", policies: "Policy" } as const;
/** What a `<Paper>` takes for a vote on it: its body, its rule, and its votes. */
export const PAPER_VOTE_PROPS = { body: "text", threshold: "text", quorum: "text" } as const;

const propsOf = (n: BusinessNode) => ({ ...n.props });

/** What a `<Company>`'s governance children add to the company document: only the parts the file writes. */
export function governanceOf(node: BusinessNode): Record<string, unknown> {
  const many = (f: string) => node.many[f] ?? [];
  const out: Record<string, unknown> = {};
  if (many("seats").length) out.governance = { seats: many("seats").map(propsOf) };
  if (node.one.compliance || many("obligations").length || many("evidence").length)
    out.compliance = {
      industries: (node.one.compliance?.props.industries as string[] | undefined) ?? [],
      ...(node.one.compliance?.props.horizon !== undefined ? { horizon: node.one.compliance.props.horizon } : {}),
      obligations: many("obligations").map(propsOf),
      evidence: many("evidence").map(propsOf),
    };
  if (many("ipAssets").length || many("assignments").length) out.ip = { assets: many("ipAssets").map(propsOf), assignments: many("assignments").map(propsOf) };
  if (many("policies").length) out.insurance = { policies: many("policies").map(propsOf) };
  return out;
}

/** A paper's votes, when it records any. */
export const votesOf = (paper: BusinessNode): Record<string, unknown> => ((paper.many.votes ?? []).length ? { votes: paper.many.votes!.map(propsOf) } : {});
