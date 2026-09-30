/**
 * THE OP-GRAPH IR — what every `commandagi/design` primitive produces: plain JSON, the same op graph every
 * CommandAGI editor stores (docs/formats.md § op graphs in the CommandAGI repository).
 *
 *   { id, nodes: { <id>: { id, type, label?, inputs, disabled?, meta? } }, outputs?, meta? }
 *
 * A node has ONE map of ports, `inputs`: a port holds a literal value, or one wire
 * `{ "wire": { "node", "port" } }` to another node's output port. A node that takes many upstreams has
 * numbered channels (`layers.1 … layers.N`). The graph's terminals are `outputs`.
 *
 * This module is STRUCTURE ONLY. Nothing here evaluates a graph: there is no geometry kernel, no solver, no
 * router and no renderer in the SDK. An engine (a CommandAGI editor, the local host) evaluates what you
 * declare.
 */

/** The upstream end of a wire: a node id and one of its output port ids. */
export interface IRBinding {
  node: string;
  port: string;
}

/** A port holding a wire (`value` is a literal kept beside it, ignored while wired). */
export interface IRWire {
  wire: IRBinding;
  value?: unknown;
}

export interface IRNode {
  id: string;
  type: string;
  label?: string;
  /** Port id → a literal, an {@link IRWire}, or null (an empty channel). */
  inputs: Record<string, unknown>;
  disabled?: boolean;
  meta?: Record<string, unknown>;
}

export interface IRGraph {
  id: string;
  nodes: Record<string, IRNode>;
  outputs?: string[];
  meta?: Record<string, unknown>;
}

/** A parameter a code file declares: `export const params = { width: { default: 40, unit: "mm" } }`. */
export interface ParamDecl {
  default: unknown;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  doc?: string;
}

/** One output port of a declared node — what a wire is drawn from. */
export class Out {
  constructor(
    readonly node: string,
    readonly port: string,
  ) {}
  toWire(): IRWire {
    return { wire: { node: this.node, port: this.port } };
  }
}

/** A declared node. Using it where a port value goes wires that port to the node's `out`. */
export class NodeRef {
  constructor(
    readonly scope: Scope,
    readonly id: string,
  ) {}
  /** One of this node's output ports. */
  out(port = "out"): Out {
    return new Out(this.id, port);
  }
  /** The node as declared so far. */
  get node(): IRNode {
    const n = this.scope.nodes[this.id];
    if (!n) throw new Error(`node ${this.id} is not in ${this.scope.id}`);
    return n;
  }
  /** Set (or replace) one port. */
  set(port: string, value: unknown): this {
    this.node.inputs[port] = portValue(value, `${this.id}.${port}`);
    return this;
  }
}

/** Anything that can drive a port: a literal, an output port, or a node (its `out`). */
export type PortValue = unknown;

/** A port's stored form: a node or output becomes a wire; a literal stays itself. */
export function portValue(value: unknown, where: string): unknown {
  if (value instanceof Out) return value.toWire();
  if (value instanceof NodeRef) return value.out().toWire();
  assertLiteral(value, where);
  return value;
}

function assertLiteral(value: unknown, where: string, depth = 0): void {
  if (value === null || value === undefined) return;
  if (value instanceof Out || value instanceof NodeRef)
    throw new Error(
      `${where}: a wire drives a whole port, not a field inside one. Pass the node as the port's value, or compute the literal in code.`,
    );
  const t = typeof value;
  if (t === "function" || t === "symbol" || t === "bigint")
    throw new Error(`${where}: a ${t} is not plain data (ports hold JSON)`);
  if (t === "number" && !Number.isFinite(value as number))
    throw new Error(`${where}: ${String(value)} is not a finite number`);
  if (t !== "object") return;
  if (depth > 64) throw new Error(`${where}: nested too deep`);
  if (Array.isArray(value)) value.forEach((v, i) => assertLiteral(v, `${where}[${i}]`, depth + 1));
  else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null)
      throw new Error(`${where}: a ${proto?.constructor?.name ?? "class"} instance is not plain data`);
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) assertLiteral(v, `${where}.${k}`, depth + 1);
  }
}

/** Numbered channels of one set: `channels("layers", [a, b])` → `{ "layers.1": a, "layers.2": b }`. */
export function channels(set: string, values: readonly PortValue[]): Record<string, PortValue> {
  const out: Record<string, PortValue> = {};
  values.forEach((v, i) => (out[`${set}.${i + 1}`] = v));
  return out;
}

const ID_SAFE = /[^A-Za-z0-9_.\-]+/g;
/** A node id from free text: letters, digits, `_ . -` (ids travel inside paths and edge ids). */
export function slug(raw: string, fallback = "node"): string {
  const s = raw.replace(ID_SAFE, "_").replace(/^_+|_+$/g, "");
  return s || fallback;
}

/**
 * Where declarations go: one graph being built. Ids are DETERMINISTIC (from the label or type, numbered on
 * collision in declaration order), so running the same file twice declares the same graph — an engine can
 * keep a reference to a declared node across runs.
 */
