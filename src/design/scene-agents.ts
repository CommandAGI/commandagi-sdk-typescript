/**
 * AGENTS IN A SCENE — the `agents` a design's `<slot name="scene">` holds (docs/formats.md § simulations, "Agents in a
 * scene", in the CommandAGI repository): a model agent attached to robots of the scene, or to some joints of one (its
 * actuators). Each acts as `agent:<id>` through the simulation's own commands, and only on its `units`: that list is its
 * grant in the simulation, and it grants nothing on hardware. The scene stays a plain literal, so the editor writes
 * into it; these types say what an entry may hold.
 *
 *   // Arms.3d.tsx
 *   export default () => (
 *     <part name="Arms">
 *       <slot name="scene" value={{ hz: 240, robots: [{ id: "left", … }, { id: "right", … }],
 *         agents: [{ id: "pilot", units: ["left"], instructions: "Keep the left arm clear of the cube." },
 *                  { id: "wrist", units: ["right.wrist_flex"] }] }} />
 *     </part>
 *   );
 *
 * `checkSceneAgents(scene)` refuses what the engine refuses, in its words: an unknown field, a malformed or repeated id,
 * an id that is a policy's principal, a unit that is no robot of the scene nor a joint of one, an empty text.
 */

/** A robot of the scene (`"left"`: every verb that drives it) or one of its joints (`"right.wrist_flex"`: its targets only). */
export type SceneAgentUnit = string;
export interface SceneAgent {
  /** Lower case letters, digits and `-`; the agent is `agent:<id>`. */
  id: string;
  units: SceneAgentUnit[];
  /** `<route>/<model>` on a route of the agent runtime (openrouter, deepinfra, deepseek, dashscope: CommandAGI's docs/agent-clis.md § an agent in a scene); absent: `deepseek/deepseek-flash`. */
  model?: string;
  /** What the design tells it, added to its prompt. */
  instructions?: string;
  label?: string;
}

/** An entry's fields: the ones it needs, then the ones it may have. One table, the same in the three SDKs. */
export const SCENE_AGENT_FIELDS = { needs: ["id", "units"], may: ["model", "instructions", "label"] } as const;
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** Refuses what the engine would refuse; returns the scene. `scene`: its `robots`, `policies` and `agents`. */
export function checkSceneAgents<S extends { robots?: { id: string }[]; policies?: { id: string }[]; agents?: SceneAgent[] }>(scene: S): S {
  if (scene.agents === undefined) return scene;
  if (!Array.isArray(scene.agents)) throw new Error("simulation: agents is a list");
  const robots = new Set((scene.robots ?? []).map((r) => r.id)), policies = new Set((scene.policies ?? []).map((p) => `agent:policy-${p.id}`)), ids = new Set<string>();
  const fields: readonly string[] = [...SCENE_AGENT_FIELDS.needs, ...SCENE_AGENT_FIELDS.may];
  for (const entry of scene.agents) {
    const a = entry as unknown as Record<string, unknown>;
    if (!a || typeof a !== "object" || typeof a.id !== "string" || !ID.test(a.id) || ids.has(a.id))
      throw new Error(`agent ${String(a?.id)}: missing, malformed or duplicate id (lower case letters, digits and -)`);
    ids.add(a.id);
    const where = `agent ${a.id}`;
    for (const k of Object.keys(a)) if (!fields.includes(k)) throw new Error(`${where}: unknown field ${k} (it has ${fields.join(", ")})`);
    if (policies.has(`agent:${a.id}`)) throw new Error(`${where}: agent:${a.id} is the principal of a policy of this scene`);
    if (!Array.isArray(a.units) || !a.units.length) throw new Error(`${where}: units is a list of the robots it drives ("arm") or their joints ("arm.j1")`);
    for (const u of a.units as unknown[]) {
      const robot = typeof u === "string" ? u.split(".")[0] : null;
      if (!robot || !robots.has(robot) || (u as string).includes(".") && !(u as string).split(".")[1])
        throw new Error(`${where}: unit ${JSON.stringify(u)} is not a robot of this scene or a joint of one`);
    }
    for (const k of ["model", "instructions", "label"]) if (a[k] !== undefined && (typeof a[k] !== "string" || !a[k])) throw new Error(`${where}: ${k} is a text`);
  }
  return scene;
}
