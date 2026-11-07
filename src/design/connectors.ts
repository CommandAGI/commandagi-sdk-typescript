/**
 * A CONNECTOR IN JSX — `<name>.connector.tsx`: a remote API declared as a folder tree, so a mount can list it and read
 * its files (docs/namespace.md § connectors, in the CommandAGI repository). A connector is data, not a plugin: the
 * platform's api worker and the local host run the same engine over it (`packages/domain/world/connectors.js`), and a
 * mount names it by its address. Nothing is copied: a listing is the API's answer now, a file's bytes are read from
 * where the API says they are, by Range.
 *
 *   // cloud://global/connectors/polyhaven.connector.tsx
 *   export default () => (
 *     <connector name="Poly Haven" base="https://api.polyhaven.com" home="https://polyhaven.com" rate={2} cache={86400}
 *                licence="CC0-1.0" credit="Poly Haven" hosts={["dl.polyhaven.org"]}>
 *       <folder path="">
 *         <dir name="models" />
 *       </folder>
 *       <folder path="models" get="/assets?type=models">
 *         <each in="$" as="a">
 *           <dir name="{a}" title="{a/name}" author="{a/authors|keys|join:, }" source="https://polyhaven.com/a/{a}" />
 *         </each>
 *       </folder>
 *       <folder path="models/{slug}" get="/files/{slug}">
 *         <each in="$/gltf" as="res">
 *           <file path="{res}/{slug}_{res}.gltf" url="{res/gltf/url}" size="{res/gltf/size}" />
 *         </each>
 *       </folder>
 *     </connector>
 *   );
 *
 * The elements:
 *
 *   <connector>   name, base (the API's https origin and path), rate (requests a second, at most 10), cache (seconds a
 *                 listing is kept, at least 60); home, terms and robots (the source's pages, as a person reads them);
 *                 hosts (the other hosts a request or a file's bytes may go to); licence, author, credit (every entry's,
 *                 unless a nearer one says otherwise).
 *   <credential>  one, optional: a service account's field (`service`, `field`, docs/services.md) sent as a query
 *                 parameter (`query`) or a header (`header`, with `prefix`), only to `hosts` (default: base's host).
 *                 `optional`: without the field the requests go without it.
 *   <licence>     value (what the API writes) → spdx (the SPDX id, or a LicenseRef-…): how an entry's licence is named.
 *   <folder>      one level of the tree: `path` (segments, a `{var}` segment matches one name and binds it), `get` (the
 *                 request whose answer lists it; none: its entries are written out), `decode` (json, gzip-json),
 *                 `page` ("link" follows `Link: rel="next"`; a query parameter's name pages by offset with `pageSize`
 *                 up to `total`, or by a token with `next`, the next page's token read from each answer). A path below
 *                 a folder that no other folder matches is listed from its nearest folder.
 *   <request>     another request a folder's entries read, bound to `as`.
 *   <here>        the fields of the folder itself (title, author, licence, source, credit): its files inherit them.
 *   <each>        for each value at `in` (a binding, then a pointer: `$/gltf`, `a/include`), bound to `as`; `where`
 *                 with `is` keeps the ones whose pointer equals the value, with `not` the others.
 *   <dir>         a folder of the level: `name` (may hold "/"), its fields, `id` (what a deeper level reads of it as
 *                 `{@}`: a folder an API names by an id) and `zip` (an archive whose members are its files).
 *   <file>        a file of the level: `path` (may hold "/"), `url` (or `zip` and `member`: one member of an
 *                 archive, read by Range), `size`, its fields.
 *
 * A text attribute is a template: `{a}` is a binding's key (an object's property name, a list's index), `{a/name}` a
 * pointer into its value, `{$/x}` into the folder's answer, `{slug}` a segment the path bound, `{@}` the `id` of the
 * folder's own entry; `|keys`, `|join:<sep>`, `|base`, `|stem`, `|ext`, `|text`, `|name` (one name: its "/" made "-"), `|lower`,
 * `|first`, `|unique` transform a value. The Python SDK's `connectors.py` and the Rust SDK's
 * `connectors.rs` declare the same document.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** A connector's file: `<name>.connector.tsx` (or `.jsx`, `.py`, `.rs`). */
