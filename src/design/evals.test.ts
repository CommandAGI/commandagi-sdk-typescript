// An eval and a metric in JSX declare the documents the platform's eval reader parses. Pinned here: each is its record
// both ways; a case names its task file or says its instruction (one of the two); `metrics` and `acceptanceMetric` are
// refs; `frozen` is a digest, never a flag; what does not read is refused with why. The Python SDK's
// tests/test_evals.py and the Rust SDK's tests/evals.rs declare the same example.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, EVALS } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const DIGEST = `sha256:${"ab".repeat(32)}`;
const EVAL = {
  slug: "yard-shakedown",
  domain: "robot",
  version: "3",
  metrics: ["Fleet availability.metric.tsx"],
  repeats: 3,
  frozen: DIGEST,
  cases: [
    { slug: "undock-and-lap", name: "Undock and lap", task: "../Tasks/Undock and lap.task.tsx", environment: { kind: "synthetic", seed: 41 } },
    {
      slug: "open-a-terminal",
      name: "Open a terminal",
      instruction: "Open a terminal window.",
      acceptanceMetric: "Terminal open.metric.tsx",
      hints: ["The dock has a terminal icon."],
      timeLimitMs: 120000,
      environment: { kind: "none" },
      tags: ["smoke"],
    },
  ],
};
const METRIC = { slug: "fleet-availability", probe: { kind: "event", eventKind: "telemetry" }, aggregation: "rate", target: 0.96 };

test("an eval in JSX: <eval> holds one <case> per case, each __source by its slug; a metric is one <metric>", () => {
  const { slug, domain, version, metrics, repeats, frozen, cases } = EVAL;
  const file = el(
    "eval",
    { slug, domain, version, metrics, repeats, frozen, __source: 0 },
    el("case", { ...cases[0], __source: 1 }),
    el("case", cases[1]!),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {}, "an eval leaves beside an empty graph");
  assert.equal(document!.format, "eval");
  assert.deepEqual(document!.sources, { "": 0, "case#undock-and-lap": 1 });
  assert.deepEqual(document!.document, EVAL);
  assert.deepEqual(EVALS.eval.fromTree(EVALS.eval.toTree(EVAL)), EVAL, "both ways");
  assert.deepEqual(EVALS.eval.empty!("Yard shakedown"), { slug: "yard-shakedown", cases: [] });

  const metric = declarationOf({ default: el("metric", METRIC) }).document!;
  assert.equal(metric.format, "metric");
  assert.deepEqual(metric.document, METRIC);
  assert.deepEqual(EVALS.metric.fromTree(EVALS.metric.toTree(METRIC)), METRIC, "both ways");
});

test("an eval or a metric that does not read is refused with why", () => {
  const world = { kind: "none" };
  const kase = (attrs: Record<string, unknown>) => () => declarationOf({ default: el("eval", { slug: "e" }, el("case", { slug: "c", name: "C", environment: world, ...attrs })) });
  assert.throws(kase({}), /says what the agent is handed once: .* not neither/);
  assert.throws(kase({ task: "a.task.tsx", instruction: "Do it." }), /not both/);
  assert.throws(kase({ task: { id: "t", instruction: "Do it." } }), /task is text/, "a task is named by ref, not carried whole");
  assert.throws(kase({ instruction: "Do it.", environment: { seed: 1 } }), /environment is a world/);
  assert.throws(kase({ instruction: "Do it.", timeLimitMs: 1.5 }), /timeLimitMs is a whole number/);
  assert.throws(() => declarationOf({ default: el("eval", { slug: "e", frozen: true }) }), /frozen is the digest the eval is frozen at/);
  assert.throws(() => declarationOf({ default: el("eval", { slug: "e", metricIds: ["m1"] }) }), /metricIds is not read/);
  assert.throws(() => declarationOf({ default: el("eval", { slug: "e", metrics: "m.metric.tsx" }) }), /metrics is a list of texts/);
  assert.throws(() => declarationOf({ default: el("metric", { slug: "m", probe: {}, aggregation: "rate" }) }), /probe is what to measure/);
  assert.throws(() => declarationOf({ default: el("metric", { slug: "m", aggregation: "rate" }) }), /<metric> needs probe/);
});
