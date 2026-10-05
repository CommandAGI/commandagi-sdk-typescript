/**
 * CAD — parts, sketches, features and assemblies, declared as a 3D document's feature graph.
 *
 *   import { part, box, cylinder, sketch, extrude, subtract } from "commandagi/design";
 *
 *   export const params = { width: { default: 60, unit: "mm", min: 30, max: 120 } };
 *
 *   export default ({ width }: { width: number }) =>
 *     part("Bracket", () => {
 *       const plate = box({ size: [width, 40, 5], center: [0, 0, 2.5] });
 *       const holes = [-1, 1].map((s) => cylinder({ base: [s * (width / 2 - 8), 0, 0], radius: 1.6, height: 5 }));
 *       return subtract(plate, ...holes);
 *     });
 *
 * Every primitive declares ONE node of the 3D feature graph: its type is the feature type (`box`,
 * `cylinder`, `sketch`, `extrude`, `transform`, …), its literal ports are the feature's fields, and the
 * references between features are wires — `profile` (the sketch an extrude uses), `base.N` / `on.N` (the
 * bodies a boolean or a modifier must see first), `seed` (what a pattern or transform copies). Lengths are
 * millimetres; the SDK takes angles in degrees and writes the radians the feature graph stores.
 *
 * Structure only. Which faces a fillet lands on, whether a cut removes anything, what the solid looks like —
 * the engine's geometry kernel decides that when it evaluates the part. A boolean acts on the bodies that
 * exist when it runs (the engine's rule); its `base` wires say which features run before it.
 */
import { Declaration, NodeRef, Scope, currentScope, withScope, channels, type PortValue } from "./ir.js";
import { CODE_OP } from "./graph.js";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type PlaneName = "XY" | "XZ" | "YZ";
export type AxisName = "X" | "Y" | "Z";
/** How a solid combines with the bodies that exist when it runs. */
export type Operation = "new" | "add" | "cut" | "intersect";

/** The built-in datum planes every 3D document has. */
export const PLANES: Record<PlaneName, string> = { XY: "plane_xy", XZ: "plane_xz", YZ: "plane_yz" };
const rad = (deg: number) => (deg * Math.PI) / 180;
const axisRef = (axis: AxisName) => ({ type: "datumAxis", axis });
const planeRef = (plane: PlaneName) => ({ type: "datum", plane: PLANES[plane] });

/**
 * A body: the feature that last shaped it, and every feature it is made of (what a later boolean or
 * modifier must see first).
 */
export class Body extends NodeRef {
  constructor(
    scope: Scope,
    id: string,
    readonly state: readonly string[],
  ) {
    super(scope, id);
  }
}

/** A sketch: a closed profile an extrude or a revolve uses. */
export class SketchRef extends NodeRef {}

function scope(what: string): Scope {
  const s = currentScope(what);
  if (s.meta.domain !== "cad") throw new Error(`${what} declares a 3D feature and belongs inside part(…) or assembly(…)`);
  return s;
}

function feature(
  what: string,
  type: string,
  fields: Record<string, PortValue>,
  opts: { name?: string; after?: readonly string[]; port?: "base" | "on" },
): Body {
  const s = scope(what);
  const after = opts.after ?? [];
  for (const id of after) if (!s.nodes[id]) throw new Error(`${what}: ${id} is not a feature of this part`);
  const ref = s.add(type, { ...fields, ...channels(opts.port ?? "base", after.map((id) => new NodeRef(s, id))) }, { label: opts.name ?? defaultName(s, type) });
  return new Body(s, ref.id, [...after, ref.id]);
}

function defaultName(s: Scope, type: string): string {
  const n = Object.values(s.nodes).filter((x) => x.type === type).length + 1;
  return type.charAt(0).toUpperCase() + type.slice(1) + " " + n;
}

/** Declare a part: `fn` declares its features and returns the body (or bodies) the part is. */
export function part(
  name: string,
  fn: () => Body | Body[] | void,
  opts: { id?: string; meta?: Record<string, unknown> } = {},
): Declaration {
  const s = new Scope(opts.id ?? name, { domain: "cad", name, units: "mm", ...(opts.meta ?? {}) });
  const result = withScope(s, fn);
  if (result) s.output(...(Array.isArray(result) ? result : [result]));
  return new Declaration("part", s.build());
}

/**
 * Declare an assembly: parts placed by code nodes (`instance`) and transforms. The same feature graph as a
 * part; each placed part is the file that declares it.
 */
export function assembly(name: string, fn: () => Body | Body[] | void, opts: { id?: string } = {}): Declaration {
  const d = part(name, fn, { ...opts, meta: { assembly: true } });
  return new Declaration("assembly", d.ir);
}

