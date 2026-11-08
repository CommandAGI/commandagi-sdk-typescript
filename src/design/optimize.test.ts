// An optimization in JSX declares a brief, three objectives kept apart, a budget and a selection rule. Pinned here: a
// street sign both ways, and each refusal by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, OPTIMIZE } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const GLANCE = { seconds: 0.5, distanceM: 25, panelMm: [2400, 900], letterMm: 150, foreground: "#ffffff", background: "#00573f" };
const SIGN = {
  name: "Pier 4 ferries",
  medium: "text",
  brief: "A wayfinding sign where walkers leave the footbridge at the Central ferry piers",
  message: "Turn left for the Pier 4 ferries to Lamma Island",
  generator: "openai/gpt-6.1-sol",
  candidates: 4,
  rounds: 3,
  budget: { usd: 0.5, calls: 40 },
  glance: GLANCE,
  objectives: [
    { name: "quality", combine: "min", evaluators: [{ id: "legibility", kind: "glance", gate: 0.8 }, { id: "comprehension", kind: "read", model: "anthropic/claude-sonnet-5-5", gate: 0.7 }] },
    { name: "distribution", evaluators: [{ id: "sightline", kind: "sightline", approachM: 40 }] },
    { name: "impact", evaluators: [] },
  ],
  select: { rule: "quality-gated", gate: 0.75, order: ["distribution", "impact"] },
};

const signTree = (top: Record<string, unknown> = {}, ...extra: unknown[]) =>
  el("optimize", { name: SIGN.name, medium: "text", brief: SIGN.brief, message: SIGN.message, generator: SIGN.generator, candidates: 4, rounds: 3, budget: SIGN.budget, ...top },
    el("glance", GLANCE),
    el("objective", { name: "quality", combine: "min" }, el("evaluator", { id: "legibility", kind: "glance", gate: 0.8 }), el("evaluator", { id: "comprehension", kind: "read", model: "anthropic/claude-sonnet-5-5", gate: 0.7 })),
    el("objective", { name: "distribution" }, el("evaluator", { id: "sightline", kind: "sightline", approachM: 40 })),
    el("objective", { name: "impact" }),
    el("select", { rule: "quality-gated", gate: 0.75, order: ["distribution", "impact"] }),
    ...extra);

test("an optimization in JSX: the brief, three objectives with their evaluators and the declared rule, both ways", () => {
  const { document } = declarationOf({ default: () => signTree() });
  assert.equal(document!.format, "optimize");
  assert.deepEqual(document!.document, SIGN);
  assert.deepEqual(OPTIMIZE.optimize.fromTree(OPTIMIZE.optimize.toTree(SIGN as never)), SIGN, "both ways");
  const published = declarationOf({ default: () => signTree({}, el("publish", { to: "./signs/pier-4.txt" })) });
  assert.deepEqual((published.document!.document as { publish: unknown }).publish, { to: "./signs/pier-4.txt" });
});

test("a video optimization: a <clip>, measured pictures and a frames judge; a text evaluator on a clip is refused", () => {
  const CLIP = { seconds: 5, aspect: "9:16", still: "text-to-image.flux-schnell", motion: "image-to-video.kling", frames: 6 };
  const tree = (...evs: unknown[]) =>
    el("optimize", { name: "Pier 4 at dusk", medium: "video", brief: "A 5 s clip of the Lamma ferry leaving Pier 4", generator: "openai/gpt-6.1-sol", budget: { usd: 5 } },
      el("clip", CLIP), el("objective", { name: "quality" }, ...evs), el("select", { rule: "pareto", tiebreak: "quality" }));
  const { document } = declarationOf({ default: () => tree(el("evaluator", { id: "sharp", kind: "picture", metric: "sharpness", gate: 0.5 }), el("evaluator", { id: "look", kind: "frames", model: "anthropic/claude-sonnet-5-5", rubric: "one clear subject, coherent motion" })) });
  const doc = document!.document as { clip: unknown; select: unknown; objectives: { evaluators: unknown[] }[] };
  assert.deepEqual(doc.clip, CLIP);
  assert.deepEqual(doc.select, { rule: "pareto", tiebreak: "quality" });
  assert.equal(doc.objectives[0]!.evaluators.length, 2);
  assert.throws(() => declarationOf({ default: () => tree(el("evaluator", { id: "g", kind: "glance" })) }), /glance measures a text; this optimization's medium is video/);
  assert.throws(() => declarationOf({ default: () => tree(el("evaluator", { id: "p", kind: "picture", metric: "blur" })) }), /picture's metric is sharpness, flicker or freeze/);
});

test("an optimization that does not read is refused with why", () => {
  const bad = (top: Record<string, unknown>, ...extra: unknown[]) => () => declarationOf({ default: () => signTree(top, ...extra) });
  assert.throws(bad({ medium: "audio" }), /medium is text or video/);
  assert.throws(bad({ message: undefined }), /a text's message is what a reader must take away/);
  assert.throws(bad({ generator: "gpt" }), /generator is the catalog id/);
  assert.throws(bad({ budget: { usd: 0 } }), /budget is \{ usd, calls\? \}/);
  assert.throws(bad({}, el("objective", { name: "engagement" })), /three kept apart, never one score/);
  assert.throws(bad({}, el("objective", { name: "quality" })), /two <objective> in <optimize> have name "quality"/);
  assert.throws(bad({}, el("clip", { seconds: 5, aspect: "9:16", still: "a", motion: "b", frames: 4 })), /a text has no <clip>/);
  const only = (...children: unknown[]) => () =>
    declarationOf({ default: () => el("optimize", { name: "x", medium: "text", brief: "b", message: "m", generator: SIGN.generator, budget: { usd: 1 } }, el("glance", GLANCE), ...children) });
  const sel = el("select", { rule: "quality-gated", gate: 0.5 });
  const q = (...evs: unknown[]) => el("objective", { name: "quality" }, ...evs);
  assert.throws(only(q(el("evaluator", { id: "c", kind: "read" })), sel), /read is a model's judgement: model is a catalog id/);
  assert.throws(only(q(el("evaluator", { id: "g", kind: "glance", model: "openai/x" })), sel), /glance is measured: it takes no model/);
  assert.throws(only(q(el("evaluator", { id: "h", kind: "judge", model: "openai/x" })), sel), /judge needs its rubric/);
  assert.throws(only(q(el("evaluator", { id: "s", kind: "sightline", approachM: 40 })), sel), /sightline measures reach: it belongs to the distribution objective/);
  assert.throws(only(q(el("evaluator", { id: "d", kind: "data", data: "./x.csv" })), sel), /data is a measured outcome: it belongs to distribution or impact/);
  assert.throws(only(q(el("evaluator", { id: "f", kind: "picture", metric: "sharpness" })), sel), /picture measures a clip; this optimization's medium is text/);
  assert.throws(only(q(el("evaluator", { id: "g", kind: "glance", gate: 2 })), sel), /gate is a score from 0 to 1/);
  assert.throws(only(q()), /needs its <select rule>/);
  assert.throws(only(q(), el("select", { rule: "best" })), /rule is quality-gated or pareto/);
  assert.throws(only(q(), el("select", { rule: "quality-gated" })), /needs its gate/);
  assert.throws(only(el("objective", { name: "distribution" }), sel), /needs the quality objective/);
  assert.throws(only(q(), sel, el("publish", { to: "" })), /to names where a winner goes/);
});
