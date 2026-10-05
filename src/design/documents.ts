/**
 * DOCUMENTS IN JSX — a JSON document of CommandAGI (a world, a device definition, a dashboard, a geo project) written
 * as a tree of elements. Each element is one record of the document, and its attributes are that record's fields,
 * verbatim (`<unit uid="arm" position={[0, 0, 0]} />` is the unit `{ "uid": "arm", "position": [0, 0, 0] }`). A
 * vocabulary (`./ontology.ts`) says which tags a document has, where each may stand, which attribute names a record
 * among its siblings, and how the tree maps to the document's JSON, both ways.
 *
 * What a run gives back is the run's one shape for a document that is not a graph (`DeclaredDocument`, beside an
 * empty graph): `{ format, document, sources }`, the document's JSON and each element's `__source` keyed by its path
 * (`treePaths`: `""` the root, `unit#arm`, `scene/body#cube`). An editor makes the tree again from the document
 * (`toTree`) and finds each element's place by the same path.
 *
 * Structure only: the document is checked for its vocabulary's shape here, and for its meaning by the application
 * that reads it (a world's validation, a definition's bounds). A code form declares; the host still enforces.
 */
import type { DeclaredDocument } from "./ir.js";
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
  /** At most one per parent. */
  single?: boolean;
  /** Attributes it must have. */
  required?: readonly string[];
  /** The attributes it may have; absent: any. */
  attrs?: readonly string[];
}

/** A document format written as elements: its tags, and its JSON both ways. */
export interface Vocabulary<D = unknown> {
  /** The format's name (a declared document's `format`). */
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

/**
 * Visit each element of a tree with its path: the identities from the root down, joined by `/` (`""` is the root,
 * `scene/body#cube` a scene's body). A declared document's `sources` name each element by it.
 */
export function treePaths(tree: DocTree, v: Vocabulary<any>, visit: (t: DocTree, path: string) => void): void {
  const walk = (t: DocTree, path: string) => {
    visit(t, path);
    const ids = identities(t.children, v);
    t.children.forEach((c, i) => walk(c, path ? `${path}/${ids[i]}` : ids[i]!));
  };
  walk(tree, "");
}

/** Declare a document from its root element (a code file's default export): `{ format, document, sources }`. */
export function declareDocument(root: DesignElement): DeclaredDocument {
  const v = vocabularyOf(root.type);
  if (!v) throw new Error(`<${root.type}> is not a document`);
  const tree = treeOfElement(root, v);
  // Its shape is checked when it is declared, not when an editor opens it.
  const document = v.fromTree(tree) as Record<string, unknown>;
  const sources: Record<string, unknown> = {};
  treePaths(tree, v, (t, path) => {
    if (t.source !== undefined) sources[path] = t.source;
  });
  return { format: v.format, document, sources };
}

/** The document a value declares when it is the root of one of the ontology's files, or null (a node graph is a graph). */
export function ontologyDocumentOf(value: unknown): DeclaredDocument | null {
  return isDocumentElement(value) && value.type !== "opgraph" ? declareDocument(value) : null;
}
