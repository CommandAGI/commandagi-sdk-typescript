/**
 * GRAPHS OF ANY DOMAIN — the general primitives every domain module is built on.
 *
 *   import { graph, node, input, code } from "commandagi/design";
 *
 *   export default graph("Mix", () => {
 *     const gain = input("gain", 0.8, { min: 0, max: 1 });
 *     const a = node("oscillator", { frequency: 440 });
 *     const b = node("oscillator", { frequency: 660 });
 *     return node("mixer", { gain, ...channels("channels", [a, b]) });
 *   });
 *
 * `node(type, inputs)` declares one node of a domain's op (the op types are the domain's: a draw layer, a
 * video clip, a music instrument, a circuit part, a 3D feature). `input` declares one of the graph's own
 * inputs (the built-in `input` op). `code` declares a node that runs another code file. Structure only: the
 * engine that knows what "mixer" means evaluates it.
 */
import { Declaration, NodeRef, Scope, currentScope, withScope, type PortValue } from "./ir.js";

export { channels } from "./ir.js";

/** The op type of a graph input node, and of a code node (built into every CommandAGI registry). */
export const INPUT_OP = "input";
export const CODE_OP = "code";

/**
 * Declare a whole graph. `fn` declares its nodes; what it returns (a node or a list of nodes) are the
 * graph's terminals, else every node nothing wires from.
 */
export function graph(
  name: string,
  fn: () => NodeRef | NodeRef[] | void,
  opts: { id?: string; domain?: string; meta?: Record<string, unknown> } = {},
): Declaration {
  const scope = new Scope(opts.id ?? name, { name, ...(opts.domain ? { domain: opts.domain } : {}), ...(opts.meta ?? {}) });
  const result = withScope(scope, fn);
  if (result) scope.output(...(Array.isArray(result) ? result : [result]));
  return new Declaration("graph", scope.build());
}

/** Declare one node of `type`. */
export function node(
  type: string,
  inputs: Record<string, PortValue> = {},
  opts: { id?: string; label?: string; meta?: Record<string, unknown> } = {},
): NodeRef {
  return currentScope(`node("${type}")`).add(type, inputs, opts);
}

/** Declare one of the graph's own inputs: its id is its name, `value` its default. */
export function input(
  name: string,
  value: unknown,
  opts: { unit?: string; min?: number; max?: number; step?: number; comment?: string } = {},
): NodeRef {
  const inputs: Record<string, unknown> = { value };
  for (const k of ["unit", "min", "max", "step", "comment"] as const) if (opts[k] !== undefined) inputs[k] = opts[k];
  return currentScope("input()").add(INPUT_OP, inputs, { id: name, label: name });
}

/**
 * A node that runs another code file (a `.ts`, `.tsx`, `.js`, `.jsx` or `.py`, by its path relative to this
 * one; an absolute path is refused), with these inputs. What it outputs is what that file declares.
 */
export function code(
  source: string,
  inputs: Record<string, PortValue> = {},
  opts: { id?: string; label?: string } = {},
): NodeRef {
  return currentScope("code()").add(CODE_OP, { source, ...inputs }, { label: opts.label ?? source.split("/").pop() ?? source, ...(opts.id ? { id: opts.id } : {}) });
}

/** Mark nodes as terminals of the graph being declared. */
export function output(...refs: NodeRef[]): void {
  currentScope("output()").output(...refs);
}
