/**
 * MACHINE JOBS IN JSX — a machining setup (`.camx`) and a slicing setup (`.slicex`) written as the elements the 3D
 * app's CAM and slicing modes edit (docs/formats.md § machine jobs, in the CommandAGI repository).
 *
 *   // Bracket plate.cam.tsx
 *   export default () => (
 *     <cam>
 *       <stock materialId="plywood" thicknessMm={6} xMm={90} yMm={70} />
 *       <part footprintXMm={60} footprintYMm={40} atXMm={15} atYMm={15} />
 *       <machine post="grbl" maxSpindleRpm={10000} maxFeedMmPerMin={1000} spindlePowerKw={0.3} />
 *       <fixture name="left clamp" xMm={-14} yMm={25} wMm={20} dMm={20} zMm={4} />
 *       <operation id="op-1" op="mill_adaptive" profile="adaptive_wood" params={{ toolDiameterMm: 3.175 }}
 *         region={{ boundary: [[27, 25], [63, 25], [63, 45], [27, 45]], depthMm: 3 }} />
 *       <operation id="op-2" op="mill_contour" profile="contour_wood" tabs={{ count: 4, lengthMm: 5, heightMm: 1.5 }} />
 *       <runsOn unit="cloud://global/worlds/fab-cell/world.tsx#cnc-1" channel="gcode" name="cnc 3018 / 01" />
 *     </cam>
 *   );
 *
 *   // Carrier.slice.tsx
 *   export default () => (
 *     <slice profile="fdm_pla_0.20_draft" params={{ layerHeightMm: 0.2 }}>
 *       <source fileId="carrier.stl" name="carrier.stl" />
 *       <spool materialId="pla" diameterMm={1.75} />
 *       <machine unit="cloud://global/worlds/fab-cell/world.tsx#printer-1" channel="gcode" name="ender-3 v3 se / 01" />
 *     </slice>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are its attributes, verbatim (millimetres,
 * the names the native file uses). A setup's single records (`source`, `design`, `stock`, `part`, `machine`,
 * `runsOn`, `spool`) are one element each, absent when the native field is null. A CAM operation is an
 * `<operation id>`; the order of the elements is the order the cuts run. A fixture is matched among its siblings by
 * what it says. An operation's `params`, `tabs` and `region` and a slicing setup's `params` are attributes whose
 * value is the native object. Nothing adds a default: the mode's reader fills its own when it reads the document, as
 * it does for the JSON (an operation with no `enabled` is enabled).
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

export const CAM_REF_FIELDS = ["fileId", "name"] as const;
export const CAM_STOCK_FIELDS = ["materialId", "thicknessMm", "xMm", "yMm"] as const;
export const CAM_PART_FIELDS = ["footprintXMm", "footprintYMm", "atXMm", "atYMm"] as const;
export const CAM_MACHINE_FIELDS = ["post", "maxSpindleRpm", "maxFeedMmPerMin", "spindlePowerKw"] as const;
export const CAM_FIXTURE_FIELDS = ["name", "xMm", "yMm", "wMm", "dMm", "zMm"] as const;
export const CAM_OPERATION_FIELDS = ["id", "op", "profile", "enabled", "params", "tabs", "region"] as const;
/** A unit's channel a job runs on (`runsOn` of a `.camx`, `machine` of a `.slicex`). */
export const TARGET_FIELDS = ["unit", "channel", "name"] as const;
export const SPOOL_FIELDS = ["materialId", "diameterMm"] as const;

export interface CamDocument {
  operations: Record<string, unknown>[];
  [field: string]: unknown;
}
export interface SliceDocument {
  profile: string;
  [field: string]: unknown;
}

/** A field's value says nothing (absent or null), or an object with no field: code does not write it. */
const nothing = (v: unknown) => v === undefined || v === null || (!!v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);

function attrsOf(o: Record<string, unknown>, keys: readonly string[], skip: (k: string, v: unknown) => boolean = () => false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (!nothing(o[k]) && !skip(k, o[k])) out[k] = o[k];
  return out;
}

const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const one = (tag: string, v: unknown, keys: readonly string[]): DocTree[] => {
  const r = record(v);
  return r ? [{ tag, attrs: attrsOf(r, keys), children: [] }] : [];
};
const single = (t: DocTree, tag: string) => t.children.find((c) => c.tag === tag);

