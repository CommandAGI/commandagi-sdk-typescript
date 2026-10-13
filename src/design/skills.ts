/**
 * SKILLS IN JSX — a `skill.tsx`: one skill of a symbolic agent's repertoire, in a folder of its own
 * (`skills/<name>/skill.tsx`; docs/symbolic-agents.md, in the CommandAGI repository). A symbolic agent runs with no
 * model: it parses what is said against the phrases of its skills, and runs the one that parses. A skill's name is its
 * folder's name, so the file never names itself.
 *
 *   // skills/count-errors/skill.tsx
 *   export default () => (
 *     <skill about="How many lines of a file say error.">
 *       <phrase match="count [the] errors in {file:path}" />
 *       <step tool="read_file" args={{ path: "{file}" }} as="read" />
 *       <step script="./count.ts" args={{ text: "{read.text}", word: "error" }} as="n" />
 *       <reply text="{file} has {n} lines that say error." />
 *     </skill>
 *   );
 *
 *   // skills/count-errors/count.ts — a literal script: it runs in the code sandbox with the step's args as its inputs
 *   import { result } from "commandagi/design";
 *   export default ({ text, word }) => result(text.split("\n").filter((l) => l.includes(word)).length);
 *
 * What a skill holds, each a child element in the order written:
 *   <phrase match>     how it is asked for: words, [optional words], (one|of|these) and typed slots {name:type}
 *   <step …>           what it does. Exactly one of `expr` (an expression over the bindings), `tool` (a CommandAGI
 *                      tool, called as the agent), `script` (a code file beside the skill: it returns `result(value)`,
 *                      or `<result value={…} />` in a `.tsx`), `skill` (another skill, by
 *                      ref) or `see` (a classical vision operation on `image`); `args`; `as` binds its value;
 *                      `always` runs it even when an earlier step failed (close what was opened)
 *   <reply text>       what it says, with {bindings} filled in
 *   <rule if then>     a rule it knows: `if` facts hold, `then` a fact holds
 *   <fact is>          a fact it knows
 *   <example say reply>  an utterance and the reply it must give: the skill's own check
 * and on `<skill>` itself `needs`, `gives` and `removes`: the facts a plan may assume of it.
 *
 * Structure only: the phrases, expressions and facts are read, and a skill is admitted or rejected, by the agent's
 * runtime (packages/domain/world/symbolic). Nothing adds a default: what the file does not say, the document does not have.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";
import { jsx } from "./jsx-runtime.js";

export const SKILL_FIELDS = ["about", "needs", "gives", "removes", "origin"] as const;
export const PHRASE_FIELDS = ["match"] as const;
export const STEP_KINDS = ["expr", "tool", "script", "skill", "see"] as const;
export const STEP_FIELDS = [...STEP_KINDS, "args", "as", "always", "image", "template", "against"] as const;
export const RULE_FIELDS = ["if", "then", "name"] as const;
export const EXAMPLE_FIELDS = ["say", "reply"] as const;

/** A skill's file name, in the skill's own folder. */
export const SKILL_FILE = /^skill\.(?:[jt]sx|py|rs)$/i;

export interface SkillStep {
  /** An expression over the bindings: `count(filter(lines(read.text), contains(it, "error")))`. */
  expr?: string;
  /** A CommandAGI tool, called as the agent's principal: `read_file`, `send_command`. */
  tool?: string;
  /** A code file beside the skill (`./count.ts`), run in the code sandbox with `args` as its inputs; it declares a `<result>`. */
  script?: string;
  /** Another skill: a ref to its folder, relative to this skill's folder (`../count-lines`), or an address. */
  skill?: string;
  /** A classical vision operation on `image`: `size`, `mean`, `blobs`, `locate` (with `template`), `changed` (with `against`). */
  see?: string;
  /** The step's arguments. A text reads `{binding}`; a text that is one `{binding}` is the binding's value. */
  args?: Record<string, unknown>;
  /** The name its value is bound to for the steps after it and the reply. */
  as?: string;
  /** It runs even when an earlier step failed (close what was opened). What it returns is then not used. */
  always?: boolean;
  image?: string;
  template?: string;
  against?: string;
}
export interface SkillRule {
  /** The facts it needs: `unit(?u, ?d)`, `not armed(?u)`, `?a < ?b`. */
  if: string | string[];
  /** The fact that then holds. */
  then: string;
  name?: string;
}
export interface SkillExample {
  say: string;
  reply: string;
}
export interface SkillDoc {
  about?: string;
  /** What a plan may assume: the facts it needs before, the facts that hold after, the facts that no longer hold. */
  needs?: string[];
  gives?: string[];
  removes?: string[];
  /** Where it came from when a program wrote it (`induced:symbolic-inductor-001`). */
  origin?: string;
  phrases: { match: string }[];
  steps: SkillStep[];
  reply?: string;
  rules: SkillRule[];
  facts: string[];
  examples: SkillExample[];
}

/** What a literal script declares: the value its step binds. */
export interface ResultDoc {
  value: unknown;
}

const said = (attrs: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => attrs[k] !== undefined).map((k) => [k, attrs[k]]));
const nothing = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const attrsOf = (o: object, keys: readonly string[]) => Object.fromEntries(keys.filter((k) => !nothing((o as Record<string, unknown>)[k])).map((k) => [k, (o as Record<string, unknown>)[k]]));
function text(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && (typeof v !== "string" || !v)) throw new Error(`<${t.tag}> ${k} is text, not ${JSON.stringify(v)}`);
}
function texts(t: DocTree, k: string): void {
  const v = t.attrs[k];
  if (v !== undefined && !(Array.isArray(v) && v.every((x) => typeof x === "string" && x))) throw new Error(`<${t.tag}> ${k} is a list of facts (["at(?unit, home)"]), not ${JSON.stringify(v)}`);
}

