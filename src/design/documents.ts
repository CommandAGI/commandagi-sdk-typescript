/**
 * DOCUMENTS IN JSX — a JSON document of CommandAGI (a world, a device definition, a dashboard, a geo project) written
 * as a tree of elements. Each element is one record of the document, and its attributes are that record's fields,
 * verbatim (`<unit uid="arm" position={[0, 0, 0]} />` is the unit `{ "uid": "arm", "position": [0, 0, 0] }`). A
 * vocabulary (`./ontology.ts`) says which tags a document has, where each may stand, which attribute names a record
 * among its siblings, and how the tree maps to the document's JSON, both ways.
 *
 * What a run gives back is the tree, carried in the op graph every code part declares: one node per element, in
 * document order (`e0` is the root), `type` `<format>.<tag>`, `inputs` its attributes, `meta.parent` its parent's id
 * and `meta.source` where the element was written (`__source`, for the editor that writes an edit back into the file).
 * `documentTree(graph)` reads the tree back; `documentOf(graph)` the document's JSON.
 *
 * Structure only: the document is checked for its vocabulary's shape here, and for its meaning by the application
 * that reads it (a world's validation, a definition's bounds). A code form declares; the host still enforces.
 */
import { Declaration, type IRGraph, type IRNode } from "./ir.js";
import { childElements, isElement, type DesignElement } from "./jsx-runtime.js";

/** One element of a document: its tag, its attributes (the record's fields), its children, and where it was written. */
export interface DocTree {
  tag: string;
  attrs: Record<string, unknown>;
  children: DocTree[];
  /** The element's `__source` (a run's source map), absent for a tree made from a document. */
  source?: unknown;
}

/** Where a tag may stand, and how its records are told apart. */
export interface TagRule {
  /** The tags it may be a child of (none: it is the root). */
  parents: readonly string[];
  /** The attribute that names one record among its siblings of this tag (`uid`, `id`). */
  key?: string;
  /** The order of these siblings means something (a split's two sides); else only their set does. */
  ordered?: boolean;
  /** At most one per parent. */
  single?: boolean;
  /** Attributes it must have. */
  required?: readonly string[];
  /** The attributes it may have; absent: any. */
  attrs?: readonly string[];
}

/** A document format written as elements: its tags, and its JSON both ways. */
export interface Vocabulary<D = unknown> {
  /** The format's name: the prefix of its nodes' types (`world.unit`). */
  format: string;
  /** What a person calls it ("a world"). */
  noun: string;
  root: string;
  tags: Readonly<Record<string, TagRule>>;
  /** The document a tree declares. Adds nothing the tree does not say: no defaults. */
  fromTree(tree: DocTree): D;
  /** The tree a document is (the inverse of `fromTree`). */
  toTree(doc: D): DocTree;
  /** The document an empty file declares before its first edit (the editor shows it; the first edit writes the file). */
  empty?(name: string): D;
}

const vocabularies = new Map<string, Vocabulary<any>>();

/** Make a vocabulary's root tag a document a code file may declare. */
export function registerVocabulary(v: Vocabulary<any>): void {
  vocabularies.set(v.root, v);
  vocabularies.set(`format:${v.format}`, v);
}

/** The vocabulary of a root tag, or of a format (`format:world`), if one is registered. */
export function vocabularyOf(rootOrFormat: string): Vocabulary<any> | undefined {
  return vocabularies.get(rootOrFormat);
}

/** Whether a declared value is the root element of a registered document. */
export function isDocumentElement(value: unknown): value is DesignElement {
  return isElement(value) && vocabularies.has(value.type) && !value.type.startsWith("format:");
}

const where = (el: DesignElement, key?: string) =>
  `<${el.type}${key && typeof el.props[key] === "string" ? ` ${key}="${el.props[key] as string}"` : ""}>`;

function plain(v: unknown, what: string): unknown {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${what} is ${v}, not a finite number`);
    return v;
  }
  if (Array.isArray(v)) return v.map((x, i) => plain(x, `${what}[${i}]`));
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, plain(x, `${what}.${k}`)]));
  throw new Error(`${what} is plain data (numbers, strings, booleans, lists and objects of them)`);
}

/** The tree an element declares, checked against the vocabulary's tags (the root's rule has no parents). */
export function treeOfElement(root: DesignElement, v: Vocabulary<any>): DocTree {
  const visit = (el: DesignElement, parent: string | null): DocTree => {
    const rule = v.tags[el.type];
    if (!rule) throw new Error(`<${el.type}> is not a tag of ${v.noun} (${Object.keys(v.tags).map((t) => `<${t}>`).join(", ")})`);
    if (parent === null ? rule.parents.length > 0 : !rule.parents.includes(parent))
      throw new Error(parent === null ? `${v.noun} in code is one <${v.root}> element, not <${el.type}>` : `<${el.type}> stands in ${rule.parents.map((p) => `<${p}>`).join(" or ")}, not in <${parent}>`);
    const attrs: Record<string, unknown> = {};
    for (const [k, value] of Object.entries(el.props)) {
      if (k === "children" || k === "key" || value === undefined) continue;
      if (rule.attrs && !rule.attrs.includes(k)) throw new Error(`${where(el, rule.key)}: ${k} is not read (${rule.attrs.join(", ")})`);
      attrs[k] = plain(value, `${where(el, rule.key)} ${k}`);
    }
    for (const k of rule.required ?? []) if (attrs[k] === undefined) throw new Error(`${where(el, rule.key)} needs ${k}`);
    const kids = el.props.children;
    for (const c of Array.isArray(kids) ? kids.flat(Infinity) : [kids])
      if (typeof c === "string" && c.trim()) throw new Error(`${where(el, rule.key)}: text is not read ("${c.trim().slice(0, 40)}")`);
    const children = childElements(kids).map((c) => visit(c, el.type));
    const seen = new Map<string, number>();
    for (const c of children) {
      const r = v.tags[c.tag]!;
      const id = r.key ? `${c.tag}#${String(c.attrs[r.key])}` : r.single ? c.tag : null;
      if (!id) continue;
      if (seen.has(id)) throw new Error(r.key ? `two <${c.tag}> in <${el.type}> have ${r.key} "${String(c.attrs[r.key])}"` : `<${el.type}> has one <${c.tag}>`);
      seen.set(id, 1);
    }
    return { tag: el.type, attrs, children, ...(el.source !== undefined ? { source: el.source } : {}) };
  };
  return visit(root, null);
}

