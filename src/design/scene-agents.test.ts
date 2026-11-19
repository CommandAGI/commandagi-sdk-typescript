// The scene agents against scene-agents.golden.json, the golden of the three SDKs: a scene the engine runs passes, and
// each refusal is the engine's own words.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSceneAgents } from "./scene-agents.js";

const golden = JSON.parse(readFileSync(new URL("./scene-agents.golden.json", import.meta.url), "utf8"));
/** The valid scene with one value set at a path. */
function changed(path: Array<string | number | unknown>) {
  const out = structuredClone(golden.valid);
  let at: any = out;
  for (const k of path.slice(0, -2)) at = at[k as string];
  at[path.at(-2) as string] = path.at(-1);
  return out;
}

test("a scene's agents the engine runs pass, and each refusal names what is wrong in the engine's words", () => {
  assert.equal(checkSceneAgents(golden.valid), golden.valid);
  for (const r of golden.refusals) assert.throws(() => checkSceneAgents(changed(r.change)), (e: Error) => e.message.includes(r.says), r.says);
});
