/**
 * `commandagi/design` — compositional primitives that DECLARE structure as the CommandAGI op graph.
 *
 * CAD (parts, sketches, features, assemblies), EDA (components, nets, the board) and any other graph domain
 * (`graph`, `node`, `input`, `code`) — each call declares nodes of the op graph every CommandAGI editor
 * stores. The SDK holds the declaration only, never an engine: no geometry kernel, no solver, no router, no
 * renderer. A file that uses these is a CODE PART: put its path in a graph's code node and the editor runs
 * it in a sandbox, evaluates what it declares, and shows it as one block.
 *
 * A code part's shape:
 *
 *   export const params = { width: { default: 60, unit: "mm", min: 30 } };   // optional: its inputs
 *   export default ({ width }) => part("Bracket", () => { … });               // or a declaration, or JSX
 *
 * Convenience importers read other frameworks' files into the same graph: tscircuit JSX (`<board>`…),
 * `@jscad/modeling` and `replicad` (solids), and — in the Python SDK — CadQuery-style workplanes.
 */
import { Declaration, checkIR, isIRGraph, type IRGraph, type ParamDecl } from "./ir.js";
import { isElement } from "./jsx-runtime.js";
import { fromTscircuit } from "./tscircuit.js";
import { fromJscad, isSolid, jscadParams } from "./jscad.js";
import { fromReplicad, isReplicadShape } from "./replicad.js";
import { fromMedia, MEDIA_ROOTS } from "./media.js";
import { declareThreeD, isThreeD } from "./threed.js";
import { fromTwoD, isTwoD } from "./twod.js";
import { isOfficeRoot, readDeck, readOffice } from "./office.js";
import { documentOf } from "./business.js";
import type { DeclaredDocument } from "./ir.js";
import { ontologyDocumentOf } from "./documents.js";
import { declareOpGraph, isOpGraph } from "./ontology.js";

export * from "./ir.js";
export * from "./graph.js";
export {
  part,
  assembly,
  instance,
  box,
  cylinder,
  sphere,
  cone,
  sketch,
  extrude,
  revolve,
  union,
  subtract,
  intersect,
  hole,
  fillet,
  chamfer,
  shell,
  copy,
  linearPattern,
  circularPattern,
  mirror,
  Body,
  SketchRef,
  SketchBuilder,
  PLANES,
  type Vec2,
  type Vec3,
  type PlaneName,
  type AxisName,
  type Operation,
  type EdgeAt,
  type FaceAt,
} from "./cad.js";
export {
  circuit,
  board,
  part as component,
  net,
  connect,
  partByRef,
  footprints,
  partTypeFor,
  PartRef,
  type Footprint,
  type Pad,
  type At,
} from "./eda.js";
export { fromTscircuit } from "./tscircuit.js";
export { schSymbolTypeFor, SHEET_PARTS } from "./sheet.js";
export * from "./business.js";
export { declareThreeD, isThreeD, THREED_FEATURES, SKETCH_SEGMENTS, BUILTIN_PLANES } from "./threed.js";
export { fromTwoD, isTwoD, subpathsOf, TWOD_ROOTS, PHOTO_ADJUSTMENTS, PHOTO_FILTERS } from "./twod.js";
export { declareBoardFile, isBoardFile, tracePointId, BOARD_FOOTPRINTS, BOARD_PART } from "./pcb.js";
export { jscadModeling, fromJscad, jscadParams } from "./jscad.js";
export { replicadModule, fromReplicad } from "./replicad.js";
export { jsx, jsxs, Fragment, isElement, type DesignElement } from "./jsx-runtime.js";
export { declareVideo, declareSong, fromMedia, mediaKind, pitchOf, pitchName, tempoOf, timeSignatureOf, MEDIA_ROOTS } from "./media.js";
export { readWorkbook, readPage, readDeck, readOffice, isOfficeRoot, inlineHtml, richText, OFFICE_ROOTS, DECK_TYPES } from "./office.js";
export * from "./documents.js";
export * from "./ontology.js";
export * from "./tasks.js";
export * from "./records.js";
export * from "./fab.js";
export * from "./postal.js";
export * from "./pdf.js";

