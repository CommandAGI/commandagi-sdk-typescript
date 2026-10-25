/**
 * SYSTEMS IN JSX — requirements (`<name>.req.tsx`), a system's budgets (`<name>.system.tsx`) and an interface between
 * two parts (`<name>.interface.tsx`), written as elements (docs/formats.md § requirements, budgets and interfaces, in the
 * CommandAGI repository).
 *
 *   // Rover.req.tsx
 *   export default () => (
 *     <requirements name="Rover">
 *       <requirement id="mass" text="The rover weighs at most 500 g." method="analysis"
 *                    verifiedBy="Rover.system.tsx#mass" design={["cad/Rover.3d.tsx"]} />
 *     </requirements>
 *   );
 *
 *   // Rover.system.tsx
 *   export default () => (
 *     <system name="Rover">
 *       <mode id="drive" />
 *       <rail id="vbat" voltage={7.4} source="2S Li-ion, nominal" />
 *       <load id="motors" part="M1 M2" rail="vbat" mode="drive" current={1.2} source="motor datasheet, rated load" />
 *       <bom ref="bom.csv" />
 *       <budget id="mass" quantity="mass" limit={500} unit="g" />
 *       <budget id="cost-100" quantity="cost" per={100} currency="USD" limit={40} design="Rover.3d.tsx" />
 *       <budget id="drive-power" quantity="power" rail="vbat" mode="drive" limit={15} unit="W" margin={0.2} />
 *       <check id="link" kind="interface" of="Link.interface.tsx" />
 *     </system>
 *   );
 *
 *   // Link.interface.tsx
 *   export default () => (
 *     <interface name="Link">
 *       <pin number={1} signal="+5V" required at={[0, 0]} />
 *       <pin number={2} signal="GND" required at={[2.54, 0]} />
 *       <param id="baud" value={115200} unit="Bd" />
 *       <message id="hello" text="AT" />
 *       <channel dir="duplex" medium="records" format="state" transport="serial" />
 *       <side id="main" ref="ee/main.circuit.ts" part="J1" rotate={90} />
 *       <side id="firmware" ref="firmware/config.h" defines={{ BOARD_MAIN: 1 }} params={{ LINK_BAUD: "baud" }} />
 *     </interface>
 *   );
 *
 * The rule of the ontology's files: a record is an element and its fields are the element's attributes, verbatim; a
 * list of records is the parent's children. A requirement is named by a ref, never an id alone: `Rover.req.tsx#mass`.
 * Every ref is a path relative to the file that holds it, with `#` and the id of one element of the file it names.
 * Nothing adds a default. A `<bom>` gives masses; a cost budget reads the logistics roll-up of the design it names
 * (`design`: a 3D document, a schematic or a board with a cost check), the one source of cost, so no contribution is a
 * cost. A link budget (`quantity="rf-link"`) is its margin in dB: two contributions in dBm (the transmitter's power
 * and the receiver's sensitivity) and the gains (positive) and losses (negative) in dB between them.
 * The checks (a requirement's trace, a budget's roll-up, each side against its interface) are
 * the host's: `commandagi check <file>`, `commandagi trace <folder>`.
 */
import { registerVocabulary, type DocTree, type Vocabulary } from "./documents.js";

/** The verification methods: test and demonstration need a physical run; analysis and inspection a check. */
export const VERIFICATION_METHODS = ["test", "analysis", "inspection", "demonstration"] as const;
/** What a budget sums from the design's own records; any other quantity is declared by its contributions, with a unit. */
export const BUDGET_QUANTITIES = ["mass", "power", "cost", "thermal", "rf-link"] as const;
/** A declared quantity's name ("exhaust-flow", "floor-area"). */
export const DECLARED_QUANTITY = /^[a-z][a-z0-9-]*$/;
/** What a system's `<check>` runs. */
export const SYSTEM_CHECK_KINDS = ["interface", "trace"] as const;
/** What a side of an interface is, when its file does not say. */
export const SIDE_KINDS = ["circuit", "3d", "firmware", "definition"] as const;
/** A channel's direction, and what it carries: the channel vocabulary of a device definition (docs/devices.md). */
export const CHANNEL_DIRS = ["in", "out", "duplex"] as const;
export const CHANNEL_MEDIA = ["records", "video", "audio", "bytes"] as const;

