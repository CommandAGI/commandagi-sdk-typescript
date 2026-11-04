// A company's <Team> read as the company document's `team`: roles, bands, payroll, benefits and checklists, each in
// the file's order, with each element's __source by path; an unknown attribute or a misplaced element is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { Band, Benefit, Checklist, Company, People, Role, Team, declarationOf, jsx } from "./index.js";

const declared = (tree: unknown) => declarationOf({ default: () => tree }).document!;

test("a <Team> is the company's team; a company without one has no team key", () => {
  const tree = jsx(Company, {
    __source: 0,
    name: "Northwind",
    children: [
      jsx(People, { __source: 1, folder: "Northwind/people/" }),
      jsx(Team, {
        __source: 2,
        hiring: "Northwind/hiring/",
        children: [
          jsx(Role, { __source: 3, id: "ceo", title: "Managing member" }),
          jsx(Role, { __source: 4, id: "pilot", title: "Drone pilot", reportsTo: "ceo", band: "ic-2", headcount: 2, kind: "employee" }),
          jsx(Band, { __source: 5, id: "ic-2", currency: "USD", per: "year", min: "80000", max: "110000" }),
          jsx(Benefit, { __source: 7, id: "health", kind: "health", eligible: ["employee"], waitingDays: 30 }),
          jsx(Checklist, { __source: 8, id: "onboarding", when: "start", steps: ["Sign the offer"] }),
        ],
      }),
    ],
  });
  const d = declared(tree);
  assert.deepEqual((d.document as Record<string, unknown>).team, {
    hiring: "Northwind/hiring/",
    roles: [{ id: "ceo", title: "Managing member" }, { id: "pilot", title: "Drone pilot", reportsTo: "ceo", band: "ic-2", headcount: 2, kind: "employee" }],
    bands: [{ id: "ic-2", currency: "USD", per: "year", min: "80000", max: "110000" }],
    benefits: [{ id: "health", kind: "health", eligible: ["employee"], waitingDays: 30 }],
    checklists: [{ id: "onboarding", when: "start", steps: ["Sign the offer"] }],
  });
  assert.equal(d.sources["team/roles/1"], 4);
  assert.equal(d.sources["team/checklists/0"], 8);
  assert.equal("team" in (declared(jsx(Company, { name: "N" })).document as Record<string, unknown>), false);
});

test("a team refuses what it does not say, by name", () => {
  const company = (...children: unknown[]) => jsx(Company, { name: "N", children: [jsx(Team, { children })] });
  assert.throws(() => declared(company(jsx(Role, { id: "x", title: "X", ssn: "123-45-6789" }))), /<Role> has no attribute ssn/);
  assert.throws(() => declared(company(jsx(Role, { title: "X" }))), /<Role> needs id/);
  assert.throws(() => declared(company(jsx(Team, {}))), /<Team> does not take <Team>/);
  assert.throws(() => declared(jsx(Company, { name: "N", children: [jsx(Role, { id: "x", title: "X" })] })), /<Company> does not take <Role>/);
});
