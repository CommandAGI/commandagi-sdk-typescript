/**
 * AN OPPORTUNITY AND AN EXPERIMENT IN JSX — `<name>.opportunity.tsx` (or `.jsx`, `.py`, `.rs`) declares one opportunity
 * of the market manager: a collaborator, a partnership or a listing on a marketplace (docs/market-manager.md, in the
 * CommandAGI repository). An application is its folder of `applications/` and a client is a company's `<Deal>`: those
 * kinds keep the home they have, and the market manager reads all of them as one shape.
 *
 *   // market/Agentverse listing.opportunity.tsx
 *   export default () => (
 *     <opportunity title="CommandAGI's agent on Agentverse" kind="listing" stage="draft" channel="agentverse"
 *                  source="https://agentverse.ai" owner="agent:market-manager" eligibility="eligible">
 *       <contact ref="../relationships/cards/fetch-ai.vcf" role="marketplace" />
 *       <action id="approve" title="Approve the listing's text" owner="person:jacob-valdez" decision />
 *       <draft id="listing" channel="agentverse" subject="CommandAGI" body="Plans, simulates and runs robots." />
 *       <evidence id="api" fact="Agentverse registers agents through its API" source="https://docs.agentverse.ai"
 *                 way="read the page" by="agent:claude-code" at="2026-11-08T10:00:00Z" />
 *     </opportunity>
 *   );
 *
 *   // market/Hook test.experiment.tsx
 *   export default () => (
 *     <experiment title="Which first line keeps a reader" hypothesis="A concrete number beats a question" status="running">
 *       <arm id="number" file="hooks/number.txt" />
 *       <arm id="question" file="hooks/question.txt" />
 *       <objective id="read" kind="quality" metric="read-through" direction="up" />
 *       <objective id="reach" kind="distribution" metric="impressions" direction="up" />
 *     </experiment>
 *   );
 *
 * A stage is one of its kind's (`OPPORTUNITY_STAGES`: the open stages in order, then the closed ones). Each stage change
 * is a `<move from to at by>`; the last move names the stage the opportunity is in. A `<draft>` is all that exists of
 * a message, a post or a listing until a principal approves it (`approvedBy`, `approvedAt`): a listing is never
 * `submitted` or `live` without an approved draft. An experiment's objectives are kept apart by kind (quality,
 * distribution, impact): reach alone is never an objective. The Python SDK's `opportunities.py` and the Rust SDK's
 * `opportunities.rs` declare the same documents.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** An opportunity's file: `<name>.opportunity.tsx` (or `.jsx`, `.py`, `.rs`). */
export const OPPORTUNITY_FILE = /\.opportunity\.(?:[jt]sx|py|rs)$/i;
/** An experiment's file: `<name>.experiment.tsx` (or `.jsx`, `.py`, `.rs`). */
export const EXPERIMENT_FILE = /\.experiment\.(?:[jt]sx|py|rs)$/i;

/** The kinds a `.opportunity.tsx` declares. `application` (a folder of applications/) and `client` (a `<Deal>`) are read from their own homes. */
export const OPPORTUNITY_KINDS = ["collaborator", "partnership", "listing"] as const;
/** Each kind's workflow: its open stages in order, then the stages that close it. */
export const OPPORTUNITY_STAGES = {
  collaborator: { open: ["found", "contacted", "talking", "working"], closed: ["ended", "dropped"] },
  partnership: { open: ["found", "contacted", "negotiating", "active"], closed: ["ended", "declined", "dropped"] },
  listing: { open: ["draft", "approved", "submitted", "live"], closed: ["withdrawn", "refused"] },
} as const;
/** A listing's stages that are public acts: each needs an approved `<draft>`. */
export const PUBLIC_STAGES = ["submitted", "live"] as const;
export const OPPORTUNITY_STATUSES = ["open", "waiting", "blocked", "closed"] as const;
export const ELIGIBILITIES = ["eligible", "eligible-with-partner", "not-eligible", "unknown"] as const;
export const OPPORTUNITY_FIELDS = ["title", "kind", "stage", "status", "source", "deadline", "value", "currency", "eligibility", "folder", "owner", "counterparty", "channel", "handle", "about"] as const;
export const OPPORTUNITY_CONTACT_FIELDS = ["ref", "role", "note"] as const;
export const OPPORTUNITY_ACTION_FIELDS = ["id", "title", "due", "owner", "decision", "done"] as const;
export const OPPORTUNITY_EVIDENCE_FIELDS = ["id", "fact", "ref", "source", "way", "by", "at"] as const;
export const OPPORTUNITY_MOVE_FIELDS = ["from", "to", "at", "by", "note"] as const;
export const OPPORTUNITY_DRAFT_FIELDS = ["id", "channel", "to", "subject", "body", "approvedBy", "approvedAt"] as const;