export const REQUIREMENT_FIELDS = ["id", "text", "rationale", "method", "verifiedBy", "design", "parent"] as const;
export const MODE_FIELDS = ["id", "description"] as const;
export const RAIL_FIELDS = ["id", "voltage", "description", "source"] as const;
export const CONVERTER_FIELDS = ["id", "input", "output", "efficiency", "source"] as const;
export const LOAD_FIELDS = ["id", "part", "rail", "mode", "current", "power", "voltage", "peakCurrent", "peakPower", "inrushCurrent", "duty", "source"] as const;
export const CONTRIBUTION_FIELDS = ["id", "quantity", "part", "value", "unit", "qty", "mode", "rail", "source"] as const;
export const BUDGET_FIELDS = ["id", "quantity", "limit", "unit", "mode", "rail", "peak", "per", "currency", "design", "resistance", "margin", "source", "description"] as const;
export const PIN_FIELDS = ["number", "signal", "dir", "voltage", "gpio", "at", "required", "description"] as const;
export const HOLE_FIELDS = ["id", "at", "diameter", "description"] as const;
export const MESSAGE_FIELDS = ["id", "text", "code", "define", "dir", "description"] as const;
export const PARAM_FIELDS = ["id", "value", "unit", "description"] as const;
export const SIDE_FIELDS = ["id", "ref", "kind", "part", "parts", "channel", "origin", "rotate", "flip", "defines", "pins", "params", "files", "description"] as const;
export const CHANNEL_FIELDS = ["format", "dir", "medium", "dialect", "transport", "description"] as const;

type Rec = Record<string, unknown>;
export interface RequirementsDoc { name?: string; description?: string; requirements?: Rec[] }
export interface SystemDoc { name?: string; description?: string; modes?: Rec[]; rails?: Rec[]; converters?: Rec[]; loads?: Rec[]; contributions?: Rec[]; boms?: Rec[]; budgets?: Rec[]; checks?: Rec[] }
export interface InterfaceDoc { name?: string; description?: string; frame?: Rec; pins?: Rec[]; holes?: Rec[]; messages?: Rec[]; params?: Rec[]; channel?: Rec; sides?: Rec[] }

const own = (o: Rec, keys: readonly string[]): Rec => {
  const out: Rec = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
};
const where = (tag: string, key: string, a: Rec) => `<${tag}${a[key] !== undefined ? ` ${key}=${JSON.stringify(a[key])}` : ""}>`;
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const refs = (v: unknown) => typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"));
const pair = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(isNum);

