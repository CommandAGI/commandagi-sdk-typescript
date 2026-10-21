/**
 * A 3D DOCUMENT IN JSX — the document's own graph, declared element by element, so the 3D editor opens a `.3d.tsx`
 * with all its tools and writes each edit back into the file:
 *
 *   export default () => (
 *     <part name="Mounting plate">
 *       <parameter name="depth" value={6} unit="mm" bindings={[{ target: "extrude1", field: "distance" }]} />
 *       <sketch id="sketch1" name="Sketch1" plane={{ type: "datum", plane: "plane_xy" }}>
 *         <point id="p1" x={-30} y={-20} />
 *         <point id="p2" x={30} y={-20} />
 *         <line id="l1" a="p1" b="p2" />
 *         <constraint id="c1" kind="horizontal" entities={["l1"]} />
 *       </sketch>
 *       <extrude id="extrude1" name="Extrude1" profile={{ sketch: "sketch1" }} distance={6} operation="new" />
 *       <fillet id="fillet1" name="Fillet1" radius={2} edges={[{ kind: "edge", select: { parallel: [0, 0, 1] } }]} />
 *       <body id="extrude1" engineering={{ material: "6061-T6", process: "cnc-milling" }} />
 *     </part>
 *   );
 *
 * The tags (each attribute is the field of the same name; nothing is renamed):
 *   <part name> | <assembly name>             the document; <assembly> opens in the assembly mode (`isAssembly`)
 *   <parameter name value unit comment min max step tolerance bindings>    a parameter; `bindings` [{ target, field }];
 *                                             `tolerance` { upper, lower } | { class: "k5" } | { basic: true }
 *                                             (`./tolerances.ts`), what a fit or stack-up check reads
 *   <part builtinPlanes={[…]}>                the built-in planes the document has (plane_xy, plane_xz, plane_yz);
 *                                             absent: all three, `builtinPlanes={[]}`: none
 *   <plane id name origin normal xAxis>       a datum plane
 *   <FEATURE id name …fields>                 a feature: the tag is its type (extrude, revolve, fillet, chamfer,
 *                                             hole, linearPattern, circularPattern, mirror, transform, box, …);
 *                                             `suppressed`, `consumes` as stored. THE ORDER OF THE ELEMENTS IS THE
 *                                             ORDER THE PART IS BUILT IN: a feature that acts on bodies (a cut, a
 *                                             hole, a fillet, a pattern) and names no `consumes` follows every
 *                                             body-making feature written before it. `consumes={[…]}` names the
 *                                             ones it follows instead (a cut of one body among several)
 *   faces and edges                           where a feature takes them (`edges`, `faces`, `face`, `edge`): one
 *                                             picked by where it was, { kind, signature: { point, … } }, or the
 *                                             ones a query chooses when the part is built, { kind, select: { … } }:
 *                                             normal, parallel, perpendicular, axis (directions), geometry, length,
 *                                             radius, area (ranges { min, max }), ofFace (the edges of the faces a
 *                                             face query chooses), createdBy (what a feature made), at (a point on
 *                                             the face), inBox, farthest
 *                                             (a direction: "the top"), any, not. Every test present must hold
 *   <hole face positions | sketch …>          where the holes are: `positions` (points in model coordinates) or
 *                                             `sketch` (a sketch of points); with neither, the face's centre. A
 *                                             face that chooses several drills each place in the one it lies on
 *   <feature type id name …fields>            a feature of a type the kernel does not know (a document may hold any
 *                                             type; its rebuild names it). A known type is written as its own tag
 *   <sketch id name plane> with children      a sketch: <point id x y>, a segment by its type (<line id a b>,
 *                                             <circle id center radius>, <arc id center start end radius>,
 *                                             <spline>, <ellipse>, <ellipseArc>), <constraint id kind entities
 *                                             value reference>, <projection id ref feature>
 *   <body id name material engineering …>     a body's own data (`bodyMeta[id]`): its name, its look (`material`: a
 *                                             colour, a metalness) and what it is (`engineering`: the material grade
 *                                             by its id in a materials table, the process and how it is made, the
 *                                             finish, its suppliers and their terms, its inspection, compliance,
 *                                             shipping and lifecycle; `ThreeD.PartEngineering`, docs/formats.md §
 *                                             logistics)
 *   <item id name qty ref engineering>        a part of the product with no geometry here (`items`): a cable in the
 *                                             box, or another design by `ref` (a board's .pcb.tsx)
 *   <assemble id order parts fasteners tools fixture by minutes ratePerHour currency instruction>
 *                                             one assembly step (`assemblySteps`)
 *   <library id match engineering>            the data of every library fastener piece whose designation matches
 *                                             (`library`): its supplier and price, compliance, shipping, given once
 *   <joint id kind a b anchor axis limits …>  a joint between two bodies (`dynamics.joints`): fixed, revolute,
 *                                             prismatic, cylindrical, planar, screw, spherical or universal, its
 *                                             axis, its limits and the geometry it binds (`refA`, `refB`)
 *   <mate id kind a b axis …>                 a mate between two components of an assembly (`assembly.mates`)
 *   <sheet id size scale projection views …>  an engineering drawing sheet of the document (`drawings`): standard
 *                                             views, the document's dimensions and a title block
 *   <check id kind bodies severity …>          a check the design must pass (`checks`): interference, clearance,
 *                                             holes, fasteners, edges, symmetry, tolerances, fit (`hole shaft
 *                                             intent`), stackup (`chain limit method samples seed`), or a
 *                                             registered kind
 *   <accept id check body region reason>      a finding accepted on purpose, in a bounded region of one body
 *                                             (`accepted`)
 *   <permitted id check body process edgeDir region reason>   findings a process or a purpose permits (`permitted`)
 *   <fastener id part length at axis clamped receiver washer nut grip fit minEngagement>
 *                                             a fastener stack (`fasteners`): a library screw, its washer and nut,
 *                                             and the parts it clamps into its receiver
 *   <slot name value>                         any other field of the document, whole (environment, animation,
 *                                             standardParts, decals, annotations, the rest of dynamics …)
 *
 * The reader declares the document's graph exactly (docs/formats.md § the 3D document's body): a feature is a node of
 * its type with its fields as ports, a plane a `plane` node, a parameter an `input` node whose `drives` are its
 * bindings, a slot a `3d.<field>` node, the bodies one `3d.bodyMeta` node. The order of the feature elements is
 * the order of the left-hand list (`presentation.order`). Every node carries the element it came from in
 * `meta.source`; a sketch's entities and the bodies are listed by key in `meta.sources`. Units are millimetres
 * and radians, as stored. A `<hole size="M4 close fit">` has that size's diameter (`./standards.ts`). An id is letters, digits, `_ . -`, with `/` between them (a merged code part's features
 * are `<code id>/<id>`). Anything else is refused by name, never guessed.
 *
 * A feature element is checked against its type's schema (`THREED_SCHEMA`; its props are typed in
 * `threed-elements.ts`, `ExtrudeProps` …): the feature `{ type: <tag>, name: <its id when absent>, …its props }`, a
 * sketch with the `sketch` its children make. A wrong field is refused with the sentence an op panel shows for it:
 * `<extrude id="e1">: distance: must be greater than 0 (got -1)`. A `<feature type>` of an unknown type is not checked.
 * A required field that declares a default may be left out: it reads as that default (an `<externalPart>` without
 * `placement` sits at the identity placement), and the node's inputs hold it.
 */
