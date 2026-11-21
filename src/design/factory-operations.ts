/**
 * A PLANT IN A SCENE — the `operations` system a design's `<slot name="scene">` holds (docs/formats.md § factories, in
 * the CommandAGI repository): items with their BOMs, locations, stations of machines, routings of ops, work orders,
 * resources of people, robots and vehicles, moves, deliveries and shipments, run by the simulation engine as discrete
 * events whose material is entities. The scene stays a plain literal, so the editor writes each edit back into it;
 * these types say what it may hold.
 *
 *   // Line.3d.tsx
 *   export default () => (
 *     <part name="Line">
 *       <slot name="scene" value={{ hz: 30, systems: [{
 *         id: "line", kind: "operations", time_scale: 60,
 *         items: [{ id: "kit" }, { id: "motor", bom: [{ item: "kit", qty: 1 }] }],
 *         locations: [{ id: "kits", kind: "store", capacity: 500, stock: [{ item: "kit", qty: 400 }] }, { id: "fg", kind: "store", capacity: 500 }],
 *         stations: [{ id: "wind", machines: 4, in: "kits", out: "fg", mtbf_s: 6900, mttr_s: 600 }],
 *         routings: [{ item: "motor", to: "fg", ops: [{ id: "wind", station: "wind", cycle_s: 75, consumes: [{ item: "kit", qty: 1 }] }] }],
 *         orders: [{ id: "wo", item: "motor", qty: 400, due_s: 57600 }] }] }} />
 *     </part>
 *   );
 *
 * `checkOperationsSystem(spec)` refuses an unknown field, a missing one, a number that is not a number or a
 * `"$parameter"`, and a name that points nowhere, in the engine's own words. The engine checks the rest when the scene
 * runs (ranges, a BOM that contains itself, a stock over its capacity). `machinesFor` is the sizing formula the engine's
 * own sizing uses.
 */

/** A number, or a `"$name"` of the scene's `parameters`. */
export type OpsNumber = number | `$${string}`;
export interface OpsLine { item: string; qty: OpsNumber }
export interface OpsBody { shape: Record<string, unknown>; mass?: OpsNumber; color?: [number, number, number] }
export interface OpsZone { center: [OpsNumber, OpsNumber, OpsNumber]; size: [OpsNumber, OpsNumber, OpsNumber] }
export interface OpsItem { id: string; label?: string; bom?: OpsLine[]; body?: OpsBody; ideal_cycle_s?: OpsNumber }
export interface OpsLocation {
  id: string; label?: string; kind: "store" | "buffer" | "conveyor" | "dock"; capacity: OpsNumber;
  stock?: Array<OpsLine & { lot?: string }>; zone?: OpsZone; slots?: { pitch: [OpsNumber, OpsNumber, OpsNumber] };
  transit_s?: OpsNumber; to?: string; drive?: { robot: string; joint: string; speed: OpsNumber };
}
export interface OpsResource { id: string; label?: string; kind: "person" | "robot" | "vehicle"; skills: string[]; members?: string[]; count?: OpsNumber; physical?: boolean }
export interface OpsStation {
  id: string; label?: string; units?: string[]; machines?: OpsNumber; in: string; out: string; mtbf_s?: OpsNumber; mttr_s?: OpsNumber; repair?: string;
  maintenance?: { every_s: OpsNumber; duration_s: OpsNumber; skill?: string }; tool?: { life_cycles: OpsNumber; change_s: OpsNumber; skill?: string };
  /** Its PLC program's structured text, or a ref to its `.st` file. */
  plc?: string; zone?: OpsZone;
}
export interface OpsCell { design: string; seconds: number; cycles: string; energy_j?: string; faults?: string; down_s?: string; measured?: Record<string, unknown> & { reality: "simulation" | "physical"; of: string } }
export interface OpsOp {
  id: string; station: string; cycle_s: OpsNumber; cycle_cv?: OpsNumber; ideal_s?: OpsNumber; setup_s?: OpsNumber; energy_j?: OpsNumber;
  consumes?: OpsLine[]; needs?: string; load_s?: OpsNumber; inspect?: { yield: OpsNumber; reject?: string; rework?: string; max_rework?: OpsNumber };
  rework?: boolean; then?: string; body?: OpsBody; cell?: OpsCell;
}
export interface OpsRouting { item: string; to: string; ops: OpsOp[] }
export interface OpsOrder { id: string; label?: string; item: string; qty: OpsNumber; release_s?: OpsNumber; due_s?: OpsNumber; priority?: OpsNumber }
export interface OpsFlowIn { id: string; label?: string; item: string; qty: OpsNumber; to: string; at_s?: OpsNumber[]; every_s?: OpsNumber; first_s?: OpsNumber }
export interface OpsFlowOut { id: string; label?: string; item: string; qty: OpsNumber; from: string; at_s?: OpsNumber[]; every_s?: OpsNumber; first_s?: OpsNumber }
export interface OpsMove { id: string; label?: string; item?: string; from: string; to: string; lot: OpsNumber; reorder_at: OpsNumber; by: string; travel_s: OpsNumber }
export interface OperationsSystem {
  id: string; kind: "operations"; seed?: number; time_scale?: OpsNumber; window_s?: OpsNumber; record?: boolean;
  shifts?: { period_s?: OpsNumber; windows: Array<[OpsNumber, OpsNumber]> };
  items: OpsItem[]; locations: OpsLocation[]; resources?: OpsResource[]; stations: OpsStation[]; routings: OpsRouting[];
  orders?: OpsOrder[]; inbound?: OpsFlowIn[]; outbound?: OpsFlowOut[]; moves?: OpsMove[];
}

