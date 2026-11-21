// A person in a scene against scene-people.golden.json, the golden of the three SDKs: each case the engine accepts
// passes, and each refusal is the engine's own words.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAssist, checkGoal, checkHumanoidPolicy, checkLook, checkMotors, HUMANOID_JOINTS, humanoidConstraint } from "./scene-people.js";

const golden = JSON.parse(readFileSync(new URL("./scene-people.golden.json", import.meta.url), "utf8"));
const checks: Record<string, (x: unknown) => unknown> = { look: checkLook, goal: checkGoal, humanoid: checkHumanoidPolicy, motors: checkMotors, assist: checkAssist };

test("a person's look, policy and commands the engine accepts pass, and each refusal names what is wrong in the engine's words", () => {
  for (const c of golden.cases) {
    if (c.says === undefined) assert.equal(checks[c.check](c.value), c.value, JSON.stringify(c.value));
    else assert.throws(() => checks[c.check](c.value), (e: Error) => e.message.includes(c.says), c.says);
  }
});

test("the person's joints are 33 constraints, named <unit>-<joint with - for _>", () => {
  assert.equal(HUMANOID_JOINTS.length, 33);
  assert.equal(new Set(HUMANOID_JOINTS).size, 33);
  assert.equal(humanoidConstraint("ana", "shoulder_l_abduct"), "ana-shoulder-l-abduct");
});
