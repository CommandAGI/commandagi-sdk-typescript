/**
 * AGENTS IN JSX — a `harness.tsx` and an `agent.tsx` (docs/agents.md, in the CommandAGI repository).
 *
 * A harness is the program that runs an agent and talks to a model: a CLI agent (Claude Code, Codex CLI …), an API
 * provider's loop (Anthropic Messages, OpenAI Responses …), or a program with no model at all. An agent instance runs
 * on one harness. A base instance names its harness and has no parent; every other instance is a fork: it names its
 * parent and keeps its parent's harness.
 *
 *   // cloud://global/agents/harnesses/claude-code/harness.tsx
 *   export default () => <harness kind="cli" label="Claude Code" provider="anthropic" cli="claude" runs={["host", "cloud"]} />;
 *
 *   // cloud://global/agents/harnesses/symbolic-planner-001/harness.tsx — a program with no model, one variant of a family
 *   export default () => <harness kind="program" label="Symbolic Planner 001" family="symbolic" experimental runs={["host"]} />;
 *
 *   // cloud://global/agents/harnesses/scaledown-classify-1/harness.tsx — a model that does one task in one pass
 *   export default () => <harness kind="api" label="ScaleDown Classify-1" provider="scaledown" tasks={["classify", "decide"]} family="system-one" experimental runs={["host"]} />;
 *
 *   // cloud://global/agents/harnesses/openai-realtime/harness.tsx — a model that converses live (docs/realtime-agents.md)
 *   export default () => (
 *     <harness kind="api" label="OpenAI Realtime API" provider="openai" runs={["worker", "host"]}
 *       realtime={{ in: ["audio", "video", "text"], out: ["audio", "text", "tools"],
 *         audio: { in: ["g711-ulaw@8000", "pcm16@24000"], out: ["g711-ulaw@8000", "pcm16@24000"] }, fps: 1, hz: 2, minutes: 60 }} />
 *   );
 *
 *   // cloud://global/agents/openai-gpt-realtime-2-1/agent.tsx — a base of a realtime harness: one per realtime model of its provider
 *   export default () => <agent harness="openai-realtime" name="GPT Realtime 2.1" model="openai/gpt-realtime-2.1" />;
 *
 *   // cloud://global/agents/claude-code/agent.tsx — the one base instance of a CLI harness
 *   export default () => <agent harness="claude-code" name="Claude Code" />;
 *
 *   // agents/secretary/agent.tsx in an account's Drive — a fork
 *   export default () => <agent parent="cloud://global/agents/claude-code" name="Joe's secretary" instructions="Keep Joe's calendar." />;
 *
 *   // agents/a2/agent.tsx — a fork on another model, at a reasoning effort its CLI takes
 *   export default () => <agent parent="cloud://global/agents/claude-code" name="A2" model="anthropic/claude-sonnet-5-5" effort="medium" />;
 *
 * A file never names itself: a harness's id is its folder's name, an agent's id is its folder's name. `parent` is a
 * ref to the parent's folder: relative to this agent's folder (`../researcher`), or an address
 * (`cloud://global/agents/claude-code`). `harness` is a harness's id (its folder under `cloud://global/agents/harnesses/`).
 *
 * Nothing adds a default: what the file does not say, the document does not have.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** What runs an agent: a CLI program, an API provider's loop, or a program with no model. */
export const HARNESS_KINDS = ["cli", "api", "program"] as const;
/** Where a harness runs: this machine's host (`local-host/agent-clis.mjs`), a computer in the cloud (a `scripted` program on the thread's computer), a container in the cloud (a CLI's turn per thread member, `docs/agent-clis.md` § a turn in the cloud), or the api worker's loop. */
export const HARNESS_RUNTIMES = ["host", "vm", "cloud", "worker"] as const;
/**
 * What a single-task model does in one turn: it takes a task-shaped input and answers a typed value. `classify`: one of
 * the caller's labels with a probability for each; `decide`: typed answers (yes or no, one of several, a level of a
 * scale); `extract`: the spans of the fields the caller describes; `summarize`: a bounded summary; `act`: one input
 * action on a computer.
 */