export const CONNECTOR_FILE = /\.connector\.(?:[jt]sx|py|rs)$/i;

/** The fields an entry carries for a person who places it: what it is and whose, under which licence, from where. */
export const PROVENANCE_FIELDS = ["title", "author", "licence", "source", "credit"] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];
export type Provenance = Partial<Record<ProvenanceField, string>>;

export const CONNECTOR_DECODES = ["json", "gzip-json"] as const;
export type ConnectorDecode = (typeof CONNECTOR_DECODES)[number];

export interface ConnectorCredential {
  service: string;
  field: string;
  query?: string;
  header?: string;
  prefix?: string;
  hosts?: string[];
  optional?: boolean;
}
export interface ConnectorRequest {
  as: string;
  get: string;
  decode?: ConnectorDecode;
}
export type ConnectorProducer =
  | { kind: "each"; in: string; as: string; where?: string; is?: string | number | boolean; not?: string | number | boolean; produce: ConnectorProducer[] }
  | ({ kind: "dir"; name: string; id?: string; zip?: string } & Provenance)
  | ({ kind: "file"; path: string; url?: string; zip?: string; member?: string; size?: string | number } & Provenance);
export interface ConnectorFolder {
  path: string;
  get?: string;
  decode?: ConnectorDecode;
  page?: string;
  pageSize?: number;
  total?: string;
  next?: string;
  requests?: ConnectorRequest[];
  here?: Provenance;
  produce: ConnectorProducer[];
}
export interface ConnectorDoc extends Provenance {
  name: string;
  base: string;
  rate: number;
  cache: number;
  home?: string;
  terms?: string;
  robots?: string;
  hosts?: string[];
  credential?: ConnectorCredential;
  licences?: { value: string; spdx: string }[];
  folders: ConnectorFolder[];
}

const CONNECTOR_ATTRS = ["name", "base", "rate", "cache", "home", "terms", "robots", "hosts", ...PROVENANCE_FIELDS] as const;
const CREDENTIAL_ATTRS = ["service", "field", "query", "header", "prefix", "hosts", "optional"] as const;
const FOLDER_ATTRS = ["path", "get", "decode", "page", "pageSize", "total", "next"] as const;
const EACH_ATTRS = ["in", "as", "where", "is", "not"] as const;
const DIR_ATTRS = ["name", "id", "zip", ...PROVENANCE_FIELDS] as const;
const FILE_ATTRS = ["path", "url", "zip", "member", "size", ...PROVENANCE_FIELDS] as const;

