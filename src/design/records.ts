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

/**
 * The fields of a hardware release (`commandagi release`, docs/formats.md § a hardware release), but its lists. `frozen`:
 * the folder beside the record that stands for the released folder, where each file's frozen copy is at `<frozen>/<path>`
 * (`files`; `files/<the folder's own names>` when its designs read files outside it, by `../` paths).
 */
export const RELEASE_FIELDS = ["id", "rev", "of", "frozen", "product", "createdAt", "by", "note", "previous"] as const;
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
  frozen: string;
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
 *   <release id="cam-001-A" rev="A" of="../.." frozen="files" product="CommandAGI-Cam-001" createdAt={1792…} by="person:…" note="README.md">
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
    release: { parents: [], required: ["id", "rev", "of", "frozen"], attrs: RELEASE_FIELDS },
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
    const frozen = t.attrs.frozen;
    if (typeof frozen !== "string" || !frozen || frozen.startsWith("/") || frozen.split("/").some((p) => !p || p === "." || p === ".."))
      throw new Error(`${at}: frozen is a folder beside the record (files, files/<the folder's names>), not ${JSON.stringify(frozen)}`);
    const createdAt = t.attrs.createdAt;
    if (createdAt !== undefined && (typeof createdAt !== "number" || !Number.isInteger(createdAt))) throw new Error(`${at}: createdAt is epoch milliseconds, not ${JSON.stringify(createdAt)}`);
    return { ...(own(t.attrs, RELEASE_FIELDS) as { id: string; rev: string; of: string; frozen: string }), files, checks, outputs: list("output") as ReleaseRecord["outputs"] };
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

/** The fields of a unit's calibration: the definition it calibrates (a ref), the unit's serial, a note. */
export const CALIBRATION_FIELDS = ["device", "serial", "note"] as const;
/** The fields of one calibrated joint: its zero (rad, what its encoder reads at the chain's zero), its servo's gains, the run that measured them. */
export const CALIBRATION_JOINT_FIELDS = ["name", "zero", "kp", "kv", "run"] as const;
/** The fields of one re-zero: the joint, its new zero (rad), when (epoch ms), who (person:<id> | agent:<id>), why. */
export const REZERO_FIELDS = ["joint", "zero", "at", "by", "reason"] as const;
/**
 * The fields of one calibrated camera: its video channel, the arm it was measured against, its intrinsics (pixels),
 * its extrinsics (the camera in the world: mm and a unit quaternion, x right, y down, z forward), the marker in that
 * arm's tool frame, the residual (reprojection px, and the position mm and rotation degrees it bounds, three sigma),
 * the run that measured it and that run's reality, when and by whom.
 */
export const CALIBRATION_CAMERA_FIELDS = ["channel", "robot", "intrinsics", "extrinsics", "marker", "residual", "run", "reality", "at", "by"] as const;

export interface CalibrationRecord {
  device: string;
  serial?: string;
  note?: string;
  joints: { name: string; zero?: number; kp?: number; kv?: number; run?: string }[];
  rezeros: { joint: string; zero: number; at: number; by: string; reason?: string }[];
  /** Only when the unit is a camera that was calibrated. */
  cameras?: CameraCalibrationRecord[];
}

export interface CameraCalibrationRecord {
  channel: string;
  robot?: string;
  intrinsics: { width: number; height: number; fx: number; fy: number; cx: number; cy: number };
  extrinsics: { position_mm: number[]; quaternion: number[] };
  marker?: { position_mm: number[]; quaternion: number[] };
  residual: { rms_px: number; max_px?: number; position_mm?: number | null; rotation_deg?: number | null; views?: number; points?: number };
  run?: string;
  reality?: "physical" | "simulation";
  at?: number;
  by?: string;
}

const finiteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const numbers = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(finiteNumber);
/** A `<camera>` as a calibration holds it, or the reason it is not one. */
function cameraChecked(c: Record<string, unknown>): asserts c is Record<string, unknown> & CameraCalibrationRecord {
  const at = `<camera channel="${String(c.channel)}">`;
  if (typeof c.channel !== "string" || !c.channel) throw new Error(`${at}: channel names the video channel, not ${JSON.stringify(c.channel)}`);
  const i = c.intrinsics as Record<string, unknown> | undefined;
  if (!i || typeof i !== "object" || !["width", "height", "fx", "fy"].every((k) => finiteNumber(i[k]) && (i[k] as number) > 0) || !finiteNumber(i.cx) || !finiteNumber(i.cy))
    throw new Error(`${at}: intrinsics are { width, height, fx, fy, cx, cy } in pixels (width, height, fx and fy positive), not ${JSON.stringify(c.intrinsics)}`);
  const e = c.extrinsics as Record<string, unknown> | undefined;
  if (!e || typeof e !== "object" || !numbers(e.position_mm, 3) || !numbers(e.quaternion, 4))
    throw new Error(`${at}: extrinsics are { position_mm: [x, y, z], quaternion: [x, y, z, w] }, not ${JSON.stringify(c.extrinsics)}`);
  const m = c.marker as Record<string, unknown> | undefined;
  if (m !== undefined && (typeof m !== "object" || m === null || !numbers(m.position_mm, 3) || !numbers(m.quaternion, 4)))
    throw new Error(`${at}: marker is { position_mm: [x, y, z], quaternion: [x, y, z, w] }, not ${JSON.stringify(c.marker)}`);
  const r = c.residual as Record<string, unknown> | undefined;
  if (!r || typeof r !== "object" || !finiteNumber(r.rms_px) || r.rms_px < 0) throw new Error(`${at}: residual has rms_px, the reprojection error in pixels, not ${JSON.stringify(c.residual)}`);
  if (c.reality !== undefined && c.reality !== "physical" && c.reality !== "simulation") throw new Error(`${at}: reality is physical or simulation, not ${JSON.stringify(c.reality)}`);
  if (c.run !== undefined && c.reality === undefined) throw new Error(`${at}: a camera measured by a run says its reality (a simulated run is never physical evidence)`);
}

/**
 * A UNIT'S CALIBRATION (`<name>.calibration.tsx`): what one physical unit measures off its definition. A unit of a world
 * names it (`<unit calibration="arm.calibration.tsx">`). Each `<joint>` holds the joint's zero and its servo's gains as
 * this unit has them; each `<rezero>` is an event of the unit, oldest first: a replaced motor or a lost index re-zeroed,
 * by whom and why. A joint's zero is its newest re-zero's, else its `<joint>`'s. A re-zero is appended, never edited.
 * A camera unit's calibration holds a `<camera>` per video channel: its lens and where it is, measured by a run that
 * moved a marker through its view, with the residual that says how far to trust them; a new run replaces it.
 *
 *   <calibration device="../../devices/so101-follower-arm/definition.tsx" serial="SO101-0007">
 *     <joint name="shoulder_lift" zero={0.012} kp={12} kv={0.6} run="runs/2026-10-30-lift/run.json" />
 *     <rezero joint="shoulder_lift" zero={0.015} at={1793318400000} by="person:owner" reason="motor replaced" />
 *   </calibration>
 *
 *   <calibration device="../../devices/cell-camera/definition.tsx">
 *     <camera channel="view" robot="arm" intrinsics={{ width: 320, height: 240, fx: 207.6, fy: 207.4, cx: 160.1, cy: 119.9 }}
 *       extrinsics={{ position_mm: [14.2, -509.1, 1006], quaternion: [0.69, -0.06, -0.06, 0.72] }}
 *       residual={{ rms_px: 0.07, position_mm: 0.83, rotation_deg: 0.18 }} run="runs/2026-10-30-cam/run.json" reality="simulation" />
 *   </calibration>
 */
