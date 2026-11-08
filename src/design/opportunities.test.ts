// An opportunity and an experiment in JSX. Pinned here: a listing with its contact, action, evidence, move and approved
// draft, and an experiment with its arms, objectives and decision, both ways; each refusal by name. The Python SDK's
// tests/test_opportunities.py and the Rust SDK's tests/opportunities.rs declare the same examples.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, OPPORTUNITIES, stagesOf } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const LISTING = {
  title: "CommandAGI's agent on Agentverse",
  kind: "listing",
  stage: "submitted",
  status: "waiting",
  source: "https://agentverse.ai",
  deadline: "2026-12-01",
  value: "0",
  currency: "USD",
  eligibility: "eligible",
  owner: "agent:market-manager",
  channel: "agentverse",
  contacts: [{ ref: "../relationships/cards/fetch-ai.vcf", role: "marketplace" }],
  actions: [{ id: "check-listing", title: "Read the listing back", due: "2026-11-10", owner: "agent:market-manager" }],
  evidence: [{ id: "api", fact: "Agentverse registers agents through its API", source: "https://docs.agentverse.ai", way: "read the page", by: "agent:claude-code", at: "2026-11-08T10:00:00Z" }],
  moves: [
    { from: "draft", to: "approved", at: "2026-11-08T11:00:00Z", by: "person:jacob-valdez" },
    { from: "approved", to: "submitted", at: "2026-11-08T12:00:00Z", by: "agent:market-manager" },
  ],
  drafts: [{ id: "listing", channel: "agentverse", subject: "CommandAGI", body: "Plans, simulates and runs robots.", approvedBy: "person:jacob-valdez", approvedAt: "2026-11-08T11:00:00Z" }],
};
const EXPERIMENT = {
  title: "Which first line keeps a reader",
  hypothesis: "A concrete number beats a question",
  status: "decided",
  channel: "linkedin",
  arms: [{ id: "number", file: "hooks/number.txt" }, { id: "question", file: "hooks/question.txt" }],
  objectives: [
    { id: "read", kind: "quality", metric: "read-through", direction: "up" },
    { id: "reach", kind: "distribution", metric: "impressions", direction: "up" },
  ],
  decision: { arm: "number", at: "2026-11-20T09:00:00Z", by: "agent:optimizer", reason: "read-through 41% against 22%, reach equal" },
};

const tree = (tag: string, d: Record<string, unknown>, kids: [string, string][]) =>
  el(tag, Object.fromEntries(Object.entries(d).filter(([k]) => !kids.some(([, f]) => f === k))), ...kids.flatMap(([t, f]) => [d[f]].flat().filter(Boolean).map((r) => el(t, r as Record<string, unknown>))));
const OPP_KIDS: [string, string][] = [["contact", "contacts"], ["action", "actions"], ["evidence", "evidence"], ["move", "moves"], ["draft", "drafts"]];
const EXP_KIDS: [string, string][] = [["arm", "arms"], ["objective", "objectives"], ["decision", "decision"]];

test("an opportunity and an experiment in JSX are their documents, both ways, each child's __source by its key", () => {
  const file = el("opportunity", { title: "x", kind: "collaborator", stage: "found", __source: 0 }, el("contact", { ref: "people/ada.vcf", __source: 1 }), el("move", { to: "found", at: "2026-11-08T10:00:00Z", by: "person:ada", __source: 2 }));
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {});
  assert.equal(document!.format, "opportunity");
  assert.deepEqual(document!.sources, { "": 0, "contact#people/ada.vcf": 1, "move#2026-11-08T10:00:00Z": 2 });
  const listing = declarationOf({ default: tree("opportunity", LISTING, OPP_KIDS) });
  assert.deepEqual(listing.document!.document, LISTING);
  const exp = declarationOf({ default: tree("experiment", EXPERIMENT, EXP_KIDS) });
  assert.equal(exp.document!.format, "experiment");
  assert.deepEqual(exp.document!.document, EXPERIMENT);
  assert.deepEqual(OPPORTUNITIES.opportunity.fromTree(OPPORTUNITIES.opportunity.toTree(LISTING as never)), LISTING, "both ways");
  assert.deepEqual(OPPORTUNITIES.experiment.fromTree(OPPORTUNITIES.experiment.toTree(EXPERIMENT as never)), EXPERIMENT, "both ways");
  assert.deepEqual(stagesOf("listing"), ["draft", "approved", "submitted", "live", "withdrawn", "refused"]);
});