const said = (v: unknown) => JSON.stringify(v);
const text = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
// A pattern, not `new URL`: the api worker's sandbox (QuickJS) has no URL.
const https = (v: unknown): v is string => text(v) && /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:[/?#][^\s]*)?$/.test(v);
const host = (v: unknown) => typeof v === "string" && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** A folder path: segments of literal names or one `{var}` each; "" is the connector's root. */
const PATH_SEGMENT = /^(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[^{}/]+)$/;

function only(attrs: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (attrs[k] !== undefined) out[k] = attrs[k];
  return out;
}

function provenanceOf(attrs: Record<string, unknown>, at: string): Provenance {
  const out: Provenance = {};
  for (const k of PROVENANCE_FIELDS) {
    const v = attrs[k];
    if (v === undefined) continue;
    if (!text(v, 1000)) throw new Error(`${at} ${k} is a text, not ${said(v)}`);
    out[k] = v;
  }
  return out;
}

function producerOf(t: DocTree, at: string): ConnectorProducer {
  const a = t.attrs as Record<string, unknown>;
  if (t.tag === "each") {
    if (!text(a.in, 500)) throw new Error(`${at} <each> in is a pointer ($/x, a/y), not ${said(a.in)}`);
    if (!text(a.as, 64) || !NAME.test(a.as as string) || a.as === "$") throw new Error(`${at} <each> as is a name, not ${said(a.as)}`);
    if (a.where !== undefined && !text(a.where, 500)) throw new Error(`${at} <each> where is a pointer, not ${said(a.where)}`);
    if ((a.where === undefined) !== (a.is === undefined && a.not === undefined) || (a.is !== undefined && a.not !== undefined)) throw new Error(`${at} <each> where goes with is or with not: one of them`);
    for (const k of ["is", "not"] as const) if (a[k] !== undefined && !["string", "number", "boolean"].includes(typeof a[k])) throw new Error(`${at} <each> ${k} is a text, a number or true/false`);
    return { kind: "each", ...(only(a, EACH_ATTRS) as { in: string; as: string }), produce: t.children.map((c) => producerOf(c, `${at} <each in="${a.in as string}">`)) };
  }
  if (t.tag === "dir") {
    if (!text(a.name, 500)) throw new Error(`${at} <dir> name is a text (a template), not ${said(a.name)}`);
    if (a.zip !== undefined && !text(a.zip)) throw new Error(`${at} <dir> zip is a url (a template), not ${said(a.zip)}`);
    if (a.id !== undefined && !text(a.id, 500)) throw new Error(`${at} <dir> id is a text (a template), not ${said(a.id)}`);
    return { kind: "dir", name: a.name as string, ...(a.id !== undefined ? { id: a.id as string } : {}), ...(a.zip !== undefined ? { zip: a.zip as string } : {}), ...provenanceOf(a, `${at} <dir name="${a.name as string}">`) };
  }
  if (t.tag === "file") {
    const where = `${at} <file path="${String(a.path)}">`;
    if (!text(a.path, 1000)) throw new Error(`${at} <file> path is a text (a template), not ${said(a.path)}`);
    for (const k of ["url", "zip", "member"] as const) if (a[k] !== undefined && !text(a[k])) throw new Error(`${where} ${k} is a text (a template), not ${said(a[k])}`);
    if ((a.zip === undefined) !== (a.member === undefined)) throw new Error(`${where} zip and member go together`);
    if ((a.url === undefined) === (a.zip === undefined)) throw new Error(`${where} reads its bytes from url, or from zip and member: one of them`);
    if (a.size !== undefined && !(typeof a.size === "number" && a.size >= 0) && !text(a.size, 500)) throw new Error(`${where} size is a number or a template`);
    return { kind: "file", ...(only(a, ["path", "url", "zip", "member", "size"]) as { path: string }), ...provenanceOf(a, where) };
  }
  throw new Error(`${at} <${t.tag}> is not a level's entry (<each>, <dir>, <file>)`);
}

function folderOf(t: DocTree): ConnectorFolder {
  const a = t.attrs as Record<string, unknown>;
  if (typeof a.path !== "string" || a.path.length > 500) throw new Error(`<folder> path is a text ("" is the root), not ${said(a.path)}`);
  const at = `<folder path="${a.path}">`;
  if (a.path !== "" && !(a.path as string).split("/").every((s) => PATH_SEGMENT.test(s))) throw new Error(`${at} path is names and {var} segments, separated by "/"`);
  if (a.get !== undefined && !text(a.get)) throw new Error(`${at} get is a path or url (a template), not ${said(a.get)}`);
  if (a.decode !== undefined && !(CONNECTOR_DECODES as readonly string[]).includes(a.decode as string)) throw new Error(`${at} decode is ${CONNECTOR_DECODES.join(" or ")}`);
  if (a.page !== undefined && (!text(a.page, 64) || (a.page !== "link" && !NAME.test(a.page as string)))) throw new Error(`${at} page is "link" or a query parameter's name`);
  if (a.page !== undefined && a.page !== "link" && a.next === undefined && !(Number.isInteger(a.pageSize) && (a.pageSize as number) > 0)) throw new Error(`${at} pages by ${String(a.page)}: it needs pageSize (by offset) or next (by a token)`);
  if (a.total !== undefined && !text(a.total, 500)) throw new Error(`${at} total is a template, not ${said(a.total)}`);
  if (a.next !== undefined && (!text(a.next, 500) || a.page === undefined || a.page === "link")) throw new Error(`${at} next is the template of the next page's token, with page naming its query parameter`);
  if (a.get === undefined && (a.page !== undefined || a.decode !== undefined)) throw new Error(`${at} pages and decodes a request: it needs get`);
  const requests: ConnectorRequest[] = [];
  let here: Provenance | undefined;
  const produce: ConnectorProducer[] = [];
  for (const c of t.children) {
    const ca = c.attrs as Record<string, unknown>;
    if (c.tag === "request") {
      if (!text(ca.as, 64) || !NAME.test(ca.as as string)) throw new Error(`${at} <request> as is a name, not ${said(ca.as)}`);
      if (!text(ca.get)) throw new Error(`${at} <request as="${ca.as as string}"> get is a path or url`);
      if (ca.decode !== undefined && !(CONNECTOR_DECODES as readonly string[]).includes(ca.decode as string)) throw new Error(`${at} <request> decode is ${CONNECTOR_DECODES.join(" or ")}`);
      requests.push(only(ca, ["as", "get", "decode"]) as unknown as ConnectorRequest);
    } else if (c.tag === "here") here = provenanceOf(ca, `${at} <here>`);
    else produce.push(producerOf(c, at));
  }
  return {
    ...(only(a, FOLDER_ATTRS) as { path: string }),
    ...(requests.length ? { requests } : {}),
    ...(here ? { here } : {}),
    produce,
  };
}

/** A connector as its elements declare it; throws with why it does not read. */
export function connectorOf(t: DocTree): ConnectorDoc {
  const a = t.attrs as Record<string, unknown>;
  if (!text(a.name, 200)) throw new Error(`<connector> name is the source's name, not ${said(a.name)}`);
  const at = `<connector name="${a.name as string}">`;
  if (!https(a.base)) throw new Error(`${at} base is the API's https url, not ${said(a.base)}`);
  if (!(typeof a.rate === "number" && a.rate > 0 && a.rate <= 10)) throw new Error(`${at} rate is the requests a second it makes at most (above 0, at most 10), not ${said(a.rate)}`);
  if (!(Number.isInteger(a.cache) && (a.cache as number) >= 60)) throw new Error(`${at} cache is the seconds a listing is kept (a whole number, at least 60), not ${said(a.cache)}`);
  for (const k of ["home", "terms", "robots"] as const) if (a[k] !== undefined && !https(a[k])) throw new Error(`${at} ${k} is an https url, not ${said(a[k])}`);
  if (a.hosts !== undefined && !(Array.isArray(a.hosts) && a.hosts.every(host))) throw new Error(`${at} hosts is a list of host names`);
  const doc: ConnectorDoc = {
    ...(only(a, CONNECTOR_ATTRS) as { name: string; base: string; rate: number; cache: number }),
    ...provenanceOf(a, at),
    folders: [],
  };
  if (Array.isArray(a.hosts)) doc.hosts = [...(a.hosts as string[])];
  const licences: { value: string; spdx: string }[] = [];
  const paths = new Set<string>();
  for (const c of t.children) {
    const ca = c.attrs as Record<string, unknown>;
    if (c.tag === "credential") {
      if (doc.credential) throw new Error(`${at} has one <credential>`);
      if (!text(ca.service, 64) || !/^[a-z0-9][a-z0-9-]*$/.test(ca.service as string)) throw new Error(`${at} <credential> service is a service's name (docs/services.md), not ${said(ca.service)}`);
      if (!text(ca.field, 64) || !/^[A-Z0-9_]+$/.test(ca.field as string)) throw new Error(`${at} <credential> field is a field's name (API_KEY), not ${said(ca.field)}`);
      if ((ca.query === undefined) === (ca.header === undefined)) throw new Error(`${at} <credential> goes as a query parameter or a header: one of them`);
      for (const k of ["query", "header", "prefix"] as const) if (ca[k] !== undefined && !text(ca[k], 64)) throw new Error(`${at} <credential> ${k} is a text`);
      if (ca.hosts !== undefined && !(Array.isArray(ca.hosts) && ca.hosts.every(host))) throw new Error(`${at} <credential> hosts is a list of host names`);
      if (ca.optional !== undefined && typeof ca.optional !== "boolean") throw new Error(`${at} <credential> optional is true or false`);
      doc.credential = only(ca, CREDENTIAL_ATTRS) as unknown as ConnectorCredential;
    } else if (c.tag === "licence") {
      if (!text(ca.value, 200) || !text(ca.spdx, 200)) throw new Error(`${at} <licence> maps a value the API writes to an spdx id: both are texts`);
      licences.push({ value: ca.value as string, spdx: ca.spdx as string });
    } else if (c.tag === "folder") {
      const f = folderOf(c);
      if (paths.has(f.path)) throw new Error(`${at} has two <folder path="${f.path}">`);
      paths.add(f.path);
      doc.folders.push(f);
    } else throw new Error(`${at} <${c.tag}> is not read (<credential>, <licence>, <folder>)`);
  }
  if (licences.length) doc.licences = licences;
  if (!doc.folders.length) throw new Error(`${at} declares no <folder>: a connector lists at least its root`);
  return doc;
}

const provenanceAttrs = (p: Provenance) => Object.fromEntries(PROVENANCE_FIELDS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));

