/**
 * REPLICAD → SOLIDS — a convenience importer: the part of replicad's API a typical part file uses, recorded as
 * solid expressions (`./solids.ts`) and declared as the 3D feature graph. Nothing is computed.
 *
 *   const { drawRectangle, makeCylinder } = replicad;
 *   export default function main(r, { width = 40 }) {
 *     const plate = drawRectangle(width, 20).sketchOnPlane("XY").extrude(5);
 *     return plate.cut(makeCylinder(3, 5, [0, 0, 0]));
 *   }
 *
 * Read: `drawRectangle drawCircle drawPolysides draw().lineTo…close()`; a drawing's `translate`,
 * `rotate` (about the origin) and `sketchOnPlane("XY", z)`; a sketch's `extrude(d)`; `makeBox makeBaseBox
 * makeCylinder makeSphere`; a solid's `translate translateX/Y/Z rotate(angle, [0,0,0], axis) fuse cut
 * intersect`. replicad's conventions hold: `drawRectangle` is centred on the origin, `makeCylinder` stands on
 * its location, `makeBox` spans two corners. Anything else — fillets and chamfers (they need replicad's edge
 * finders), shells, lofts, sweeps, sketches on other planes — is refused by name.
 */
import { declareSolids, rotateSolid, translate2D, translateSolid, type Shape2D, type Solid } from "./solids.js";
import type { Vec2, Vec3 } from "./cad.js";
import type { Declaration } from "./ir.js";

function refuse(name: string): never {
  throw new Error(`replicad ${name} is not read by the CommandAGI importer (it declares structure only); see commandagi/design replicad`);
}
const deg = (a: number) => (a * Math.PI) / 180;
const v3 = (a: unknown, b?: unknown, c?: unknown): Vec3 =>
  Array.isArray(a) ? [Number(a[0] ?? 0), Number(a[1] ?? 0), Number(a[2] ?? 0)] : [Number(a ?? 0), Number(b ?? 0), Number(c ?? 0)];

export class Drawing {
  constructor(readonly shape: Shape2D) {}
  translate(x: number | Vec2, y = 0): Drawing {
    const d: Vec2 = Array.isArray(x) ? x : [x, y];
    return new Drawing(translate2D(this.shape, d));
  }
  rotate(angle: number, center?: Vec2): Drawing {
    if (center && (center[0] || center[1])) refuse("Drawing.rotate about a point other than the origin");
    const probe: Solid = { k: "extrude", profile: this.shape, z: 0, h: 1 };
    const turned = rotateSolid(probe, "Z", deg(angle), "Drawing.rotate");
    return new Drawing((turned as { profile: Shape2D }).profile);
  }
  sketchOnPlane(plane: string = "XY", origin: number | Vec3 = 0): Sketch {
    if (plane !== "XY") refuse(`sketchOnPlane("${plane}") (only "XY" is read)`);
    const z = typeof origin === "number" ? origin : origin[2];
    const shift: Vec2 = typeof origin === "number" ? [0, 0] : [origin[0], origin[1]];
    return new Sketch(translate2D(this.shape, shift), z);
  }
  cut(): never {
    return refuse("Drawing.cut (2D booleans)");
  }
  fuse(): never {
    return refuse("Drawing.fuse (2D booleans)");
  }
  offset(): never {
    return refuse("Drawing.offset");
  }
  fillet(): never {
    return refuse("Drawing.fillet");
  }
}

export class Sketch {
  constructor(
    readonly shape: Shape2D,
    readonly z: number,
  ) {}
  extrude(distance: number, opts?: { twistAngle?: number; extrusionDirection?: unknown }): Shape3D {
    if (opts?.twistAngle || opts?.extrusionDirection) refuse("extrude with a twist or a direction");
    return new Shape3D({ k: "extrude", profile: this.shape, z: this.z, h: distance });
  }
  revolve(): never {
    return refuse("Sketch.revolve");
  }
  loftWith(): never {
    return refuse("Sketch.loftWith");
  }
  sweepSketch(): never {
    return refuse("Sketch.sweepSketch");
  }
}