test("an opportunity or an experiment that does not read is refused with why", () => {
  const opp = (attrs: Record<string, unknown>, ...kids: [string, Record<string, unknown>][]) => () => declarationOf({ default: el("opportunity", attrs, ...kids.map(([t, a]) => el(t, a))) });
  const base = { title: "x", kind: "collaborator", stage: "found" };
  assert.throws(opp({ ...base, kind: "application" }), /an application is its folder of applications\//);
  assert.throws(opp({ ...base, kind: "client" }), /a client is a <Deal> of its company/);
  assert.throws(opp({ ...base, stage: "won" }), /stage is a stage of a collaborator \(found, contacted, talking, working, ended, dropped\)/);
  assert.throws(opp({ ...base, stage: "ended", status: "open" }), /is ended, which closes it: its status is closed/);
  assert.throws(opp({ ...base, status: "closed" }), /is closed, so its stage is one that closes a collaborator/);
  assert.throws(opp({ ...base, value: "100" }), /value needs its currency/);
  assert.throws(opp({ ...base, value: "-1", currency: "USD" }), /value is a decimal amount/);
  assert.throws(opp({ ...base, currency: "USD" }), /names a currency and no value/);
  assert.throws(opp({ ...base, owner: "jacob" }), /owner is a principal/);
  assert.throws(opp({ ...base, deadline: "next week" }), /deadline is an ISO 8601 day/);
  assert.throws(opp({ ...base, eligibility: "maybe" }), /eligibility is eligible, eligible-with-partner, not-eligible, unknown/);
  assert.throws(opp(base, ["move", { from: "found", to: "talking", at: "2026-11-08T10:00:00Z", by: "person:ada" }]), /is found, but its last <move> \(2026-11-08T10:00:00Z\) went to talking/);
  assert.throws(opp(base, ["move", { to: "found", at: "2026-11-08T10:00:00Z", by: "ada" }]), /by is the principal who moved it/);
  assert.throws(opp(base, ["evidence", { id: "e", fact: "f" }]), /names where the fact was read: a ref \(a file\) or a source/);
  assert.throws(opp(base, ["draft", { id: "d", body: "b", approvedBy: "person:ada" }]), /approvedBy and approvedAt come together/);
  assert.throws(opp(base, ["action", { id: "a", title: "t", decision: "yes" }]), /decision is true when only its owner can decide it/);
  assert.throws(opp({ title: "x", kind: "listing", stage: "live" }, ["draft", { id: "d", body: "b" }]), /is live: a listing is public only after a principal approved its <draft>/);
  assert.throws(opp({ ...base, handle: "CommandAGI" }), /names a handle and no channel/);
  assert.throws(opp({ ...base, colour: "red" }), /colour/);

  const exp = (attrs: Record<string, unknown>, ...kids: [string, Record<string, unknown>][]) => () => declarationOf({ default: el("experiment", attrs, ...kids.map(([t, a]) => el(t, a))) });
  const reach: [string, Record<string, unknown>] = ["objective", { id: "r", kind: "distribution", metric: "impressions", direction: "up" }];
  assert.throws(exp({ title: "x" }, reach), /measures only distribution: name a quality or an impact objective too/);
  assert.throws(exp({ title: "x" }, ["objective", { id: "q", kind: "virality", metric: "m", direction: "up" }]), /kind is quality, distribution, impact/);
  assert.throws(exp({ title: "x", status: "decided" }, ["arm", { id: "a" }]), /is decided: its <decision> says which arm/);
  assert.throws(exp({ title: "x", status: "decided" }, ["arm", { id: "a" }], ["decision", { arm: "b", at: "2026-11-08T10:00:00Z", by: "agent:o", reason: "r" }]), /<decision> arm is one of its arms \(a\)/);
  assert.throws(exp({ title: "x", status: "running" }, ["arm", { id: "a" }], ["decision", { arm: "a", at: "2026-11-08T10:00:00Z", by: "agent:o", reason: "r" }]), /has a <decision>, so its status is decided/);
});