function skillOf(t: DocTree): SkillDoc {
  for (const k of ["about", "origin"]) text(t, k);
  for (const k of ["needs", "gives", "removes"]) texts(t, k);
  const parts = (tag: string) => t.children.filter((c) => c.tag === tag);
  const steps = parts("step").map((s, i) => {
    const kinds = STEP_KINDS.filter((k) => s.attrs[k] !== undefined);
    if (kinds.length !== 1) throw new Error(`<step> ${i + 1} is exactly one of ${STEP_KINDS.join(", ")}${kinds.length ? ` (it has ${kinds.join(" and ")})` : ""}`);
    for (const k of [...STEP_KINDS, "as", "image", "template", "against"]) text(s, k);
    if (s.attrs.always !== undefined && typeof s.attrs.always !== "boolean") throw new Error(`<step> ${i + 1}: always is true or false, not ${JSON.stringify(s.attrs.always)}`);
    const args = s.attrs.args;
    if (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args))) throw new Error(`<step> ${i + 1}: args is an object ({ path: "{file}" }), not ${JSON.stringify(args)}`);
    return said(s.attrs, STEP_FIELDS) as SkillStep;
  });
  const rules = parts("rule").map((r) => {
    const cond = r.attrs.if;
    if (!(typeof cond === "string" && cond) && !(Array.isArray(cond) && cond.length && cond.every((x) => typeof x === "string" && x))) throw new Error(`<rule> if is a fact or a list of facts, not ${JSON.stringify(cond)}`);
    text(r, "then");
    text(r, "name");
    return said(r.attrs, RULE_FIELDS) as unknown as SkillRule;
  });
  const reply = parts("reply")[0];
  if (reply) text(reply, "text");
  return {
    ...(said(t.attrs, SKILL_FIELDS) as Partial<SkillDoc>),
    phrases: parts("phrase").map((p) => (text(p, "match"), { match: p.attrs.match as string })),
    steps,
    ...(reply ? { reply: reply.attrs.text as string } : {}),
    rules,
    facts: parts("fact").map((f) => (text(f, "is"), f.attrs.is as string)),
    examples: parts("example").map((e) => {
      if (typeof e.attrs.say !== "string" || !e.attrs.say || typeof e.attrs.reply !== "string") throw new Error(`<example> is say="…" reply="…"`);
      return { say: e.attrs.say, reply: e.attrs.reply };
    }),
  };
}

const leaf = (tag: string, attrs: Record<string, unknown>): DocTree => ({ tag, attrs, children: [] });

export const skillVocabulary: Vocabulary<SkillDoc> = {
  format: "skill",
  noun: "a skill",
  root: "skill",
  tags: {
    skill: { parents: [], attrs: SKILL_FIELDS },
    phrase: { parents: ["skill"], key: "match", required: ["match"], attrs: PHRASE_FIELDS },
    step: { parents: ["skill"], attrs: STEP_FIELDS },
    reply: { parents: ["skill"], single: true, required: ["text"], attrs: ["text"] },
    rule: { parents: ["skill"], required: ["if", "then"], attrs: RULE_FIELDS },
    fact: { parents: ["skill"], key: "is", required: ["is"], attrs: ["is"] },
    example: { parents: ["skill"], key: "say", required: ["say", "reply"], attrs: EXAMPLE_FIELDS },
  },
  fromTree: skillOf,
  toTree: (s) => ({
    tag: "skill",
    attrs: attrsOf(s, SKILL_FIELDS),
    children: [
      ...(s.phrases ?? []).map((p) => leaf("phrase", { match: p.match })),
      ...(s.steps ?? []).map((x) => leaf("step", attrsOf(x, STEP_FIELDS))),
      ...(s.reply ? [leaf("reply", { text: s.reply })] : []),
      ...(s.rules ?? []).map((r) => leaf("rule", attrsOf(r, RULE_FIELDS))),
      ...(s.facts ?? []).map((f) => leaf("fact", { is: f })),
      // An example's reply may be empty text, which is still a reply.
      ...(s.examples ?? []).map((e) => leaf("example", { say: e.say, reply: e.reply })),
    ],
  }),
  empty: () => ({ phrases: [], steps: [], rules: [], facts: [], examples: [] }),
};

export const resultVocabulary: Vocabulary<ResultDoc> = {
  format: "result",
  noun: "a script's result",
  root: "result",
  tags: { result: { parents: [], required: ["value"], attrs: ["value"] } },
  fromTree(t) {
    if (t.children.length) throw new Error(`<result> has no children; its value is its value={…} attribute`);
    return { value: t.attrs.value };
  },
  toTree: (r) => leaf("result", { value: r.value }),
};

/** What a literal script returns: `result(value)` is `<result value={value} />`, for a script that is not JSX. */
export const result = (value: unknown): unknown => jsx("result", { value });

registerVocabulary(skillVocabulary);
registerVocabulary(resultVocabulary);

/** The vocabularies of a symbolic agent's repertoire, by format. */
export const SKILLS = { skill: skillVocabulary, result: resultVocabulary } as const;
