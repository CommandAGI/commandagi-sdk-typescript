/**
 * TOLERANCES — what a toleranced size allows, and the fit of a hole and a shaft.
 *
 *   import { toleranceLimits, fitOf } from "commandagi/design";
 *
 *   toleranceLimits(25, { class: "H7" })            // { nominal: 25, upper: 0.021, lower: 0, min: 25, max: 25.021, class: "H7", source }
 *   toleranceLimits(12, { upper: 0.05, lower: -0.05 })
 *   fitOf(toleranceLimits(25, { class: "H7" }), toleranceLimits(25, { class: "g6" })).kind   // "clearance"
 *
 * A class is any ISO 286 class (`H7`, `e8`, `E10`, `H13`, `zc11`), computed from its fundamental deviation and grade
 * over 0 up to 3150 mm (`cloud://global/standards/iso-286-1-grades.csv`, `iso-286-1-deviations.csv`), a general
 * tolerance of ISO 2768-1 (`ISO 2768-m`), or a bearing ring's ISO 492 Normal class (`ISO 492 bore`, `ISO 492 outside`,
 * `ISO 492 width`); `./standards-data.ts` `TOLERANCE_TABLES` holds the tables. A class or a size the standard does not
 * give is refused, with the reason. The same rules are the 3D engine's (`packages/domain/3d-core/tolerances.ts`) and the Python and
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

const fmt = (n: number) => `${Number(n.toFixed(4))}`;
const round = (n: number) => Math.round(n * 1e6) / 1e6;
type Row = Readonly<Record<string, string | number>>;
const BEARING = /^ISO\s*492\s+(bore|outside|width)$/i;
const GENERAL = /^ISO\s*2768(?:-1)?[-\s]*([fmcv])$/i;
/** An ISO 286 class: the fundamental deviation's letters (capital: a hole, small: a shaft) and the grade. */
const ISO286 = /^(A|B|CD|C|D|EF|E|FG|F|G|H|JS|J|K|M|N|P|R|S|T|U|V|X|Y|ZA|ZB|ZC|Z)(01|0|1[0-8]|[1-9])$/;
const ISO286_SOURCE = "ISO 286-1: the fundamental deviation (Tables 2 and 3) and the standard tolerance grade (Table 1)";
/** The shaft letters whose fundamental deviation is the upper one (es); a hole's A to H mirror them (EI = −es). */
const UPPER_LETTERS = ["a", "b", "c", "cd", "d", "e", "ef", "f", "fg", "g", "h"];