/** A part declared by another code file (`wheel.part.ts`), run with these inputs. */
export function instance(source: string, inputs: Record<string, PortValue> = {}, opts: { name?: string } = {}): Body {
  const s = scope("instance()");
  const ref = s.add(CODE_OP, { source, ...inputs }, { label: opts.name ?? source.split("/").pop() ?? source });
  return new Body(s, ref.id, [ref.id]);
}

// ── Primitives ───────────────────────────────────────────────────────────────────────────────────────

export interface SolidOpts {
  name?: string;
  /** How it combines with the bodies that exist when it runs (default "new"). */
  operation?: Operation;
  /** Bodies it must run after (a boolean's targets). */
  after?: Body[];
}
const afterIds = (o: SolidOpts) => (o.after ?? []).flatMap((b) => b.state);

/** A box, centred on `center` (default the origin). */
export function box(o: { size: Vec3; center?: Vec3 } & SolidOpts): Body {
  return feature("box()", "box", { center: o.center ?? [0, 0, 0], size: o.size, operation: o.operation ?? "new" }, { name: o.name, after: afterIds(o) });
}

/** A cylinder standing on `base` (the centre of one end), extending `height` along `axis` (default +Z). */
export function cylinder(o: { radius: number; height: number; base?: Vec3; axis?: Vec3 } & SolidOpts): Body {
  return feature(
    "cylinder()",
    "cylinder",
    { center: o.base ?? [0, 0, 0], axis: o.axis ?? [0, 0, 1], radius: o.radius, height: o.height, operation: o.operation ?? "new" },
    { name: o.name, after: afterIds(o) },
  );
}

/** A sphere. */
export function sphere(o: { radius: number; center?: Vec3 } & SolidOpts): Body {
  return feature("sphere()", "sphere", { center: o.center ?? [0, 0, 0], radius: o.radius, operation: o.operation ?? "new" }, { name: o.name, after: afterIds(o) });
}

/** A cone (or a frustum) standing on `base`, radius1 there and radius2 at the far end. */
export function cone(o: { radius1: number; radius2: number; height: number; base?: Vec3; axis?: Vec3 } & SolidOpts): Body {
  return feature(
    "cone()",
    "cone",
    { center: o.base ?? [0, 0, 0], axis: o.axis ?? [0, 0, 1], radius1: o.radius1, radius2: o.radius2, height: o.height, operation: o.operation ?? "new" },
    { name: o.name, after: afterIds(o) },
  );
}

// ── Sketches ─────────────────────────────────────────────────────────────────────────────────────────

interface SketchPoint {
  id: string;
  x: number;
  y: number;
}
type SketchSegment =
  | { id: string; type: "line"; a: string; b: string }
  | { id: string; type: "circle"; center: string; radius: number }
  | { id: string; type: "arc"; center: string; start: string; end: string; radius: number };
type SegmentInit = SketchSegment extends infer S ? (S extends { id: string } ? Omit<S, "id"> : never) : never;

/** What a sketch declares: points and segments in the plane's own millimetres. No constraints are solved. */
export class SketchBuilder {
  readonly points: Record<string, SketchPoint> = {};
  readonly segments: Record<string, SketchSegment> = {};
  private n = 0;
  private point(x: number, y: number): string {
    const id = `p${++this.n}`;
    this.points[id] = { id, x, y };
    return id;
  }
  private seg(s: SegmentInit): void {
    const id = `s${++this.n}`;
    this.segments[id] = { ...s, id } as SketchSegment;
  }
  /** A closed polyline through these points. */
  polygon(points: Vec2[]): this {
    if (points.length < 3) throw new Error("a polygon needs at least three points");
    const ids = points.map(([x, y]) => this.point(x, y));
    ids.forEach((a, i) => this.seg({ type: "line", a, b: ids[(i + 1) % ids.length]! }));
    return this;
  }
  /** A rectangle, centred on `center` (default the origin) or from `corner`. */
  rect(o: { size: Vec2; center?: Vec2; corner?: Vec2 }): this {
    const [w, h] = o.size;
    const [cx, cy] = o.corner ? [o.corner[0] + w / 2, o.corner[1] + h / 2] : (o.center ?? [0, 0]);
    return this.polygon([
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
    ]);
  }
  /** A circle. */
  circle(o: { radius: number; center?: Vec2 }): this {
    const [x, y] = o.center ?? [0, 0];
    this.seg({ type: "circle", center: this.point(x, y), radius: o.radius });
    return this;
  }
  /** A slot: two semicircles joined by straight sides, from `a` to `b`, `width` across. */
  slot(o: { a: Vec2; b: Vec2; width: number }): this {
    const [ax, ay] = o.a, [bx, by] = o.b, r = o.width / 2;
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 0)) throw new Error("a slot's ends must differ");
    const nx = (-(by - ay) / len) * r, ny = ((bx - ax) / len) * r;
    const a1 = this.point(ax + nx, ay + ny), b1 = this.point(bx + nx, by + ny);
    const b2 = this.point(bx - nx, by - ny), a2 = this.point(ax - nx, ay - ny);
    const ca = this.point(ax, ay), cb = this.point(bx, by);
    this.seg({ type: "line", a: a1, b: b1 });
    this.seg({ type: "arc", center: cb, start: b1, end: b2, radius: r });
    this.seg({ type: "line", a: b2, b: a2 });
    this.seg({ type: "arc", center: ca, start: a2, end: a1, radius: r });
    return this;
  }
  toSketch() {
    return {
      points: this.points,
      segments: this.segments,
      constraints: {},
      pointOrder: Object.keys(this.points),
      segmentOrder: Object.keys(this.segments),
      constraintOrder: [],
    };
  }
}