/** What a code part declares: its graph and the parameters it takes. */
export interface CodePartResult {
  graph: IRGraph;
  params: Record<string, ParamDecl>;
  /** A native document the file declared that is not a graph (a workbook, a page, a company, an RFC, a case); its graph is then empty. */
  document?: DeclaredDocument;
}

/**
 * The graph a code part's module declares, run with `inputs`. The module's `default` export (or JSCAD's and
 * replicad's `main`) may be a declaration, a plain IR graph, a JSX `<board>` (tscircuit), solids (JSCAD,
 * replicad), or a function of the inputs returning any of those. `params` (or JSCAD's
 * `getParameterDefinitions()`) declares the inputs and their defaults; given inputs override defaults.
 * `replicad` is passed as the first argument when the module imported it (replicad's `main(r, params)`).
 */
export function declarationOf(
  mod: Record<string, unknown>,
  inputs: Record<string, unknown> = {},
  opts: { name?: string; replicad?: unknown } = {},
): CodePartResult {
  const params: Record<string, ParamDecl> = {};
  if (mod.params && typeof mod.params === "object") {
    for (const [k, v] of Object.entries(mod.params as Record<string, unknown>))
      params[k] = v && typeof v === "object" && "default" in (v as object) ? (v as ParamDecl) : { default: v };
  } else if (typeof mod.getParameterDefinitions === "function") {
    Object.assign(params, jscadParams((mod.getParameterDefinitions as () => unknown)()));
  }
  const values: Record<string, unknown> = {};
  for (const [k, p] of Object.entries(params)) values[k] = p.default;
  Object.assign(values, inputs);

  let value: unknown = mod.default ?? mod.main;
  if (value === undefined) throw new Error("the file exports nothing to declare (export default a part, a circuit, a graph, or a function returning one)");
  if (typeof value === "function") value = opts.replicad ? (value as (r: unknown, p: unknown) => unknown)(opts.replicad, values) : (value as (p: unknown) => unknown)(values);
  // A workbook, a page, a company, an RFC, a case, a world, a definition, a dashboard or a geo project is a document of
  // its own, not a graph: it leaves beside an empty graph.
  const office = isOfficeRoot(value) ? readOffice(value) : null;
  const document = office ? ("document" in office ? office.document : null) : (documentOf(value) ?? ontologyDocumentOf(value));
  if (document) return { graph: { id: opts.name ?? "Document", nodes: {} }, params, document };
  const graph = graphOf(value, opts.name ?? "Part");
  const problems = checkIR(graph);
  if (problems.length) throw new Error(`the declared graph is not well formed: ${problems.slice(0, 5).join("; ")}`);
  return { graph, params };
}

/** The op graph a declared value is. */
export function graphOf(value: unknown, name = "Part"): IRGraph {
  if (value instanceof Declaration) return value.ir;
  if (isIRGraph(value)) return value;
  if (isElement(value) && MEDIA_ROOTS.has(value.type)) return fromMedia(value).ir;
  if (isThreeD(value)) return declareThreeD(value, name) as IRGraph;
  if (isTwoD(value)) return fromTwoD(value, name).ir;
  if (isOfficeRoot(value) && value.type === "deck") return readDeck(value);
  if (isOpGraph(value)) return declareOpGraph(value).ir;
  if (isElement(value) || (Array.isArray(value) && value.some(isElement))) return fromTscircuit(value).ir;
  if (isSolid(value) || (Array.isArray(value) && value.length && value.every(isSolid))) return fromJscad(value, name).ir;
  if (isReplicadShape(value)) return fromReplicad(value, name).ir;
  throw new Error("the file declared something that is not a part, a circuit, a graph, JSX, or solids");
}