function check(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

/**
 * A budget's or a contribution's quantity: one of {@link BUDGET_QUANTITIES}, which the host computes from the design's
 * records, or the name of a declared quantity ("exhaust-flow", "floor-area"), which needs its unit: the unit names
 * the family the host converts within (m3/h, m2, slm).
 */
function checkQuantity(a: Rec, at: string): void {
  if ((BUDGET_QUANTITIES as readonly unknown[]).includes(a.quantity)) return;
  check(typeof a.quantity === "string" && DECLARED_QUANTITY.test(a.quantity), `${at}: quantity must be one of ${BUDGET_QUANTITIES.join(", ")}, or a quantity's name in lower-case letters, digits and "-" ("exhaust-flow") (got ${JSON.stringify(a.quantity)})`);
  check(typeof a.unit === "string" && a.unit.trim(), `${at}: a quantity of ${a.quantity} states its unit (unit="m3/h"): the unit names what it measures`);
}

/** Group a tree's children by tag into the document's lists, in the order written (a tag absent: its list absent). */
function lists(t: DocTree, byTag: Record<string, string>): Rec {
  const out: Rec = {};
  for (const c of t.children) {
    const field = byTag[c.tag]!;
    ((out[field] ??= []) as Rec[]).push({ ...c.attrs });
  }
  return out;
}
function children(d: Rec, byTag: Record<string, string>, fields: Record<string, readonly string[]>): DocTree[] {
  return Object.entries(byTag).flatMap(([tag, field]) => ((d[field] as Rec[] | undefined) ?? []).map((r) => ({ tag, attrs: own(r, fields[tag]!), children: [] })));
}

const REQUIREMENT_LISTS = { requirement: "requirements" };
export const requirementsVocabulary: Vocabulary<RequirementsDoc> = {
  format: "requirements",
  noun: "a requirements document",
  root: "requirements",
  tags: {
    requirements: { parents: [], attrs: ["name", "description"] },
    requirement: { parents: ["requirements"], key: "id", required: ["id", "text"], attrs: REQUIREMENT_FIELDS },
  },
  fromTree(t) {
    for (const c of t.children) {
      const a = c.attrs, at = where("requirement", "id", a);
      check(typeof a.id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(a.id), `${at}: id is letters, digits, ".", "_" and "-" (a ref names it as <file>#<id>)`);
      check(typeof a.text === "string" && a.text.trim(), `${at}: text says what is required`);
      check(a.method === undefined || (VERIFICATION_METHODS as readonly unknown[]).includes(a.method), `${at}: method must be one of ${VERIFICATION_METHODS.join(", ")} (got ${JSON.stringify(a.method)})`);
      for (const k of ["verifiedBy", "design"]) check(a[k] === undefined || refs(a[k]), `${at}: ${k} is a ref or a list of refs`);
      check(a.parent === undefined || typeof a.parent === "string", `${at}: parent is a ref to the requirement this one is derived from`);
    }
    return { ...own(t.attrs, ["name", "description"]), ...lists(t, REQUIREMENT_LISTS) };
  },
  toTree(d) {
    return { tag: "requirements", attrs: own(d as Rec, ["name", "description"]), children: children(d as Rec, REQUIREMENT_LISTS, { requirement: REQUIREMENT_FIELDS }) };
  },
  empty: (name) => ({ name }),
};

const SYSTEM_LISTS = { mode: "modes", rail: "rails", converter: "converters", load: "loads", contribution: "contributions", bom: "boms", budget: "budgets", check: "checks" };
const SYSTEM_TAG_FIELDS: Record<string, readonly string[]> = {
  mode: MODE_FIELDS, rail: RAIL_FIELDS, converter: CONVERTER_FIELDS, load: LOAD_FIELDS, contribution: CONTRIBUTION_FIELDS, bom: ["ref"], budget: BUDGET_FIELDS, check: ["id", "kind", "of"],
};
export const systemVocabulary: Vocabulary<SystemDoc> = {
  format: "system",
  noun: "a system",
  root: "system",
  tags: {
    system: { parents: [], attrs: ["name", "description"] },
    mode: { parents: ["system"], key: "id", required: ["id"], attrs: MODE_FIELDS },
    rail: { parents: ["system"], key: "id", required: ["id", "voltage"], attrs: RAIL_FIELDS },
    converter: { parents: ["system"], key: "id", required: ["id", "input", "output", "efficiency"], attrs: CONVERTER_FIELDS },
    load: { parents: ["system"], key: "id", required: ["id", "part", "rail", "mode"], attrs: LOAD_FIELDS },
    contribution: { parents: ["system"], key: "id", required: ["id", "quantity", "part", "value"], attrs: CONTRIBUTION_FIELDS },
    bom: { parents: ["system"], key: "ref", required: ["ref"], attrs: ["ref"] },
    budget: { parents: ["system"], key: "id", required: ["id", "quantity", "limit"], attrs: BUDGET_FIELDS },
    check: { parents: ["system"], key: "id", required: ["id", "kind", "of"], attrs: ["id", "kind", "of"] },
  },
  fromTree(t) {
    for (const c of t.children) {
      const a = c.attrs, at = where(c.tag, c.tag === "bom" ? "ref" : "id", a);
      if (c.tag === "rail") check(isNum(a.voltage), `${at}: voltage is a number of volts`);
      if (c.tag === "converter") check(isNum(a.efficiency) && (a.efficiency as number) > 0 && (a.efficiency as number) <= 1, `${at}: efficiency is a number in (0, 1] (0.88 for 88 %)`);
      if (c.tag === "load") {
        check(a.current !== undefined || a.power !== undefined, `${at}: a load states its current (A) or its power (W)`);
        for (const k of ["current", "power", "voltage", "peakCurrent", "peakPower", "inrushCurrent"]) check(a[k] === undefined || isNum(a[k]), `${at}: ${k} is a number`);
        check(a.duty === undefined || (isNum(a.duty) && (a.duty as number) > 0 && (a.duty as number) <= 1), `${at}: duty is the share of time the load draws, a number in (0, 1] (0.25 for 25 %)`);
      }
      if (c.tag === "contribution") {
        checkQuantity(a, at);
        check(a.quantity !== "cost", `${at}: a cost is stated in the design's logistics (a part's suppliers, a made part's rate), which a cost budget's design rolls up, not as a contribution`);
        check(isNum(a.value), `${at}: value is a number`);
        check(typeof a.source === "string" && a.source.trim(), `${at}: source says where the number was read (a datasheet, a measurement, "estimate: …")`);
      }
      if (c.tag === "budget") {
        checkQuantity(a, at);
        check(isNum(a.limit), `${at}: limit is a number`);
        check(a.margin === undefined || (isNum(a.margin) && (a.margin as number) >= 0 && (a.margin as number) < 1), `${at}: margin is a fraction of the limit kept free, in [0, 1)`);
        if (a.quantity === "power") check(typeof a.rail === "string" && typeof a.mode === "string", `${at}: a power budget names its rail and its mode`);
        check(a.peak === undefined || (typeof a.peak === "boolean" && a.quantity === "power"), `${at}: peak is true or false, on a power budget (each load at its peakCurrent or peakPower)`);
        if (a.quantity === "cost") check(typeof a.design === "string" && a.design.trim(), `${at}: a cost budget names the design whose logistics roll-up it reads (design="cad/Assembly.3d.tsx")`);
        if (a.quantity === "thermal") check(typeof a.mode === "string" && isNum(a.resistance), `${at}: a thermal budget names its mode and the thermal resistance to the ambient (resistance, K/W)`);
      }
      if (c.tag === "check") check((SYSTEM_CHECK_KINDS as readonly unknown[]).includes(a.kind), `${at}: kind must be one of ${SYSTEM_CHECK_KINDS.join(", ")} (got ${JSON.stringify(a.kind)})`);
    }
    return { ...own(t.attrs, ["name", "description"]), ...lists(t, SYSTEM_LISTS) };
  },
  toTree(d) {
    return { tag: "system", attrs: own(d as Rec, ["name", "description"]), children: children(d as Rec, SYSTEM_LISTS, SYSTEM_TAG_FIELDS) };
  },
  empty: (name) => ({ name }),
};

const INTERFACE_LISTS = { pin: "pins", hole: "holes", message: "messages", param: "params", side: "sides" };
const INTERFACE_TAG_FIELDS: Record<string, readonly string[]> = { pin: PIN_FIELDS, hole: HOLE_FIELDS, message: MESSAGE_FIELDS, param: PARAM_FIELDS, channel: CHANNEL_FIELDS, side: SIDE_FIELDS };
export const interfaceVocabulary: Vocabulary<InterfaceDoc> = {
  format: "interface",
  noun: "an interface",
  root: "interface",
  tags: {
    interface: { parents: [], attrs: ["name", "description"] },
    frame: { parents: ["interface"], single: true, attrs: ["description", "unit"] },
    pin: { parents: ["interface"], key: "number", required: ["number", "signal"], attrs: PIN_FIELDS },
    hole: { parents: ["interface"], key: "id", required: ["id", "at"], attrs: HOLE_FIELDS },
    message: { parents: ["interface"], key: "id", required: ["id"], attrs: MESSAGE_FIELDS },
    param: { parents: ["interface"], key: "id", required: ["id", "value"], attrs: PARAM_FIELDS },
    channel: { parents: ["interface"], single: true, attrs: CHANNEL_FIELDS },
    side: { parents: ["interface"], key: "id", required: ["id", "ref"], attrs: SIDE_FIELDS },
  },
  fromTree(t) {
    for (const c of t.children) {
      const a = c.attrs, at = where(c.tag, c.tag === "pin" ? "number" : "id", a);
      if (c.tag === "frame") check(a.unit === undefined || a.unit === "mm", `${at}: positions are in mm (unit "mm")`);
      if (c.tag === "pin") {
        check(Number.isInteger(a.number) && (a.number as number) > 0, `${at}: number is the pin's number, 1, 2, 3 …`);
        check(a.at === undefined || pair(a.at, 2), `${at}: at is [x, y] mm in the interface's frame`);
        check(a.gpio === undefined || Number.isInteger(a.gpio), `${at}: gpio is the GPIO number of the pin on the side that has one`);
        check(a.required === undefined || typeof a.required === "boolean", `${at}: required is true or false`);
      }
      if (c.tag === "hole") {
        check(pair(a.at, 2), `${at}: at is [x, y] mm in the interface's frame`);
        check(a.diameter === undefined || isNum(a.diameter), `${at}: diameter is mm`);
      }
      if (c.tag === "message") check(a.text !== undefined || a.code !== undefined, `${at}: a message has its text, its code, or both`);
      if (c.tag === "param") check(isNum(a.value), `${at}: value is a number (its unit in unit)`);
      if (c.tag === "side") {
        check(a.kind === undefined || (SIDE_KINDS as readonly unknown[]).includes(a.kind), `${at}: kind must be one of ${SIDE_KINDS.join(", ")} (got ${JSON.stringify(a.kind)})`);
        check(a.origin === undefined || pair(a.origin, 2) || pair(a.origin, 3), `${at}: origin is where the interface's frame sits in this side's frame, [x, y] or [x, y, z] mm`);
        check(a.rotate === undefined || isNum(a.rotate), `${at}: rotate is the interface's frame turned as this side has it, in degrees counter-clockwise`);
        check(a.flip === undefined || typeof a.flip === "boolean", `${at}: flip is true or false (true: this side is seen from the mating board, its x the other way)`);
        check(a.parts === undefined || (Array.isArray(a.parts) && a.parts.every((p) => typeof p === "string")), `${at}: parts is a list of part references, whose pins are the interface's in turn`);
        check(a.channel === undefined || typeof a.channel === "string", `${at}: channel is the id of a channel of the device definition`);
      }
      if (c.tag === "channel") {
        check(typeof a.format === "string" && a.format.trim(), `${at}: format is the channel's format, a name ("state", "lines", "gcode-chat")`);
        check(a.dir === undefined || (CHANNEL_DIRS as readonly unknown[]).includes(a.dir), `${at}: dir must be one of ${CHANNEL_DIRS.join(", ")} (got ${JSON.stringify(a.dir)})`);
        check(a.medium === undefined || (CHANNEL_MEDIA as readonly unknown[]).includes(a.medium), `${at}: medium must be one of ${CHANNEL_MEDIA.join(", ")} (got ${JSON.stringify(a.medium)})`);
        for (const k of ["dialect", "transport"]) check(a[k] === undefined || (typeof a[k] === "string" && (a[k] as string).trim()), `${at}: ${k} is a name (${k}="usb-serial")`);
      }
    }
    const one = (tag: string) => { const c = t.children.find((x) => x.tag === tag); return c ? { [tag]: { ...c.attrs } } : {}; };
    return { ...own(t.attrs, ["name", "description"]), ...one("frame"), ...one("channel"), ...lists({ ...t, children: t.children.filter((c) => c.tag !== "frame" && c.tag !== "channel") }, INTERFACE_LISTS) };
  },
  toTree(d) {
    const one = (tag: string, fields: readonly string[]) => { const r = (d as Rec)[tag] as Rec | undefined; return r ? [{ tag, attrs: own(r, fields), children: [] }] : []; };
    return {
      tag: "interface",
      attrs: own(d as Rec, ["name", "description"]),
      children: [...one("frame", ["description", "unit"]), ...one("channel", CHANNEL_FIELDS), ...children(d as Rec, INTERFACE_LISTS, INTERFACE_TAG_FIELDS)],
    };
  },
  empty: (name) => ({ name }),
};

for (const v of [requirementsVocabulary, systemVocabulary, interfaceVocabulary]) registerVocabulary(v);

/** The vocabularies of systems engineering, by format. */
export const SYSTEMS = { requirements: requirementsVocabulary, system: systemVocabulary, interface: interfaceVocabulary } as const;
