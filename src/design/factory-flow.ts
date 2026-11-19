/**
 * A FACTORY IN A SCENE — the `flow` system a design's `<slot name="scene">` holds (docs/formats.md § simulations, "A
 * factory", in the CommandAGI repository): products on routes through stations of machines with finite buffers, from
 * sources to sinks, run by the simulation engine as discrete events. The scene stays a plain literal, so the editor
 * writes each edit back into it (a station's machines, its cycle); these types say what it may hold.
 *
 *   // Line.3d.tsx
 *   export default () => (
 *     <part name="Line">
 *       <slot name="scene" value={{ hz: 30, systems: [{
 *         id: "line", kind: "flow", time_scale: 60,
 *         products: [{ id: "motor", route: ["wind", "test"], sink: "dock", demand_per_period: 2000 }],
 *         sources: [{ id: "kits", product: "motor" }], sinks: [{ id: "dock" }],
 *         stations: [{ id: "wind", machines: 4, cycle_s: 75, buffer: 12, availability: 0.92 },
 *                    { id: "test", machines: 2, cycle_s: 44, buffer: 8, yield: 0.975 }] }] }} />
 *     </part>
 *   );
 *
 * `checkFlowSystem(spec)` refuses an unknown field, a missing one, a number that is not a number or a `"$parameter"`, and
 * a name that points nowhere, in the engine's own words. The engine checks the rest when the scene runs (ranges, loops of
 * routes, a buffer smaller than its batch). `machinesFor` is the sizing formula the engine's own sizing uses.
 */

/** A number, or a `"$name"` of the scene's `parameters`. */
export type FlowNumber = number | `$${string}`;
export interface FlowStation {
  id: string; label?: string; at?: [FlowNumber, FlowNumber];
  machines: FlowNumber; cycle_s: FlowNumber; buffer: FlowNumber;
  cycle_cv?: FlowNumber; batch?: FlowNumber; setup_s?: FlowNumber; yield?: FlowNumber;
  /** Failures, one way or the other: `availability` (with `mttr_s`, 20 cycles when absent), or `mtbf_s` with `mttr_s`. */
  availability?: FlowNumber; mtbf_s?: FlowNumber; mttr_s?: FlowNumber;
}
export interface FlowProduct {
  id: string; label?: string; route: Array<string | { station: string; cycle_s?: FlowNumber }>; sink: string;
  demand_per_period?: FlowNumber; color?: [number, number, number];
}
export interface FlowSource { id: string; label?: string; at?: [FlowNumber, FlowNumber]; product: string; per_hour?: FlowNumber; arrivals?: "steady" | "random" }
export interface FlowSink { id: string; label?: string; at?: [FlowNumber, FlowNumber] }
export interface FlowSystem {
  id: string; kind: "flow"; seed?: number; time_scale?: FlowNumber; window_s?: FlowNumber; record?: boolean;
  shifts?: { period_s?: FlowNumber; windows: Array<[FlowNumber, FlowNumber]> };
  products: FlowProduct[]; stations: FlowStation[]; sources: FlowSource[]; sinks: FlowSink[];
}

/** Each part's fields: the ones it needs, then the ones it may have. One table, the same in the three SDKs. */
type FactoryPart = "system" | "station" | "product" | "source" | "sink" | "shifts";
export const FACTORY_FIELDS: Record<FactoryPart, { needs: string[]; may: string[] }> = {
  system: { needs: ["id", "kind", "products", "stations", "sources", "sinks"], may: ["seed", "time_scale", "window_s", "shifts", "record"] },
  station: { needs: ["id", "machines", "cycle_s", "buffer"], may: ["label", "at", "cycle_cv", "batch", "setup_s", "availability", "mtbf_s", "mttr_s", "yield"] },
  product: { needs: ["id", "route", "sink"], may: ["label", "demand_per_period", "color"] },
  source: { needs: ["id", "product"], may: ["label", "at", "per_hour", "arrivals"] },
  sink: { needs: ["id"], may: ["label", "at"] },
  shifts: { needs: ["windows"], may: ["period_s"] },
};
const NUMBERS: Record<string, string> = {
  machines: "a whole number from 1 to 256", buffer: "a whole number from 1 to 100000", batch: "a whole number from 1 to 1024",
  cycle_s: "the seconds one batch takes, more than 0", cycle_cv: "the spread of the cycle time over its mean, 0 to 4",
  setup_s: "the seconds a change of product takes, 0 or more", yield: "the share of parts that survive, above 0 and at most 1",
  availability: "the share of time it is not under repair, above 0 and at most 1", mtbf_s: "the mean operating seconds between failures, more than 0",
  mttr_s: "the mean seconds a repair takes, more than 0", per_hour: "the parts it releases in a working hour, more than 0",
  demand_per_period: "the parts wanted in one shift period, more than 0",
};
const isNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && /^\$[A-Za-z_]\w*$/.test(v));

