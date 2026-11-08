/**
 * AN OPTIMIZATION IN JSX — `<name>.optimize.tsx` (or `.jsx`) declares one optimization of generated media (docs/optimization.md
 * in the CommandAGI repository): the brief, the medium and its format, the three objectives with their evaluators, the
 * budget, the selection rule and, optionally, where a winner would be published (only after a principal approves it).
 *
 *   // Signs/Pier 4 ferries.optimize.tsx
 *   export default () => (
 *     <optimize name="Pier 4 ferries" medium="text" generator="openai/gpt-6.1-sol" candidates={4} rounds={3}
 *       brief="A wayfinding sign where walkers leave the footbridge at the Central ferry piers"
 *       message="Turn left for the Pier 4 ferries to Lamma Island" budget={{ usd: 0.5, calls: 40 }}>
 *       <glance seconds={0.5} distanceM={25} panelMm={[2400, 900]} letterMm={150} foreground="#ffffff" background="#00573f" />
 *       <objective name="quality" combine="min">
 *         <evaluator id="legibility" kind="glance" gate={0.8} />
 *         <evaluator id="comprehension" kind="read" model="anthropic/claude-sonnet-5-5" gate={0.7} />
 *       </objective>
 *       <objective name="distribution"><evaluator id="sightline" kind="sightline" approachM={40} /></objective>
 *       <objective name="impact" />
 *       <select rule="quality-gated" gate={0.75} order={["distribution", "impact"]} />
 *     </optimize>
 *   );
 *
 * Three objectives, never one number: `quality`, `distribution` and `impact` each combine only their own evaluators,
 * and an objective with no evaluator is unmeasured. A text optimization has a `<glance>` (how the text is met: the
 * glance in seconds, the reading distance, the panel and its largest letter, the colours); a video one has a `<clip>`.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** An optimization's file: `<name>.optimize.tsx` (or `.jsx`). */
export const OPTIMIZE_FILE = /\.optimize\.[jt]sx$/i;
export const OPTIMIZE_MEDIA = ["text", "video"] as const;
export const OPTIMIZE_OBJECTIVES = ["quality", "distribution", "impact"] as const;
export const OPTIMIZE_RULES = ["quality-gated", "pareto"] as const;
/**
 * What an evaluator does. Measured: `glance` (the glance model), `sightline` (how far the sign is legible against the
 * approach), `data` (a measured outcome of a text, from a CSV of `text,value`), `picture` (a clip's no-reference
 * measures). Judged by a model: `read` (shown the text at the size the eye resolves, says what it reads and means),
 * `judge` (a rubric: humour, quality), `frames` (a rubric over a clip's sampled frames).
 */
export const EVALUATOR_KINDS = ["glance", "sightline", "data", "picture", "read", "judge", "frames"] as const;
const JUDGED = new Set(["read", "judge", "frames"]);
const TEXT_ONLY = new Set(["glance", "sightline", "read", "data"]);
const VIDEO_ONLY = new Set(["picture", "frames"]);

export const OPTIMIZE_FIELDS = ["name", "medium", "brief", "message", "audience", "generator", "candidates", "rounds", "budget", "seed"] as const;
export const GLANCE_FIELDS = ["seconds", "distanceM", "panelMm", "letterMm", "foreground", "background"] as const;
export const CLIP_FIELDS = ["seconds", "aspect", "still", "motion", "frames"] as const;
export const EVALUATOR_FIELDS = ["id", "kind", "model", "gate", "rubric", "approachM", "data", "metric"] as const;

export interface OptimizeGlance { seconds: number; distanceM: number; panelMm: [number, number]; letterMm: number; foreground: string; background: string }
export interface OptimizeClip { seconds: number; aspect: string; still: string; motion: string; frames: number }
export interface OptimizeEvaluator { id: string; kind: (typeof EVALUATOR_KINDS)[number]; model?: string; gate?: number; rubric?: string; approachM?: number; data?: string; metric?: string }
export interface OptimizeObjective { name: (typeof OPTIMIZE_OBJECTIVES)[number]; combine?: "min" | "mean"; evaluators: OptimizeEvaluator[] }
export interface OptimizeSelect { rule: (typeof OPTIMIZE_RULES)[number]; gate?: number; order?: string[]; tiebreak?: string }
export interface OptimizeDoc {
  name: string;
  medium: (typeof OPTIMIZE_MEDIA)[number];
  brief: string;
  message?: string;
  audience?: string;
  generator: string;
  candidates?: number;
  rounds?: number;
  budget: { usd: number; calls?: number };
  seed?: number;
  glance?: OptimizeGlance;
  clip?: OptimizeClip;
  objectives: OptimizeObjective[];
  select: OptimizeSelect;
  publish?: { to: string };
}