/**
 * Declare a sketch on a datum plane, or on a plane `offset` mm along its normal (which declares a
 * `datumPlane` feature the sketch is wired to).
 */
export function sketch(
  plane: PlaneName | { plane: PlaneName; offset: number },
  draw: (s: SketchBuilder) => void,
  opts: { name?: string } = {},
): SketchRef {
  const s = scope("sketch()");
  const b = new SketchBuilder();
  draw(b);
  if (!Object.keys(b.segments).length) throw new Error("this sketch draws nothing");
  let on: PortValue;
  if (typeof plane === "string" || !plane.offset) on = planeRef(typeof plane === "string" ? plane : plane.plane);
  else on = s.add("datumPlane", { base: PLANES[plane.plane], offset: plane.offset }, { label: `${plane.plane} + ${plane.offset}` });
  const ref = s.add("sketch", { plane: on, sketch: b.toSketch() }, { label: opts.name ?? defaultName(s, "sketch") });
  return new SketchRef(s, ref.id);
}

/** Extrude a sketch's closed regions `distance` along the plane's normal. */
export function extrude(
  profile: SketchRef,
  o: { distance: number; symmetric?: boolean; reverse?: boolean; regions?: number[] } & SolidOpts,
): Body {
  return feature(
    "extrude()",
    "extrude",
    {
      profile,
      distance: o.distance,
      ...(o.symmetric ? { symmetric: true } : {}),
      ...(o.reverse ? { reverse: true } : {}),
      ...(o.regions ? { regions: o.regions } : {}),
      operation: o.operation ?? "new",
    },
    { name: o.name, after: afterIds(o) },
  );
}

/** Revolve a sketch about a datum axis, `angle` degrees (default a full turn). */
export function revolve(profile: SketchRef, o: { axis: AxisName; angle?: number } & SolidOpts): Body {
  return feature(
    "revolve()",
    "revolve",
    { profile, axis: axisRef(o.axis), angle: rad(o.angle ?? 360), operation: o.operation ?? "new" },
    { name: o.name, after: afterIds(o) },
  );
}

// ── Booleans ─────────────────────────────────────────────────────────────────────────────────────────

function boolean(what: string, op: "add" | "cut" | "intersect", target: Body, tools: Body[]): Body {
  if (!tools.length) throw new Error(`${what} needs at least one tool body`);
  const s = scope(what);
  let state = [...target.state];
  for (const tool of tools) {
    const n = s.nodes[tool.id];
    if (!n || !("operation" in n.inputs)) throw new Error(`${what}: ${tool.id} is not a solid primitive or extrude`);
    n.inputs.operation = op;
    const before = state.filter((id) => !tool.state.includes(id));
    const prior = Object.keys(n.inputs).filter((k) => k.startsWith("base."));
    for (const k of prior) delete n.inputs[k];
    Object.assign(n.inputs, channels("base", before.map((id) => ({ wire: { node: id, port: "out" } }))));
    state = [...state, ...tool.state.filter((id) => !state.includes(id))];
  }
  const last = tools[tools.length - 1]!;
  return new Body(s, last.id, state);
}

/** Fuse tools into the target. */
export const union = (target: Body, ...tools: Body[]): Body => boolean("union()", "add", target, tools);
/** Cut tools out of the target. */
export const subtract = (target: Body, ...tools: Body[]): Body => boolean("subtract()", "cut", target, tools);
/** Keep what the target and the tools share. */
export const intersect = (target: Body, ...tools: Body[]): Body => boolean("intersect()", "intersect", target, tools);