import { slug } from "./ir.js";
import { childElements, isElement, type DesignElement } from "./jsx-runtime.js";
import { describeIssue, validate, withDefaults } from "./schema.js";
import { sizedHole } from "./standards.js";
import { THREED_SCHEMA } from "./threed-schema.js";
import { toleranceProblem, type DimensionTolerance } from "./tolerances.js";

/**
 * The feature types a 3D document holds, by tag: the roots of `THREED_SCHEMA`, generated from the `Feature` union
 * (`packages/domain/3d-core/types.ts`).
 */
export const THREED_FEATURES: readonly string[] = Object.keys(THREED_SCHEMA.roots);
const FEATURES = new Set(THREED_FEATURES);
/** Tags with a meaning of their own: never a `<feature type>`. */
const NOT_FEATURES = new Set(["feature", "part", "assembly", "parameter", "plane", "body", "slot", "joint", "mate", "sheet", "check", "accept", "permitted", "fastener", "item", "assemble", "library", "point", "constraint", "projection", "line", "circle", "arc", "spline", "ellipse", "ellipseArc", "input"]);
/** A sketch's segment kinds, by tag. */
export const SKETCH_SEGMENTS: readonly string[] = ["line", "circle", "arc", "spline", "ellipse", "ellipseArc"];
const SEGMENTS = new Set(SKETCH_SEGMENTS);
/** The datum planes every 3D document has (`3d-core/document.ts` basePlanes). */
export const BUILTIN_PLANES = {
  plane_xy: { name: "Front (XY)", origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0], builtin: "XY" },
  plane_xz: { name: "Top (XZ)", origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [1, 0, 0], builtin: "XZ" },
  plane_yz: { name: "Right (YZ)", origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0], builtin: "YZ" },
} as const;
/** The document's view fields a root element may hold (the graph's `meta`), beside `name`. */
const VIEW_ATTRS = new Set(["semanticVisibility"]);
const PARAM_FIELDS = ["value", "unit", "comment", "min", "max", "step", "tolerance"];
/** Document fields a <slot> may not hold: they have elements of their own, or are the graph itself. */
const NOT_SLOTS = new Set(["id", "name", "units", "planes", "features", "parameters", "presentation", "isAssembly", "bodyMeta", "semanticVisibility", "drawings", "checks", "accepted", "permitted", "fasteners", "items", "assemblySteps", "library"]);
/**
 * Elements that are the items of a list the document holds: the tag, the document field (its node), the port of that
 * node that holds the list, and the definition each item is checked against (`THREED_SCHEMA.$defs`).
 */