const said = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const COLOUR = /^#[0-9a-f]{6}$/i;
/** A catalog model id: `<provider>/<model>`. */
const MODEL = /^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/;
const only = <T extends object>(attrs: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]])) as T;

function glanceOf(a: Record<string, unknown>): OptimizeGlance {
  const at = "<glance>";
  if (!num(a.seconds, 0.05, 10)) throw new Error(`${at} seconds is the glance, 0.05 to 10 s (1 to 3 saccades: 0.25 to 0.75), not ${said(a.seconds)}`);
  if (!num(a.distanceM, 0.1, 1000)) throw new Error(`${at} distanceM is the reading distance in metres, not ${said(a.distanceM)}`);
  if (!Array.isArray(a.panelMm) || a.panelMm.length !== 2 || !a.panelMm.every((x) => num(x, 10, 100000))) throw new Error(`${at} panelMm is [width, height] in millimetres, not ${said(a.panelMm)}`);
  if (!num(a.letterMm, 1, 5000)) throw new Error(`${at} letterMm is the largest capital's height in millimetres, not ${said(a.letterMm)}`);
  for (const k of ["foreground", "background"] as const)
    if (typeof a[k] !== "string" || !COLOUR.test(a[k] as string)) throw new Error(`${at} ${k} is a colour #rrggbb, not ${said(a[k])}`);
  return only<OptimizeGlance>(a, GLANCE_FIELDS);
}

function clipOf(a: Record<string, unknown>): OptimizeClip {
  const at = "<clip>";
  if (!num(a.seconds, 1, 60)) throw new Error(`${at} seconds is the clip's length, 1 to 60, not ${said(a.seconds)}`);
  if (typeof a.aspect !== "string" || !/^\d+:\d+$/.test(a.aspect)) throw new Error(`${at} aspect is w:h (9:16), not ${said(a.aspect)}`);
  for (const k of ["still", "motion"] as const)
    if (!text(a[k], 120)) throw new Error(`${at} ${k} names a generative model (text-to-image.flux-schnell, image-to-video.kling), not ${said(a[k])}`);
  if (!int(a.frames, 1, 32)) throw new Error(`${at} frames is how many frames a judge sees, 1 to 32, not ${said(a.frames)}`);
  return only<OptimizeClip>(a, CLIP_FIELDS);
}

function evaluatorOf(a: Record<string, unknown>, medium: OptimizeDoc["medium"], objective: string): OptimizeEvaluator {
  if (typeof a.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(a.id)) throw new Error(`<evaluator> id is lower-case letters, digits and dashes, not ${said(a.id)}`);
  const at = `<evaluator id="${a.id}">`;
  if (!(EVALUATOR_KINDS as readonly unknown[]).includes(a.kind)) throw new Error(`${at} kind is ${EVALUATOR_KINDS.join(", ")}, not ${said(a.kind)}`);
  const kind = a.kind as string;
  if (medium === "video" && TEXT_ONLY.has(kind)) throw new Error(`${at} ${kind} measures a text; this optimization's medium is video`);
  if (medium === "text" && VIDEO_ONLY.has(kind)) throw new Error(`${at} ${kind} measures a clip; this optimization's medium is text`);
  if (JUDGED.has(kind) && !(typeof a.model === "string" && MODEL.test(a.model))) throw new Error(`${at} ${kind} is a model's judgement: model is a catalog id (<provider>/<model>), not ${said(a.model)}`);
  if (!JUDGED.has(kind) && a.model !== undefined) throw new Error(`${at} ${kind} is measured: it takes no model`);
  if ((kind === "judge" || kind === "frames") && !text(a.rubric, 2000)) throw new Error(`${at} ${kind} needs its rubric (what a good one is), not ${said(a.rubric)}`);
  if (kind === "sightline" && !num(a.approachM, 1, 2000)) throw new Error(`${at} sightline needs approachM, the metres over which a reader approaches, not ${said(a.approachM)}`);
  if (kind === "sightline" && objective !== "distribution") throw new Error(`${at} sightline measures reach: it belongs to the distribution objective`);
  if (kind === "data" && !text(a.data, 1000)) throw new Error(`${at} data names a CSV of measured outcomes (text,value), not ${said(a.data)}`);
  if (kind === "data" && objective === "quality") throw new Error(`${at} data is a measured outcome: it belongs to distribution or impact`);
  if (kind === "picture" && !["sharpness", "flicker", "freeze"].includes(a.metric as string)) throw new Error(`${at} picture's metric is sharpness, flicker or freeze, not ${said(a.metric)}`);
  if (a.gate !== undefined && !num(a.gate, 0, 1)) throw new Error(`${at} gate is a score from 0 to 1, not ${said(a.gate)}`);
  return only<OptimizeEvaluator>(a, EVALUATOR_FIELDS);
}