export const EXPERIMENT_STATUSES = ["draft", "running", "decided", "stopped"] as const;
export const OBJECTIVE_KINDS = ["quality", "distribution", "impact"] as const;
export const EXPERIMENT_FIELDS = ["title", "hypothesis", "status", "opportunity", "channel", "started", "ended"] as const;
export const EXPERIMENT_ARM_FIELDS = ["id", "file", "note"] as const;
export const EXPERIMENT_OBJECTIVE_FIELDS = ["id", "kind", "metric", "direction", "note"] as const;
export const EXPERIMENT_DECISION_FIELDS = ["arm", "at", "by", "reason"] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];
export interface OpportunityContact { ref: string; role?: string; note?: string }
export interface OpportunityAction { id: string; title: string; due?: string; owner?: string; decision?: boolean; done?: string }
export interface OpportunityEvidence { id: string; fact: string; ref?: string; source?: string; way?: string; by?: string; at?: string }
export interface OpportunityMove { from?: string; to: string; at: string; by: string; note?: string }
export interface OpportunityDraft { id: string; channel?: string; to?: string; subject?: string; body: string; approvedBy?: string; approvedAt?: string }
export interface OpportunityDoc {
  title: string;
  kind: OpportunityKind;
  stage: string;
  status?: (typeof OPPORTUNITY_STATUSES)[number];
  source?: string;
  deadline?: string;
  value?: string;
  currency?: string;
  eligibility?: (typeof ELIGIBILITIES)[number];
  folder?: string;
  owner?: string;
  counterparty?: string;
  channel?: string;
  /** The listing's name on its channel: a GitHub org or owner/repo, an Agentverse agent's address, a site's domain. */
  handle?: string;
  about?: string;
  contacts: OpportunityContact[];
  actions: OpportunityAction[];
  evidence: OpportunityEvidence[];
  moves: OpportunityMove[];
  drafts: OpportunityDraft[];
}
export interface ExperimentArm { id: string; file?: string; note?: string }
export interface ExperimentObjective { id: string; kind: (typeof OBJECTIVE_KINDS)[number]; metric: string; direction: "up" | "down"; note?: string }
export interface ExperimentDecision { arm: string; at: string; by: string; reason: string }
export interface ExperimentDoc {
  title: string;
  hypothesis?: string;
  status?: (typeof EXPERIMENT_STATUSES)[number];
  opportunity?: string;
  channel?: string;
  started?: string;
  ended?: string;
  arms: ExperimentArm[];
  objectives: ExperimentObjective[];
  decision?: ExperimentDecision;
}

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
/** A principal as the authority records name one (docs/devices.md § standing grants); `role:` names a seat of the company's roles. */
const PRINCIPAL = /^(?:person|agent|org|role):[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const CURRENCY = /^[A-Z]{3}$/;
const day = (v: unknown): v is string => typeof v === "string" && (DAY.test(v) || INSTANT.test(v)) && !Number.isNaN(Date.parse(v));
const instant = (v: unknown): v is string => typeof v === "string" && INSTANT.test(v) && !Number.isNaN(Date.parse(v));
const principal = (v: unknown): v is string => typeof v === "string" && PRINCIPAL.test(v);
const id = (v: unknown): v is string => typeof v === "string" && ID.test(v);

function keep<T extends object>(out: T, attrs: Record<string, unknown>, fields: readonly string[]): T {
  for (const k of fields) if (attrs[k] !== undefined && (out as Record<string, unknown>)[k] === undefined) (out as Record<string, unknown>)[k] = attrs[k];
  return out;
}

/** The stages of a kind, open then closed. */
export function stagesOf(kind: OpportunityKind): readonly string[] {
  const s = OPPORTUNITY_STAGES[kind];
  return [...s.open, ...s.closed];
}
/** Whether a stage closes its kind's workflow. */
export const closesKind = (kind: OpportunityKind, stage: string) => (OPPORTUNITY_STAGES[kind].closed as readonly string[]).includes(stage);

function contactOf(a: Record<string, unknown>): OpportunityContact {
  if (!text(a.ref, 1000)) throw new Error(`<contact> ref names a card (a .vcf, by ref) or a relationship's id, not ${said(a.ref)}`);
  const at = `<contact ref="${a.ref}">`;
  for (const k of ["role", "note"] as const) if (a[k] !== undefined && !text(a[k], k === "note" ? 2000 : 80)) throw new Error(`${at} ${k} is a short text, not ${said(a[k])}`);
  return keep({ ref: a.ref }, a, OPPORTUNITY_CONTACT_FIELDS);
}

function actionOf(a: Record<string, unknown>): OpportunityAction {
  if (!id(a.id)) throw new Error(`<action> id is lower-case letters, digits and dashes (at most 64), not ${said(a.id)}`);
  const at = `<action id="${a.id}">`;
  if (!text(a.title, 200)) throw new Error(`${at} title is a short text (at most 200), not ${said(a.title)}`);
  if (a.due !== undefined && !day(a.due)) throw new Error(`${at} due is an ISO 8601 day or instant, not ${said(a.due)}`);
  if (a.done !== undefined && !day(a.done)) throw new Error(`${at} done is the ISO 8601 day or instant it was done, not ${said(a.done)}`);
  if (a.owner !== undefined && !principal(a.owner)) throw new Error(`${at} owner is a principal (person:, agent:, org: or role:<id>), not ${said(a.owner)}`);
  if (a.decision !== undefined && typeof a.decision !== "boolean") throw new Error(`${at} decision is true when only its owner can decide it, not ${said(a.decision)}`);
  return keep({ id: a.id, title: a.title }, a, OPPORTUNITY_ACTION_FIELDS);
}

function evidenceOf(a: Record<string, unknown>): OpportunityEvidence {
  if (!id(a.id)) throw new Error(`<evidence> id is lower-case letters, digits and dashes (at most 64), not ${said(a.id)}`);
  const at = `<evidence id="${a.id}">`;
  if (!text(a.fact, 2000)) throw new Error(`${at} fact says what it is evidence of, not ${said(a.fact)}`);
  if (a.ref === undefined && a.source === undefined) throw new Error(`${at} names where the fact was read: a ref (a file) or a source (a URL)`);
  for (const k of ["ref", "source", "way"] as const) if (a[k] !== undefined && !text(a[k], 2000)) throw new Error(`${at} ${k} is a text, not ${said(a[k])}`);
  if (a.by !== undefined && !principal(a.by)) throw new Error(`${at} by is the principal that read it, not ${said(a.by)}`);
  if (a.at !== undefined && !instant(a.at)) throw new Error(`${at} at is the ISO 8601 instant it was read, not ${said(a.at)}`);
  return keep({ id: a.id, fact: a.fact }, a, OPPORTUNITY_EVIDENCE_FIELDS);
}

function moveOf(a: Record<string, unknown>, kind: OpportunityKind): OpportunityMove {
  const stages = stagesOf(kind);
  if (!instant(a.at)) throw new Error(`<move> at is an ISO 8601 instant, not ${said(a.at)}`);
  const at = `<move at="${a.at}">`;
  if (!stages.includes(a.to as string)) throw new Error(`${at} to is a stage of a ${kind} (${stages.join(", ")}), not ${said(a.to)}`);
  if (a.from !== undefined && !stages.includes(a.from as string)) throw new Error(`${at} from is a stage of a ${kind}, not ${said(a.from)}`);
  if (a.from !== undefined && a.from === a.to) throw new Error(`${at} moves to the stage it is in (${a.to})`);
  if (!principal(a.by)) throw new Error(`${at} by is the principal who moved it, not ${said(a.by)}`);
  if (a.note !== undefined && !text(a.note, 2000)) throw new Error(`${at} note is a text, not ${said(a.note)}`);
  return keep({ to: a.to as string, at: a.at, by: a.by }, a, OPPORTUNITY_MOVE_FIELDS);
}

function draftOf(a: Record<string, unknown>): OpportunityDraft {
  if (!id(a.id)) throw new Error(`<draft> id is lower-case letters, digits and dashes (at most 64), not ${said(a.id)}`);
  const at = `<draft id="${a.id}">`;
  if (!text(a.body, 20000)) throw new Error(`${at} body is the text that would be sent or published (at most 20000), not ${said(a.body)}`);
  if (a.channel !== undefined && !id(a.channel)) throw new Error(`${at} channel is a channel's id, not ${said(a.channel)}`);
  for (const k of ["to", "subject"] as const) if (a[k] !== undefined && !text(a[k], 1000)) throw new Error(`${at} ${k} is a short text, not ${said(a[k])}`);
  if ((a.approvedBy === undefined) !== (a.approvedAt === undefined)) throw new Error(`${at} approvedBy and approvedAt come together: who approved it, and when`);
  if (a.approvedBy !== undefined && !principal(a.approvedBy)) throw new Error(`${at} approvedBy is the principal that approved it, not ${said(a.approvedBy)}`);
  if (a.approvedAt !== undefined && !instant(a.approvedAt)) throw new Error(`${at} approvedAt is an ISO 8601 instant, not ${said(a.approvedAt)}`);
  return keep({ id: a.id, body: a.body }, a, OPPORTUNITY_DRAFT_FIELDS);
}

/** Each tag's records, refused when one key is used twice. */
function many<T>(t: DocTree, tag: string, key: string, of: (a: Record<string, unknown>) => T): T[] {
  const seen = new Set<unknown>();
  return t.children.filter((c) => c.tag === tag).map((c) => {
    const a = c.attrs as Record<string, unknown>;
    if (seen.has(a[key])) throw new Error(`<${tag} ${key}=${said(a[key])}> is declared twice`);
    seen.add(a[key]);
    return of(a);
  });
}

/** An opportunity as its tree declares it; throws with why it does not read. */
export function opportunityOf(t: DocTree): OpportunityDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.title, 160)) throw new Error(`<opportunity> title is a short text (at most 160), not ${said(a.title)}`);
  const at = `<opportunity title="${a.title}">`;
  if (!(OPPORTUNITY_KINDS as readonly unknown[]).includes(a.kind)) {
    const home = a.kind === "application" ? ": an application is its folder of applications/" : a.kind === "client" ? ": a client is a <Deal> of its company" : "";
    throw new Error(`${at} kind is ${OPPORTUNITY_KINDS.join(", ")}, not ${said(a.kind)}${home}`);
  }
  const kind = a.kind as OpportunityKind;
  const stages = stagesOf(kind);
  if (!stages.includes(a.stage as string)) throw new Error(`${at} stage is a stage of a ${kind} (${stages.join(", ")}), not ${said(a.stage)}`);
  const stage = a.stage as string;
  if (a.status !== undefined && !(OPPORTUNITY_STATUSES as readonly unknown[]).includes(a.status)) throw new Error(`${at} status is ${OPPORTUNITY_STATUSES.join(", ")}, not ${said(a.status)}`);
  if (closesKind(kind, stage) && a.status !== undefined && a.status !== "closed") throw new Error(`${at} is ${stage}, which closes it: its status is closed, not ${a.status}`);
  if (a.status === "closed" && !closesKind(kind, stage)) throw new Error(`${at} is closed, so its stage is one that closes a ${kind} (${OPPORTUNITY_STAGES[kind].closed.join(", ")}), not ${stage}`);
  if (a.source !== undefined && !text(a.source, 2000)) throw new Error(`${at} source is where it was found (a URL or a ref), not ${said(a.source)}`);
  if (a.deadline !== undefined && !day(a.deadline)) throw new Error(`${at} deadline is an ISO 8601 day or instant, not ${said(a.deadline)}`);
  let value: string | undefined;
  if (a.value !== undefined) {
    const v = typeof a.value === "number" && Number.isFinite(a.value) && a.value >= 0 ? String(a.value) : a.value;
    if (typeof v !== "string" || !DECIMAL.test(v)) throw new Error(`${at} value is a decimal amount (text or a number, not negative), not ${said(a.value)}`);
    if (!(typeof a.currency === "string" && CURRENCY.test(a.currency))) throw new Error(`${at} value needs its currency (three capitals, ISO 4217), not ${said(a.currency)}`);
    value = v;
  } else if (a.currency !== undefined) throw new Error(`${at} names a currency and no value`);
  if (a.eligibility !== undefined && !(ELIGIBILITIES as readonly unknown[]).includes(a.eligibility)) throw new Error(`${at} eligibility is ${ELIGIBILITIES.join(", ")}, not ${said(a.eligibility)}`);
  for (const k of ["folder", "counterparty"] as const) if (a[k] !== undefined && !text(a[k], 1000)) throw new Error(`${at} ${k} is a ref, not ${said(a[k])}`);
  if (a.owner !== undefined && !principal(a.owner)) throw new Error(`${at} owner is a principal (person:, agent:, org: or role:<id>), not ${said(a.owner)}`);
  if (a.channel !== undefined && !id(a.channel)) throw new Error(`${at} channel is a channel's id, not ${said(a.channel)}`);
  if (a.handle !== undefined && !text(a.handle, 300)) throw new Error(`${at} handle is its name on its channel (a GitHub org or owner/repo, an agent's address, a domain), not ${said(a.handle)}`);
  if (a.handle !== undefined && a.channel === undefined) throw new Error(`${at} names a handle and no channel`);
  if (a.about !== undefined && !text(a.about, 8000)) throw new Error(`${at} about is a text (at most 8000)`);

  const out = keep({ title: a.title, kind, stage, ...(value !== undefined ? { value } : {}) } as OpportunityDoc, a, OPPORTUNITY_FIELDS);
  out.contacts = many(t, "contact", "ref", contactOf);
  out.actions = many(t, "action", "id", actionOf);
  out.evidence = many(t, "evidence", "id", evidenceOf);
  out.moves = many(t, "move", "at", (m) => moveOf(m, kind));
  out.drafts = many(t, "draft", "id", draftOf);
  const last = [...out.moves].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).at(-1);
  if (last && last.to !== stage) throw new Error(`${at} is ${stage}, but its last <move> (${last.at}) went to ${last.to}`);
  if (kind === "listing" && (PUBLIC_STAGES as readonly string[]).includes(stage) && !out.drafts.some((d) => d.approvedBy)) {
    throw new Error(`${at} is ${stage}: a listing is public only after a principal approved its <draft> (approvedBy, approvedAt)`);
  }
  return out;
}