export const THREED_LISTS: Readonly<Record<string, { node: string; port: string; def: string }>> = {
  joint: { node: "dynamics", port: "joints", def: "DynamicsJoint" },
  mate: { node: "assembly", port: "mates", def: "Mate" },
  sheet: { node: "drawings", port: "value", def: "DrawingSheet" },
  check: { node: "checks", port: "value", def: "DesignCheck" },
  accept: { node: "accepted", port: "value", def: "AcceptedFinding" },
  permitted: { node: "permitted", port: "value", def: "PermittedFinding" },
  fastener: { node: "fasteners", port: "value", def: "FastenerStack" },
  item: { node: "items", port: "value", def: "ProductItem" },
  assemble: { node: "assemblySteps", port: "value", def: "AssemblyStep" },
  library: { node: "library", port: "value", def: "LibraryData" },
};

interface Node {
  id: string;
  type: string;
  label?: string;
  disabled?: boolean;
  inputs: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

/** Whether a JSX tree is a 3D document: one <part> or <assembly> element. */
export function isThreeD(root: unknown): root is DesignElement {
  return isElement(root) && (root.type === "part" || root.type === "assembly");
}

const where = (el: DesignElement) => `<${el.type}${typeof el.props.id === "string" ? ` id="${el.props.id}"` : typeof el.props.name === "string" ? ` name="${el.props.name}"` : ""}>`;

function plain(v: unknown, what: string): unknown {
  if (v === null || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${what} is ${v}, not a finite number`);
    return v;
  }
  if (Array.isArray(v)) return v.map((x, i) => plain(x, `${what}[${i}]`));
  if (v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v)))
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, plain(x, `${what}.${k}`)]));
  throw new Error(`${what} is plain data (numbers, strings, arrays, objects)`);
}

/** The element's props as fields: plain data, without `children`, `key` and the names in `skip`. */
function fields(el: DesignElement, skip: readonly string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el.props)) {
    if (k === "children" || k === "key" || skip.includes(k) || v === undefined) continue;
    out[k] = plain(v, `${where(el)} ${k}`);
  }
  return out;
}

/** An id: letters, digits, `_ . -`, with `/` between them (a document names a merged code part's features `<code id>/<id>`). */
const ID = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
function idOf(el: DesignElement): string {
  const id = el.props.id;
  if (typeof id !== "string" || !id) throw new Error(`${where(el)} needs an id`);
  if (!ID.test(id)) throw new Error(`${where(el)}: an id is letters, digits, _ . - with / between them (${JSON.stringify(id)})`);
  return id;
}

const source = (el: DesignElement) => (el.source === undefined ? undefined : el.source);
function noChildren(el: DesignElement): void {
  if (childElements(el.props.children).length) throw new Error(`${where(el)} has no child elements`);
}

/** The sketch a <sketch>'s children declare, and where each entity was written. */
function sketchOf(el: DesignElement): { sketch: Record<string, unknown>; sources: Record<string, unknown> } {
  const points: Record<string, unknown> = {};
  const segments: Record<string, unknown> = {};
  const constraints: Record<string, unknown> = {};
  const projections: Record<string, unknown> = {};
  const sources: Record<string, unknown> = {};
  const taken = new Set<string>();
  const claim = (child: DesignElement, kind: string): string => {
    const id = idOf(child);
    if (taken.has(id)) throw new Error(`${where(el)}: two entities are called ${id}`);
    taken.add(id);
    if (child.source !== undefined) sources[`${kind}:${id}`] = child.source;
    noChildren(child);
    return id;
  };
  for (const child of childElements(el.props.children)) {
    if (child.type === "point") {
      const id = claim(child, "point");
      const f = fields(child);
      if (typeof f.x !== "number" || typeof f.y !== "number") throw new Error(`${where(el)} ${where(child)}: a point has x and y (mm)`);
      points[id] = f;
    } else if (SEGMENTS.has(child.type)) {
      const id = claim(child, "segment");
      if ("type" in child.props) throw new Error(`${where(el)} ${where(child)}: the tag is the segment's type`);
      segments[id] = { id, type: child.type, ...fields(child, ["id"]) };
    } else if (child.type === "constraint") {
      const id = claim(child, "constraint");
      const f = fields(child);
      if (typeof f.kind !== "string" || !Array.isArray(f.entities)) throw new Error(`${where(el)} ${where(child)}: a constraint has a kind and its entities`);
      constraints[id] = f;
    } else if (child.type === "projection") {
      const id = claim(child, "projection");
      projections[id] = fields(child);
    } else throw new Error(`${where(el)}: <${child.type}> is not read in a sketch (point, ${SKETCH_SEGMENTS.join(", ")}, constraint, projection)`);
  }
  for (const [id, s] of Object.entries(segments)) {
    for (const k of ["a", "b", "center", "start", "end", "focus"]) {
      const p = (s as Record<string, unknown>)[k];
      if (p !== undefined && (typeof p !== "string" || !points[p])) throw new Error(`${where(el)}: segment ${id}'s ${k} names no point of the sketch (${JSON.stringify(p)})`);
    }
  }
  const sketch: Record<string, unknown> = {
    points,
    segments,
    constraints,
    pointOrder: Object.keys(points),
    segmentOrder: Object.keys(segments),
    constraintOrder: Object.keys(constraints),
  };
  if (Object.keys(projections).length) {
    sketch.projections = projections;
    sketch.projectionOrder = Object.keys(projections);
  }
  return { sketch, sources };
}