export class Scope {
  readonly nodes: Record<string, IRNode> = {};
  readonly outputs: string[] = [];
  private readonly taken = new Set<string>();
  /** The next number to try per base (so naming N nodes alike stays linear). */
  private readonly next = new Map<string, number>();
  constructor(
    readonly id: string,
    readonly meta: Record<string, unknown> = {},
  ) {}

  uniqueId(base: string): string {
    const b = slug(base);
    let id = b;
    let n = this.next.get(b) ?? 2;
    while (this.taken.has(id)) id = `${b}_${n++}`;
    this.next.set(b, n);
    this.taken.add(id);
    return id;
  }

  /** Declare a node. `inputs` values may be literals, nodes or output ports. */
  add(
    type: string,
    inputs: Record<string, PortValue> = {},
    opts: { id?: string; label?: string; meta?: Record<string, unknown> } = {},
  ): NodeRef {
    let id: string;
    if (opts.id !== undefined) {
      id = slug(opts.id);
      if (this.taken.has(id)) throw new Error(`${this.id}: two nodes are called ${id}`);
      this.taken.add(id);
    } else id = this.uniqueId(opts.label ?? type);
    const stored: Record<string, unknown> = {};
    for (const [port, v] of Object.entries(inputs)) if (v !== undefined) stored[port] = portValue(v, `${id}.${port}`);
    const node: IRNode = { id, type, inputs: stored };
    if (opts.label !== undefined) node.label = opts.label;
    if (opts.meta) node.meta = { ...opts.meta };
    this.nodes[id] = node;
    return new NodeRef(this, id);
  }

  /** Mark nodes as the graph's terminals (what it defines), in order. */
  output(...refs: (NodeRef | string)[]): void {
    for (const r of refs) {
      const id = typeof r === "string" ? r : r.id;
      if (!this.outputs.includes(id)) this.outputs.push(id);
    }
  }

  /** Nodes no other node wires from — the default terminals. */
  sinks(): string[] {
    const used = new Set<string>();
    for (const n of Object.values(this.nodes))
      for (const v of Object.values(n.inputs))
        if (v && typeof v === "object" && "wire" in (v as object)) used.add((v as IRWire).wire.node);
    return Object.keys(this.nodes).filter((id) => !used.has(id));
  }

  build(): IRGraph {
    const outputs = this.outputs.length ? [...this.outputs] : this.sinks();
    return JSON.parse(
      JSON.stringify({ id: this.id, nodes: this.nodes, ...(outputs.length ? { outputs } : {}), meta: this.meta }),
    ) as IRGraph;
  }
}

const stack: Scope[] = [];

/** The scope a primitive declares into. */
export function currentScope(what = "this primitive"): Scope {
  const s = stack[stack.length - 1];
  if (!s)
    throw new Error(
      `${what} declares structure and must be called inside part(…), circuit(…) or graph(…) (commandagi/design)`,
    );
  return s;
}

/** Run `fn` with `scope` as the place declarations go. */
export function withScope<T>(scope: Scope, fn: () => T): T {
  stack.push(scope);
  try {
    return fn();
  } finally {
    stack.pop();
  }
}

/** A finished declaration: its op graph, and what kind of thing it declares. */
export class Declaration {
  constructor(
    readonly kind: string,
    readonly ir: IRGraph,
  ) {}
  toJSON(): IRGraph {
    return this.ir;
  }
}

/** Whether a value is an IR graph (plain JSON, as a file may also export directly). */
export function isIRGraph(value: unknown): value is IRGraph {
  if (!value || typeof value !== "object") return false;
  const g = value as IRGraph;
  if (typeof g.id !== "string" || !g.nodes || typeof g.nodes !== "object" || Array.isArray(g.nodes)) return false;
  return Object.entries(g.nodes).every(
    ([id, n]) => !!n && typeof n === "object" && n.id === id && typeof n.type === "string" && !!n.inputs && typeof n.inputs === "object",
  );
}

/** Check an IR graph is well formed: ids agree, wires name nodes that exist, terminals exist. Returns problems. */
export function checkIR(g: IRGraph): string[] {
  const out: string[] = [];
  if (!isIRGraph(g)) return ["not an op graph ({ id, nodes: { <id>: { id, type, inputs } } })"];
  for (const n of Object.values(g.nodes)) {
    for (const [port, v] of Object.entries(n.inputs)) {
      if (v && typeof v === "object" && !Array.isArray(v) && "wire" in (v as object)) {
        const w = (v as IRWire).wire;
        if (!w || typeof w.node !== "string" || typeof w.port !== "string") out.push(`${n.id}.${port}: a wire names { node, port }`);
        else if (!g.nodes[w.node]) out.push(`${n.id}.${port}: wired from ${w.node}, which is not declared`);
      }
    }
  }
  for (const id of g.outputs ?? []) if (!g.nodes[id]) out.push(`output ${id} is not declared`);
  return out;
}