/** The classes an editor suggests: the usual ISO 286-2 classes, ISO 2768-1 and the ISO 492 rings. Every ISO 286 class is read, not only these. */
export function toleranceClasses(): string[] {
  const holes = ["H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "G6", "G7", "F7", "F8", "E8", "E9", "E10", "D9", "D10", "C11", "JS6", "JS7", "JS8", "K6", "K7", "M6", "M7", "N6", "N7", "P6", "P7", "R7", "S7", "U7"];
  const shafts = ["h5", "h6", "h7", "h8", "h9", "h10", "h11", "h12", "h13", "g5", "g6", "f6", "f7", "e7", "e8", "e9", "d9", "d10", "c11", "js5", "js6", "js7", "j5", "j6", "k5", "k6", "m5", "m6", "n5", "n6", "p5", "p6", "r6", "s6", "u6"];
  const general = [...new Set((TOLERANCE_TABLES["iso-2768-1"] ?? []).map((r) => `ISO 2768-${r.class}`))];
  const rings = [...new Set((TOLERANCE_TABLES["iso-492-normal"] ?? []).map((r) => `ISO 492 ${r.ring}`))];
  return [...holes, ...shafts, ...general, ...rings];
}

const KNOWN = "an ISO 286 class (a hole's letters A to ZC or a shaft's a to zc, then a grade 01, 0 or 1 to 18: H7, e8, JS9), ISO 2768-f, -m, -c or -v, or ISO 492 bore, outside or width";
const inRange = (r: Row, size: number) => size > Number(r.overMm) && size <= Number(r.uptoMm);
const rowAt = (table: string, size: number, where: (r: Row) => boolean = () => true): Row | undefined =>
  (TOLERANCE_TABLES[table] ?? []).find((r) => where(r) && inRange(r, size));

/** An ISO 286 class at a size, in micrometres (the 3D engine's `iso286`, line for line). */
function iso286(letters: string, gradeText: string, size: number): { upper: number; lower: number } {
  const name = `${letters}${gradeText}`;
  const hole = letters !== letters.toLowerCase();
  const l = letters.toLowerCase();
  const grade = gradeText === "01" ? -1 : Number(gradeText);
  if (!(size > 0 && size <= 3150)) throw new Error(`${name}: ISO 286 gives sizes over 0 up to 3150 mm, not ${fmt(size)} mm`);
  const it = rowAt("iso-286-1-grades", size)?.[gradeText === "01" ? "it01" : `it${gradeText}`];
  if (it === undefined || it === "") throw new Error(`${name}: the grade IT${gradeText} is not defined at ${fmt(size)} mm (IT01 and IT0 go up to 500 mm)`);
  if (grade >= 14 && size <= 1) throw new Error(`${name}: the grades IT14 to IT18 are not used at 1 mm and below (ISO 286-1)`);
  if ((l === "a" || l === "b") && size <= 1) throw new Error(`${name}: the deviations a and b are not used at 1 mm and below (ISO 286-1)`);
  const IT = Number(it);
  if (l === "js") return { upper: IT / 2, lower: -IT / 2 };
  const d = rowAt("iso-286-1-deviations", size)!;
  const has = (k: string) => d[k] !== undefined && d[k] !== "";
  const val = (k: string) => Number(d[k]);
  const none = () => new Error(`${name}: ISO 286-1 gives no fundamental deviation ${letters} at ${fmt(size)} mm`);
  if (UPPER_LETTERS.includes(l)) {
    if (!has(l)) throw none();
    return hole ? { upper: -val(l) + IT, lower: -val(l) } : { upper: val(l), lower: val(l) - IT };
  }
  if (l === "j") {
    const k = hole ? `holeJ${grade}` : grade === 5 || grade === 6 ? "j5" : `j${grade}`;
    if (!has(k)) throw new Error(`${name}: ISO 286-2 gives ${hole ? "J6, J7 and J8" : "j5, j6 and j7 (j8 to 3 mm)"} up to 500 mm, not ${name} at ${fmt(size)} mm`);
    return hole ? { upper: val(k), lower: val(k) - IT } : { upper: val(k) + IT, lower: val(k) };
  }
  if (!hole) {
    const ei = l === "k" ? (grade >= 4 && grade <= 7 ? val("k") : 0) : has(l) ? val(l) : NaN;
    if (Number.isNaN(ei)) throw none();
    return { upper: ei + IT, lower: ei };
  }
  const delta = size <= 500 && grade >= 3 && grade <= 8 ? val(`delta${grade}`) : 0;
  let es: number;
  if (l === "k") es = size <= 500 && grade <= 8 ? -val("k") + delta : 0;
  else if (l === "m") es = size > 250 && size <= 315 && grade === 6 ? -9 : -val("m") + (grade <= 8 ? delta : 0);
  else if (l === "n") es = size > 3 && size <= 500 && grade > 8 ? 0 : -val("n") + (grade <= 8 ? delta : 0);
  else {
    if (!has(l)) throw none();
    es = -val(l) + (grade <= 7 ? delta : 0);
  }
  return { upper: es, lower: es - IT };
}

/** A class's deviations at a size, in millimetres, with the source they were read from. Throws when it has none. */
function classDeviations(name: string, size: number): { upper: number; lower: number; source: string } {
  const text = name.trim();
  const ring = BEARING.exec(text);
  if (ring) {
    const rows = (TOLERANCE_TABLES["iso-492-normal"] ?? []).filter((r) => String(r.ring) === ring[1]!.toLowerCase());
    const r = rows.find((x) => inRange(x, size));
    if (!r) throw new Error(`${text} is tabled over ${fmt(Math.min(...rows.map((x) => Number(x.overMm))))} up to ${fmt(Math.max(...rows.map((x) => Number(x.uptoMm))))} mm, not at ${fmt(size)} mm`);
    return { upper: Number(r.upperUm) / 1000, lower: Number(r.lowerUm) / 1000, source: String(r.source ?? "") };
  }
  const general = GENERAL.exec(text);
  if (general) {
    const c = general[1]!.toLowerCase();
    const r = rowAt("iso-2768-1", size, (x) => String(x.class) === c);
    if (!r) throw new Error(`ISO 2768-${c} gives no deviation at ${fmt(size)} mm`);
    return { upper: Number(r.deviationMm), lower: -Number(r.deviationMm), source: String(r.source) };
  }
  // A shaft's class is all small letters; a hole's all capitals.
  const m = ISO286.exec(text) ?? (text === text.toLowerCase() ? ISO286.exec(text.toUpperCase()) : null);
  if (!m) throw new Error(`there is no tolerance class ${JSON.stringify(name)}: a class is ${KNOWN}`);
  const um = iso286(text === text.toLowerCase() ? m[1]!.toLowerCase() : m[1]!, m[2]!, size);
  return { upper: round(um.upper / 1000) + 0, lower: round(um.lower / 1000) + 0, source: ISO286_SOURCE };
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
    const { upper, lower, source } = classDeviations(name, nominal);
    return { nominal, upper, lower, min: round(nominal + lower), max: round(nominal + upper), class: name, ...(source ? { source } : {}) };
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
