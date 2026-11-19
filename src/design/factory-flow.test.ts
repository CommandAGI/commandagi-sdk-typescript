// The factory module against factory-flow.golden.json, the golden of the three SDKs: a factory that the engine runs
// passes, each refusal is the engine's own words, and the sizing gives the machines the engine's sizing gives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFlowSystem, machinesFor, type FlowSystem } from "./factory-flow.js";

const golden = JSON.parse(readFileSync(new URL("./factory-flow.golden.json", import.meta.url), "utf8"));
/** The valid factory with one value set at a path. */
function changed(path: Array<string | number>): FlowSystem {
  const out = structuredClone(golden.valid), keys = path.slice(0, -1), value = keys.pop();
  let at: any = out;
  for (const k of path.slice(0, -2)) at = at[k];
  at[value as string] = path.at(-1);
  return out;
}

test("a factory the engine runs passes, and each refusal names what is wrong in the engine's words", () => {
  assert.equal(checkFlowSystem(golden.valid), golden.valid);
  for (const r of golden.refusals) assert.throws(() => checkFlowSystem(changed(r.change)), (e: Error) => e.message.includes(r.says), r.says);
});

test("machinesFor: CEIL(rate * cycle / (batch * availability * 0.85))", () => {
  for (const c of golden.machines) assert.equal(machinesFor(c), c.machines, JSON.stringify(c));
  assert.throws(() => machinesFor({ rate: 1, cycle_s: 0 }), /cycle_s/);
});
