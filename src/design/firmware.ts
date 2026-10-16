/**
 * FIRMWARE RELEASES AND ROLLOUTS IN JSX (docs/firmware-updates.md, in the CommandAGI repository).
 *
 * A firmware release (`<name>.firmware.tsx`) names one built image by ref and states what it is: its SHA-256 (the
 * digest a unit reports when it runs it), its SBOM, the device definition it is for and the hardware revisions it
 * supports. It holds no bytes: the image and the SBOM are files beside it.
 *
 *   // cam-002 1.4.0.firmware.tsx
 *   export default () => (
 *     <firmware version="1.4.0" image="build/cam-002-1.4.0.bin" sha256="9f2c…" size={1203456}
 *               sbom="build/cam-002-1.4.0.cdx.json" device="../devices/commandagi-cam-002/definition.tsx" securityVersion={2}>
 *       <supports revision="B" />
 *       <supports revision="C" />
 *     </firmware>
 *   );
 *
 * A rollout (`<name>.rollout.tsx`) pushes one release to the units of one world in stages: a canary share first, then
 * waves (cumulative percentages, the last one 100). Each wave starts only when every unit of the waves before it runs
 * the release's digest and passes every health check; a failure halts the rollout. Nothing retries an update: a retry
 * is a principal's own recorded command.
 *
 *   // spring.rollout.tsx
 *   export default () => (
 *     <rollout firmware="cam-002 1.4.0.firmware.tsx" world="worlds/fleet/world.tsx" channel="firmware"
 *              canary={10} waves={[50, 100]} settleMs={60000}>
 *       <health id="no-crash" channel="state" command={{ verb: "read" }} read="crashes" max={0} />
 *       <target unit="cam-1" />
 *     </rollout>
 *   );
 *
 * A firmware's project folder holds `firmware.tsx`, the same element without a built image: what the firmware gives,
 * its channels as a definition writes them, and the revisions it supports. A definition names that folder (or a release
 * by `sha256:<hex>`) as its `firmware`; `commandagi check <definition.tsx>` holds the two to each other.
 *
 *   // firmware/firmware.tsx
 *   export default () => (
 *     <firmware name="ESP32 camera">
 *       <supports revision="A" />
 *       <channel id="cam" dir="out" medium="video" format="video" transport="host-wire" seals="device" />
 *     </firmware>
 *   );
 *
 * `<target unit>`: the units it updates, in that world; none: every unit of the world whose definition is the
 * release's device. The rule of the ontology's files: a record is an element, its fields are its attributes, verbatim.
 *
 * The documents they declare (`fromTree`):
 *   firmware: { name?, version?, image?, sha256?, sbom?, device?, size?, securityVersion?, title?, note?,
 *               supports?: [{ revision }], channels?: [{ id, … }] }: a release states all of version, image, sha256,
 *               sbom and device; a project's declaration states its name
 *   rollout:  { firmware, world, channel, canary, waves, settleMs?, title?, note?, health?: [{ id, channel, read,
 *               command?, min?, max?, equals?, unit?, timeoutMs? }], targets?: [{ unit }] }
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const FIRMWARE_FIELDS = ["name", "version", "image", "sha256", "size", "sbom", "device", "securityVersion", "title", "note"] as const;
export const ROLLOUT_FIELDS = ["firmware", "world", "channel", "canary", "waves", "settleMs", "title", "note"] as const;
export const HEALTH_FIELDS = ["id", "channel", "command", "read", "min", "max", "equals", "unit", "timeoutMs"] as const;

/** The fields a release states, all of them (a firmware's declaration in its project states none of them). */
export const FIRMWARE_RELEASE_FIELDS = ["version", "image", "sha256", "sbom", "device"] as const;