const ref = { attrs: CAM_REF_FIELDS, required: ["fileId", "name"] } as const;

export const camVocabulary: Vocabulary<CamDocument> = {
  format: "cam",
  noun: "a machining setup",
  root: "cam",
  tags: {
    cam: { parents: [], attrs: [] },
    source: { parents: ["cam"], single: true, ...ref },
    design: { parents: ["cam"], single: true, ...ref },
    stock: { parents: ["cam"], single: true, attrs: CAM_STOCK_FIELDS },
    part: { parents: ["cam"], single: true, required: ["footprintXMm", "footprintYMm"], attrs: CAM_PART_FIELDS },
    machine: { parents: ["cam"], single: true, attrs: CAM_MACHINE_FIELDS },
    fixture: { parents: ["cam"], required: CAM_FIXTURE_FIELDS, attrs: CAM_FIXTURE_FIELDS },
    operation: { parents: ["cam"], key: "id", required: ["id", "op", "profile"], attrs: CAM_OPERATION_FIELDS },
    runsOn: { parents: ["cam"], single: true, required: TARGET_FIELDS, attrs: TARGET_FIELDS },
  },
  fromTree(t) {
    const doc: CamDocument = { operations: [] };
    for (const tag of ["source", "design", "stock", "part", "machine"] as const) {
      const c = single(t, tag);
      if (c) doc[tag] = { ...c.attrs };
    }
    const fixtures = t.children.filter((c) => c.tag === "fixture").map((c) => ({ ...c.attrs }));
    if (fixtures.length) doc.fixtures = fixtures;
    doc.operations = t.children.filter((c) => c.tag === "operation").map((c) => ({ ...c.attrs }));
    const target = single(t, "runsOn");
    if (target) doc.runsOn = { ...target.attrs };
    return doc;
  },
  toTree(d) {
    return {
      tag: "cam",
      attrs: {},
      children: [
        ...one("source", d.source, CAM_REF_FIELDS),
        ...one("design", d.design, CAM_REF_FIELDS),
        ...one("stock", d.stock, CAM_STOCK_FIELDS),
        ...one("part", d.part, CAM_PART_FIELDS),
        ...one("machine", d.machine, CAM_MACHINE_FIELDS),
        ...((d.fixtures as Record<string, unknown>[] | undefined) ?? []).map((f) => ({ tag: "fixture", attrs: attrsOf(f, CAM_FIXTURE_FIELDS), children: [] })),
        // An operation is enabled unless it says otherwise (the reader's rule): `enabled` is written only when false.
        ...(d.operations ?? []).map((o) => ({ tag: "operation", attrs: attrsOf(o, CAM_OPERATION_FIELDS, (k, v) => k === "enabled" && v === true), children: [] })),
        ...one("runsOn", d.runsOn, TARGET_FIELDS),
      ],
    };
  },
};

export const sliceVocabulary: Vocabulary<SliceDocument> = {
  format: "slice",
  noun: "a slicing setup",
  root: "slice",
  tags: {
    slice: { parents: [], required: ["profile"], attrs: ["profile", "params"] },
    source: { parents: ["slice"], single: true, ...ref },
    design: { parents: ["slice"], single: true, ...ref },
    spool: { parents: ["slice"], single: true, attrs: SPOOL_FIELDS },
    machine: { parents: ["slice"], single: true, required: TARGET_FIELDS, attrs: TARGET_FIELDS },
  },
  fromTree(t) {
    const doc: SliceDocument = { ...(t.attrs as { profile: string }) };
    for (const tag of ["source", "design", "spool", "machine"] as const) {
      const c = single(t, tag);
      if (c) doc[tag] = { ...c.attrs };
    }
    return doc;
  },
  toTree(d) {
    return {
      tag: "slice",
      attrs: attrsOf(d, ["profile", "params"]),
      children: [...one("source", d.source, CAM_REF_FIELDS), ...one("design", d.design, CAM_REF_FIELDS), ...one("spool", d.spool, SPOOL_FIELDS), ...one("machine", d.machine, TARGET_FIELDS)],
    };
  },
};

for (const v of [camVocabulary, sliceVocabulary]) registerVocabulary(v);

/** The vocabularies of machine jobs, by format. */
export const FAB = { cam: camVocabulary, slice: sliceVocabulary } as const;