/** The op graph that carries a tree out of a run (see the top). */
export function carryTree(tree: DocTree, v: Vocabulary<any>, name?: string): IRGraph {
  const nodes: Record<string, IRNode> = {};
  let n = 0;
  const visit = (t: DocTree, parent: string | null) => {
    const id = `e${n++}`;
    const meta: Record<string, unknown> = {};
    if (parent !== null) meta.parent = parent;
    if (t.source !== undefined) meta.source = t.source;
    nodes[id] = { id, type: `${v.format}.${t.tag}`, inputs: JSON.parse(JSON.stringify(t.attrs)) as Record<string, unknown>, ...(Object.keys(meta).length ? { meta } : {}) };
    for (const c of t.children) visit(c, id);
  };
  visit(tree, null);
  const title = name ?? (typeof tree.attrs.name === "string" ? tree.attrs.name : v.format);
  return { id: `${v.format}:${title}`, nodes, outputs: ["e0"], meta: { domain: v.format, document: v.format, name: title } };
}

/** Declare a document from its root element (a code file's default export). */
export function declareDocument(root: DesignElement, name?: string): Declaration {
  const v = vocabularyOf(root.type);
  if (!v) throw new Error(`<${root.type}> is not a document`);
  const tree = treeOfElement(root, v);
  v.fromTree(tree); // its shape is checked when it is declared, not when an editor opens it
  return new Declaration(v.format, carryTree(tree, v, name));
}

/** Whether a graph carries a document's tree, and which format. */
export function documentFormat(graph: IRGraph): string | null {
  const d = graph.meta?.document;
  return typeof d === "string" && vocabularyOf(`format:${d}`) ? d : null;
}

/** The tree a run's graph carries, with each element's `source` as the run left it (its `meta.source`). */
export function documentTree(graph: IRGraph): DocTree {
  const format = documentFormat(graph);
  if (!format) throw new Error("this graph does not carry a document");
  const prefix = `${format}.`;
  const made = new Map<string, DocTree>();
  let root: DocTree | null = null;
  for (const node of Object.values(graph.nodes)) {
    if (!node.type.startsWith(prefix)) throw new Error(`node ${node.id} (${node.type}) is not part of ${format}`);
    const t: DocTree = { tag: node.type.slice(prefix.length), attrs: { ...node.inputs }, children: [], ...(node.meta?.source !== undefined ? { source: node.meta.source } : {}) };
    made.set(node.id, t);
    const parent = node.meta?.parent;
    if (typeof parent === "string") {
      const p = made.get(parent);
      if (!p) throw new Error(`node ${node.id}'s parent ${parent} comes after it`);
      p.children.push(t);
    } else if (root) throw new Error(`${format} has two roots`);
    else root = t;
  }
  if (!root) throw new Error(`${format} declares nothing`);
  return root;
}

/** The document's JSON a run's graph carries. */
export function documentOf(graph: IRGraph): unknown {
  const format = documentFormat(graph);
  return vocabularyOf(`format:${format}`)!.fromTree(documentTree(graph));
}

/** A record's identity among its siblings: `unit#arm` by its key, `space` when single, else `split@1` by position. */
export function identities(children: readonly DocTree[], v: Vocabulary<any>): string[] {
  const nth = new Map<string, number>();
  return children.map((c) => {
    const r = v.tags[c.tag];
    if (r?.key && c.attrs[r.key] !== undefined) return `${c.tag}#${typeof c.attrs[r.key] === "string" ? (c.attrs[r.key] as string) : JSON.stringify(c.attrs[r.key])}`;
    const i = nth.get(c.tag) ?? 0;
    nth.set(c.tag, i + 1);
    return r?.single ? c.tag : `${c.tag}@${i}`;
  });
}

/** `tree` with each element's `source` taken from the element of `from` that is the same record (by identity). */
export function withSources(tree: DocTree, from: DocTree, v: Vocabulary<any>): DocTree {
  if (tree.tag !== from.tag) return tree;
  const theirs = new Map(identities(from.children, v).map((id, i) => [id, from.children[i]!]));
  const ids = identities(tree.children, v);
  return {
    ...tree,
    ...(from.source !== undefined ? { source: from.source } : {}),
    children: tree.children.map((c, i) => {
      const twin = theirs.get(ids[i]!);
      return twin ? withSources(c, twin, v) : c;
    }),
  };
}