/** An optimization as its tree declares it; throws with why it does not read. */
export function optimizeOf(t: DocTree): OptimizeDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.name, 120)) throw new Error(`<optimize> name is a short text (at most 120), not ${said(a.name)}`);
  const at = `<optimize name="${a.name}">`;
  if (!(OPTIMIZE_MEDIA as readonly unknown[]).includes(a.medium)) throw new Error(`${at} medium is ${OPTIMIZE_MEDIA.join(" or ")}, not ${said(a.medium)}`);
  const medium = a.medium as OptimizeDoc["medium"];
  if (!text(a.brief, 4000)) throw new Error(`${at} brief says what the reader or viewer needs, not ${said(a.brief)}`);
  if (medium === "text" && !text(a.message, 500)) throw new Error(`${at} a text's message is what a reader must take away, not ${said(a.message)}`);
  if (!(typeof a.generator === "string" && MODEL.test(a.generator))) throw new Error(`${at} generator is the catalog id of the model agent that writes candidates, not ${said(a.generator)}`);
  if (a.candidates !== undefined && !int(a.candidates, 1, 20)) throw new Error(`${at} candidates is 1 to 20 a round, not ${said(a.candidates)}`);
  if (a.rounds !== undefined && !int(a.rounds, 1, 10)) throw new Error(`${at} rounds is 1 to 10, not ${said(a.rounds)}`);
  if (a.seed !== undefined && !int(a.seed, 0, 2 ** 31)) throw new Error(`${at} seed is a whole number, not ${said(a.seed)}`);
  const b = a.budget;
  if (!isObject(b) || !num(b.usd, 0.001, 1000) || (b.calls !== undefined && !int(b.calls, 1, 10000)) || Object.keys(b).some((k) => k !== "usd" && k !== "calls"))
    throw new Error(`${at} budget is { usd, calls? }: the most the run spends, then it stops; not ${said(b)}`);
  const out = only<OptimizeDoc>(a, OPTIMIZE_FIELDS);
  out.objectives = [];
  const one = (tag: string) => {
    const xs = t.children.filter((c) => c.tag === tag);
    if (xs.length > 1) throw new Error(`${at} has one <${tag}>, not ${xs.length}`);
    return xs[0];
  };
  const glance = one("glance"), clip = one("clip"), sel = one("select"), pub = one("publish");
  if (medium === "text") {
    if (!glance) throw new Error(`${at} a text needs its <glance> (how a reader meets it)`);
    if (clip) throw new Error(`${at} a text has no <clip>`);
    out.glance = glanceOf(glance.attrs as Record<string, unknown>);
  } else {
    if (!clip) throw new Error(`${at} a video needs its <clip>`);
    if (glance) throw new Error(`${at} a video has no <glance>`);
    out.clip = clipOf(clip.attrs as Record<string, unknown>);
  }
  const seen = new Set<string>(), ids = new Set<string>();
  for (const o of t.children.filter((c) => c.tag === "objective")) {
    const oa = o.attrs as Record<string, unknown>;
    if (!(OPTIMIZE_OBJECTIVES as readonly unknown[]).includes(oa.name)) throw new Error(`<objective> name is ${OPTIMIZE_OBJECTIVES.join(", ")}: three kept apart, never one score; not ${said(oa.name)}`);
    if (seen.has(oa.name as string)) throw new Error(`${at} declares the objective ${oa.name} twice`);
    seen.add(oa.name as string);
    if (oa.combine !== undefined && oa.combine !== "min" && oa.combine !== "mean") throw new Error(`<objective name="${oa.name}"> combine is min or mean, not ${said(oa.combine)}`);
    const evaluators = o.children.filter((c) => c.tag === "evaluator").map((c) => evaluatorOf(c.attrs as Record<string, unknown>, medium, oa.name as string));
    for (const e of evaluators) {
      if (ids.has(e.id)) throw new Error(`${at} has two evaluators ${e.id}`);
      ids.add(e.id);
    }
    out.objectives.push({ ...only<OptimizeObjective>(oa, ["name", "combine"]), evaluators });
  }
  if (!seen.has("quality")) throw new Error(`${at} needs the quality objective: the gate every rule reads`);
  if (!sel) throw new Error(`${at} needs its <select rule>: how a winner is chosen is declared, not implied`);
  const sa = sel.attrs as Record<string, unknown>;
  if (!(OPTIMIZE_RULES as readonly unknown[]).includes(sa.rule)) throw new Error(`<select> rule is ${OPTIMIZE_RULES.join(" or ")}, not ${said(sa.rule)}`);
  if (sa.gate !== undefined && !num(sa.gate, 0, 1)) throw new Error(`<select> gate is a quality from 0 to 1, not ${said(sa.gate)}`);
  if (sa.order !== undefined && (!Array.isArray(sa.order) || !sa.order.every((x) => (OPTIMIZE_OBJECTIVES as readonly unknown[]).includes(x))))
    throw new Error(`<select> order lists objectives (${OPTIMIZE_OBJECTIVES.join(", ")}), not ${said(sa.order)}`);
  if (sa.tiebreak !== undefined && !(OPTIMIZE_OBJECTIVES as readonly unknown[]).includes(sa.tiebreak)) throw new Error(`<select> tiebreak is an objective, not ${said(sa.tiebreak)}`);
  if (sa.rule === "quality-gated" && sa.gate === undefined) throw new Error(`<select rule="quality-gated"> needs its gate`);
  out.select = only<OptimizeSelect>(sa, ["rule", "gate", "order", "tiebreak"]);
  if (pub) {
    const to = (pub.attrs as Record<string, unknown>).to;
    if (!text(to, 1000)) throw new Error(`<publish> to names where a winner goes once a principal approves it, not ${said(to)}`);
    out.publish = { to };
  }
  return out;
}

