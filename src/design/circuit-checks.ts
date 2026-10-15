/**
 * THE CHECKS A CIRCUIT DECLARES: `<check>` and `<accept>` in a `.sch.tsx` or a `.pcb.tsx`.
 *
 *   <check id="erc" kind="erc" />                         the electrical rule check (a schematic, a board)
 *   <check id="drc" kind="drc" severity="warning" />      the design rule check (a board); its errors as warnings
 *   <check id="pinout" kind="pinout" />                   every part's pinout checked against its datasheet or
 *                                                         measured (its `pinoutVerified`, `./part-fields.ts`)
 *   <check id="footprint" kind="footprint" />             every part's pads checked, and its footprint's pad count,
 *                                                         pitch and body equal to its `packageDimensions`
 *   <accept id="tx" check="erc" rule="pin_conflict" refs={["U1", "U3"]} reason="the bus is open-drain" />
 *   <accept id="edge" check="drc" rule="clearance" region={{ min: [0, 0], max: [3, 3] }} reason="…" />
 *
 * An accept suppresses the findings of its check with its rule that it matches: every ref it names is a part the
 * finding is about, its net is the finding's, and a DRC finding lies in its region (board millimetres). A region
 * larger than 5 % of the board is refused and suppresses nothing. A suppressed finding stays in the report.
 *
 * They are no node of the circuit: the reader keeps them in the graph's `meta` (`checks`, `accepted`), with where each
 * was written, so the circuit the editor draws is the same with them or without them.
 */
import type { Scope } from "./ir.js";
import type { DesignElement } from "./jsx-runtime.js";

export const CIRCUIT_CHECK_TAGS: ReadonlySet<string> = new Set(["check", "accept"]);

const where = (el: DesignElement) => `<${el.type}${typeof el.props.id === "string" ? ` id="${el.props.id}"` : ""}>`;
const ID = /^[A-Za-z0-9_.-]+$/;

function text(el: DesignElement, prop: string, what: string, required = true): string | undefined {
  const v = el.props[prop];
  if (v === undefined && !required) return undefined;
  if (typeof v !== "string" || !v.trim()) throw new Error(`${where(el)}: ${prop} is ${what}`);
  return v;
}

function only(el: DesignElement, allowed: readonly string[]): void {
  for (const k of Object.keys(el.props)) if (k !== "children" && k !== "key" && !allowed.includes(k)) throw new Error(`${where(el)}: prop ${k} is not read (it takes ${allowed.join(", ")})`);
}

const point = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** Read the circuit's `<check>` and `<accept>` elements into its scope's meta; the other elements are returned. */
export function declareCircuitChecks(s: Scope, elements: readonly DesignElement[]): DesignElement[] {
  const checks = (s.meta.checks as Record<string, unknown>[] | undefined) ?? [];
  const accepted = (s.meta.accepted as Record<string, unknown>[] | undefined) ?? [];
  const rest: DesignElement[] = [];
  const at = (el: DesignElement) => (el.source !== undefined ? { source: el.source } : {});
  for (const el of elements) {
    if (el.type === "check") {
      only(el, ["id", "kind", "severity"]);
      const id = text(el, "id", "the check's name (erc)")!;
      if (!ID.test(id)) throw new Error(`${where(el)}: id is letters, digits, _ . -`);
      if ([...checks, ...accepted].some((c) => c.id === id)) throw new Error(`two checks or accepts are called ${id}`);
      const kind = text(el, "kind", "what is checked: erc, drc, pinout, footprint")!;
      const severity = el.props.severity;
      if (severity !== undefined && severity !== "error" && severity !== "warning") throw new Error(`${where(el)}: severity is error or warning`);
      checks.push({ id, kind, ...(severity ? { severity } : {}), ...at(el) });
    } else if (el.type === "accept") {
      only(el, ["id", "check", "rule", "refs", "net", "region", "reason"]);
      const id = text(el, "id", "the accept's name")!;
      if (!ID.test(id)) throw new Error(`${where(el)}: id is letters, digits, _ . -`);
      if ([...checks, ...accepted].some((c) => c.id === id)) throw new Error(`two checks or accepts are called ${id}`);
      const refs = el.props.refs;
      if (refs !== undefined && !(Array.isArray(refs) && refs.length && refs.every((r) => typeof r === "string" && r))) throw new Error(`${where(el)}: refs is a list of part references (["U1", "U3"])`);
      const region = el.props.region as { min?: unknown; max?: unknown } | undefined;
      if (region !== undefined && !(region && typeof region === "object" && point(region.min) && point(region.max))) throw new Error(`${where(el)}: region is { min: [x, y], max: [x, y] } in board millimetres`);
      const net = text(el, "net", "a net's name", false);
      accepted.push({
        id, check: text(el, "check", "the id of the check whose finding it accepts")!, rule: text(el, "rule", "the rule of the finding it accepts (pin_conflict, clearance)")!,
        ...(refs ? { refs } : {}), ...(net ? { net } : {}), ...(region ? { region: { min: region.min, max: region.max } } : {}),
        reason: text(el, "reason", "why the finding is right on purpose")!, ...at(el),
      });
    } else rest.push(el);
  }
  if (checks.length) s.meta.checks = checks;
  if (accepted.length) s.meta.accepted = accepted;
  return rest;
}
