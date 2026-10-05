/**
 * SIGNED RECORDS IN JSX — a market contract (`.contract`) and a product instance (`.instance`) written as elements
 * (docs/formats.md § a contract record and a product instance in code, in the CommandAGI repository).
 *
 *   // Contracts/Bench time.contract.tsx
 *   export default () => (
 *     <contract id="c-1" createdAt={1780765664000} terms={{ subject: { kind: "data_stream", … }, title: "Bench time", … }}>
 *       <party principal="u-1" role="offeror" sig="ed25519:…" signedAt={1780765664000} />
 *     </contract>
 *   );
 *
 *   // Instances/Rover A.instance.tsx
 *   export default () => (
 *     <instance serial="ACME-FU-0031" productId="fleet-unit">
 *       <event seq={0} kind="manufacture" at={1772409600000} prev={null} by="org-acme" sig="ed25519:…" />
 *     </instance>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim.
 * These records are SIGNED, so nothing is rewritten on the way: a contract's `terms` are ONE attribute (the exact
 * object both parties sign, `canonicalContractTerms`, nulls and empty strings kept), times stay epoch milliseconds,
 * signatures are written as they are. A contract's parties are `<party>` children in order; an instance's provenance
 * chain is `<event>` children, oldest first, each named by its `seq`. Nothing adds a default.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The fields of a contract record (packages/domain/core/src/contract-document.ts `ContractDoc`), but its parties. */
export const CONTRACT_FIELDS = ["id", "terms", "createdAt"] as const;
/** The fields of a product instance (`ProductInstance`), but its events. */
export const INSTANCE_FIELDS = ["serial", "productId", "model"] as const;
/** The fields of a provenance event (`InstanceEvent`). */
export const INSTANCE_EVENT_FIELDS = ["seq", "kind", "at", "prev", "by", "to", "contractRef", "attestationRef", "data", "sig"] as const;

export interface ContractRecord {
  id: string;
  terms: Record<string, unknown>;
  parties: Record<string, unknown>[];
  createdAt: number;
  [field: string]: unknown;
}
export interface InstanceRecord {
  serial: string;
  productId: string;
  model?: string;
  events: Record<string, unknown>[];
}

/** The fields of a record that it has (undefined is not a field; null, "" and [] are, and are kept). */
function own(o: Record<string, unknown>, keys?: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys ?? Object.keys(o)) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export const contractVocabulary: Vocabulary<ContractRecord> = {
  format: "contract",
  noun: "a contract record",
  root: "contract",
  tags: {
    contract: { parents: [], required: ["id", "terms", "createdAt"], attrs: CONTRACT_FIELDS },
    // A party's fields are the record's as stored (principal, role, actedBy, agent, sig, signedAt, …): any.
    party: { parents: ["contract"], required: ["principal", "role"] },
  },
  fromTree(t: DocTree) {
    const { id, terms, createdAt } = t.attrs as { id: string; terms: unknown; createdAt: unknown };
    if (!terms || typeof terms !== "object" || Array.isArray(terms)) throw new Error(`<contract id="${id}">: terms is the object the parties sign`);
    if (typeof createdAt !== "number" || !Number.isInteger(createdAt)) throw new Error(`<contract id="${id}">: createdAt is epoch milliseconds, not ${JSON.stringify(createdAt)}`);
    return { id, terms: terms as Record<string, unknown>, parties: t.children.map((c) => ({ ...c.attrs })), createdAt };
  },
  toTree(d) {
    return { tag: "contract", attrs: own(d, CONTRACT_FIELDS), children: (d.parties ?? []).map((p) => ({ tag: "party", attrs: own(p), children: [] })) };
  },
};

export const instanceVocabulary: Vocabulary<InstanceRecord> = {
  format: "instance",
  noun: "a product instance",
  root: "instance",
  tags: {
    instance: { parents: [], required: ["serial", "productId"], attrs: INSTANCE_FIELDS },
    event: { parents: ["instance"], key: "seq", required: ["seq", "kind", "at", "by"], attrs: INSTANCE_EVENT_FIELDS },
  },
  fromTree(t: DocTree) {
    const events = t.children.map((c) => ({ ...c.attrs }));
    events.forEach((e, i) => {
      if (e.seq !== i) throw new Error(`<event seq={${JSON.stringify(e.seq)}}> is event ${i} of the chain: events are written oldest first, seq 0, 1, 2 …`);
    });
    return { ...(own(t.attrs, INSTANCE_FIELDS) as { serial: string; productId: string }), events };
  },
  toTree(d) {
    return { tag: "instance", attrs: own(d as unknown as Record<string, unknown>, INSTANCE_FIELDS), children: (d.events ?? []).map((e) => ({ tag: "event", attrs: own(e, INSTANCE_EVENT_FIELDS), children: [] })) };
  },
};

for (const v of [contractVocabulary, instanceVocabulary]) registerVocabulary(v);

/** The vocabularies of the signed records, by format. */
export const RECORDS = { contract: contractVocabulary, instance: instanceVocabulary } as const;