function producerTree(p: ConnectorProducer): DocTree {
  if (p.kind === "each") {
    const { kind: _k, produce, ...attrs } = p;
    return { tag: "each", attrs, children: produce.map(producerTree) };
  }
  const { kind, ...attrs } = p;
  return { tag: kind, attrs, children: [] };
}

export const connectorVocabulary: Vocabulary<ConnectorDoc> = {
  format: "connector",
  noun: "a connector",
  root: "connector",
  tags: {
    connector: { parents: [], attrs: CONNECTOR_ATTRS },
    credential: { parents: ["connector"], single: true, attrs: CREDENTIAL_ATTRS },
    licence: { parents: ["connector"], key: "value", required: ["value", "spdx"], attrs: ["value", "spdx"] },
    folder: { parents: ["connector"], key: "path", required: ["path"], attrs: FOLDER_ATTRS },
    request: { parents: ["folder"], key: "as", required: ["as", "get"], attrs: ["as", "get", "decode"] },
    here: { parents: ["folder"], single: true, attrs: PROVENANCE_FIELDS },
    each: { parents: ["folder", "each"], required: ["in", "as"], attrs: EACH_ATTRS },
    dir: { parents: ["folder", "each"], required: ["name"], attrs: DIR_ATTRS },
    file: { parents: ["folder", "each"], required: ["path"], attrs: FILE_ATTRS },
  },
  fromTree: connectorOf,
  toTree(d) {
    const { folders, licences, credential, ...attrs } = d;
    return {
      tag: "connector",
      attrs,
      children: [
        ...(credential ? [{ tag: "credential", attrs: { ...credential }, children: [] }] : []),
        ...(licences ?? []).map((l) => ({ tag: "licence", attrs: { ...l }, children: [] })),
        ...folders.map((f) => {
          const { requests, here, produce, ...fa } = f;
          return {
            tag: "folder",
            attrs: fa,
            children: [
              ...(requests ?? []).map((r) => ({ tag: "request", attrs: { ...r }, children: [] })),
              ...(here ? [{ tag: "here", attrs: provenanceAttrs(here), children: [] }] : []),
              ...produce.map(producerTree),
            ],
          };
        }),
      ],
    };
  },
  empty: (name) => ({ name: name || "connector", base: "https://example.com", rate: 1, cache: 86400, folders: [{ path: "", produce: [] }] }),
};

registerVocabulary(connectorVocabulary);

/** The vocabulary of a connector, by format. */
export const CONNECTORS = { connector: connectorVocabulary } as const;
