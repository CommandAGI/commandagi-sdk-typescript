/**
 * A COMPANY'S LEGAL PROFILE, in JSX (docs/company-substrate.md § the legal profile): the facts a form asks for (a bank's
 * account opening, an ad platform's business verification, a grant's registration), so an agent fills one from the
 * company file alone. It adds the company's `website`, its addresses by purpose, its listings on exchanges, its classes
 * of stock and its beneficial owners; the rest of the profile is the company's other parts (`<Entity>`, `<Registration>`,
 * `<RegisteredAgent>`, `<Paper>`, `<Seat>`, `<BankAccount>`). A company names no mailbox and no phone line (mail and
 * phone lines are separate from companies): a form's contact email and phone are its responsible person's card, the
 * `holder` of an `<Owner>` or a `<Seat>`:
 *
 *   <Company name="Acme" website="https://acme.example/about">
 *     <Entity jurisdiction="US-DE" form="corporation" name="Acme Robotics, Inc." formed="2026-01-05" ids={{ ein: "12-3456789" }} />
 *     <Address kind="legal" line1="1 Main St" city="Austin" region="TX" postal="78701" country="US" />
 *     <Address kind="office" line1="2 Market St" city="San Francisco" region="CA" postal="94105" country="US" />
 *     <Listing venue="XNAS" symbol="ACME" since="2026-06-01" />
 *     <Stock kind="common" authorized={10000000} issued={8000000} reserved={2000000} par="0.00001" />
 *     <Owner name="Ada Founder" holder="people/ada-founder/" percent="100" since="2026-01-05" />
 *   </Company>
 *
 * An address's `kind` says what a form means by it: `legal` (the address on the formation documents and the tax-id
 * notice), `mailing` (where post reaches the company), `office` (where it works), or another word. `<Company
 * postalAddress>` stays the address its commercial mail carries. A stock class's `authorized` is what the charter
 * allows, `issued` what is outstanding, `reserved` what is set aside (an option pool); `par` is the par value, `none`
 * when the charter says no par. A listing is where the company's shares trade: `venue` the exchange's market identifier
 * code (ISO 10383: `XNAS`, `XNYS`; `OTC` for over the counter), `symbol` the ticker there, `since` the first day it traded
 * there. An owner is a beneficial owner: `percent` of the company it holds, `holder` the
 * person's folder or card, by ref. `source` on each says where the fact was read. The company document holds them as
 * `website`, `addresses`, `listings`, `stock` and `owners`, each absent when the file writes none.
 *
 * The profile holds identifiers (a tax id, a bank's last four digits): a company file that has one is private.
 */
import type { BusinessNode } from "./business.js";

export const Address = "Address";
export const Stock = "Stock";
export const Owner = "Owner";
export const Listing = "Listing";

/** The attributes this part adds to `<Company>`. */
export const PROFILE_COMPANY_PROPS = { website: "text" } as const;

/** The tags this part adds. */
export const PROFILE_TAGS = {
  Address: {
    props: { kind: "text", line1: "text", line2: "text", city: "text", region: "text", postal: "text", country: "text", source: "text" },
    required: ["kind", "line1", "country"],
  },
  Listing: { props: { venue: "text", symbol: "text", since: "text", source: "text" }, required: ["venue", "symbol"] },
  Stock: { props: { kind: "text", authorized: "amount", issued: "amount", reserved: "amount", par: "text", source: "text" }, required: ["kind", "authorized"] },
  Owner: { props: { name: "text", holder: "text", percent: "amount", since: "text", source: "text" }, required: ["name", "percent"] },
} as const;

/** The lists of `<Company>` they fill. */
export const PROFILE_LISTS = { addresses: "Address", listings: "Listing", stock: "Stock", owners: "Owner" } as const;

/** The company document's profile fields, each only when the file writes it. */
export function profileOf(node: BusinessNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(PROFILE_COMPANY_PROPS)) if (node.props[k] !== undefined) out[k] = node.props[k];
  for (const field of Object.keys(PROFILE_LISTS)) {
    const list = node.many[field] ?? [];
    if (list.length) out[field] = list.map((n) => ({ ...n.props }));
  }
  return out;
}