/**
 * The graph a <part> or <assembly> element declares: an op graph whose nodes are its parameters, planes,
 * features and slots (docs/formats.md § the 3D document's body).
 */
export function declareThreeD(root: DesignElement, fallbackName = "Part"): { id: string; nodes: Record<string, Node>; meta: Record<string, unknown> } {
  if (!isThreeD(root)) throw new Error("a 3D document is one <part> or <assembly> element");
  for (const k of Object.keys(root.props))
    if (!["children", "key", "name", "id", "builtinPlanes"].includes(k) && !VIEW_ATTRS.has(k)) throw new Error(`${where(root)}: prop ${k} is not read on a 3D document`);
  const builtins = builtinPlanesOf(root);
  const name = typeof root.props.name === "string" && root.props.name ? root.props.name : fallbackName;
  const nodes: Record<string, Node> = {};
  const owner = new Map<string, string>();
  const claim = (id: string, what: string) => {
    const prev = owner.get(id);
    if (prev) throw new Error(`the id "${id}" is both ${prev} and ${what}; a node id is used once`);
    owner.set(id, what);
  };
  const order: string[] = [];
  const bodies: Record<string, unknown> = {};
  const bodySources: Record<string, unknown> = {};
  const declared: DesignElement[] = [];
  const lists: Record<string, { items: Record<string, unknown>[]; sources: Record<string, unknown> }> = {};
  // Every element is read, and every one refused is named together: a file with ten mistakes needs one run, not ten.
  const refused: string[] = [];
  const refuse = (e: unknown) => refused.push(e instanceof Error ? e.message : String(e));
  for (const el of childElements(root.props.children)) try {
    if (el.type === "parameter") {
      noChildren(el);
      const pname = el.props.name;
      if (typeof pname !== "string" || !pname || slug(pname) !== pname) throw new Error(`${where(el)} needs a name (letters, digits, _ . -)`);
      for (const k of Object.keys(el.props))
        if (!["children", "key", "name", "bindings", ...PARAM_FIELDS].includes(k)) throw new Error(`${where(el)}: prop ${k} is not read on a parameter`);
      if (typeof el.props.value !== "number") throw new Error(`${where(el)}: value is a number`);
      if (el.props.tolerance !== undefined) {
        const problem = toleranceProblem(el.props.tolerance as DimensionTolerance);
        if (problem) throw new Error(`${where(el)}: tolerance: ${problem}`);
      }
      claim(pname, `parameter "${pname}"`);
      const f = fields(el, ["name", "bindings"]);
      const bindings = el.props.bindings === undefined ? [] : plain(el.props.bindings, `${where(el)} bindings`);
      if (!Array.isArray(bindings) || bindings.some((b) => !b || typeof (b as { target?: unknown }).target !== "string" || typeof (b as { field?: unknown }).field !== "string"))
        throw new Error(`${where(el)}: bindings are [{ target, field }]`);
      nodes[pname] = { id: pname, type: "input", label: pname, inputs: { ...f, ...(bindings.length ? { drives: bindings } : {}) }, ...meta(el) };
    } else if (el.type === "plane") {
      noChildren(el);
      const id = idOf(el);
      claim(id, `plane "${id}"`);
      const { name: label, ...rest } = fields(el, ["id"]);
      nodes[id] = { id, type: "plane", ...(typeof label === "string" ? { label } : {}), inputs: rest, ...meta(el) };
    } else if (el.type === "body") {
      noChildren(el);
      const id = idOf(el);
      if (bodies[id]) throw new Error(`two <body> elements are called ${id}`);
      const body = fields(el, ["id"]);
      if (body.engineering !== undefined) body.engineering = checkValue(el, "PartEngineering", body.engineering, "engineering");
      bodies[id] = body;
      if (el.source !== undefined) bodySources[id] = el.source;
    } else if (THREED_LISTS[el.type]) {
      noChildren(el);
      const id = idOf(el);
      const list = (lists[el.type] ??= { items: [], sources: {} });
      if (list.items.some((x) => x.id === id)) throw new Error(`two <${el.type}> elements are called ${id}`);
      const item = checkValue(el, THREED_LISTS[el.type]!.def, fields(el)) as Record<string, unknown>;
      if (el.type === "sheet") {
        const problems = sheetViewProblems(item.views as SheetView[]);
        if (problems.length) throw new Error(`${where(el)}: ${problems.join("; ")}`);
      }
      list.items.push(item);
      if (el.source !== undefined) list.sources[`${el.type}:${id}`] = el.source;
    } else if (el.type === "slot") {
      noChildren(el);
      const field = el.props.name;
      if (typeof field !== "string" || !/^[A-Za-z_]\w*$/.test(field)) throw new Error(`${where(el)} needs the name of a document field`);
      if (NOT_SLOTS.has(field)) throw new Error(`${where(el)}: ${field} is not a slot (it has its own element or attribute)`);
      for (const k of Object.keys(el.props)) if (!["children", "key", "name", "value"].includes(k)) throw new Error(`${where(el)}: prop ${k} is not read on a slot (its value is "value")`);
      claim(field, `the document's ${field}`);
      const value = plain(el.props.value, `${where(el)} value`);
      let inputs: Record<string, unknown> = { value };
      if (OBJECT_SLOTS.has(field)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${where(el)}: the document's ${field} is an object`);
        inputs = value as Record<string, unknown>;
        for (const [tag, list] of Object.entries(THREED_LISTS))
          if (list.node === field && list.port in inputs) throw new Error(`${where(el)}: ${list.port} are written as <${tag}> elements`);
      }
      nodes[field] = { id: field, type: `3d.${field}`, inputs, ...meta(el) };
    } else if (FEATURES.has(el.type)) {
      declared.push(el);
    } else if (el.type === "feature") {
      const t = el.props.type;
      if (typeof t !== "string" || !/^[A-Za-z_][\w.-]*$/.test(t)) throw new Error(`${where(el)} needs the feature's type`);
      if (FEATURES.has(t) || NOT_FEATURES.has(t)) throw new Error(`${where(el)}: a ${t} is written <${t}>`);
      declared.push(el);
    } else if (el.type === "part" || el.type === "assembly")
      throw new Error(`<${el.type}> is a document of its own: place its file with <externalPart fileName="…" importer="3d" /> (its bodies keep their names under the placement)`);
    else throw new Error(`<${el.type}> is not read in a 3D document (see commandagi/design threed)`);
  } catch (e) {
    refuse(e);
  }
  for (const el of declared) try {
    const id = idOf(el);
    claim(id, `feature "${id}"`);
    const generic = el.type === "feature";
    if (!generic && "type" in el.props) throw new Error(`${where(el)}: the tag is the feature's type`);
    const type = generic ? (el.props.type as string) : el.type;
    const { name: label, suppressed, ...rest } = fields(el, generic ? ["id", "type"] : ["id"]);
    if (suppressed !== undefined && typeof suppressed !== "boolean") throw new Error(`${where(el)}: suppressed is true or false`);
    let inputs = rest;
    let sources: Record<string, unknown> | undefined;
    if (el.type === "sketch") {
      if ("sketch" in rest) throw new Error(`${where(el)}: a sketch's points, segments and constraints are its child elements`);
      const s = sketchOf(el);
      inputs = { ...rest, sketch: s.sketch };
      sources = s.sources;
    }
    // A hole that names a standard size ("M4 close fit") has that size's diameter and head (./standards.ts).
    if (el.type === "hole" && typeof inputs.size === "string") {
      try {
        inputs = sizedHole(inputs);
      } catch (e) {
        throw new Error(`${where(el)}: ${(e as Error).message}`);
      }
    }
    if (!generic) {
      const { type: _type, id: _id, name: _name, suppressed: _suppressed, ...filled } = checkFeature(el, { type, id, name: label ?? id, ...(suppressed !== undefined ? { suppressed } : {}), ...inputs });
      inputs = filled;
    }
    if (el.type !== "sketch") {
      noChildren(el);
      if (el.type === "code") {
        // A code feature's `inputs` are ports of its node, beside `source` and `consumes` (the document graph's rule).
        const { inputs: codeInputs, ...own } = rest as { inputs?: Record<string, unknown> };
        if (codeInputs !== undefined && (typeof codeInputs !== "object" || Array.isArray(codeInputs) || codeInputs === null))
          throw new Error(`${where(el)}: inputs is an object`);
        for (const k of Object.keys(own)) if (k !== "source" && k !== "consumes") throw new Error(`${where(el)}: a code feature has source, inputs and consumes, not ${k}`);
        inputs = { ...own, ...(codeInputs ?? {}) };
      }
    }
    nodes[id] = {
      id,
      type,
      label: typeof label === "string" ? label : id,
      ...(suppressed !== undefined ? { disabled: suppressed as boolean } : {}),
      inputs,
      ...(el.source !== undefined || sources ? { meta: { ...(el.source !== undefined ? { source: el.source } : {}), ...(sources && Object.keys(sources).length ? { sources } : {}) } } : {}),
    };
    order.push(id);
  } catch (e) {
    refuse(e);
  }
  if (refused.length) throw new Error(refused.join("\n"));
  for (const [id, p] of Object.entries(BUILTIN_PLANES)) {
    if (owner.has(id) || !builtins.has(id)) continue;
    const { name: label, ...inputs } = p;
    nodes[id] = { id, type: "plane", label, inputs: JSON.parse(JSON.stringify(inputs)) };
  }
  for (const [tag, { items, sources }] of Object.entries(lists)) {
    const { node: field, port } = THREED_LISTS[tag]!;
    if (!nodes[field]) {
      claim(field, `the document's ${field} (<${tag}>)`);
      nodes[field] = { id: field, type: `3d.${field}`, inputs: {} };
    }
    const node = nodes[field]!;
    node.inputs = { ...node.inputs, [port]: items };
    if (Object.keys(sources).length) node.meta = { ...node.meta, sources: { ...((node.meta?.sources as Record<string, unknown>) ?? {}), ...sources } };
  }
  if (Object.keys(bodies).length) {
    claim("bodyMeta", "the bodies (<body>)");
    nodes.bodyMeta = { id: "bodyMeta", type: "3d.bodyMeta", inputs: bodies, ...(Object.keys(bodySources).length ? { meta: { sources: bodySources } } : {}) };
  }
  const view: Record<string, unknown> = { name, units: "mm" };
  for (const k of VIEW_ATTRS) if (root.props[k] !== undefined) view[k] = plain(root.props[k], `${where(root)} ${k}`);
  if (root.type === "assembly") view.isAssembly = true;
  if (order.length) view.presentation = { order };
  const id = typeof root.props.id === "string" && root.props.id ? root.props.id : `3d-${slug(name).toLowerCase()}`;
  return { id, nodes, meta: view };
}

