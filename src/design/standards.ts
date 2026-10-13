/**
 * ENGINEERING TABLES — material grades, standard holes by name and the dimension tables of standard parts.
 *
 *   import { material, holeSize, standardRow } from "commandagi/design";
 *
 *   material("6061-T6").densityGCm3            // 2.7, with .source: where the number was read
 *   holeSize("M4 close fit").diameter          // 4.3 (ISO 273 fine)
 *   holeSize("M4 tap").diameter                // 3.3 (ISO 2306)
 *   standardRow("iso-4762", "M4")              // { thread: "M4", dkMax: 7, kMax: 4, s: 3, tMin: 2, bRef: 20 }
 *   massGrams(1200, "6061-T6")                 // 3.24: 1200 mm³ × 2.7 g/cm³
 *
 * The numbers are data (`./standards-data.ts`), generated from the shipped tables
 * (`cloud://global/standards/<table>.csv`, `cloud://global/materials/engineering.csv`). Each row of a table names its
 * source, how it was read, by whom and when; `STANDARD_SOURCES[table]` and a material's `source` carry the source's
 * name here. The Python and Rust SDKs carry the same data and the same calls.
 *
 * A name the tables do not have is refused with the names they do have. Nothing is computed in its place.
 *
 * A 3D document uses them by name: `<hole size="M4 close fit">` has that diameter, and
 * `<body engineering={{ material: "6061-T6" }}>` has that density, so an observation of the document says the body's
 * mass. A materials table of your own (`materials/<name>.csv` beside the document or in a folder above it) is read
 * before the shipped one: pass its rows as `tables`.
 */
import { HOLE_SIZES, MATERIALS, STANDARD_TABLES, type EngineeringMaterial, type HoleSize, type StandardRow } from "./standards-data.js";

export { HOLE_SIZES, MATERIALS, STANDARD_SOURCES, STANDARD_TABLES, type EngineeringMaterial, type HoleSize, type StandardRow } from "./standards-data.js";

const norm = (id: string) => id.trim().toLowerCase().replace(/[\s_]+/g, "-");

/** The row a material id names: the nearest of `tables` (your own tables, nearest first), then the shipped table. */
export function material(id: string, tables: readonly EngineeringMaterial[] = []): EngineeringMaterial {
  const want = norm(id);
  const row = [...tables, ...MATERIALS].find((m) => norm(m.id) === want);
  if (!row) throw new Error(`no materials table has a row "${id}" (the shipped table has ${MATERIALS.map((m) => m.id).join(", ")})`);
  return row;
}

/** The mass in grams of a solid of `volumeMm3` made of a material: volume × density (1 g/cm³ is 1 g per 1000 mm³). */
export function massGrams(volumeMm3: number, materialId: string, tables: readonly EngineeringMaterial[] = []): number {
  return (volumeMm3 / 1000) * material(materialId, tables).densityGCm3;
}

export type HoleFit = "close fit" | "normal fit" | "loose fit" | "tap";
/** What a hole's `size` says after its thread. */
export const HOLE_FITS: readonly HoleFit[] = ["close fit", "normal fit", "loose fit", "tap"];

/** A named hole: its thread's row, what it is for and its diameter in millimetres. */
export interface NamedHole {
  thread: string;
  fit: HoleFit;
  diameter: number;
  row: HoleSize;
  /** Where the diameter was read. */
  source: string;
}

/**
 * The hole a name says: a thread and a fit, "M4 close fit", "M4 normal fit", "M4 loose fit" (the clearance holes of
 * ISO 273 fine, medium and coarse; ASME B18.2.8 for an inch thread), or "M4 tap" (the drill before tapping).
 */
export function holeSize(name: string): NamedHole {
  const text = name.trim().replace(/\s+/g, " ");
  const space = text.indexOf(" ");
  const thread = space < 0 ? text : text.slice(0, space);
  const fit = (space < 0 ? "" : text.slice(space + 1).toLowerCase()) as HoleFit;
  const key = Object.keys(HOLE_SIZES).find((k) => k.toLowerCase() === thread.toLowerCase());
  const row = key ? HOLE_SIZES[key] : undefined;
  if (!row) throw new Error(`"${name}": no hole table has the thread ${thread || "(none)"} (it has ${Object.keys(HOLE_SIZES).join(", ")})`);
  if (!HOLE_FITS.includes(fit)) throw new Error(`"${name}": a hole size is a thread and one of ${HOLE_FITS.join(", ")} ("${row.thread} close fit")`);
  if (fit === "tap") {
    if (row.tap === undefined) throw new Error(`"${name}": the tap drill table has no ${row.thread}`);
    return { thread: row.thread, fit, diameter: row.tap, row, source: row.sources.tap ?? "" };
  }
  return { thread: row.thread, fit, diameter: row[fit.slice(0, -4) as "close" | "normal" | "loose"], row, source: row.sources.clearance };
}

/**
 * A hole's fields with what its `size` says: the diameter, and for a counterbore or a countersink the head the
 * tables give for that thread where the hole does not say its own. A countersink's depth follows from its diameter
 * and angle. A `diameter` that differs from the size's is refused: leave it out, or clear `size`.
 */
export function sizedHole(hole: Record<string, unknown>): Record<string, unknown> {
  if (typeof hole.size !== "string") return hole;
  const named = holeSize(hole.size);
  if (typeof hole.diameter === "number" && Math.abs(hole.diameter - named.diameter) > 1e-9)
    throw new Error(`diameter: "${hole.size}" is ${named.diameter} mm (got ${hole.diameter}); leave diameter out, or clear size`);
  const out: Record<string, unknown> = { ...hole, diameter: named.diameter };
  if (named.fit === "tap") return out;
  const { counterbore, countersink } = named.row;
  if (hole.style === "counterbore" && counterbore) {
    out.headDiameter = hole.headDiameter ?? counterbore.diameter;
    out.headDepth = hole.headDepth ?? counterbore.depth;
  } else if (hole.style === "countersink" && countersink) {
    const head = typeof hole.headDiameter === "number" ? hole.headDiameter : countersink.diameter;
    out.headDiameter = head;
    out.headDepth = hole.headDepth ?? Math.round(((head - named.diameter) / 2 / Math.tan((countersink.angleDeg * Math.PI) / 360)) * 1e4) / 1e4;
  }
  return out;
}

/**
 * A row of a dimension table by the value of its first column: `standardRow("iso-4762", "M4")`,
 * `standardRow("bearings", "608")`. The tables are `Object.keys(STANDARD_TABLES)`.
 */
export function standardRow(table: string, key: string): StandardRow {
  const rows = STANDARD_TABLES[table];
  if (!rows) throw new Error(`no table "${table}" (the tables are ${Object.keys(STANDARD_TABLES).join(", ")})`);
  const first = Object.keys(rows[0] ?? {})[0] ?? "";
  const row = rows.find((r) => String(r[first]).toLowerCase() === key.toLowerCase());
  if (!row) throw new Error(`table "${table}" has no row "${key}" (it has ${rows.map((r) => r[first]).join(", ")})`);
  return row;
}
