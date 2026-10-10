/**
 * THE SCHEMA OF AN ELEMENT'S PROPS, AND ITS CHECK. A document's elements (`<extrude distance={10} … />`) take fields
 * whose JSON Schema is generated from the types that declare them (`./threed-schema.ts`). The reader checks each
 * element against it, and the CommandAGI editors check their op panels and their agent tools with this same
 * function, so a wrong value gets the same sentence everywhere: `distance: must be greater than 0 (got -1)`.
 *
 * The subset: type (string, number, integer, boolean, array, object, null), enum, const, pattern, properties,
 * required, additionalProperties, items, prefixItems, minItems, maxItems, minimum, maximum, exclusiveMinimum,
 * exclusiveMaximum, anyOf, oneOf, $ref (to `#/$defs/<name>`), $defs, default, description; and the editors' own
 * x-unit, x-pick, x-widget, x-step, x-showIf, x-derived (not checked). No dependency: the subset is small.
 */

export type SchemaType = "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";

export interface JsonSchema {
  type?: SchemaType | readonly SchemaType[];
  enum?: readonly unknown[];
  const?: unknown;
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  prefixItems?: readonly JsonSchema[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  /** A string matches this regular expression. */
  pattern?: string;
  anyOf?: readonly JsonSchema[];
  oneOf?: readonly JsonSchema[];
  $ref?: string;
  $defs?: Readonly<Record<string, JsonSchema>>;
  default?: unknown;
  description?: string;
  title?: string;
  /** The unit a number is stored in: "mm", "rad" (shown in degrees), "deg", "%". */
  "x-unit"?: string;
  /** The value is picked in the editor's viewport or lists ("face", "edge", "sketch", "net" …). */
  "x-pick"?: string;
  /** How a form shows the value: "slider", "segmented", "select", "color", "json". */
  "x-widget"?: string;
  /** The step of a number field (arrows, scrub). */
  "x-step"?: number;
  /** Shown (and read) only when each named field has one of the given values; null stands for absent. */
  "x-showIf"?: Readonly<Record<string, unknown>>;
  /** A value an editor builds (an unwrap atlas): an agent's tool names it without its structure. */
  "x-derived"?: boolean;
}

export type Defs = Readonly<Record<string, JsonSchema>>;

/** A generated schema file: each root name (a feature type) → its definition, and the definitions. */
export interface SchemaDocument {
  readonly roots: Readonly<Record<string, string>>;
  readonly $defs: Defs;
}

const REF = "#/$defs/";

/** The definition a `$ref` names, with the referring schema's own keywords (a description, x-unit …) over it. */
export function resolve(schema: JsonSchema, defs: Defs = schema.$defs ?? {}): JsonSchema {
  let s = schema;
  for (let guard = 0; s.$ref; guard++) {
    if (guard > 32) throw new Error(`${schema.$ref}: a reference cycle`);
    if (!s.$ref.startsWith(REF)) throw new Error(`${s.$ref}: only #/$defs/<name> references are read`);
    const target = defs[s.$ref.slice(REF.length)];
    if (!target) throw new Error(`${s.$ref}: no such definition`);
    const { $ref: _ref, ...own } = s;
    s = { ...target, ...own };
  }
  return s;
}

/** The name of the definition a schema refers to, or undefined. */
export function refName(schema: JsonSchema): string | undefined {
  return schema.$ref?.startsWith(REF) ? schema.$ref.slice(REF.length) : undefined;
}

/** Every definition `schema` reaches through its references, transitively, by name. */
export function reachedDefs(schema: JsonSchema, defs: Defs): Record<string, JsonSchema> {
  const reached: Record<string, JsonSchema> = {};
  const walk = (s: JsonSchema | boolean | undefined) => {
    if (!s || typeof s !== "object") return;
    const n = refName(s);
    if (n && !reached[n]) {
      const d = defs[n];
      if (!d) throw new Error(`#/$defs/${n}: no such definition`);
      reached[n] = d;
      walk(d);
    }
    for (const v of Object.values(s.properties ?? {})) walk(v);
    walk(s.additionalProperties);
    walk(s.items);
    for (const v of s.prefixItems ?? []) walk(v);
    for (const v of s.anyOf ?? []) walk(v);
    for (const v of s.oneOf ?? []) walk(v);
  };
  walk(schema);
  return reached;
}

export type IssueCode =
  | "required"
  | "type"
  | "enum"
  | "const"
  | "minimum"
  | "maximum"
  | "exclusiveMinimum"
  | "exclusiveMaximum"
  | "integer"
  | "minItems"
  | "maxItems"
  | "additional"
  | "pattern"
  | "anyOf";

export interface Issue {
  /** Where, as `distance`, `edges/0/kind`; "" is the value itself. */
  path: string;
  code: IssueCode;
  /** What the schema asks for: the bound, the type, the allowed values. */
  expected?: unknown;
  /** What the value had, when it helps the reader. */
  actual?: unknown;
}

/** `{ $file: "Part.assets/f3/positions.f64", mime, encoding, len }`: data kept in a file beside the document. */
export const isFileRef = (v: unknown): boolean => !!v && typeof v === "object" && !Array.isArray(v) && typeof (v as { $file?: unknown }).$file === "string";

const kindOf = (v: unknown): string => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" && Number.isInteger(v) ? "integer" : typeof v);

function typeMatches(type: string, v: unknown): boolean {
  switch (type) {
    // Large data (an array, the bytes of a data URL) may be an ordinary file the document names (docs/formats.md § data
    // that is not JSON).
    case "string":
      return typeof v === "string" || isFileRef(v);
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v) || isFileRef(v);
    case "object":
      return !!v && typeof v === "object" && !Array.isArray(v);
    case "null":
      return v === null;
    default:
      return false;
  }
}