/**
 * The feature with each required field it leaves out filled with its declared default (`withDefaults`), checked against
 * its type's schema; refused with every issue when it does not fit.
 */
function checkFeature(el: DesignElement, feature: Record<string, unknown>): Record<string, unknown> {
  const def = THREED_SCHEMA.roots[feature.type as string];
  if (!def) return feature;
  const root = { $ref: `#/$defs/${def}` };
  const filled = withDefaults(root, feature, THREED_SCHEMA.$defs) as Record<string, unknown>;
  const issues = validate(root, filled, THREED_SCHEMA.$defs);
  if (issues.length) throw new Error(`${where(el)}: ${issues.map(describeIssue).join("; ")}`);
  return filled;
}

/**
 * A value checked against a definition of the schema (a body's engineering data, a joint, a mate, a sheet), with each
 * required field it leaves out filled with its declared default; refused with every issue when it does not fit.
 */
function checkValue(el: DesignElement, def: string, value: unknown, at = ""): unknown {
  const root = { $ref: `#/$defs/${def}` };
  const filled = withDefaults(root, value, THREED_SCHEMA.$defs);
  const issues = validate(root, filled, THREED_SCHEMA.$defs, at);
  if (issues.length) throw new Error(`${where(el)}: ${issues.map(describeIssue).join("; ")}`);
  return filled;
}

