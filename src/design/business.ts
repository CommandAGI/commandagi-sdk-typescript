/**
 * A COMPANY, AN RFC OR A CASE IN JSX — the same documents the CommandAGI company app and contract editor open as
 * `<Name>.company`, `<name>.rfc` and `<name>.case`, declared as code (`<Name>.company.tsx`, `<name>.rfc.tsx`,
 * `<name>.case.tsx`). The reader gives back the native document itself: no second model.
 *
 *   import { Company, Entity, Registration, Books, CapTable, People, Calendar, Matters } from "commandagi/design";
 *
 *   export default () => (
 *     <Company name="Northwind Survey" about="Drone surveys." files={["Northwind Survey/"]}>
 *       <Entity jurisdiction="US-DE" form="llc" name="Northwind Survey LLC" formed="2024-01-31" fiscalYearEnd="12-31" />
 *       <Books journal="Northwind Survey/books/main.journal" />
 *       <CapTable ocf="Northwind Survey/captable/" />
 *       <People folder="Northwind Survey/people/" />
 *       <Registration kind="tax-id" jurisdiction="US" id="12-3456789" issued="2024-02-05" />
 *     </Company>
 *   );
 *
 * The standard's parts REF their files: the books stay an hledger journal and the cap table an Open Cap Table Format
 * folder, because those open formats are the faithful records. The company is on the standard when it names any of
 * its parts (`<Books>`, `<CapTable>`, `<People>`, `<Calendar>`, `<Matters>`, `<Registration>`).
 *
 *   <Rfc title target procedure body engineJson id>                     an RFC draft; `id` once the contract opened it
 *     <Option title summary>                                             one option
 *       <Change op parameter value dutyId title text protects harm …/>     one change of the law (`parameter` is the
 *                                                                        draft's `key`: JSX keeps `key` for itself)
 *   <Case respondent filedFor criminal source dutyId article … id>        a case draft; `id` once it was filed
 *     <Harm id interest description amount/>  <Relief kind description harmIds amount days/>
 *
 * Each tag is a string constant, so `<Company>` is an element like an intrinsic one and keeps its `__source` (the
 * element's index in the file): the reader returns, beside the document, where each part of it was written, and an
 * editor writes an edit back into that element. An unknown attribute or child is refused by name, never guessed.
 */
import { childElements, isElement, type DesignElement } from "./jsx-runtime.js";

export const Company = "Company";
export const Entity = "Entity";
export const Registration = "Registration";
export const Books = "Books";
export const CapTable = "CapTable";
export const People = "People";
export const Calendar = "Calendar";
export const Matters = "Matters";
export const Rfc = "Rfc";
export const Option = "Option";
export const Change = "Change";
export const Case = "Case";
export const Harm = "Harm";
export const Relief = "Relief";

type Kind = "text" | "texts" | "bool" | "record" | "data";
interface TagSpec {
  props: Record<string, Kind>;
  required?: readonly string[];
  /** A child that occurs at most once, by the field it fills. */
  one?: Record<string, string>;
  /** Children that repeat, by the list they fill. */
  many?: Record<string, string>;
}

/** The vocabulary: each tag's attributes and children (what the document's fields are). */
export const BUSINESS_TAGS: Readonly<Record<string, TagSpec>> = {
  Company: {
    props: { name: "text", about: "text", files: "texts", dashboard: "text" },
    required: ["name"],
    one: { entity: "Entity", books: "Books", captable: "CapTable", people: "People", calendar: "Calendar", matters: "Matters" },
    many: { registrations: "Registration" },
  },
  Entity: {
    props: { jurisdiction: "text", form: "text", taxClassification: "text", name: "text", formed: "text", fiscalYearEnd: "text", ids: "record", operatesIn: "texts", conditions: "record" },
    required: ["jurisdiction"],
  },
  Registration: { props: { kind: "text", jurisdiction: "text", id: "text", issued: "text", expires: "text", file: "text" }, required: ["kind"] },
  Books: { props: { journal: "text" }, required: ["journal"] },
  CapTable: { props: { ocf: "text" }, required: ["ocf"] },
  People: { props: { folder: "text" }, required: ["folder"] },
  Calendar: { props: { folder: "text" }, required: ["folder"] },
  Matters: { props: { folder: "text" }, required: ["folder"] },
  Rfc: {
    props: { id: "text", procedure: "text", title: "text", body: "text", target: "text", engineJson: "text" },
    many: { options: "Option" },
  },
  Option: { props: { title: "text", summary: "text" }, many: { changes: "Change" } },
  Change: {
    props: {
      op: "text", parameter: "text", value: "text", dutyId: "text", title: "text", text: "text", protects: "texts", harm: "text",
      elements: "text", criminal: "bool", kind: "text", uniqueness: "text", issuers: "text", modalities: "texts",
    },
    required: ["op"],
  },
  Case: {
    props: {
      id: "text", respondent: "text", filedFor: "text", criminal: "bool", source: "text", dutyId: "text", article: "text",
      agreementId: "text", term: "text", act: "text", actDate: "text", evidence: "text", media: "data", reopens: "text",
    },
    many: { harms: "Harm", relief: "Relief" },
  },
  Harm: { props: { id: "text", interest: "text", description: "text", amount: "text" }, required: ["id"] },
  Relief: { props: { kind: "text", description: "text", harmIds: "texts", amount: "text", days: "text" }, required: ["kind"] },
};

