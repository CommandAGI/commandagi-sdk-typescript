/**
 * RECORDS IN JSX — a market contract (`.contract.tsx`) and a product instance (`.instance.tsx`), which are signed, and a
 * hardware release (`.release.tsx`, below), written as elements (docs/formats.md § a contract record and a product
 * instance in code, § a hardware release, in the CommandAGI repository).
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
/** The fields of a product instance (`ProductInstance`), but its events. `release`: the release it was built from (a ref to its `.release.tsx`). */
export const INSTANCE_FIELDS = ["serial", "productId", "model", "release"] as const;
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
  /** The release the unit was built from: a ref to its `.release.tsx`. */
  release?: string;
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

/** The fields of a hardware release (`commandagi release`, docs/formats.md § a hardware release), but its lists. */
export const RELEASE_FIELDS = ["id", "rev", "of", "product", "createdAt", "by", "note", "previous"] as const;
/** The fields of one frozen file of a release: its path in the released folder and its content id (SHA-256, hex). */
export const RELEASE_FILE_FIELDS = ["path", "digest"] as const;
/** The fields of one check verdict of a release, at the frozen file's digest. */
export const RELEASE_CHECK_FIELDS = ["file", "id", "kind", "status", "accepted", "reason"] as const;
/** The fields of one generated output of a release: its path in the release's folder, its content id, what made it. */
export const RELEASE_OUTPUT_FIELDS = ["path", "digest", "from", "kind"] as const;
/** What a release's check says: passed, failed, not run, or passed with every finding accepted in the design. */
export const RELEASE_CHECK_STATUSES = ["passed", "failed", "skipped", "accepted"] as const;

export interface ReleaseRecord {
  id: string;
  rev: string;
  of: string;
  product?: string;
  createdAt?: number;
  by?: string;
  note?: string;
  previous?: string;
  files: { path: string; digest: string }[];
  checks: { file: string; id: string; kind: string; status: (typeof RELEASE_CHECK_STATUSES)[number]; accepted?: number; reason?: string }[];
  outputs: { path: string; digest: string; from?: string; kind?: string }[];
}

const DIGEST = /^[0-9a-f]{64}$/;

/**
 * A HARDWARE RELEASE (`<rev>.release.tsx`): the design files of a folder frozen by digest, each declared check's verdict
 * at that digest, and the outputs made from them. `commandagi release` writes it from the empty file; nothing edits it.
 *
 *   <release id="cam-001-A" rev="A" of="../.." product="CommandAGI-Cam-001" createdAt={1792…} by="person:…" note="README.md">
 *     <file path="cad/Assembly.3d.tsx" digest="<sha256>" />
 *     <check file="cad/Assembly.3d.tsx" id="interference" kind="interference" status="passed" />
 *     <output path="outputs/Assembly.step" digest="<sha256>" from="cad/Assembly.3d.tsx" kind="step" />
 *   </release>
 */
export const releaseVocabulary: Vocabulary<ReleaseRecord> = {
  format: "release",
  noun: "a hardware release",
  root: "release",
  tags: {
    release: { parents: [], required: ["id", "rev", "of"], attrs: RELEASE_FIELDS },
    file: { parents: ["release"], key: "path", required: ["path", "digest"], attrs: RELEASE_FILE_FIELDS },
    check: { parents: ["release"], required: ["file", "id", "kind", "status"], attrs: RELEASE_CHECK_FIELDS },
    output: { parents: ["release"], key: "path", required: ["path", "digest"], attrs: RELEASE_OUTPUT_FIELDS },
  },
  fromTree(t: DocTree) {
    const rev = String(t.attrs.rev);
    const at = `<release rev="${rev}">`;
    const list = (tag: string) => t.children.filter((c) => c.tag === tag).map((c) => ({ ...c.attrs }));
    const files = list("file") as ReleaseRecord["files"];
    for (const f of [...files, ...(list("output") as ReleaseRecord["outputs"])])
      if (typeof f.digest !== "string" || !DIGEST.test(f.digest)) throw new Error(`${at}: ${f.path}'s digest is its content's SHA-256 in hex (64 characters), not ${JSON.stringify(f.digest)}`);
    const checks = list("check") as ReleaseRecord["checks"];
    for (const c of checks)
      if (!(RELEASE_CHECK_STATUSES as readonly string[]).includes(c.status)) throw new Error(`${at}: check ${c.id} of ${c.file}: status is ${RELEASE_CHECK_STATUSES.join(", ")}, not ${JSON.stringify(c.status)}`);
    const createdAt = t.attrs.createdAt;
    if (createdAt !== undefined && (typeof createdAt !== "number" || !Number.isInteger(createdAt))) throw new Error(`${at}: createdAt is epoch milliseconds, not ${JSON.stringify(createdAt)}`);
    return { ...(own(t.attrs, RELEASE_FIELDS) as { id: string; rev: string; of: string }), files, checks, outputs: list("output") as ReleaseRecord["outputs"] };
  },
  toTree(d) {
    const leaf = (tag: string, o: Record<string, unknown>, keys: readonly string[]) => ({ tag, attrs: own(o, keys), children: [] });
    return {
      tag: "release",
      attrs: own(d as unknown as Record<string, unknown>, RELEASE_FIELDS),
      children: [
        ...(d.files ?? []).map((f) => leaf("file", f, RELEASE_FILE_FIELDS)),
        ...(d.checks ?? []).map((c) => leaf("check", c, RELEASE_CHECK_FIELDS)),
        ...(d.outputs ?? []).map((o) => leaf("output", o, RELEASE_OUTPUT_FIELDS)),
      ],
    };
  },
};

for (const v of [contractVocabulary, instanceVocabulary, releaseVocabulary]) registerVocabulary(v);

/** The vocabularies of the records, by format. */
export const RECORDS = { contract: contractVocabulary, instance: instanceVocabulary, release: releaseVocabulary } as const;