type SheetView = { id: string; view: string; section?: unknown; detail?: { of: string } };

/**
 * What is wrong with a sheet's section and detail views, one sentence each, as the 3D core's `sheetViewProblems`
 * says it (packages/domain/3d-core/drawing-sheet.ts); the Python and Rust SDKs say the same sentences.
 */
function sheetViewProblems(views: readonly SheetView[]): string[] {
  const out: string[] = [];
  for (const v of views) {
    if (v.view === "section" && !v.section) out.push(`view ${v.id} is a section view with no section: give its cutting plane (point and normal)`);
    if (v.view !== "detail") continue;
    if (!v.detail) {
      out.push(`view ${v.id} is a detail view with no detail: give the view it enlarges, its centre and its radius`);
      continue;
    }
    const of = views.find((w) => w.id === v.detail!.of);
    if (!of) out.push(`view ${v.id} is a detail of ${v.detail.of}, which is no view of this sheet`);
    else if (of.view === "detail") out.push(`view ${v.id} is a detail of ${v.detail.of}, which is a detail itself`);
  }
  return out;
}

/** The built-in planes a root says the document has (`builtinPlanes`); absent: all three. */
function builtinPlanesOf(root: DesignElement): Set<string> {
  const v = root.props.builtinPlanes;
  if (v === undefined) return new Set(Object.keys(BUILTIN_PLANES));
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !(x in BUILTIN_PLANES)))
    throw new Error(`${where(root)}: builtinPlanes lists built-in planes (${Object.keys(BUILTIN_PLANES).join(", ")})`);
  if (new Set(v).size !== v.length) throw new Error(`${where(root)}: builtinPlanes names a plane twice`);
  return new Set(v as string[]);
}

/** Slots whose value is an object: each field is a port of the slot's node; any other slot holds its value whole. */
const OBJECT_SLOTS = new Set(["environment", "assembly", "sceneConstraints", "dynamics", "animation", "optimization", "standardParts"]);

function meta(el: DesignElement): { meta?: Record<string, unknown> } {
  const s = source(el);
  return s === undefined ? {} : { meta: { source: s } };
}