/** An experiment as its tree declares it; throws with why it does not read. */
export function experimentOf(t: DocTree): ExperimentDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.title, 160)) throw new Error(`<experiment> title is a short text (at most 160), not ${said(a.title)}`);
  const at = `<experiment title="${a.title}">`;
  if (a.hypothesis !== undefined && !text(a.hypothesis, 2000)) throw new Error(`${at} hypothesis is a text (at most 2000), not ${said(a.hypothesis)}`);
  if (a.status !== undefined && !(EXPERIMENT_STATUSES as readonly unknown[]).includes(a.status)) throw new Error(`${at} status is ${EXPERIMENT_STATUSES.join(", ")}, not ${said(a.status)}`);
  if (a.opportunity !== undefined && !text(a.opportunity, 1000)) throw new Error(`${at} opportunity is a ref to its .opportunity.tsx, not ${said(a.opportunity)}`);
  if (a.channel !== undefined && !id(a.channel)) throw new Error(`${at} channel is a channel's id, not ${said(a.channel)}`);
  for (const k of ["started", "ended"] as const) if (a[k] !== undefined && !day(a[k])) throw new Error(`${at} ${k} is an ISO 8601 day or instant, not ${said(a[k])}`);
  const out = keep({ title: a.title } as ExperimentDoc, a, EXPERIMENT_FIELDS);
  out.arms = many(t, "arm", "id", (c) => {
    if (!id(c.id)) throw new Error(`<arm> id is lower-case letters, digits and dashes (at most 64), not ${said(c.id)}`);
    for (const k of ["file", "note"] as const) if (c[k] !== undefined && !text(c[k], 2000)) throw new Error(`<arm id="${c.id}"> ${k} is a text, not ${said(c[k])}`);
    return keep({ id: c.id }, c, EXPERIMENT_ARM_FIELDS);
  });
  out.objectives = many(t, "objective", "id", (c) => {
    if (!id(c.id)) throw new Error(`<objective> id is lower-case letters, digits and dashes (at most 64), not ${said(c.id)}`);
    const o = `<objective id="${c.id}">`;
    if (!(OBJECTIVE_KINDS as readonly unknown[]).includes(c.kind)) throw new Error(`${o} kind is ${OBJECTIVE_KINDS.join(", ")}, not ${said(c.kind)}`);
    if (!text(c.metric, 120)) throw new Error(`${o} metric names what is measured, not ${said(c.metric)}`);
    if (c.direction !== "up" && c.direction !== "down") throw new Error(`${o} direction is up or down, not ${said(c.direction)}`);
    if (c.note !== undefined && !text(c.note, 2000)) throw new Error(`${o} note is a text, not ${said(c.note)}`);
    return keep({ id: c.id, kind: c.kind as ExperimentObjective["kind"], metric: c.metric, direction: c.direction }, c, EXPERIMENT_OBJECTIVE_FIELDS);
  });
  // Reach alone rewards whatever spreads: an experiment that measures only distribution has no objective.
  if (out.objectives.length && out.objectives.every((o) => o.kind === "distribution")) throw new Error(`${at} measures only distribution: name a quality or an impact objective too`);
  const decisions = t.children.filter((c) => c.tag === "decision");
  if (decisions.length > 1) throw new Error(`${at} has one <decision>, not ${decisions.length}`);
  if (decisions.length) {
    const d = decisions[0]!.attrs as Record<string, unknown>;
    if (!out.arms.some((x) => x.id === d.arm)) throw new Error(`${at} <decision> arm is one of its arms (${out.arms.map((x) => x.id).join(", ")}), not ${said(d.arm)}`);
    if (!instant(d.at)) throw new Error(`${at} <decision> at is an ISO 8601 instant, not ${said(d.at)}`);
    if (!principal(d.by)) throw new Error(`${at} <decision> by is the principal that decided, not ${said(d.by)}`);
    if (!text(d.reason, 2000)) throw new Error(`${at} <decision> reason says why, from the observations, not ${said(d.reason)}`);
    out.decision = { arm: d.arm as string, at: d.at, by: d.by, reason: d.reason };
  }
  if (out.status === "decided" && !out.decision) throw new Error(`${at} is decided: its <decision> says which arm, who, when and why`);
  if (out.decision && out.status !== "decided") throw new Error(`${at} has a <decision>, so its status is decided, not ${said(out.status)}`);
  return out;
}

