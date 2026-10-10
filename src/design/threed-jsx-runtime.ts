/**
 * The JSX runtime of a 3D document with the types of its elements: write `/** @jsxImportSource commandagi/threed *\/` at
 * the top of a `.3d.tsx`, and an editor's TypeScript checks every element against the fields its feature takes
 * (`<extrude distance="10">` is an error before the file runs). The elements are the same as `commandagi`'s runtime
 * makes; the reader (`declareThreeD`) checks them again against `THREED_SCHEMA`, for files written without types.
 */
import type { SketchElements, ThreeDFeatureElements, Vec3 } from "./threed-elements.js";

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
    /** A body's own data: its material, its name. */
    body: { id: string; name?: string; material?: string; visible?: boolean; [field: string]: unknown };
    /** Any other field of the document, whole. */
    slot: { name: string; value: unknown };
    /** A feature of a type the kernel does not know. A known type is written as its own tag. */
    feature: { type: string; id: string; name?: string; [field: string]: unknown };
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}
