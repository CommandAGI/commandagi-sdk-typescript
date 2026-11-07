/**
 * The JSX runtime of a 3D document with the types of its elements: write `/** @jsxImportSource commandagi/threed *\/` at
 * the top of a `.3d.tsx`, and an editor's TypeScript checks every element against the fields its feature takes
 * (`<extrude distance="10">` is an error before the file runs). The elements are the same as `commandagi`'s runtime
 * makes; the reader (`declareThreeD`) checks them again against `THREED_SCHEMA`, for files written without types.
 */
import type {
  AcceptedFinding,
  AngularDimension,
  DatumFeature,
  DatumTarget,
  DesignCheck,
  DrawingSheet,
  DynamicsContact,
  DynamicsJoint,
  FastenerStack,
  FeatureControlFrame,
  LinearDimension,
  Mate,
  NamedView,
  Note,
  PermittedFinding,
  PartEngineering,
  PlacedCapture,
  PlacedUnit,
  Port,
  RadialDimension,
  SizeDimension,
  SketchElements,
  SurfaceFinish,
  TactileSkin,
  ThreeDFeatureElements,
  Vec3,
} from "./threed-elements.js";

export { jsx, jsxs, jsxDEV, Fragment } from "./jsx-runtime.js";

type BuiltinPlane = "plane_xy" | "plane_xz" | "plane_yz";
interface DocumentProps {
  name?: string;
  id?: string;
  /** The built-in planes the document has; absent: all three. */
  builtinPlanes?: BuiltinPlane[];
  semanticVisibility?: unknown;
  children?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace JSX {
  type Element = unknown;
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface IntrinsicElements extends ThreeDFeatureElements, SketchElements {
    part: DocumentProps;
    assembly: DocumentProps;
    /** A parameter: `bindings` drive the named fields of features. */
    parameter: { name: string; value: number; unit?: string; comment?: string; min?: number; max?: number; step?: number; bindings?: { target: string; field: string }[] };
    /** A datum plane. */
    plane: { id: string; name?: string; origin: Vec3; normal: Vec3; xAxis?: Vec3 };
    /** A body's own data: its name, its look (`material`) and what it is (`engineering`). */
    body: { id: string; name?: string; material?: unknown; engineering?: PartEngineering; visible?: boolean; [field: string]: unknown };
    /** A joint between two bodies. */
    joint: DynamicsJoint;
    /** A contact pair: its own friction and restitution, whether it touches, and what a run records of it. */
    contact: DynamicsContact;
    /** A mate between two components of an assembly. */
    mate: Mate;
    /** An engineering drawing sheet of the document. A field with a default may be left out. */
    sheet: Pick<DrawingSheet, "id" | "views"> & Partial<DrawingSheet>;
    /** A check the design must pass. */
    check: DesignCheck;
    /** A finding accepted on purpose, in a bounded region of one body, with a reason. */
    accept: AcceptedFinding;
    /** Findings a process or a purpose permits, with a reason. */
    permitted: PermittedFinding;
    /** A fastener stack: a library screw, its washer and nut, and what it clamps into what. */
    fastener: FastenerStack;
    /** A tactile skin: a grid of taxels on one face of a body. */
    tactile: TactileSkin;
    /** Where a rod's end can be held: a pad, a joint, a socket, a row of them. */
    port: Port;
    /** A device definition placed as a unit (`placements`): never real, its channels run on their simulators. */
    unit: PlacedUnit;
    /** A captured place drawn as Gaussian splats (`captures`): captured data, never live. */
    capture: PlacedCapture;
    /** A camera kept under a name (`views`), and what it rides when the view is applied. */
    view: NamedView;
    /** An annotation: the tag is its type, each attribute the field of the same name. */
    linearDimension: Omit<LinearDimension, "type">;
    radialDimension: Omit<RadialDimension, "type">;
    sizeDimension: Omit<SizeDimension, "type">;
    angularDimension: Omit<AngularDimension, "type">;
    note: Omit<Note, "type">;
    datumFeature: Omit<DatumFeature, "type">;
    datumTarget: Omit<DatumTarget, "type">;
    featureControlFrame: Omit<FeatureControlFrame, "type">;
    surfaceFinish: Omit<SurfaceFinish, "type">;
    /** Any other field of the document, whole. */
    slot: { name: string; value: unknown };
    /** A feature of a type the kernel does not know. A known type is written as its own tag. */
    feature: { type: string; id: string; name?: string; [field: string]: unknown };
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}
