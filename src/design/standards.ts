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
 * tables give for that thread (a counterbore for a hexagon socket head cap screw, DIN 974-1; a countersink for a
 * countersunk screw, DIN 74 form F, its depth from its diameter and angle). The size wins: a `diameter`,
 * `headDiameter` or `headDepth` that differs from the size's is refused. Leave it out, or clear `size` to give your
 * own. One choice stays yours: a counterbore deeper than the size's (`headDepth` more than the table's) sinks the head
 * below the face.
 */
export function sizedHole(hole: Record<string, unknown>): Record<string, unknown> {
  if (typeof hole.size !== "string") return hole;
  const named = holeSize(hole.size);
  const says: Record<string, number> = { diameter: named.diameter };
  const { counterbore, countersink } = named.row;
  if (named.fit !== "tap" && hole.style === "counterbore" && counterbore) {
    says.headDiameter = counterbore.diameter;
    says.headDepth = counterbore.depth;
  } else if (named.fit !== "tap" && hole.style === "countersink" && countersink) {
    says.headDiameter = countersink.diameter;
    says.headDepth = Math.floor(((countersink.diameter - named.diameter) / 2 / Math.tan((countersink.angleDeg * Math.PI) / 360)) * 1e4 + 0.5) / 1e4;
  }
  if (hole.style === "counterbore" && says.headDepth !== undefined && typeof hole.headDepth === "number" && hole.headDepth > says.headDepth) says.headDepth = hole.headDepth;
  for (const [field, value] of Object.entries(says)) {
    const written = hole[field];
    if (typeof written === "number" && Math.abs(written - value) > 1e-9)
      throw new Error(
        `${field}: "${hole.size}" is ${value} mm (got ${written}); leave ${field} out, or clear size` +
          (field === "headDepth" && hole.style === "counterbore" ? " (a counterbore may be deeper than the size's, not shallower)" : ""),
      );
  }
  return { ...hole, ...says };
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