export const HARNESS_TASKS = ["classify", "decide", "extract", "summarize", "act"] as const;
/** What a realtime harness's model takes live, and gives live (docs/realtime-agents.md). */
export const REALTIME_IN = ["audio", "video", "text"] as const;
export const REALTIME_OUT = ["audio", "text", "tools"] as const;
/** G.711 μ-law (a telephone call) and 16-bit little-endian PCM, mono, at a rate. */
export const AUDIO_FORMATS = ["g711-ulaw@8000", "pcm16@8000", "pcm16@16000", "pcm16@24000"] as const;
export const HARNESS_FIELDS = ["kind", "label", "provider", "cli", "runs", "tasks", "realtime", "family", "experimental", "homepage", "about"] as const;
export const AGENT_FIELDS = ["harness", "parent", "name", "model", "effort", "supervisor", "instructions", "voice", "voiceMode", "tools", "persona", "color", "icon", "gender"] as const;
export const VOICE_MODES = ["off", "push-to-talk", "open-mic"] as const;

/** A harness's file and an agent's file, each in its own folder. */
export const HARNESS_FILE = /^harness\.(?:[jt]sx|py|rs)$/i;
export const AGENT_FILE = /^agent\.(?:[jt]sx|py|rs)$/i;
/** An id: a folder name. */
export const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export interface HarnessDoc {
  kind: (typeof HARNESS_KINDS)[number];
  label: string;
  /** api: the model catalog's provider id (`anthropic`); cli and program: who makes it. */
  provider?: string;
  /** cli: the program the host or the VM kernel starts (`claude`, `codex`). */
  cli?: string;
  /** Where it runs today. Absent or empty: declared only; nothing runs it yet. */
  runs?: (typeof HARNESS_RUNTIMES)[number][];
  /**
   * api only: the tasks its model does, one in a turn (a model that holds no conversation and calls no tools). Such a
   * harness has exactly one base instance, which names the model. Absent: its agents converse and use tools.
   */
  tasks?: (typeof HARNESS_TASKS)[number][];
  /**
   * api only, not with `tasks`: what its model does in real time. `in`: audio, video (frames), text; `out`: audio
   * (speech), text, tools (calls: actions); `audio`: the formats it takes and gives without conversion; `fps`: the
   * most video frames a second (when it takes video); `hz`: the most tool calls a second (when it calls tools);
   * `minutes`, `videoMinutes`: the longest session the provider allows, and with video.
   */
  realtime?: RealtimeDoc;
  /** The family it is a variant of (`symbolic`, `system-one`): harnesses that share one runtime and differ in how they decide. */
  family?: string;
  /** It may change or go without notice; what it does is not commissioned. Absent: not said. */
  experimental?: boolean;
  homepage?: string;
  about?: string;
}

export interface RealtimeDoc {
  in: (typeof REALTIME_IN)[number][];
  out: (typeof REALTIME_OUT)[number][];
  audio?: { in?: (typeof AUDIO_FORMATS)[number][]; out?: (typeof AUDIO_FORMATS)[number][] };
  fps?: number;
  hz?: number;
  minutes?: number;
  videoMinutes?: number;
}

export interface AgentDoc {
  /** A base instance's harness (a harness id). A fork does not say it: it keeps its parent's. */
  harness?: string;
  /** A fork's parent: a ref to the parent agent's folder. A base has none. */
  parent?: string;
  name?: string;
  /** The model it runs, from the model catalog (`anthropic/claude-opus-5-5`); a program harness has none. */
  model?: string;
  /**
   * The reasoning effort it runs at, in its harness's words (`low`, `medium`, `high`, `xhigh`, `max`; a model of the
   * catalog offers its own ladder). A CLI harness takes it as the CLI does (Claude Code `--effort`, Codex
   * `model_reasoning_effort`); a host refuses an agent whose CLI does not take that effort. A fork keeps its parent's.
   */
  effort?: string;
  /**
   * Who answers the questions it gives on to `role:supervisor` (`agent:<id>` or `person:<id>`): a thread's membership
   * takes it at join, and a person's supervise of that member overrides it.
   */
  supervisor?: string;
  /** Its system prompt. */
  instructions?: string;
  voice?: string;
  voiceMode?: (typeof VOICE_MODES)[number];
  tools?: string[];
  persona?: Record<string, unknown>;
  color?: string;
  icon?: string;
  gender?: string;
}

