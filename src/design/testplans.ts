/**
 * TEST PLANS IN JSX — a test plan (`<name>.testplan.tsx`) holds the steps that test one serial-numbered unit, never the
 * results: what to command, what to read, on which channel or instrument, the limits, and the requirements each step
 * verifies (docs/testplans.md, in the CommandAGI repository). A run of the plan on one unit is a run beside the plan;
 * its `results` stream holds one signed record per step and the unit's verdict.
 *
 *   // Power rail.testplan.tsx
 *   export default () => (
 *     <testplan title="Cam-001 power rail" device="../devices/commandagi-cam-001/definition.tsx">
 *       <condition id="ambient" quantity="temperature" min={15} max={35} unit="C" />
 *       <fixture id="supply" kind="instrument" unit="psu-1" channel="output" note="5 V, current limit 1 A" />
 *       <fixture id="bed" kind="jig" note="pogo bed, rev B" />
 *       <step id="rail-3v3" channel="power" command={{ verb: "read" }} read="v3v3" min={3.2} max={3.4} unit="V"
 *             verifies={["requirements/power.req.tsx#rail-3v3"]} />
 *       <step id="supply-current" fixture="supply" command={{ verb: "read" }} read="current" max={0.4} unit="A" />
 *       <step id="room" fixture="thermometer" read="temperature" condition="ambient" />
 *     </testplan>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are its attributes, verbatim. A step reads
 * the unit's channel (`channel`) or an instrument's (`fixture`: a fixture that names a unit of the same world).
 * `command` is one record in the channel format's shape, sent first; `read` is a value of the state the channel reports
 * after it. A step with `read` and no limit records the value and passes nothing: its status is `unknown`. Nothing adds
 * a default: the runner says what it assumes.
 *
 * The document a test plan declares (`fromTree`):
 *   { title?, device?, conditions?: [{ id, quantity, value?, min?, max?, unit?, note? }], fixtures?: [{ id, kind,
 *     unit?, channel?, note? }], steps?: [{ id, channel?, fixture?, command?, read?, min?, max?, equals?, unit?,
 *     settleMs?, timeoutMs?, condition?, verifies?, note? }] }
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const TESTPLAN_FIELDS = ["title", "device", "note"] as const;
export const TESTPLAN_CONDITION_FIELDS = ["id", "quantity", "value", "min", "max", "unit", "note"] as const;
export const TESTPLAN_FIXTURE_FIELDS = ["id", "kind", "unit", "channel", "note"] as const;
export const TESTPLAN_STEP_FIELDS = ["id", "channel", "fixture", "command", "read", "min", "max", "equals", "unit", "settleMs", "timeoutMs", "condition", "verifies", "note"] as const;

export interface TestPlanDoc {
  title?: string;
  device?: string;
  conditions?: Record<string, unknown>[];
  fixtures?: Record<string, unknown>[];
  steps?: Record<string, unknown>[];
  [field: string]: unknown;
}

/** A field's value says nothing (absent, null, "" or []): code does not write it. */
const nothing = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const attrsOf = (o: Record<string, unknown>, keys: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (!nothing(o[k])) out[k] = o[k];
  return out;
};
const leaf = (tag: string, attrs: Record<string, unknown>): DocTree => ({ tag, attrs, children: [] });
const LISTS = [
  ["condition", "conditions", TESTPLAN_CONDITION_FIELDS],
  ["fixture", "fixtures", TESTPLAN_FIXTURE_FIELDS],
  ["step", "steps", TESTPLAN_STEP_FIELDS],
] as const;

export const testplanVocabulary: Vocabulary<TestPlanDoc> = {
  format: "testplan",
  noun: "a test plan",
  root: "testplan",
  tags: {
    testplan: { parents: [], attrs: TESTPLAN_FIELDS },
    condition: { parents: ["testplan"], key: "id", required: ["id", "quantity"], attrs: TESTPLAN_CONDITION_FIELDS },
    fixture: { parents: ["testplan"], key: "id", required: ["id", "kind"], attrs: TESTPLAN_FIXTURE_FIELDS },
    step: { parents: ["testplan"], key: "id", required: ["id"], attrs: TESTPLAN_STEP_FIELDS },
  },
  fromTree(t) {
    const doc: TestPlanDoc = { ...t.attrs };
    for (const [tag, field] of LISTS) {
      const items = t.children.filter((c) => c.tag === tag).map((c) => ({ ...c.attrs }));
      if (items.length) doc[field] = items;
    }
    for (const s of doc.steps ?? []) {
      if (s.verifies !== undefined && !(Array.isArray(s.verifies) && s.verifies.every((r) => typeof r === "string" && r)))
        throw new Error(`<step id="${String(s.id)}"> verifies is a list of refs to requirements, not ${JSON.stringify(s.verifies)}`);
      if (s.command !== undefined && (!s.command || typeof s.command !== "object" || Array.isArray(s.command)))
        throw new Error(`<step id="${String(s.id)}"> command is one record in the channel format's shape ({ verb: … }), not ${JSON.stringify(s.command)}`);
    }
    return doc;
  },
  toTree(d) {
    return {
      tag: "testplan",
      attrs: attrsOf(d, TESTPLAN_FIELDS),
      children: LISTS.flatMap(([tag, field, keys]) => ((d[field] as Record<string, unknown>[] | undefined) ?? []).map((x) => leaf(tag, attrsOf(x, keys)))),
    };
  },
  empty: () => ({}),
};

registerVocabulary(testplanVocabulary);

/** The vocabulary of test plans, by format. */
export const TESTPLANS = { testplan: testplanVocabulary } as const;
