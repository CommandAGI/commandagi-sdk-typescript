/**
 * JSCAD → SOLIDS — a convenience importer: the part of `@jscad/modeling`'s API a typical part file uses,
 * recorded as solid expressions (`./solids.ts`) and declared as the 3D feature graph. Nothing is computed:
 * `cuboid(…)` is a box feature, `subtract(a, b)` is a cut.
 *
 *   const { primitives, booleans, transforms } = require("@jscad/modeling");
 *   const main = ({ width = 40 }) =>
 *     booleans.subtract(primitives.cuboid({ size: [width, 20, 6] }), primitives.cylinder({ radius: 3, height: 8 }));
 *   module.exports = { main, getParameterDefinitions: () => [{ name: "width", type: "float", initial: 40 }] };
 *
 * Read: primitives `cuboid cube sphere cylinder rectangle square circle polygon`; booleans `union subtract
 * intersect`; transforms `translate translateX translateY translateZ rotate rotateX rotateY rotateZ`;
 * extrusions `extrudeLinear`; colors `colorize` (the colour is not kept). JSCAD's conventions hold: a cuboid
 * and a cylinder are centred on `center`, `extrudeLinear` rises from z = 0. Anything else (rounded
 * primitives, hulls, scaling, 2D booleans, `rotateX` of an extrusion, a box turned off a quarter turn) is
 * refused by name.
 */
import { declareSolids, rotateSolid, translate2D, translateSolid, unwrap, wrap, isSolid, type Shape2D, type Solid, type SolidValue } from "./solids.js";
import type { Vec2, Vec3 } from "./cad.js";
import type { Declaration, ParamDecl } from "./ir.js";

const SHAPE2 = Symbol.for("commandagi.design.jscad.geom2");
type Geom2 = { readonly [SHAPE2]: Shape2D };
const g2 = (s: Shape2D): Geom2 => ({ [SHAPE2]: s }) as Geom2;
const isGeom2 = (v: unknown): v is Geom2 => !!v && typeof v === "object" && SHAPE2 in (v as object);

const vec3 = (v: unknown, d: Vec3): Vec3 => (Array.isArray(v) && v.length === 3 ? (v.map(Number) as Vec3) : typeof v === "number" ? [v, v, v] : d);
const vec2 = (v: unknown, d: Vec2): Vec2 => (Array.isArray(v) && v.length >= 2 ? [Number(v[0]), Number(v[1])] : typeof v === "number" ? [v, v] : d);
const flat = (args: unknown[]): unknown[] => args.flatMap((a) => (Array.isArray(a) ? flat(a) : [a]));

function refuse(name: string): never {
  throw new Error(`@jscad/modeling ${name} is not read by the CommandAGI importer (it declares structure only); see commandagi/design jscad`);
}

const primitives = {
  cuboid: (o: { size?: unknown; center?: unknown } = {}) => wrap({ k: "box", center: vec3(o.center, [0, 0, 0]), size: vec3(o.size, [2, 2, 2]) }),
  cube: (o: { size?: number; center?: unknown } = {}) => wrap({ k: "box", center: vec3(o.center, [0, 0, 0]), size: vec3(o.size ?? 2, [2, 2, 2]) }),
  sphere: (o: { radius?: number; center?: unknown } = {}) => wrap({ k: "sphere", center: vec3(o.center, [0, 0, 0]), r: o.radius ?? 1 }),
  cylinder: (o: { radius?: number; height?: number; center?: unknown } = {}) => {
    const h = o.height ?? 2, c = vec3(o.center, [0, 0, 0]);
    return wrap({ k: "cylinder", base: [c[0], c[1], c[2] - h / 2], axis: [0, 0, 1], r: o.radius ?? 1, h });
  },
  rectangle: (o: { size?: unknown; center?: unknown } = {}) => g2({ k: "rect", center: vec2(o.center, [0, 0]), size: vec2(o.size, [2, 2]) }),
  square: (o: { size?: number; center?: unknown } = {}) => g2({ k: "rect", center: vec2(o.center, [0, 0]), size: vec2(o.size ?? 2, [2, 2]) }),
  circle: (o: { radius?: number; center?: unknown } = {}) => g2({ k: "circle", center: vec2(o.center, [0, 0]), r: o.radius ?? 1 }),
  polygon: (o: { points: unknown }) => {
    const pts = o?.points;
    if (!Array.isArray(pts) || !pts.length || Array.isArray(pts[0]?.[0])) refuse("polygon with paths");
    return g2({ k: "poly", points: (pts as unknown[]).map((p) => vec2(p, [0, 0])) });
  },
  roundedCuboid: () => refuse("primitives.roundedCuboid"),
  roundedCylinder: () => refuse("primitives.roundedCylinder"),
  cylinderElliptic: () => refuse("primitives.cylinderElliptic"),
  ellipsoid: () => refuse("primitives.ellipsoid"),
  torus: () => refuse("primitives.torus"),
  geodesicSphere: () => refuse("primitives.geodesicSphere"),
  polyhedron: () => refuse("primitives.polyhedron"),
  ellipse: () => refuse("primitives.ellipse"),
  roundedRectangle: () => refuse("primitives.roundedRectangle"),
  star: () => refuse("primitives.star"),
};

