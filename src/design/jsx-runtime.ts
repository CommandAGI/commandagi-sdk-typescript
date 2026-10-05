/**
 * The JSX runtime for design files: `/** @jsxImportSource commandagi *\/`, or the CommandAGI sandbox, which
 * compiles `.tsx` / `.jsx` against it. A function component is called with its props; an intrinsic element
 * (`<board>`, `<resistor>`, …) stays an element until a declaration reads it (`./tscircuit.ts`). Elements are
 * plain data: nothing renders.
 *
 * `__source` is not a prop (React's rule): it says where the element was written. The CommandAGI sandbox puts
 * the element's index in the file there, the reader copies it to the `meta.source` of each node the element
 * declares, and an editor finds the element again to write an edit back into the file.
 */
export interface DesignElement {
  readonly $$design: "element";
  readonly type: string;
  readonly props: Record<string, unknown> & { children?: unknown };
  /** Where the element was written (`__source`), when the compiler said. */
  readonly source?: unknown;
}

export const Fragment = Symbol.for("commandagi.design.fragment");

type Component = (props: Record<string, unknown>) => unknown;

export function jsx(type: string | Component | typeof Fragment, props: Record<string, unknown> | null, _key?: unknown): unknown {
  let p = props ?? {};
  let source: unknown;
  if ("__source" in p || "__self" in p) {
    const { __source, __self: _self, ...rest } = p;
    source = __source;
    p = rest;
  }
  if (type === Fragment) return p.children ?? null;
  if (typeof type === "function") return type(p);
  if (typeof type !== "string") throw new Error("a JSX element's type is a tag name or a component function");
  return { $$design: "element", type, props: p, ...(source === undefined ? {} : { source }) } satisfies DesignElement;
}
export const jsxs = jsx;
export const jsxDEV = jsx;

export function isElement(value: unknown): value is DesignElement {
  return !!value && typeof value === "object" && (value as DesignElement).$$design === "element";
}

/** Every element in a JSX child value, flattened (arrays, fragments, nulls and booleans skipped). */
export function childElements(children: unknown): DesignElement[] {
  const out: DesignElement[] = [];
  const walk = (c: unknown) => {
    if (c === null || c === undefined || typeof c === "boolean") return;
    if (Array.isArray(c)) return c.forEach(walk);
    if (isElement(c)) out.push(c);
    else if (typeof c === "string" || typeof c === "number") return;
    else throw new Error("a design element's children are elements");
  };
  walk(children);
  return out;
}

// JSX type-checking for design files: any intrinsic tag, any props (the tag's reader checks them).
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace JSX {
  type Element = unknown;
  interface IntrinsicElements {
    [tag: string]: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
}