const where = (t: DocTree) => `<${t.tag}>`;
function word(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && (typeof v !== "string" || !v)) throw new Error(`${where(t)} ${k} is a word, not ${JSON.stringify(v)}`);
}
function oneOf(t: DocTree, k: string, values: readonly string[]): void {
  const v = t.attrs[k];
  if (v !== undefined && !values.includes(v as string)) throw new Error(`${where(t)} ${k} is ${values.map((x) => `"${x}"`).join(", ")}, not ${JSON.stringify(v)}`);
}
function said(attrs: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (attrs[k] !== undefined) out[k] = attrs[k];
  return out;
}
const nothing = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
function attrsOf(o: object, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (!nothing(v)) out[k] = v;
  }
  return out;
}

const REALTIME_FIELDS = ["in", "out", "audio", "fps", "hz", "minutes", "videoMinutes"];
function checkRealtime(v: unknown): void {
  const no = (why: string): never => {
    throw new Error(`<harness> realtime ${why}`);
  };
  if (!v || typeof v !== "object" || Array.isArray(v)) no(`is an object ({ in: ["audio"], out: ["audio", "tools"], … }), not ${JSON.stringify(v)}`);
  const r = v as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!REALTIME_FIELDS.includes(k)) no(`has no field ${k}; its fields are ${REALTIME_FIELDS.join(", ")}`);
  const list = (x: unknown, allowed: readonly string[]) => Array.isArray(x) && x.length > 0 && x.every((y) => allowed.includes(y as string)) && new Set(x).size === x.length;
  if (!list(r.in, REALTIME_IN)) no(`in is a list of ${REALTIME_IN.map((x) => `"${x}"`).join(", ")}`);
  if (!list(r.out, REALTIME_OUT)) no(`out is a list of ${REALTIME_OUT.map((x) => `"${x}"`).join(", ")}`);
  const ins = r.in as string[], outs = r.out as string[];
  const audio = r.audio as Record<string, unknown> | undefined;
  if (ins.includes("audio") || outs.includes("audio")) {
    if (!audio || typeof audio !== "object") no(`audio names the formats it takes and gives: { in: ["pcm16@24000"], out: ["pcm16@24000"] }`);
    for (const side of ["in", "out"] as const)
      if ((side === "in" ? ins : outs).includes("audio") && !list(audio![side], AUDIO_FORMATS)) no(`audio.${side} is a list of ${AUDIO_FORMATS.map((x) => `"${x}"`).join(", ")}`);
  } else if (audio !== undefined) no(`audio is for a harness that takes or gives audio`);
  const positive = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x > 0;
  if (ins.includes("video") && !positive(r.fps)) no(`fps is the most video frames a second it takes (a harness that takes video says it)`);
  if (outs.includes("tools") && !positive(r.hz)) no(`hz is the most tool calls a second it decides (a harness that calls tools says it)`);
  for (const k of ["fps", "hz", "minutes", "videoMinutes"]) if (r[k] !== undefined && !positive(r[k])) no(`${k} is a positive number, not ${JSON.stringify(r[k])}`);
}

