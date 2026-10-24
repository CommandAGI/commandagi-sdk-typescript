/** Routing knowledge documents: shared priors, hard rules, prices and measured observations. */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const ROUTING_KINDS = ["prior", "rule", "price", "observation"] as const;
export type RoutingRecord = { id: string; [key: string]: unknown };
export interface RoutingDoc { priors: RoutingRecord[]; rules: RoutingRecord[]; prices: RoutingRecord[]; observations: RoutingRecord[] }
export const ROUTING_FIELDS = ["id", "region", "text", "config", "harness", "model", "quality", "importance", "cost", "currency", "channel", "billing", "weight", "count", "date", "source", "evidence", "reported", "checked", "task", "uncensored", "sensitive", "deny", "reason", "inputPerMillion", "outputPerMillion", "tokensPerTask", "budget", "tasksPerUsd", "linesPerUsd", "done", "blocked", "linesMerged", "spend"] as const;
const ROOTS = { prior: "priors", rule: "rules", price: "prices", observation: "observations" } as const;
const vocabulary: Vocabulary<RoutingDoc> = {
  format: "routing", noun: "routing knowledge", root: "routing",
  tags: {
    routing: { parents: [], attrs: [] },
    prior: { parents: ["routing"], key: "id", required: ["id"], attrs: ROUTING_FIELDS },
    rule: { parents: ["routing"], key: "id", required: ["id"], attrs: ROUTING_FIELDS },
    price: { parents: ["routing"], key: "id", required: ["id"], attrs: ROUTING_FIELDS },
    observation: { parents: ["routing"], key: "id", required: ["id"], attrs: ROUTING_FIELDS },
  },
  fromTree(t: DocTree) {
    const out: RoutingDoc = { priors: [], rules: [], prices: [], observations: [] };
    const seen = new Set<string>();
    for (const child of t.children) {
      const group = ROOTS[child.tag as keyof typeof ROOTS];
      if (!group) throw new Error(`<${child.tag}> is not routing knowledge`);
      const id = child.attrs.id;
      if (typeof id !== "string" || !id.trim()) throw new Error(`<${child.tag}> id is required`);
      const key = `${child.tag}:${id}`;
      if (seen.has(key)) throw new Error(`duplicate <${child.tag}> id ${JSON.stringify(id)}`);
      seen.add(key);
      out[group].push({ ...child.attrs, id } as RoutingRecord);
    }
    return out;
  },
  toTree(d) { return { tag: "routing", attrs: {}, children: ROUTING_KINDS.flatMap((tag) => d[ROOTS[tag]].map((record) => ({ tag, attrs: { ...record }, children: [] }))) }; },
  empty: () => ({ priors: [], rules: [], prices: [], observations: [] }),
};
registerVocabulary(vocabulary);
export const ROUTING = { routing: vocabulary } as const;