/** One element as read: its attributes, its children by field, and where it was written. */
export interface BusinessNode {
  tag: string;
  props: Record<string, unknown>;
  one: Record<string, BusinessNode | null>;
  many: Record<string, BusinessNode[]>;
  source?: unknown;
}

/** What a business file declares: the native document, and where each part was written (by path, "" the root). */
export interface DeclaredDocument {
  kind: "company" | "rfc" | "case";
  document: Record<string, unknown>;
  /** `entity`, `registrations/0`, `options/1/changes/0`, … → the element's `__source`. */
  sources: Record<string, unknown>;
}

const where = (el: DesignElement) => `<${el.type}>`;

function value(el: DesignElement, prop: string, kind: Kind): unknown {
  const v = el.props[prop];
  const bad = (what: string) => new Error(`${where(el)}: ${prop} is ${what}, not ${JSON.stringify(v)}`);
  switch (kind) {
    case "text":
      if (typeof v !== "string") throw bad("text");
      return v;
    case "texts":
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw bad("a list of text");
      return [...v];
    case "bool":
      if (typeof v !== "boolean") throw bad("true or false");
      return v;
    case "record":
      if (!v || typeof v !== "object" || Array.isArray(v)) throw bad("an object");
      return plain(v, `${where(el)} ${prop}`);
    case "data":
      return plain(v, `${where(el)} ${prop}`);
  }
}

function plain(v: unknown, what: string): unknown {
  if (v === null || ["string", "number", "boolean"].includes(typeof v)) return v;
  if (Array.isArray(v)) return v.map((x, i) => plain(x, `${what}[${i}]`));
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x, `${what}.${k}`)]));
  throw new Error(`${what} is plain data (text, numbers, true or false, lists, objects)`);
}

/** Read one element of the vocabulary and its children, refusing what it does not say. */
export function readBusinessNode(el: DesignElement): BusinessNode {
  const spec = BUSINESS_TAGS[el.type];
  if (!spec) throw new Error(`<${el.type}> is not a tag of a company, an RFC or a case`);
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children" || k === "key" || v === undefined) continue;
    const kind = spec.props[k];
    if (!kind) throw new Error(`${where(el)} has no attribute ${k} (it takes ${Object.keys(spec.props).join(", ")})`);
    props[k] = value(el, k, kind);
  }
  for (const k of spec.required ?? []) if (props[k] === undefined || props[k] === "") throw new Error(`${where(el)} needs ${k}`);
  const one: Record<string, BusinessNode | null> = Object.fromEntries(Object.keys(spec.one ?? {}).map((f) => [f, null]));
  const many: Record<string, BusinessNode[]> = Object.fromEntries(Object.keys(spec.many ?? {}).map((f) => [f, []]));
  const fieldOf = (tag: string): [string, "one" | "many"] | null => {
    for (const [f, t] of Object.entries(spec.one ?? {})) if (t === tag) return [f, "one"];
    for (const [f, t] of Object.entries(spec.many ?? {})) if (t === tag) return [f, "many"];
    return null;
  };
  for (const child of childElements(el.props.children)) {
    const field = fieldOf(child.type);
    if (!field) throw new Error(`${where(el)} does not take <${child.type}> (it takes ${[...Object.values(spec.one ?? {}), ...Object.values(spec.many ?? {})].map((t) => `<${t}>`).join(", ") || "no children"})`);
    const node = readBusinessNode(child);
    if (field[1] === "one") {
      if (one[field[0]]) throw new Error(`${where(el)} has two <${child.type}>`);
      one[field[0]] = node;
    } else many[field[0]]!.push(node);
  }
  return { tag: el.type, props, one, many, ...(el.source === undefined ? {} : { source: el.source }) };
}