/** Each part's fields: the ones it needs, then the ones it may have. One table, the same in the three SDKs. */
type PlantPart = "system" | "item" | "location" | "resource" | "station" | "routing" | "op" | "order" | "inbound" | "outbound" | "move" | "shifts";
export const PLANT_FIELDS: Record<PlantPart, { needs: string[]; may: string[] }> = {
  system: { needs: ["id", "kind", "items", "locations", "stations", "routings"], may: ["seed", "time_scale", "window_s", "shifts", "record", "resources", "orders", "inbound", "outbound", "moves"] },
  item: { needs: ["id"], may: ["label", "bom", "body", "ideal_cycle_s"] },
  location: { needs: ["id", "kind", "capacity"], may: ["label", "stock", "zone", "slots", "transit_s", "to", "drive"] },
  resource: { needs: ["id", "kind", "skills"], may: ["label", "members", "count", "physical"] },
  station: { needs: ["id", "in", "out"], may: ["label", "units", "machines", "mtbf_s", "mttr_s", "repair", "maintenance", "tool", "plc", "zone"] },
  routing: { needs: ["item", "to", "ops"], may: [] },
  op: { needs: ["id", "station", "cycle_s"], may: ["cycle_cv", "ideal_s", "setup_s", "consumes", "needs", "load_s", "inspect", "rework", "then", "body", "energy_j", "cell"] },
  order: { needs: ["id", "item", "qty"], may: ["label", "release_s", "due_s", "priority"] },
  inbound: { needs: ["id", "item", "qty", "to"], may: ["label", "at_s", "every_s", "first_s"] },
  outbound: { needs: ["id", "item", "qty", "from"], may: ["label", "at_s", "every_s", "first_s"] },
  move: { needs: ["id", "from", "to", "lot", "reorder_at", "by", "travel_s"], may: ["label", "item"] },
  shifts: { needs: ["windows"], may: ["period_s"] },
};
const NUMBERS: Record<string, string> = {
  capacity: "a whole number from 1 to 100000", machines: "a whole number from 1 to 1000", qty: "a whole number from 1 to 100000",
  cycle_s: "the seconds one entity takes, more than 0", setup_s: "seconds, 0 or more", mtbf_s: "the mean operating seconds between failures, more than 0",
  mttr_s: "the mean seconds a repair takes, more than 0", energy_j: "the joules one entity takes, 0 or more", lot: "a whole number from 1 to 100000",
  reorder_at: "a whole number from 0 to 100000", travel_s: "seconds, 0 or more", transit_s: "the seconds an entity rides it, more than 0",
};
const isNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && /^\$[A-Za-z_]\w*$/.test(v));
type Rec = Record<string, unknown>;