export class Shape3D {
  constructor(readonly solid: Solid) {}
  translate(x: number | Vec3, y = 0, z = 0): Shape3D {
    return new Shape3D(translateSolid(this.solid, v3(x, y, z)));
  }
  translateX(n: number) {
    return this.translate([n, 0, 0]);
  }
  translateY(n: number) {
    return this.translate([0, n, 0]);
  }
  translateZ(n: number) {
    return this.translate([0, 0, n]);
  }
  rotate(angle: number, position: Vec3 = [0, 0, 0], direction: Vec3 = [0, 0, 1]): Shape3D {
    if (position.some((x) => x)) refuse("rotate about a point other than the origin");
    const axis = direction[0] && !direction[1] && !direction[2] ? "X" : !direction[0] && direction[1] && !direction[2] ? "Y" : !direction[0] && !direction[1] && direction[2] ? "Z" : null;
    if (!axis) refuse("rotate about an axis other than X, Y or Z");
    const sign = (direction[0] + direction[1] + direction[2]) < 0 ? -1 : 1;
    return new Shape3D(rotateSolid(this.solid, axis, sign * deg(angle), "Shape3D.rotate"));
  }
  fuse(other: Shape3D): Shape3D {
    return new Shape3D({ k: "union", items: [this.solid, other.solid] });
  }
  cut(tool: Shape3D): Shape3D {
    return new Shape3D({ k: "subtract", items: [this.solid, tool.solid] });
  }
  intersect(tool: Shape3D): Shape3D {
    return new Shape3D({ k: "intersect", items: [this.solid, tool.solid] });
  }
  fillet(): never {
    return refuse("fillet (replicad's edge finders select edges on computed geometry; declare it with commandagi/design fillet())");
  }
  chamfer(): never {
    return refuse("chamfer (declare it with commandagi/design chamfer())");
  }
  shell(): never {
    return refuse("shell (declare it with commandagi/design shell())");
  }
  mirror(): never {
    return refuse("mirror");
  }
  scale(): never {
    return refuse("scale");
  }
}

/** A minimal pen: `draw([x, y]).lineTo([x, y]) … .close()` (straight lines only). */
class Pen {
  private pts: Vec2[];
  constructor(start: Vec2) {
    this.pts = [start];
  }
  private last(): Vec2 {
    return this.pts[this.pts.length - 1]!;
  }
  lineTo(p: Vec2) {
    this.pts.push(p);
    return this;
  }
  line(dx: number, dy: number) {
    const [x, y] = this.last();
    return this.lineTo([x + dx, y + dy]);
  }
  hLine(d: number) {
    return this.line(d, 0);
  }
  vLine(d: number) {
    return this.line(0, d);
  }
  close(): Drawing {
    if (this.pts.length < 3) throw new Error("a closed drawing needs three points");
    return new Drawing({ k: "poly", points: this.pts });
  }
  done(): never {
    return refuse("an open drawing (close() it to extrude)");
  }
}

/** The `replicad` module a file imports inside the CommandAGI sandbox. */
export const replicadModule = {
  drawRectangle: (w: number, h: number, r?: number) => (r ? refuse("drawRoundedRectangle / a rectangle with a radius") : new Drawing({ k: "rect", center: [0, 0], size: [w, h] })),
  drawRoundedRectangle: () => refuse("drawRoundedRectangle"),
  drawCircle: (r: number) => new Drawing({ k: "circle", center: [0, 0], r }),
  drawPolysides: (r: number, sides: number) =>
    new Drawing({ k: "poly", points: Array.from({ length: sides }, (_, i) => [r * Math.cos((2 * Math.PI * i) / sides), r * Math.sin((2 * Math.PI * i) / sides)] as Vec2) }),
  draw: (start: Vec2 = [0, 0]) => new Pen(start),
  makeBox: (a: Vec3, b: Vec3) => new Shape3D({ k: "box", center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], size: [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])] }),
  makeBaseBox: (x: number, y: number, z: number) => new Shape3D({ k: "box", center: [0, 0, z / 2], size: [x, y, z] }),
  makeCylinder: (radius: number, height: number, location: Vec3 = [0, 0, 0], direction: Vec3 = [0, 0, 1]) =>
    new Shape3D({ k: "cylinder", base: location, axis: direction, r: radius, h: height }),
  makeSphere: (radius: number) => new Shape3D({ k: "sphere", center: [0, 0, 0], r: radius }),
  EdgeFinder: class {
    constructor() {
      refuse("EdgeFinder");
    }
  },
  FaceFinder: class {
    constructor() {
      refuse("FaceFinder");
    }
  },
};

/** What a replicad `main()` returned (a shape, a list, or `{ shape, name }` entries), declared as a part. */
export function fromReplicad(value: unknown, name = "Part"): Declaration {
  const items = (Array.isArray(value) ? value : [value]).map((v) => (v && typeof v === "object" && "shape" in (v as object) ? (v as { shape: unknown }).shape : v));
  const solids = items.map((v) => {
    if (!(v instanceof Shape3D)) throw new Error("main() returned something that is not a replicad solid");
    return v.solid;
  });
  return declareSolids(name, solids);
}

export const isReplicadShape = (v: unknown): boolean =>
  v instanceof Shape3D || (Array.isArray(v) && v.length > 0 && v.every((x) => x instanceof Shape3D || (x && typeof x === "object" && (x as { shape?: unknown }).shape instanceof Shape3D)));