function harnessOf(t: DocTree): HarnessDoc {
  for (const k of ["label", "provider", "cli", "family", "homepage", "about"]) word(t, k);
  oneOf(t, "kind", HARNESS_KINDS);
  if (t.attrs.experimental !== undefined && typeof t.attrs.experimental !== "boolean") throw new Error(`<harness> experimental is true or false, not ${JSON.stringify(t.attrs.experimental)}`);
  const runs = t.attrs.runs;
  if (runs !== undefined && !(Array.isArray(runs) && runs.every((r) => (HARNESS_RUNTIMES as readonly string[]).includes(r as string)) && new Set(runs).size === runs.length))
    throw new Error(`<harness> runs is a list of ${HARNESS_RUNTIMES.map((r) => `"${r}"`).join(", ")}, not ${JSON.stringify(runs)}`);
  const tasks = t.attrs.tasks;
  if (tasks !== undefined && !(Array.isArray(tasks) && tasks.length && tasks.every((x) => (HARNESS_TASKS as readonly string[]).includes(x as string)) && new Set(tasks).size === tasks.length))
    throw new Error(`<harness> tasks is a list of ${HARNESS_TASKS.map((x) => `"${x}"`).join(", ")}, not ${JSON.stringify(tasks)}`);
  if (tasks !== undefined && t.attrs.kind !== "api") throw new Error(`<harness> tasks is for kind="api" only: a model that does one task in a turn`);
  if (t.attrs.kind === "cli" && t.attrs.cli === undefined) throw new Error(`<harness kind="cli"> names the program it starts: cli="claude"`);
  if (t.attrs.kind !== "cli" && t.attrs.cli !== undefined) throw new Error(`<harness> cli is for kind="cli" only`);
  if (t.attrs.kind === "api" && t.attrs.provider === undefined) throw new Error(`<harness kind="api"> names its provider in the model catalog: provider="anthropic"`);
  if (t.attrs.realtime !== undefined) {
    if (t.attrs.kind !== "api" || tasks !== undefined) throw new Error(`<harness> realtime is for kind="api" with no tasks: a model that converses live`);
    checkRealtime(t.attrs.realtime);
  }
  return said(t.attrs, HARNESS_FIELDS) as unknown as HarnessDoc;
}

function agentOf(t: DocTree): AgentDoc {
  for (const k of ["harness", "parent", "name", "model", "effort", "supervisor", "instructions", "voice", "color", "icon", "gender"]) word(t, k);
  oneOf(t, "voiceMode", VOICE_MODES);
  if (t.attrs.supervisor !== undefined && !/^(agent|person):\S+$/.test(t.attrs.supervisor as string)) throw new Error(`<agent> supervisor is an agent or a person ("agent:lead", "person:me"), not ${JSON.stringify(t.attrs.supervisor)}`);
  const base = t.attrs.harness !== undefined, fork = t.attrs.parent !== undefined;
  if (base === fork)
    throw new Error(base ? `<agent> names a harness (a base instance) or a parent (a fork), not both: a fork keeps its parent's harness` : `<agent> names its harness (a base instance: harness="claude-code") or its parent (a fork: parent="cloud://global/agents/claude-code")`);
  if (base && !AGENT_ID.test(t.attrs.harness as string)) throw new Error(`<agent> harness is a harness's id ("claude-code"), not ${JSON.stringify(t.attrs.harness)}`);
  const tools = t.attrs.tools;
  if (tools !== undefined && !(Array.isArray(tools) && tools.every((x) => typeof x === "string" && x))) throw new Error(`<agent> tools is a list of tool names, not ${JSON.stringify(tools)}`);
  const persona = t.attrs.persona;
  if (persona !== undefined && (!persona || typeof persona !== "object" || Array.isArray(persona))) throw new Error(`<agent> persona is an object ({ tone: "warm" }), not ${JSON.stringify(persona)}`);
  if (t.children.length) throw new Error(`<agent> has no children; its instructions are its instructions="…" attribute`);
  return said(t.attrs, AGENT_FIELDS) as unknown as AgentDoc;
}

export const harnessVocabulary: Vocabulary<HarnessDoc> = {
  format: "harness",
  noun: "an agent harness",
  root: "harness",
  tags: { harness: { parents: [], required: ["kind", "label"], attrs: HARNESS_FIELDS } },
  fromTree(t) {
    if (t.children.length) throw new Error(`<harness> has no children`);
    return harnessOf(t);
  },
  toTree: (h) => ({ tag: "harness", attrs: attrsOf(h, HARNESS_FIELDS), children: [] }),
};

export const agentVocabulary: Vocabulary<AgentDoc> = {
  format: "agent",
  noun: "an agent",
  root: "agent",
  tags: { agent: { parents: [], attrs: AGENT_FIELDS } },
  fromTree: agentOf,
  toTree: (a) => ({ tag: "agent", attrs: attrsOf(a, AGENT_FIELDS), children: [] }),
};

registerVocabulary(harnessVocabulary);
registerVocabulary(agentVocabulary);

/** The vocabularies of agents, by format. */
export const AGENTS = { harness: harnessVocabulary, agent: agentVocabulary } as const;