/** Refuses what the engine would refuse by shape or by name; returns the spec. */
export function checkOperationsSystem(spec: OperationsSystem): OperationsSystem {
  const s = spec as unknown as Rec, no = (why: string): never => { throw new Error(`system ${String(s.id)}: ${why}`); };
  const fields = (o: Rec, part: PlantPart, at: string) => {
    const { needs, may } = PLANT_FIELDS[part];
    for (const k of Object.keys(o)) if (!needs.includes(k) && !may.includes(k)) no(`${at}: unknown field ${k} (it has ${[...needs, ...may].join(", ")})`);
    for (const k of needs) if (o[k] === undefined) no(`${at}: ${k} is needed`);
    for (const [k, why] of Object.entries(NUMBERS)) if (o[k] !== undefined && !isNumber(o[k])) no(`${at}: ${k} is ${why}`);
  };
  fields(s, "system", "the system");
  if (s.kind !== "operations") no("kind is operations");
  const list = (k: string): Rec[] => (s[k] === undefined ? [] : Array.isArray(s[k]) ? (s[k] as Rec[]) : no(`${k} is a list`));
  const items = list("items"), locations = list("locations"), resources = list("resources"), stations = list("stations"), routings = list("routings");
  const orders = list("orders"), inbound = list("inbound"), outbound = list("outbound"), moves = list("moves");
  for (const [part, xs] of [["item", items], ["location", locations], ["resource", resources], ["station", stations], ["order", orders], ["inbound", inbound], ["outbound", outbound], ["move", moves]] as const)
    for (const x of xs) fields(x, part, `${part} ${String(x.id)}`);
  if (s.shifts !== undefined) fields(s.shifts as Rec, "shifts", "shifts");
  const ids = (xs: Rec[]) => new Set(xs.map((x) => x.id));
  const itemIds = ids(items), locIds = ids(locations), stationIds = ids(stations), skills = new Set(resources.flatMap((r) => (r.skills as string[]) ?? []));
  const item = (v: unknown, at: string) => { if (!itemIds.has(v)) no(`${at}: item ${JSON.stringify(v)} is not one of the items`); };
  const loc = (v: unknown, at: string) => { if (!locIds.has(v)) no(`${at}: location ${JSON.stringify(v)} is not one of the locations`); };
  const skill = (v: unknown, at: string) => { if (!skills.has(v as string)) no(`${at}: skill ${JSON.stringify(v)} is no resource's`); };
  const lines = (v: unknown, at: string) => (v === undefined ? [] : (v as Rec[])).forEach((l, i) => item(l.item, `${at} ${i + 1}`));
  for (const x of items) lines(x.bom, `item ${String(x.id)}: bom`);
  for (const x of locations) {
    lines(x.stock, `location ${String(x.id)}: stock`);
    if (x.to !== undefined) loc(x.to, `location ${String(x.id)}`);
  }
  for (const x of stations) {
    loc(x.in, `station ${String(x.id)}: in`);
    loc(x.out, `station ${String(x.id)}: out`);
    if (x.repair !== undefined) skill(x.repair, `station ${String(x.id)}: repair`);
  }
  const made = new Set<unknown>();
  routings.forEach((r, i) => {
    const at = `routing ${i + 1}`;
    fields(r, "routing", at);
    item(r.item, at);
    made.add(r.item);
    loc(r.to, `${at}: to`);
    for (const op of r.ops as Rec[]) {
      const where = `${at} op ${String(op.id)}`;
      fields(op, "op", where);
      if (!stationIds.has(op.station)) no(`${where}: station ${JSON.stringify(op.station)} is not one of the stations`);
      lines(op.consumes, `${where}: consumes`);
      if (op.needs !== undefined) skill(op.needs, where);
    }
  });
  for (const x of orders) if (!made.has(x.item)) no(`order ${String(x.id)}: no routing makes ${JSON.stringify(x.item)}`);
  for (const x of inbound) {
    item(x.item, `inbound ${String(x.id)}`);
    loc(x.to, `inbound ${String(x.id)}: to`);
  }
  for (const x of outbound) {
    item(x.item, `outbound ${String(x.id)}`);
    loc(x.from, `outbound ${String(x.id)}: from`);
  }
  for (const x of moves) {
    if (x.item !== undefined) item(x.item, `move ${String(x.id)}`);
    loc(x.from, `move ${String(x.id)}: from`);
    loc(x.to, `move ${String(x.id)}: to`);
    skill(x.by, `move ${String(x.id)}`);
  }
  return spec;
}

/**
 * The machines a rate needs: CEIL(rate * cycle / (batch * availability * load)). `rate` is entities a second into the
 * station (the demand over the yields from it to the end of the routing); `load` the planned share of a machine's time.
 */
export function machinesFor({ rate, cycle_s, batch = 1, availability = 1, load = 0.85 }: { rate: number; cycle_s: number; batch?: number; availability?: number; load?: number }): number {
  if (!(rate >= 0 && cycle_s > 0 && batch > 0 && availability > 0 && availability <= 1 && load > 0 && load <= 1))
    throw new Error("machinesFor: rate is 0 or more; cycle_s, batch and load are above 0; availability and load are at most 1");
  return Math.max(0, Math.ceil(rate * cycle_s / (batch * availability * load) - 1e-9));
}