function solids(args: unknown[], what: string): Solid[] {
  const items = flat(args);
  if (items.some(isGeom2)) refuse(`2D ${what}`);
  return items.map((v) => unwrap(v, what));
}

const booleans = {
  union: (...a: unknown[]) => wrap({ k: "union", items: solids(a, "union") }),
  subtract: (...a: unknown[]) => wrap({ k: "subtract", items: solids(a, "subtract") }),
  intersect: (...a: unknown[]) => wrap({ k: "intersect", items: solids(a, "intersect") }),
  scission: () => refuse("booleans.scission"),
};

function each(objs: unknown[], f: (s: Solid) => Solid, g?: (s: Shape2D) => Shape2D): unknown {
  const out = flat(objs).map((o) => (isGeom2(o) ? (g ? g2(g(o[SHAPE2])) : refuse("that transform of a 2D shape")) : wrap(f(unwrap(o, "transform")))));
  return out.length === 1 ? out[0] : out;
}

const transforms = {
  translate: (d: unknown, ...objs: unknown[]) => {
    const v = vec3(Array.isArray(d) && d.length === 2 ? [d[0], d[1], 0] : d, [0, 0, 0]);
    return each(objs, (s) => translateSolid(s, v), (p) => translate2D(p, [v[0], v[1]]));
  },
  translateX: (n: number, ...objs: unknown[]) => transforms.translate([n, 0, 0], ...objs),
  translateY: (n: number, ...objs: unknown[]) => transforms.translate([0, n, 0], ...objs),
  translateZ: (n: number, ...objs: unknown[]) => transforms.translate([0, 0, n], ...objs),
  rotateX: (a: number, ...objs: unknown[]) => each(objs, (s) => rotateSolid(s, "X", a, "transforms.rotateX")),
  rotateY: (a: number, ...objs: unknown[]) => each(objs, (s) => rotateSolid(s, "Y", a, "transforms.rotateY")),
  rotateZ: (a: number, ...objs: unknown[]) => each(objs, (s) => rotateSolid(s, "Z", a, "transforms.rotateZ")),
  rotate: (a: unknown, ...objs: unknown[]) => {
    const [x, y, z] = vec3(a, [0, 0, 0]);
    return each(objs, (s) => rotateSolid(rotateSolid(rotateSolid(s, "X", x, "transforms.rotate"), "Y", y, "transforms.rotate"), "Z", z, "transforms.rotate"));
  },
  scale: () => refuse("transforms.scale"),
  mirror: () => refuse("transforms.mirror"),
  center: () => refuse("transforms.center"),
  align: () => refuse("transforms.align"),
  transform: () => refuse("transforms.transform"),
};

const extrusions = {
  extrudeLinear: (o: { height?: number; twistAngle?: number }, ...objs: unknown[]) => {
    if (o?.twistAngle) refuse("extrudeLinear with a twist");
    const out = flat(objs).map((g) => {
      if (!isGeom2(g)) refuse("extrudeLinear of a 3D shape");
      return wrap({ k: "extrude", profile: g[SHAPE2], z: 0, h: o?.height ?? 1 });
    });
    return out.length === 1 ? out[0] : out;
  },
  extrudeRotate: () => refuse("extrusions.extrudeRotate"),
  extrudeRectangular: () => refuse("extrusions.extrudeRectangular"),
};

const colors = { colorize: (_c: unknown, ...objs: unknown[]) => (objs.length === 1 ? objs[0] : objs), colorNameToRgb: () => [0, 0, 0] };
const hulls = { hull: () => refuse("hulls.hull"), hullChain: () => refuse("hulls.hullChain") };
const expansions = { expand: () => refuse("expansions.expand"), offset: () => refuse("expansions.offset") };

/** The `@jscad/modeling` module a file imports inside the CommandAGI sandbox. */
export const jscadModeling = { primitives, booleans, transforms, extrusions, colors, hulls, expansions, maths: {}, measurements: {}, geometries: {}, utils: {} };

/** A JSCAD `getParameterDefinitions()` as the parameters a code file declares. */
export function jscadParams(defs: unknown): Record<string, ParamDecl> {
  const out: Record<string, ParamDecl> = {};
  if (!Array.isArray(defs)) return out;
  for (const d of defs as { name?: string; initial?: unknown; caption?: string; min?: number; max?: number; step?: number }[]) {
    if (!d || typeof d.name !== "string") continue;
    out[d.name] = { default: d.initial ?? null, ...(d.caption ? { label: d.caption } : {}), ...(d.min !== undefined ? { min: d.min } : {}), ...(d.max !== undefined ? { max: d.max } : {}), ...(d.step !== undefined ? { step: d.step } : {}) };
  }
  return out;
}

/** What a JSCAD `main()` returned, declared as a part. */
export function fromJscad(value: unknown, name = "Part"): Declaration {
  const items = flat([value]).filter((v) => v !== null && v !== undefined);
  if (items.some(isGeom2)) throw new Error("the file returned a 2D shape; extrude it to declare a solid");
  return declareSolids(name, items.map((v) => unwrap(v as SolidValue, "main()")));
}

export { isSolid };