export const calibrationVocabulary: Vocabulary<CalibrationRecord> = {
  format: "calibration",
  noun: "a unit's calibration",
  root: "calibration",
  tags: {
    calibration: { parents: [], required: ["device"], attrs: CALIBRATION_FIELDS },
    joint: { parents: ["calibration"], key: "name", required: ["name"], attrs: CALIBRATION_JOINT_FIELDS },
    rezero: { parents: ["calibration"], required: ["joint", "zero", "at", "by"], attrs: REZERO_FIELDS },
    camera: { parents: ["calibration"], key: "channel", required: ["channel", "intrinsics", "extrinsics", "residual"], attrs: CALIBRATION_CAMERA_FIELDS },
  },
  fromTree(t: DocTree) {
    const list = (tag: string) => t.children.filter((c) => c.tag === tag).map((c) => ({ ...c.attrs }));
    const joints = list("joint") as CalibrationRecord["joints"];
    for (const j of joints) {
      if (j.zero !== undefined && !finiteNumber(j.zero)) throw new Error(`<joint name="${j.name}">: zero is radians, not ${JSON.stringify(j.zero)}`);
      if (j.kp !== undefined && !(finiteNumber(j.kp) && j.kp > 0)) throw new Error(`<joint name="${j.name}">: kp is a positive number (N·m/rad), not ${JSON.stringify(j.kp)}`);
      if (j.kv !== undefined && !(finiteNumber(j.kv) && j.kv >= 0)) throw new Error(`<joint name="${j.name}">: kv is a number of at least 0 (N·m·s/rad), not ${JSON.stringify(j.kv)}`);
    }
    const rezeros = list("rezero") as CalibrationRecord["rezeros"];
    let last = -Infinity;
    for (const r of rezeros) {
      const at = `<rezero joint="${r.joint}">`;
      if (!finiteNumber(r.zero)) throw new Error(`${at}: zero is radians, not ${JSON.stringify(r.zero)}`);
      if (!Number.isInteger(r.at)) throw new Error(`${at}: at is epoch milliseconds, not ${JSON.stringify(r.at)}`);
      if (typeof r.by !== "string" || !/^(person|agent):.+/.test(r.by)) throw new Error(`${at}: by is person:<id> or agent:<id>, not ${JSON.stringify(r.by)}`);
      if (r.at < last) throw new Error(`${at}: the re-zeros are oldest first, and this one is older than the one before it`);
      last = r.at;
    }
    const cameras: CameraCalibrationRecord[] = [];
    for (const c of list("camera")) {
      cameraChecked(c);
      cameras.push(c);
    }
    return { ...(own(t.attrs, CALIBRATION_FIELDS) as { device: string }), joints, rezeros, ...(cameras.length ? { cameras } : {}) };
  },
  toTree(d) {
    const leaf = (tag: string, o: Record<string, unknown>, keys: readonly string[]) => ({ tag, attrs: own(o, keys), children: [] });
    return {
      tag: "calibration",
      attrs: own(d as unknown as Record<string, unknown>, CALIBRATION_FIELDS),
      children: [
        ...(d.joints ?? []).map((j) => leaf("joint", j, CALIBRATION_JOINT_FIELDS)),
        ...(d.rezeros ?? []).map((r) => leaf("rezero", r, REZERO_FIELDS)),
        ...(d.cameras ?? []).map((c) => leaf("camera", c as unknown as Record<string, unknown>, CALIBRATION_CAMERA_FIELDS)),
      ],
    };
  },
  empty: () => ({ device: "", joints: [], rezeros: [] }),
};

for (const v of [contractVocabulary, instanceVocabulary, releaseVocabulary, calibrationVocabulary]) registerVocabulary(v);

/** The vocabularies of the records, by format. */
export const RECORDS = { contract: contractVocabulary, instance: instanceVocabulary, release: releaseVocabulary, calibration: calibrationVocabulary } as const;