export interface FirmwareDoc {
  name?: string;
  version?: string;
  image?: string;
  sha256?: string;
  sbom?: string;
  device?: string;
  supports?: { revision: string }[];
  channels?: Record<string, unknown>[];
  [field: string]: unknown;
}
export interface RolloutDoc {
  firmware: string;
  world: string;
  channel: string;
  canary: number;
  waves: number[];
  health?: Record<string, unknown>[];
  targets?: { unit: string }[];
  [field: string]: unknown;
}

const nothing = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const attrsOf = (o: Record<string, unknown>, keys: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (!nothing(o[k])) out[k] = o[k];
  return out;
};
const leaf = (tag: string, attrs: Record<string, unknown>): DocTree => ({ tag, attrs, children: [] });
const listOf = (t: DocTree, tag: string) => t.children.filter((c) => c.tag === tag).map((c) => ({ ...c.attrs }));

export const firmwareVocabulary: Vocabulary<FirmwareDoc> = {
  format: "firmware",
  noun: "a firmware",
  root: "firmware",
  tags: {
    firmware: { parents: [], attrs: FIRMWARE_FIELDS },
    supports: { parents: ["firmware"], key: "revision", required: ["revision"], attrs: ["revision"] },
    channel: { parents: ["firmware"], key: "id", required: ["id"] },
  },
  fromTree(t) {
    const doc = { ...t.attrs } as FirmwareDoc;
    const stated = FIRMWARE_RELEASE_FIELDS.filter((k) => !nothing(doc[k]));
    if (stated.length) {
      const missing = FIRMWARE_RELEASE_FIELDS.filter((k) => nothing(doc[k]));
      if (missing.length) throw new Error(`<firmware> needs ${missing.join(", ")}: a release states all of ${FIRMWARE_RELEASE_FIELDS.join(", ")}`);
      if (typeof doc.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(doc.sha256))
        throw new Error(`<firmware> sha256 is the image's SHA-256 in 64 lowercase hex digits, not ${JSON.stringify(doc.sha256)}`);
    } else if (nothing(doc.name)) throw new Error("<firmware>: a firmware's declaration states its name; a release states version, image, sha256, sbom and device");
    const supports = listOf(t, "supports") as { revision: string }[], channels = listOf(t, "channel");
    if (supports.length) doc.supports = supports;
    if (channels.length) doc.channels = channels;
    return doc;
  },
  toTree(d) {
    return {
      tag: "firmware",
      attrs: attrsOf(d, FIRMWARE_FIELDS),
      children: [...(d.supports ?? []).map((s) => leaf("supports", { revision: s.revision })), ...(d.channels ?? []).map((c) => leaf("channel", { ...c }))],
    };
  },
};

export const rolloutVocabulary: Vocabulary<RolloutDoc> = {
  format: "rollout",
  noun: "a firmware rollout",
  root: "rollout",
  tags: {
    rollout: { parents: [], required: ["firmware", "world", "channel", "canary", "waves"], attrs: ROLLOUT_FIELDS },
    health: { parents: ["rollout"], key: "id", required: ["id", "channel", "read"], attrs: HEALTH_FIELDS },
    target: { parents: ["rollout"], key: "unit", required: ["unit"], attrs: ["unit"] },
  },
  fromTree(t) {
    const doc = { ...t.attrs } as RolloutDoc;
    const health = listOf(t, "health"), targets = listOf(t, "target") as { unit: string }[];
    if (health.length) doc.health = health;
    if (targets.length) doc.targets = targets;
    return doc;
  },
  toTree(d) {
    return {
      tag: "rollout",
      attrs: attrsOf(d, ROLLOUT_FIELDS),
      children: [...(d.health ?? []).map((h) => leaf("health", attrsOf(h, HEALTH_FIELDS))), ...(d.targets ?? []).map((x) => leaf("target", { unit: x.unit }))],
    };
  },
};

for (const v of [firmwareVocabulary, rolloutVocabulary]) registerVocabulary(v);

/** The vocabularies of firmware (a declaration or a release) and rollouts, by format. */
export const FIRMWARE = { firmware: firmwareVocabulary, rollout: rolloutVocabulary } as const;