/** A round hole: a cylinder cut from `target`, entering at `at` along `-axis` (default straight down, -Z). */
export function hole(target: Body, o: { at: Vec3; diameter: number; depth: number; axis?: Vec3; name?: string }): Body {
  const [ax, ay, az] = o.axis ?? [0, 0, 1];
  const len = Math.hypot(ax, ay, az) || 1;
  const d: Vec3 = [ax / len, ay / len, az / len];
  const base: Vec3 = [o.at[0] - d[0] * o.depth, o.at[1] - d[1] * o.depth, o.at[2] - d[2] * o.depth];
  return subtract(target, cylinder({ base, axis: d, radius: o.diameter / 2, height: o.depth, name: o.name ?? "Hole" }));
}

// ── Modifiers (they act on the bodies that exist; `on` says which features run first) ─────────────────

/** An edge named by a point on it (its midpoint is best) and, optionally, its direction. */
export interface EdgeAt {
  at: Vec3;
  dir?: Vec3;
}
/** A face named by a point on it and its outward normal. */
export interface FaceAt {
  at: Vec3;
  normal: Vec3;
}
const edgeRef = (e: EdgeAt) => ({ kind: "edge", signature: { point: e.at, ...(e.dir ? { dir: e.dir } : {}) } });
const faceRef = (f: FaceAt) => ({ kind: "face", signature: { point: f.at, normal: f.normal } });

function modifier(what: string, type: string, target: Body, fields: Record<string, PortValue>, name?: string): Body {
  return feature(what, type, fields, { name, after: target.state, port: "on" });
}

/** Round these edges of `target`. */
export function fillet(target: Body, o: { radius: number; edges: EdgeAt[]; name?: string }): Body {
  return modifier("fillet()", "fillet", target, { edges: o.edges.map(edgeRef), radius: o.radius }, o.name);
}
/** Bevel these edges of `target`. */
export function chamfer(target: Body, o: { distance: number; edges: EdgeAt[]; name?: string }): Body {
  return modifier("chamfer()", "chamfer", target, { edges: o.edges.map(edgeRef), distance: o.distance }, o.name);
}
/** Hollow `target`, removing these faces, leaving walls `thickness` thick. */
export function shell(target: Body, o: { thickness: number; open: FaceAt[]; name?: string }): Body {
  return modifier("shell()", "shell", target, { faces: o.open.map(faceRef), thickness: o.thickness }, o.name);
}

// ── Copies and patterns (the engine's rule: they repeat the SEED FEATURE's own solid, with its operation —
//    a pattern of a cut cuts again; a copy is fused into the part). Place a primitive by its own position. ──

function seeded(what: string, type: string, seed: Body, fields: Record<string, PortValue>, name?: string): Body {
  const s = scope(what);
  const ref = s.add(type, { seed, ...fields }, { label: name ?? defaultName(s, type) });
  return new Body(s, ref.id, [...seed.state, ref.id]);
}

/** A copy of the seed feature's solid, moved and/or turned about a datum axis, fused into the part. */
export function copy(seed: Body, o: { translate?: Vec3; rotate?: { axis: AxisName; angle: number }; name?: string }): Body {
  return seeded(
    "copy()",
    "transform",
    seed,
    {
      ...(o.translate ? { translate: o.translate } : {}),
      ...(o.rotate ? { rotateAxis: axisRef(o.rotate.axis), rotateAngle: rad(o.rotate.angle) } : {}),
    },
    o.name,
  );
}
/** `count` instances of the seed feature (itself included), `spacing` apart along `direction`. */
export function linearPattern(seed: Body, o: { direction: Vec3; spacing: number; count: number; name?: string }): Body {
  return seeded("linearPattern()", "linearPattern", seed, { direction: o.direction, spacing: o.spacing, count: o.count }, o.name);
}
/** `count` instances of the seed feature about a datum axis, over `angle` degrees (default a full turn). */
export function circularPattern(seed: Body, o: { axis: AxisName; count: number; angle?: number; name?: string }): Body {
  return seeded("circularPattern()", "circularPattern", seed, { axis: axisRef(o.axis), count: o.count, angle: rad(o.angle ?? 360) }, o.name);
}
/** The seed feature's solid mirrored across a datum plane (the original kept). */
export function mirror(seed: Body, o: { plane: PlaneName; name?: string }): Body {
  return seeded("mirror()", "mirror", seed, { plane: planeRef(o.plane), keepOriginal: true }, o.name);
}