/** Every element's source, by path. */
function sourcesOf(node: BusinessNode, at = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (node.source !== undefined) out[at] = node.source;
  const join = (f: string) => (at ? `${at}/${f}` : f);
  for (const [f, n] of Object.entries(node.one)) if (n) sourcesOf(n, join(f), out);
  for (const [f, list] of Object.entries(node.many)) list.forEach((n, i) => sourcesOf(n, join(`${f}/${i}`), out));
  return out;
}

/** A `.company` document from a `<Company>` (docs/formats.md § companies). */
export function companyOf(node: BusinessNode): Record<string, unknown> {
  const p = node.props, one = node.one;
  const entity = one.entity
    ? (() => {
        const e = one.entity.props;
        return {
          jurisdiction: e.jurisdiction,
          form: e.form ?? null,
          ...(e.taxClassification !== undefined ? { taxClassification: e.taxClassification } : {}),
          name: e.name ?? null,
          formed: e.formed ?? null,
          fiscalYearEnd: e.fiscalYearEnd ?? null,
          ids: e.ids ?? {},
          operatesIn: e.operatesIn ?? [],
          ...(e.conditions !== undefined ? { conditions: e.conditions } : {}),
        };
      })()
    : null;
  const ref = (f: string, prop: string) => (one[f]?.props[prop] as string | undefined) ?? null;
  const registrations = node.many.registrations!.map((r) => ({ ...r.props }));
  const on = ["books", "captable", "people", "calendar", "matters"].some((f) => one[f]) || registrations.length > 0;
  return {
    format: "commandagi-company",
    name: p.name,
    about: p.about ?? "",
    files: p.files ?? [],
    dashboard: p.dashboard ?? null,
    entity,
    standard: on
      ? { enabled: true, books: ref("books", "journal"), captable: ref("captable", "ocf"), people: ref("people", "folder"), calendar: ref("calendar", "folder"), registrations, matters: ref("matters", "folder") }
      : { enabled: false },
  };
}

/** An RFC from a `<Rfc>`: `{ draft }`, and `id` once the contract opened it. Fields not written take the blank's. */
export function rfcOf(node: BusinessNode): Record<string, unknown> {
  const { id, ...draft } = node.props;
  return {
    ...(id !== undefined ? { id } : {}),
    draft: { ...draft, options: node.many.options!.map((o) => ({ ...o.props, changes: o.many.changes!.map((c) => changeOf(c.props)) })) },
  };
}

/** A change's `parameter` attribute is the draft's `key` (JSX keeps `key` for itself). */
function changeOf(props: Record<string, unknown>): Record<string, unknown> {
  const { parameter, ...rest } = props;
  return parameter === undefined ? rest : { ...rest, key: parameter };
}

/** A case from a `<Case>`: `{ draft }`, and `id` once it was filed. Fields not written take the blank's. */
export function caseOf(node: BusinessNode): Record<string, unknown> {
  const { id, ...draft } = node.props;
  return {
    ...(id !== undefined ? { id } : {}),
    draft: { ...draft, harms: node.many.harms!.map((h) => ({ ...h.props })), relief: node.many.relief!.map((r) => ({ ...r.props })) },
  };
}

const ROOTS = { Company: ["company", companyOf], Rfc: ["rfc", rfcOf], Case: ["case", caseOf] } as const;

/** The document a business file declares (its default export: a `<Company>`, `<Rfc>` or `<Case>`), or null. */
export function documentOf(value: unknown): DeclaredDocument | null {
  if (!isElement(value) || !(value.type in ROOTS)) return null;
  const [kind, read] = ROOTS[value.type as keyof typeof ROOTS];
  const node = readBusinessNode(value);
  return { kind, document: read(node), sources: sourcesOf(node) };
}

/** The document a module declares: its default export, or that called with `inputs`. */
export function declaredDocument(mod: Record<string, unknown>, inputs: Record<string, unknown> = {}): DeclaredDocument {
  let v: unknown = mod.default;
  if (v === undefined) throw new Error("the file exports nothing (export default a <Company>, an <Rfc> or a <Case>)");
  if (typeof v === "function") v = (v as (p: unknown) => unknown)(inputs);
  const doc = documentOf(v);
  if (!doc) throw new Error("the file declares no company, RFC or case (export default a <Company>, an <Rfc> or a <Case>)");
  return doc;
}