/** Refuses what the engine would refuse by shape or by name; returns the spec. */
export function checkFlowSystem(spec: FlowSystem): FlowSystem {
  const s = spec as unknown as Record<string, unknown>, no = (why: string): never => { throw new Error(`system ${String(s.id)}: ${why}`); };
  const fields = (o: Record<string, unknown>, part: FactoryPart, at: string) => {
    const { needs, may } = FACTORY_FIELDS[part];
    for (const k of Object.keys(o)) if (!needs.includes(k) && !may.includes(k)) no(`${at}: unknown field ${k} (it has ${[...needs, ...may].join(", ")})`);
    for (const k of needs) if (o[k] === undefined) no(`${at}: ${k} is needed`);
    for (const [k, why] of Object.entries(NUMBERS)) if (o[k] !== undefined && !isNumber(o[k])) no(`${at}: ${k} is ${why}`);
  };
  fields(s, "system", "the system");
  if (s.kind !== "flow") no("kind is flow");
  const list = (k: string) => (Array.isArray(s[k]) ? (s[k] as Record<string, unknown>[]) : no(`${k} is a list`));
  const stations = list("stations"), products = list("products"), sources = list("sources"), sinks = list("sinks");
  for (const x of stations) fields(x, "station", `station ${String(x.id)}`);
  for (const x of products) fields(x, "product", `product ${String(x.id)}`);
  for (const x of sources) fields(x, "source", `source ${String(x.id)}`);
  for (const x of sinks) fields(x, "sink", `sink ${String(x.id)}`);
  if (s.shifts !== undefined) fields(s.shifts as Record<string, unknown>, "shifts", "shifts");
  const ids = (xs: Record<string, unknown>[]) => new Set(xs.map((x) => x.id));
  const stationIds = ids(stations), sinkIds = ids(sinks), productIds = ids(products);
  for (const p of products) {
    for (const step of p.route as Array<string | { station: string }>) {
      const id = typeof step === "string" ? step : step.station;
      if (!stationIds.has(id)) no(`product ${String(p.id)}: route names ${JSON.stringify(id)}, which is not a station`);
    }
    if (!sinkIds.has(p.sink)) no(`product ${String(p.id)}: sink ${JSON.stringify(p.sink)} is not one of the sinks`);
  }
  for (const x of sources) if (!productIds.has(x.product)) no(`source ${String(x.id)}: product ${JSON.stringify(x.product)} is not one of the products`);
  return spec;
}

/**
 * The machines a rate needs: CEIL(rate * cycle / (batch * availability * load)). `rate` is parts a second into the
 * station (the demand over the yields from it to the end of the route); `load` the planned share of a machine's time.
 */
export function machinesFor({ rate, cycle_s, batch = 1, availability = 1, load = 0.85 }: { rate: number; cycle_s: number; batch?: number; availability?: number; load?: number }): number {
  if (!(rate >= 0 && cycle_s > 0 && batch > 0 && availability > 0 && availability <= 1 && load > 0 && load <= 1))
    throw new Error("machinesFor: rate is 0 or more; cycle_s, batch and load are above 0; availability and load are at most 1");
  return Math.max(0, Math.ceil(rate * cycle_s / (batch * availability * load) - 1e-9));
}
