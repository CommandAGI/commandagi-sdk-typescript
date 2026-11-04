/**
 * A COMPANY'S FINANCE IN JSX — the elements `business.ts` reads inside a `<Company>` (CommandAGI docs/formats.md §
 * companies, "finance"; docs/company-substrate.md § finance operations):
 *
 *   <Company name="Northwind Survey" files={["Northwind Survey/"]}>
 *     <Books journal="Northwind Survey/books/main.journal" />
 *     <Budget journal="Northwind Survey/books/budget.journal" />
 *     <BankAccount name="Operating" provider="First Bank" last4="4321" currency="USD" ledger="Assets:Cash:Operating"
 *                  kind="checking" statements="Northwind Survey/bank/operating/" />
 *     <Payroll provider="Gusto" ledger="Expenses:Payroll" register="Northwind Survey/payroll/" schedule="semimonthly" />
 *     <DataRoom name="Seed round" expires="2026-12-31">
 *       <Include document="Northwind Survey/Documents/Certificate of formation.pdf" section="corporate" />
 *     </DataRoom>
 *   </Company>
 *
 * Each element only REFS files: the budget is an hledger journal of periodic transactions, a bank account is an
 * account of the books (`ledger`) and a folder of statements, payroll is an account and a folder of the provider's
 * registers, and a data room names the documents a share of it reaches. A bank account holds at most the last four
 * digits of its number, never the number. The reader gives the company's `finance` (absent when it names none of these).
 */
import type { BusinessNode, TagSpec } from "./business.js";

export const Budget = "Budget";
export const BankAccount = "BankAccount";
export const Payroll = "Payroll";
export const DataRoom = "DataRoom";
export const Include = "Include";

/** The finance tags. */
export const FINANCE_TAGS: Readonly<Record<string, TagSpec>> = {
  Budget: { props: { journal: "text" }, required: ["journal"] },
  BankAccount: {
    props: { name: "text", provider: "text", last4: "text", currency: "text", ledger: "text", kind: "text", statements: "text", opened: "text", closed: "text" },
    required: ["name"],
  },
  Payroll: { props: { provider: "text", ledger: "text", register: "text", schedule: "text", jurisdiction: "text" }, required: ["provider"] },
  DataRoom: { props: { name: "text", about: "text", expires: "text" }, required: ["name"], many: { include: "Include" } },
  Include: { props: { document: "text", section: "text" }, required: ["document"] },
};

/** The children a `<Company>` takes for its finance, by the field each fills. */
export const COMPANY_FINANCE_ONE = { budget: "Budget" } as const;
export const COMPANY_FINANCE_MANY = { bankAccounts: "BankAccount", payroll: "Payroll", dataRooms: "DataRoom" } as const;

/** A company's `finance` from its `<Company>` node, or null when it names none of it. */
export function financeOf(node: BusinessNode): Record<string, unknown> | null {
  const rows = (f: string) => (node.many[f] ?? []).map((n) => ({ ...n.props }));
  const budget = (node.one.budget?.props.journal as string | undefined) ?? null;
  const bankAccounts = rows("bankAccounts"), payroll = rows("payroll");
  const dataRooms = (node.many.dataRooms ?? []).map((n) => ({ ...n.props, include: (n.many.include ?? []).map((i) => ({ ...i.props })) }));
  if (!budget && !bankAccounts.length && !payroll.length && !dataRooms.length) return null;
  return { budget, bankAccounts, payroll, dataRooms };
}
