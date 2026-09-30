/**
 * SOLID EXPRESSIONS — what the JSCAD and replicad importers build while a file runs: a small tree of
 * primitives, extrusions, booleans and rigid moves, with NO geometry computed. {@link declareSolids} then
 * declares that tree as a part's feature graph (`./cad.ts`). A move is folded into the primitives it moves
 * (a translated box is a box somewhere else), so the declared graph has no transform nodes; a boolean's
 * tools must be primitives or extrusions (or unions of them), because the feature graph's booleans are
 * features that cut, add or intersect ONE solid each. What cannot be declared that way is refused, naming
 * the call — never approximated.
 */
import { part, box, cylinder, cone, sphere, sketch, extrude, union, subtract, intersect, type Body, type Vec2, type Vec3 } from "./cad.js";
import type { Declaration } from "./ir.js";

export type Shape2D =
  | { k: "rect"; center: Vec2; size: Vec2 }
  | { k: "circle"; center: Vec2; r: number }
  | { k: "poly"; points: Vec2[] };

export type Solid =
  | { k: "box"; center: Vec3; size: Vec3 }
  | { k: "cylinder"; base: Vec3; axis: Vec3; r: number; h: number }
  | { k: "cone"; base: Vec3; axis: Vec3; r1: number; r2: number; h: number }
  | { k: "sphere"; center: Vec3; r: number }
  /** A profile on the XY plane at height `z`, extruded `h` along +Z. */
  | { k: "extrude"; profile: Shape2D; z: number; h: number }
  | { k: "union" | "subtract" | "intersect"; items: Solid[] };

const TAG = Symbol.for("commandagi.design.solid");
/** A solid value as the importers hand it to user code (the tree, tagged). */
export type SolidValue = { readonly [TAG]: Solid };
export const wrap = (s: Solid): SolidValue => ({ [TAG]: s }) as SolidValue;
export const isSolid = (v: unknown): v is SolidValue => !!v && typeof v === "object" && TAG in (v as object);
export const unwrap = (v: unknown, what: string): Solid => {
  if (!isSolid(v)) throw new Error(`${what}: expected a solid`);
  return v[TAG];
};

const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function translateSolid(s: Solid, d: Vec3): Solid {
  switch (s.k) {
    case "box":
      return { ...s, center: add3(s.center, d) };
    case "sphere":
      return { ...s, center: add3(s.center, d) };
    case "cylinder":
    case "cone":
      return { ...s, base: add3(s.base, d) };
    case "extrude":
      return { ...s, profile: translate2D(s.profile, [d[0], d[1]]), z: s.z + d[2] };
    default:
      return { ...s, items: s.items.map((i) => translateSolid(i, d)) };
  }
}

export function translate2D(p: Shape2D, d: Vec2): Shape2D {
  switch (p.k) {
    case "rect":
      return { ...p, center: [p.center[0] + d[0], p.center[1] + d[1]] };
    case "circle":
      return { ...p, center: [p.center[0] + d[0], p.center[1] + d[1]] };
    case "poly":
      return { ...p, points: p.points.map(([x, y]) => [x + d[0], y + d[1]] as Vec2) };
  }
}

type Axis = "X" | "Y" | "Z";
function rot(v: Vec3, axis: Axis, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  const r = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);
  const [x, y, z] = v;
  if (axis === "X") return [r(x), r(y * c - z * s), r(y * s + z * c)];
  if (axis === "Y") return [r(x * c + z * s), r(y), r(-x * s + z * c)];
  return [r(x * c - y * s), r(x * s + y * c), r(z)];
}
const quarterTurns = (a: number): number | null => {
  const q = a / (Math.PI / 2);
  return Math.abs(q - Math.round(q)) < 1e-9 ? ((Math.round(q) % 4) + 4) % 4 : null;
};

/** Turn a solid `a` radians about a coordinate axis through the origin. */
export function rotateSolid(s: Solid, axis: Axis, a: number, what: string): Solid {
  if (Math.abs(a) < 1e-12) return s;
  switch (s.k) {
    case "sphere":
      return { ...s, center: rot(s.center, axis, a) };
    case "cylinder":
    case "cone":
      return { ...s, base: rot(s.base, axis, a), axis: rot(s.axis, axis, a) };
    case "box": {
      const q = quarterTurns(a);
      if (q === null) throw new Error(`${what}: a box turns only in quarter turns (the feature graph's box is axis-aligned)`);
      const [sx, sy, sz] = s.size;
      const size: Vec3 = q % 2 === 0 ? s.size : axis === "X" ? [sx, sz, sy] : axis === "Y" ? [sz, sy, sx] : [sy, sx, sz];
      return { k: "box", center: rot(s.center, axis, a), size };
    }
    case "extrude": {
      if (axis !== "Z") throw new Error(`${what}: an extrusion turns only about Z`);
      const pts = (p: Shape2D): Shape2D => {
        const r2 = ([x, y]: Vec2): Vec2 => {
          const [rx, ry] = rot([x, y, 0], "Z", a);
          return [rx, ry];
        };
        if (p.k === "circle") return { ...p, center: r2(p.center) };
        if (p.k === "poly") return { k: "poly", points: p.points.map(r2) };
        const [cx, cy] = p.center, [w, h] = p.size;
        return { k: "poly", points: ([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]] as Vec2[]).map(r2) };
      };
      return { ...s, profile: pts(s.profile) };
    }
    default:
      return { ...s, items: s.items.map((i) => rotateSolid(i, axis, a, what)) };
  }
}

/** Declare a tree of solids as a part. */
export function declareSolids(name: string, solids: Solid[]): Declaration {
  if (!solids.length) throw new Error("the file returned no solids");
  return part(name, () => solids.map((s) => emit(s)));
}

function emit(s: Solid): Body {
  switch (s.k) {
    case "box":
      return box({ center: s.center, size: s.size });
    case "sphere":
      return sphere({ center: s.center, radius: s.r });
    case "cylinder":
      return cylinder({ base: s.base, axis: s.axis, radius: s.r, height: s.h });
    case "cone":
      return cone({ base: s.base, axis: s.axis, radius1: s.r1, radius2: s.r2, height: s.h });
    case "extrude": {
      const p = s.profile;
      const sk = sketch(s.z ? { plane: "XY", offset: s.z } : "XY", (b) => {
        if (p.k === "rect") b.rect({ center: p.center, size: p.size });
        else if (p.k === "circle") b.circle({ center: p.center, radius: p.r });
        else b.polygon(p.points);
      });
      return extrude(sk, { distance: s.h });
    }
    case "union": {
      const [first, ...rest] = s.items;
      if (!first) throw new Error("an empty union");
      return rest.length ? union(emit(first), ...rest.flatMap(tools)) : emit(first);
    }
    case "subtract": {
      const [first, ...rest] = s.items;
      if (!first) throw new Error("an empty subtraction");
      return rest.length ? subtract(emit(first), ...rest.flatMap(tools)) : emit(first);
    }
    case "intersect": {
      const [first, ...rest] = s.items;
      if (!first) throw new Error("an empty intersection");
      return rest.length ? intersect(emit(first), ...rest.flatMap(tools)) : emit(first);
    }
  }
}

/** A boolean's tools: primitives and extrusions, or a union of them (each one a tool). */
function tools(s: Solid): Body[] {
  if (s.k === "union") return s.items.flatMap(tools);
  if (s.k === "subtract" || s.k === "intersect")
    throw new Error(`a ${s.k === "subtract" ? "difference" : "intersection"} used as a boolean's tool cannot be declared as features; declare the tools separately`);
  return [emit(s)];
}