const join = (path: string, key: string | number) => (path ? `${path}/${key}` : String(key));

/** Every way `value` breaks `schema`; empty when it fits. */
export function validate(schema: JsonSchema, value: unknown, defs: Defs = schema.$defs ?? {}, path = ""): Issue[] {
  const s = resolve(schema, defs);
  const out: Issue[] = [];
  if (s.anyOf || s.oneOf) {
    const options = (s.anyOf ?? s.oneOf)!;
    const results = options.map((o) => validate(o, value, defs, path));
    if (results.some((r) => r.length === 0)) return [];
    // A union of objects told apart by a constant field (`type: "datum"`): the option the value names says the most.
    const named = options.findIndex((o) => {
      const r = resolve(o, defs);
      return Object.entries(r.properties ?? {}).some(([k, p]) => p.const !== undefined && (value as Record<string, unknown> | null)?.[k] === p.const);
    });
    return named >= 0 ? results[named]! : [{ path, code: "anyOf", actual: kindOf(value) }];
  }
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  if (types.length && !types.some((t) => typeMatches(t as string, value))) {
    if (types.includes("integer") && typeof value === "number") return [{ path, code: "integer", actual: value }];
    return [{ path, code: "type", expected: types.join(" | "), actual: kindOf(value) }];
  }
  if (s.const !== undefined && value !== s.const) out.push({ path, code: "const", expected: s.const, actual: value });
  if (s.enum && !s.enum.some((e) => e === value)) out.push({ path, code: "enum", expected: s.enum, actual: value });
  if (typeof value === "string" && s.pattern !== undefined && !new RegExp(s.pattern, "u").test(value)) out.push({ path, code: "pattern", expected: s.pattern, actual: value });
  if (typeof value === "number") {
    if (s.minimum !== undefined && value < s.minimum) out.push({ path, code: "minimum", expected: s.minimum, actual: value });
    if (s.maximum !== undefined && value > s.maximum) out.push({ path, code: "maximum", expected: s.maximum, actual: value });
    if (s.exclusiveMinimum !== undefined && value <= s.exclusiveMinimum) out.push({ path, code: "exclusiveMinimum", expected: s.exclusiveMinimum, actual: value });
    if (s.exclusiveMaximum !== undefined && value >= s.exclusiveMaximum) out.push({ path, code: "exclusiveMaximum", expected: s.exclusiveMaximum, actual: value });
  }
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) out.push({ path, code: "minItems", expected: s.minItems, actual: value.length });
    if (s.maxItems !== undefined && value.length > s.maxItems) out.push({ path, code: "maxItems", expected: s.maxItems, actual: value.length });
    value.forEach((item, i) => {
      const itemSchema = s.prefixItems?.[i] ?? s.items;
      if (itemSchema) out.push(...validate(itemSchema, item, defs, join(path, i)));
    });
  }
  if (value && typeof value === "object" && !Array.isArray(value) && (s.properties || s.required || s.additionalProperties !== undefined)) {
    const obj = value as Record<string, unknown>;
    for (const k of s.required ?? []) if (obj[k] === undefined) out.push({ path: join(path, k), code: "required" });
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const p = s.properties?.[k];
      if (p) out.push(...validate(p, v, defs, join(path, k)));
      else if (s.additionalProperties === false) out.push({ path: join(path, k), code: "additional" });
      else if (s.additionalProperties && typeof s.additionalProperties === "object") out.push(...validate(s.additionalProperties, v, defs, join(path, k)));
    }
  }
  return out;
}

const show = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) ?? String(v));

/**
 * One issue as an English sentence: "distance: must be greater than 0 (got -1)". An op panel shows the same sentence
 * (its English catalog, `editors.kit.operations.errors.<code>`, without the path and the value it got).
 */
export function describeIssue(issue: Issue): string {
  const at = issue.path ? `${issue.path}: ` : "";
  const got = issue.actual !== undefined ? ` (got ${show(issue.actual)})` : "";
  switch (issue.code) {
    case "required":
      return `${at}is required`;
    case "type":
      return `${at}must be ${issue.expected}${got}`;
    case "integer":
      return `${at}must be a whole number${got}`;
    case "enum":
      return `${at}must be one of ${(issue.expected as unknown[]).map(String).join(", ")}${got}`;
    case "const":
      return `${at}must be ${show(issue.expected)}${got}`;
    case "minimum":
      return `${at}must be at least ${issue.expected}${got}`;
    case "maximum":
      return `${at}must be at most ${issue.expected}${got}`;
    case "exclusiveMinimum":
      return `${at}must be greater than ${issue.expected}${got}`;
    case "exclusiveMaximum":
      return `${at}must be less than ${issue.expected}${got}`;
    case "minItems":
      return `${at}needs at least ${issue.expected} items${got}`;
    case "maxItems":
      return `${at}takes at most ${issue.expected} items${got}`;
    case "additional":
      return `${at}is not one of its fields`;
    case "pattern":
      return `${at}has the wrong form (it must match ${issue.expected})${got}`;
    case "anyOf":
      return `${at}does not match an allowed shape${got}`;
  }
}

/** The field an issue belongs to: the first segment of its path. */
export const issueField = (issue: Issue): string => issue.path.split("/")[0] ?? "";
