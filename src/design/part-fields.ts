/**
 * A PART'S FIELDS: the engineering data a part states, each one KiCad `property` form on the part (`foreign`, the
 * form the board editor writes), so the BOM, the KiCad board, a 3D body's join and the part checks read one thing.
 * A schematic's part (`./sheet.ts`) and a circuit's part (`./eda.ts`, `component(…)`) take the same arguments.
 *
 *   partNumber manufacturer mpn rating      the part's numbers and its rating
 *   pinoutVerified footprintVerified        how its symbol's pin numbers and names, and its footprint's pads, are
 *                                           known: "memory", "datasheet <url> p. <page>, <YYYY-MM-DD>" or
 *                                           "measured <YYYY-MM-DD>[, <how>]"
 *   packageDimensions                       the datasheet's package: "<n> pins, pitch <mm> mm, body <l> x <w> mm"
 *   attrs={{ Tolerance: "1%" }}             any other field, by its KiCad name (Datasheet, …)
 *
 * The circuit's `<check kind="pinout">` and `<check kind="footprint">` read the last three (docs/eda-authoring.md
 * § datasheet-checked parts).
 */

/** The named arguments, by the KiCad property each writes. */
export const PART_FIELDS: Readonly<Record<string, string>> = {
  partNumber: "CommandAGI IPN",
  manufacturer: "Manufacturer",
  mpn: "MPN",
  rating: "Rating",
  pinoutVerified: "Pinout Verified",
  footprintVerified: "Footprint Verified",
  packageDimensions: "Package Dimensions",
};
const FIELD_EXAMPLES: Record<string, string> = {
  partNumber: "MF-R-3K",
  manufacturer: "Yageo",
  mpn: "RC0805FR-073KL",
  rating: "0.125 W",
  pinoutVerified: "datasheet https://www.ti.com/lit/ds/symlink/sn74lvc1t45.pdf p. 3, 2026-10-15",
  footprintVerified: "measured 2026-10-15, calipers on the reel's part",
  packageDimensions: "6 pins, pitch 0.95 mm, body 2.9 x 1.6 mm",
};
/** How a pinout or a footprint is known (`pinoutVerified`, `footprintVerified`). */
export const VERIFIED = /^(?:memory|datasheet https?:\/\/\S+ p\. \d+, \d{4}-\d{2}-\d{2}|measured \d{4}-\d{2}-\d{2}(?:, .+)?)$/;
/** A datasheet's package numbers (`packageDimensions`). */
export const PACKAGE = /^\d+ pins, pitch \d+(?:\.\d+)? mm, body \d+(?:\.\d+)? x \d+(?:\.\d+)? mm$/;
const GRAMMAR: Record<string, RegExp> = { pinoutVerified: VERIFIED, footprintVerified: VERIFIED, packageDimensions: PACKAGE };
/** Fields a part holds otherwise: its reference, its value, its footprint. */
const OWN_FIELDS = new Set(["Reference", "Value", "Footprint"]);
/** The props that state fields. */
export const FIELD_PROPS = [...Object.keys(PART_FIELDS), "attrs"];

const atomOf = (v: string, q: boolean) => ({ kind: "atom", v, q });
const listOf = (...items: unknown[]) => ({ kind: "list", items });
/** One field as the part carries it: `(property "MPN" "…" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))`. */
function fieldForm(name: string, value: string) {
  const sym = (v: string) => atomOf(v, false);
  return listOf(sym("property"), atomOf(name, true), atomOf(value, true), listOf(sym("at"), sym("0"), sym("0"), sym("0")),
    listOf(sym("effects"), listOf(sym("font"), listOf(sym("size"), sym("1.27"), sym("1.27"))), listOf(sym("hide"), sym("yes"))));
}

/** The fields `props` state, as `property` forms; `where` names the element or the part in a refusal. */
export function fieldForms(props: Readonly<Record<string, unknown>>, where: string): { foreign?: unknown[] } {
  const forms: unknown[] = [];
  for (const [prop, name] of Object.entries(PART_FIELDS)) {
    const v = props[prop];
    if (v === undefined) continue;
    if (typeof v !== "string" || !v.trim() || (GRAMMAR[prop] && !GRAMMAR[prop]!.test(v))) throw new Error(`${where}: ${prop} is text ("${FIELD_EXAMPLES[prop]}")`);
    forms.push(fieldForm(name, v));
  }
  const attrs = props.attrs;
  if (attrs !== undefined) {
    if (!attrs || typeof attrs !== "object" || Array.isArray(attrs) || !Object.values(attrs).every((v) => typeof v === "string" && v.trim()))
      throw new Error(`${where}: attrs is an object of text ({ Tolerance: "1%" })`);
    for (const [name, v] of Object.entries(attrs as Record<string, string>)) {
      const named = Object.entries(PART_FIELDS).find(([, n]) => n === name)?.[0];
      if (named) throw new Error(`${where}: attrs names ${name}: say it with ${named}=`);
      if (OWN_FIELDS.has(name) || !name.trim()) throw new Error(`${where}: attrs names ${name}, which is the part's own (its name, value or footprint)`);
      forms.push(fieldForm(name, v));
    }
  }
  return forms.length ? { foreign: forms } : {};
}

/** The fields a part states, by argument. */
export type PartFieldValues = { partNumber?: string; manufacturer?: string; mpn?: string; rating?: string; pinoutVerified?: string; footprintVerified?: string; packageDimensions?: string; attrs?: Record<string, string> };

/**
 * A part's fields, read back from its node's inputs (the `property` forms it carries): the named ones by their
 * argument, any other in `attrs`. A part with none gives `{}`.
 */
export function partFields(inputs: Readonly<Record<string, unknown>>): PartFieldValues {
  const out: Record<string, unknown> = {};
  const attrs: Record<string, string> = {};
  for (const form of (Array.isArray(inputs.foreign) ? inputs.foreign : []) as { kind?: string; items?: { kind?: string; v?: string }[] }[]) {
    const [head, name, value] = form?.items ?? [];
    if (form?.kind !== "list" || head?.v !== "property" || typeof name?.v !== "string" || typeof value?.v !== "string" || OWN_FIELDS.has(name.v)) continue;
    const named = Object.entries(PART_FIELDS).find(([, n]) => n === name.v)?.[0];
    if (named) out[named] = value.v;
    else attrs[name.v] = value.v;
  }
  return { ...out, ...(Object.keys(attrs).length ? { attrs } : {}) };
}