const attrsOf = (d: object, fields: readonly string[]) => Object.fromEntries(fields.filter((k) => (d as Record<string, unknown>)[k] !== undefined).map((k) => [k, (d as Record<string, unknown>)[k]]));
const leaves = (tag: string, rows: readonly object[] | undefined, fields: readonly string[]): DocTree[] => (rows ?? []).map((r) => ({ tag, attrs: attrsOf(r, fields), children: [] }));

export const opportunityVocabulary: Vocabulary<OpportunityDoc> = {
  format: "opportunity",
  noun: "an opportunity",
  root: "opportunity",
  tags: {
    opportunity: { parents: [], required: ["title", "kind", "stage"], attrs: OPPORTUNITY_FIELDS },
    contact: { parents: ["opportunity"], key: "ref", required: ["ref"], attrs: OPPORTUNITY_CONTACT_FIELDS },
    action: { parents: ["opportunity"], key: "id", required: ["id", "title"], attrs: OPPORTUNITY_ACTION_FIELDS },
    evidence: { parents: ["opportunity"], key: "id", required: ["id", "fact"], attrs: OPPORTUNITY_EVIDENCE_FIELDS },
    move: { parents: ["opportunity"], key: "at", required: ["to", "at", "by"], attrs: OPPORTUNITY_MOVE_FIELDS },
    draft: { parents: ["opportunity"], key: "id", required: ["id", "body"], attrs: OPPORTUNITY_DRAFT_FIELDS },
  },
  fromTree: opportunityOf,
  toTree(d) {
    return {
      tag: "opportunity",
      attrs: attrsOf(d, OPPORTUNITY_FIELDS),
      children: [
        ...leaves("contact", d.contacts, OPPORTUNITY_CONTACT_FIELDS),
        ...leaves("action", d.actions, OPPORTUNITY_ACTION_FIELDS),
        ...leaves("evidence", d.evidence, OPPORTUNITY_EVIDENCE_FIELDS),
        ...leaves("move", d.moves, OPPORTUNITY_MOVE_FIELDS),
        ...leaves("draft", d.drafts, OPPORTUNITY_DRAFT_FIELDS),
      ],
    };
  },
  empty: (name) => ({ title: name || "Opportunity", kind: "collaborator", stage: "found", contacts: [], actions: [], evidence: [], moves: [], drafts: [] }),
};