export const optimizeVocabulary: Vocabulary<OptimizeDoc> = {
  format: "optimize",
  noun: "an optimization",
  root: "optimize",
  tags: {
    optimize: { parents: [], required: ["name", "medium", "brief", "generator", "budget"], attrs: OPTIMIZE_FIELDS },
    glance: { parents: ["optimize"], required: [...GLANCE_FIELDS], attrs: GLANCE_FIELDS },
    clip: { parents: ["optimize"], required: [...CLIP_FIELDS], attrs: CLIP_FIELDS },
    objective: { parents: ["optimize"], key: "name", required: ["name"], attrs: ["name", "combine"] },
    evaluator: { parents: ["objective"], key: "id", required: ["id", "kind"], attrs: EVALUATOR_FIELDS },
    select: { parents: ["optimize"], required: ["rule"], attrs: ["rule", "gate", "order", "tiebreak"] },
    publish: { parents: ["optimize"], required: ["to"], attrs: ["to"] },
  },
  fromTree: optimizeOf,
  toTree(d) {
    const el = (tag: string, attrs: Record<string, unknown>, children: DocTree[] = []): DocTree => ({ tag, attrs: Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== undefined)), children });
    return el("optimize", only(d as never, OPTIMIZE_FIELDS), [
      ...(d.glance ? [el("glance", { ...d.glance })] : []),
      ...(d.clip ? [el("clip", { ...d.clip })] : []),
      ...(d.objectives ?? []).map((o) => el("objective", { name: o.name, combine: o.combine }, o.evaluators.map((e) => el("evaluator", { ...e })))),
      ...(d.select ? [el("select", { ...d.select })] : []),
      ...(d.publish ? [el("publish", { ...d.publish })] : []),
    ]);
  },
  empty: (name) => ({
    name: name || "Optimization",
    medium: "text",
    brief: "Who reads it, where, and what they need",
    message: "What a reader must take away",
    generator: "openai/gpt-6.1-sol",
    budget: { usd: 0.5 },
    glance: { seconds: 0.5, distanceM: 20, panelMm: [2000, 800], letterMm: 150, foreground: "#ffffff", background: "#00573f" },
    objectives: [{ name: "quality", evaluators: [{ id: "legibility", kind: "glance", gate: 0.8 }] }],
    select: { rule: "quality-gated", gate: 0.75 },
  }),
};

registerVocabulary(optimizeVocabulary);

/** The vocabulary of an optimization, by format. */
export const OPTIMIZE = { optimize: optimizeVocabulary } as const;
