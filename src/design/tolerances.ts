/**
 * TOLERANCES — what a toleranced size allows, and the fit of a hole and a shaft.
 *
 *   import { toleranceLimits, fitOf } from "commandagi/design";
 *
 *   toleranceLimits(25, { class: "H7" })            // { nominal: 25, upper: 0.021, lower: 0, min: 25, max: 25.021, class: "H7", source }
 *   toleranceLimits(12, { upper: 0.05, lower: -0.05 })
 *   fitOf(toleranceLimits(25, { class: "H7" }), toleranceLimits(25, { class: "g6" })).kind   // "clearance"
 *
 * A class is read from the shipped tables (`cloud://global/standards/iso-286.csv`, `iso-492-normal.csv`;
 * `./standards-data.ts` `TOLERANCE_TABLES`): an ISO 286 class (`H7`, `g6`) or a bearing ring's ISO 492 Normal class
 * (`ISO 492 bore`, `ISO 492 outside`, `ISO 492 width`). A class or a size the tables do not have is refused, with the
 * classes they have. The same rules are the 3D engine's (`packages/domain/3d-core/tolerances.ts`) and the Python and
 * Rust SDKs'. A 3D document's fit and stack-up checks (`<check kind="fit">`, `<check kind="stackup">`) run in
 * `Kernel.check`.
 */
import { TOLERANCE_TABLES } from "./standards-data.js";

/** A size's tolerance: deviations, or a class, or basic; one way, never two. */
export interface DimensionTolerance {
  /** @unit mm, signed */
  upper?: number;
  /** @unit mm, signed */
  lower?: number;
  class?: string;
  basic?: boolean;
}

export interface ToleranceLimits {
  nominal: number;
  upper: number;
  lower: number;
  min: number;
  max: number;
  class?: string;
  source?: string;
  basic?: boolean;
}

export type FitKind = "clearance" | "transition" | "interference";

const BEARING = /^ISO\s*492\s+(bore|outside|width)$/i;
const fmt = (n: number) => `${Number(n.toFixed(4))}`;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The classes the shipped tables have. */
export function toleranceClasses(): string[] {
  const iso286 = [...new Set((TOLERANCE_TABLES["iso-286"] ?? []).map((r) => String(r.class)))];
  const rings = [...new Set((TOLERANCE_TABLES["iso-492-normal"] ?? []).map((r) => `ISO 492 ${r.ring}`))];
  return [...iso286, ...rings];
}

/** What is wrong with a tolerance as written, or null. */
export function toleranceProblem(tol: DimensionTolerance): string | null {
  if (!tol || typeof tol !== "object" || Array.isArray(tol)) return "a tolerance is { upper, lower }, { class } or { basic: true }";
  for (const k of Object.keys(tol)) if (!["upper", "lower", "class", "basic"].includes(k)) return `a tolerance has no field ${k} (it has upper, lower, class, basic)`;
  if (tol.upper !== undefined && typeof tol.upper !== "number") return "upper is a number of millimetres";
  if (tol.lower !== undefined && typeof tol.lower !== "number") return "lower is a number of millimetres";
  if (tol.class !== undefined && (typeof tol.class !== "string" || !tol.class.trim())) return "class is a name (H7, g6, ISO 492 bore)";
  if (tol.basic !== undefined && typeof tol.basic !== "boolean") return "basic is true or false";
  const devs = tol.upper !== undefined || tol.lower !== undefined;
  if (tol.basic && (devs || tol.class)) return "a basic dimension has no tolerance of its own: clear basic, or clear the tolerance";
  if (devs && tol.class) return `give the class (${tol.class}) or the deviations, not both`;
  if (devs && (tol.upper === undefined || tol.lower === undefined)) return "give both deviations, upper and lower (0 for none)";
  if (devs && !(tol.upper! >= tol.lower!)) return `the upper deviation (${tol.upper}) is below the lower (${tol.lower})`;
  if (!devs && !tol.class && !tol.basic) return "an empty tolerance: give upper and lower, or a class, or basic";
  return null;
}

/** The sizes a tolerance allows at a nominal size. Throws with the reason when it cannot say. */
export function toleranceLimits(nominal: number, tol: DimensionTolerance): ToleranceLimits {
  const problem = toleranceProblem(tol);
  if (problem) throw new Error(problem);
  if (tol.basic) return { nominal, upper: 0, lower: 0, min: nominal, max: nominal, basic: true };
  if (tol.class) {
    const name = tol.class.trim();
    const ring = BEARING.exec(name);
    const rows = ring
      ? (TOLERANCE_TABLES["iso-492-normal"] ?? []).filter((r) => String(r.ring) === ring[1]!.toLowerCase())
      : (TOLERANCE_TABLES["iso-286"] ?? []).filter((r) => String(r.class) === name);
    if (!rows.length) throw new Error(`the tables have no tolerance class ${JSON.stringify(tol.class)} (they have ${toleranceClasses().join(", ")})`);
    const row = rows.find((r) => nominal > Number(r.overMm) && nominal <= Number(r.uptoMm));
    if (!row) {
      const lo = Math.min(...rows.map((r) => Number(r.overMm))), hi = Math.max(...rows.map((r) => Number(r.uptoMm)));
      throw new Error(`${name} is tabled over ${lo} up to ${hi} mm, not at ${fmt(nominal)} mm`);
    }
    const upper = Number(row.upperUm) / 1000, lower = Number(row.lowerUm) / 1000;
    return { nominal, upper, lower, min: round(nominal + lower), max: round(nominal + upper), class: name, ...(row.source ? { source: String(row.source) } : {}) };
  }
  return { nominal, upper: tol.upper!, lower: tol.lower!, min: round(nominal + tol.lower!), max: round(nominal + tol.upper!) };
}

/**
 * The fit of a hole and a shaft: clearance when the smallest hole takes the largest shaft (a minimum clearance of 0
 * counts), interference when the largest hole is smaller than the smallest shaft, else transition.
 */
export function fitOf(hole: { min: number; max: number }, shaft: { min: number; max: number }): { kind: FitKind; minClearance: number; maxClearance: number } {
  const minClearance = hole.min - shaft.max, maxClearance = hole.max - shaft.min;
  const kind: FitKind = minClearance >= -1e-9 ? "clearance" : maxClearance <= 1e-9 ? "interference" : "transition";
  return { kind, minClearance: round(minClearance), maxClearance: round(maxClearance) };
}
