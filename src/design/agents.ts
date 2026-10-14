/**
 * AGENTS IN JSX — a `harness.tsx` and an `agent.tsx` (docs/agents.md, in the CommandAGI repository).
 *
 * A harness is the program that runs an agent and talks to a model: a CLI agent (Claude Code, Codex CLI …), an API
 * provider's loop (Anthropic Messages, OpenAI Responses …), or a program with no model at all. An agent instance runs
 * on one harness. A base instance names its harness and has no parent; every other instance is a fork: it names its
 * parent and keeps its parent's harness.
 *
 *   // cloud://global/agents/harnesses/claude-code/harness.tsx
 *   export default () => <harness kind="cli" label="Claude Code" provider="anthropic" cli="claude" runs={["host", "vm"]} />;
 *
 *   // cloud://global/agents/harnesses/symbolic-planner-001/harness.tsx — a program with no model, one variant of a family
 *   export default () => <harness kind="program" label="Symbolic Planner 001" family="symbolic" experimental runs={["host"]} />;
 *
 *   // cloud://global/agents/harnesses/scaledown-classify-1/harness.tsx — a model that does one task in one pass
 *   export default () => <harness kind="api" label="ScaleDown Classify-1" provider="scaledown" tasks={["classify", "decide"]} family="system-one" experimental runs={["host"]} />;
 *
 *   // cloud://global/agents/claude-code/agent.tsx — the one base instance of a CLI harness
 *   export default () => <agent harness="claude-code" name="Claude Code" />;
 *
 *   // agents/secretary/agent.tsx in an account's Drive — a fork
 *   export default () => <agent parent="cloud://global/agents/claude-code" name="Joe's secretary" instructions="Keep Joe's calendar." />;
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
/** Where a harness runs: this machine's host (`local-host/agent-clis.mjs`), a cloud computer (the thread's VM kernel), or the api worker's loop. */
export const HARNESS_RUNTIMES = ["host", "vm", "worker"] as const;
/**
 * What a single-task model does in one turn: it takes a task-shaped input and answers a typed value. `classify`: one of
 * the caller's labels with a probability for each; `decide`: typed answers (yes or no, one of several, a level of a
 * scale); `extract`: the spans of the fields the caller describes; `summarize`: a bounded summary; `act`: one input
 * action on a computer.
 */
export const HARNESS_TASKS = ["classify", "decide", "extract", "summarize", "act"] as const;
export const HARNESS_FIELDS = ["kind", "label", "provider", "cli", "runs", "tasks", "family", "experimental", "homepage", "about"] as const;
export const AGENT_FIELDS = ["harness", "parent", "name", "model", "effort", "instructions", "voice", "voiceMode", "tools", "persona", "color", "icon", "gender"] as const;
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
  /** The family it is a variant of (`symbolic`, `system-one`): harnesses that share one runtime and differ in how they decide. */
  family?: string;
  /** It may change or go without notice; what it does is not commissioned. Absent: not said. */
  experimental?: boolean;
  homepage?: string;
  about?: string;
}

export interface AgentDoc {
  /** A base instance's harness (a harness id). A fork does not say it: it keeps its parent's. */
  harness?: string;
  /** A fork's parent: a ref to the parent agent's folder. A base has none. */
  parent?: string;
  name?: string;
  /** The model it runs, from the model catalog (`anthropic/claude-opus-5-5`); a program harness has none. */
  model?: string;
  effort?: string;
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
  return said(t.attrs, HARNESS_FIELDS) as unknown as HarnessDoc;
}

function agentOf(t: DocTree): AgentDoc {
  for (const k of ["harness", "parent", "name", "model", "effort", "instructions", "voice", "color", "icon", "gender"]) word(t, k);
  oneOf(t, "voiceMode", VOICE_MODES);
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