export const experimentVocabulary: Vocabulary<ExperimentDoc> = {
  format: "experiment",
  noun: "an experiment",
  root: "experiment",
  tags: {
    experiment: { parents: [], required: ["title"], attrs: EXPERIMENT_FIELDS },
    arm: { parents: ["experiment"], key: "id", required: ["id"], attrs: EXPERIMENT_ARM_FIELDS },
    objective: { parents: ["experiment"], key: "id", required: ["id", "kind", "metric", "direction"], attrs: EXPERIMENT_OBJECTIVE_FIELDS },
    decision: { parents: ["experiment"], single: true, required: ["arm", "at", "by", "reason"], attrs: EXPERIMENT_DECISION_FIELDS },
  },
  fromTree: experimentOf,
  toTree(d) {
    return {
      tag: "experiment",
      attrs: attrsOf(d, EXPERIMENT_FIELDS),
      children: [
        ...leaves("arm", d.arms, EXPERIMENT_ARM_FIELDS),
        ...leaves("objective", d.objectives, EXPERIMENT_OBJECTIVE_FIELDS),
        ...(d.decision ? leaves("decision", [d.decision], EXPERIMENT_DECISION_FIELDS) : []),
      ],
    };
  },
  empty: (name) => ({ title: name || "Experiment", status: "draft", arms: [], objectives: [] }),
};

registerVocabulary(opportunityVocabulary);
registerVocabulary(experimentVocabulary);

/** The vocabularies of the market manager's documents, by format. */
export const OPPORTUNITIES = { opportunity: opportunityVocabulary, experiment: experimentVocabulary } as const;
