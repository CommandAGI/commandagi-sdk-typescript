/**
 * A PERSON IN A SCENE — the human avatar (`cloud://global/devices/human-avatar/definition.tsx`) placed in a design's
 * `<slot name="scene">` as a `robots` entry with a `look`, the `humanoid` policy that drives it, and the `goal`,
 * `motors`, `assist` and `face` commands an agent sends it (docs/formats.md § a person in the scene, in the CommandAGI
 * repository). The scene stays a plain literal, so the editor writes into it; these types say what it may hold.
 *
 *   // Office.3d.tsx
 *   <slot name="scene" value={{ hz: 240,
 *     robots: [{ id: "ana", definition: "cloud://global/devices/human-avatar/definition.tsx",
 *                look: { body: "feminine", height_m: 1.68, hair_style: "ponytail", outfit: "blouse_skirt" } }],
 *     policies: [{ id: "ana-day", kind: "humanoid", unit: "ana", repeat: true, routine: [
 *       { do: "walk", route: [[0, 0], [1, 2]] }, { do: "sit", seat: [1, 2.4, 0.45], facing: 1.57 },
 *       { do: "idle", activity: "type", seconds: 60 }, { do: "stand" }] }] }} />
 *
 * `checkLook`, `checkGoal`, `checkHumanoidPolicy`, `checkMotors`, `checkAssist` and `checkFace` refuse what the engine refuses, in
 * its words. They check the shape only: whether a unit, a body or a constraint is in the scene is the engine's to say.
 */

/** sRGB, each from 0 to 1. */
export type Rgb = [number, number, number];
export type XY = [number, number];
export type XYZ = [number, number, number];

export const LOOK_BODIES = ["masculine", "feminine"] as const;
export const HAIR_STYLES = ["none", "afro", "bob", "bob_sleek", "braid", "long", "ponytail", "short", "short_swept", "pixie", "crop"] as const;
export const OUTFITS = ["tee_jeans", "crew_tee_jeans", "longsleeve_jeans", "shirt_jeans", "denim_shirt_jeans", "jacket_jeans", "suit_tie", "overalls", "fitted_tee_jeans", "tee_shorts", "blouse_skirt", "sport_top_leggings"] as const;
export const FOOTWEAR = ["leather_shoes", "hiking_shoes", "boots", "black_shoes", "white_trainers", "blue_trainers"] as const;
/** MakeHuman's ethnic macros. A look's `ethnicity` weighs them; absent, an even blend. */
export const ETHNICITIES = ["african", "asian", "caucasian"] as const;

/** A robots entry's `look`: how the person looks. Every field is optional; the definition gives the rest. */
export interface Look {
  body?: (typeof LOOK_BODIES)[number];
  /** Metres, 1.2 to 2.2. */
  height_m?: number;
  /** MakeHuman's weight macro: 0 thin, 0.5 average, 1 heavy. */
  weight?: number;
  /** MakeHuman's muscle macro, 0 to 1: 0.5 average. */
  muscle?: number;
  /** MakeHuman's proportions macro: 0 uncommon, 0.5 neutral, 1 ideal. */
  proportions?: number;
  /** Years, 25 to 90 (MakeHuman's adult ages); absent, 25. */
  age_years?: number;
  /** Each weight 0 or more, not all 0; the engine blends them. Absent, an even blend. */
  ethnicity?: { [K in (typeof ETHNICITIES)[number]]?: number };
  skin?: Rgb;
  hair?: Rgb;
  /** top, bottom and shoes tint the outfit's and the footwear's own colours. */
  top?: Rgb;
  bottom?: Rgb;
  shoes?: Rgb;
  hair_style?: (typeof HAIR_STYLES)[number];
  outfit?: (typeof OUTFITS)[number];
  footwear?: (typeof FOOTWEAR)[number];
}
/** A look's numbers and their bounds, and its colours. One table, the same in the three SDKs. */
export const LOOK_BOUNDS = { height_m: [1.2, 2.2], weight: [0, 1], muscle: [0, 1], proportions: [0, 1], age_years: [25, 90] } as const;
export const LOOK_COLOURS = ["skin", "hair", "top", "bottom", "shoes"] as const;
export const LOOK_FIELDS = ["body", "height_m", "weight", "muscle", "proportions", "age_years", "ethnicity", ...LOOK_COLOURS, "hair_style", "outfit", "footwear"] as const;

/** Which step of which policy's routine a goal is (a policy writes it on the goals it sends). */
export interface GoalPlan { policy: string; step: number }
interface GoalBase { plan?: GoalPlan }
/** Walk a route of 1 to 64 points (metres), at `speed` m/s (above 0, at most 1.6). */
export interface WalkGoal extends GoalBase { do: "walk"; route: XY[]; speed?: number }
/** Step to a point without turning (sideways or back). */
export interface StepGoal extends GoalBase { do: "step"; to: XY; heading?: number }
/** Turn to a heading: radians about z, from +x. */
export interface TurnGoal extends GoalBase { do: "turn"; heading: number }
/** Sit on a seat (metres), facing a heading (radians). */
export interface SitGoal extends GoalBase { do: "sit"; seat: XYZ; facing: number }
export interface StandGoal extends GoalBase { do: "stand" }
export const IDLE_ACTIVITIES = ["type", "look", "still", "talk"] as const;
/** Stay a while: `at` is the point it types at or looks at; `with` (talk) the unit it talks with, faces and looks at. */
export interface IdleGoal extends GoalBase { do: "idle"; activity?: (typeof IDLE_ACTIVITIES)[number]; seconds?: number; at?: XYZ; with?: string }
export const REACH_HANDS = ["left", "right", "both"] as const;
export interface ReachGoal extends GoalBase { do: "reach"; at: XYZ; hand?: (typeof REACH_HANDS)[number]; seconds?: number }
export type Goal = WalkGoal | StepGoal | TurnGoal | SitGoal | StandGoal | IdleGoal | ReachGoal;
/** Each goal's own fields, beside `do` and `plan`. One table, the same in the three SDKs. */
export const GOAL_FIELDS = {
  walk: ["route", "speed"], step: ["to", "heading"], turn: ["heading"], sit: ["seat", "facing"], stand: [],
  idle: ["activity", "seconds", "at", "with"], reach: ["at", "hand", "seconds"],
} as const;
export const GOAL_KINDS = Object.keys(GOAL_FIELDS) as Goal["do"][];

/** A scene policy that drives one person through its routine: each step a goal, then `wait` seconds once it is done. */
export interface HumanoidPolicy {
  id: string;
  kind: "humanoid";
  /** The robots entry it drives. */
  unit: string;
  hz?: number;
  lookahead?: number;
  routine?: (Goal & { wait?: number })[];
  repeat?: boolean;
}
export const HUMANOID_POLICY_FIELDS = ["id", "kind", "unit", "hz", "lookahead", "routine", "repeat"] as const;

/** The commands an agent sends a person. */
export type GoalCommand = { verb: "goal"; unit: string } & Goal;
export interface MotorSet { target?: number; velocity?: number; stiffness?: number; damping?: number }
export interface MotorsCommand {
  verb: "motors";
  /** Each constraint's motor now. */
  set?: Record<string, MotorSet>;
  /** Targets over time: `at` seconds from `since` (increasing, at most 10), each constraint's target there. */
  path?: { at: number; set: Record<string, number> }[];
  /** The scene time the path starts at, not later than now; absent, now. */
  since?: number;
}
/** The heading (radians about z, from +x) a body's balance aid turns it to; null lets it be. */
export interface AssistCommand { verb: "assist"; body: string; heading: number | null }

/** ARKit's 52 face units (blendshapes), each from 0 (rest) to 1. A `face` command names them. */
export const FACE_UNITS = Object.freeze([
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
  "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
  "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen",
  "jawRight", "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft",
  "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight", "mouthRollLower",
  "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft", "mouthStretchRight",
  "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight", "tongueOut",
] as const);
export type FaceUnit = (typeof FACE_UNITS)[number];
/** A person's face: each unit's weight now (`set`), or weights over time (`path`, `at` seconds from `since`). */
export interface FaceCommand {
  verb: "face";
  /** The robots entry whose face it moves. */
  unit: string;
  set?: Partial<Record<FaceUnit, number>>;
  /** `at` increasing, at most 10 seconds. */
  path?: { at: number; set: Partial<Record<FaceUnit, number>> }[];
  /** The scene time the path starts at, not later than now; absent, now. */
  since?: number;
}

/** The person's joints. Each is the constraint `humanoidConstraint(unit, joint)` that a `motors` command names. */
export const HUMANOID_JOINTS = Object.freeze([
  "spine_lower", "spine_lower_lean", "spine_lower_twist", "spine_upper", "spine_upper_lean", "spine_upper_twist", "neck_turn", "neck_nod", "neck_lean",
  ...(["l", "r"] as const).flatMap((s) => [`shoulder_${s}`, `shoulder_${s}_abduct`, `shoulder_${s}_twist`, `elbow_${s}`, `wrist_${s}`, `wrist_${s}_deviate`, `hip_${s}`, `hip_${s}_abduct`, `hip_${s}_twist`, `knee_${s}`, `ankle_${s}`, `ankle_${s}_roll`]),
]);
/** `ana`, `knee_l` → `ana-knee-l`. */
export const humanoidConstraint = (unit: string, joint: string): string => `${unit}-${joint.replace(/_/g, "-")}`;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const point = (n: number) => (x: unknown) => Array.isArray(x) && x.length === n && x.every(num);
const text = (x: unknown) => typeof x === "string" && x.length > 0;
const oneOf = (list: readonly string[], x: unknown) => typeof x === "string" && list.includes(x);
function unknown(g: Obj, fields: readonly string[], what: string): string | null {
  for (const k of Object.keys(g)) if (!fields.includes(k)) return `${what} has no field ${k} (it has ${fields.join(", ")})`;
  return null;
}

/** Refuses what the engine would refuse of a look; returns it. `where`: the entry, for the words. */
export function checkLook<L>(look: L, where = "robot"): L {
  const no = (why: string): never => { throw new Error(`${where}: ${why}`); };
  if (look === undefined) return look;
  if (!isObj(look)) no(`look is { ${LOOK_FIELDS.map((k) => `${k}?`).join(", ")} }`);
  const l = look as Obj;
  const bad = unknown(l, LOOK_FIELDS, "look");
  if (bad) no(bad);
  if (l.body !== undefined && !oneOf(LOOK_BODIES, l.body)) no(`look.body is ${LOOK_BODIES.join(" or ")}`);
  for (const [k, [lo, hi]] of Object.entries(LOOK_BOUNDS))
    if (l[k] !== undefined && !(num(l[k]) && (l[k] as number) >= lo && (l[k] as number) <= hi)) no(`look.${k} is a number from ${lo} to ${hi}`);
  for (const k of LOOK_COLOURS)
    if (l[k] !== undefined && !(point(3)(l[k]) && (l[k] as number[]).every((c) => c >= 0 && c <= 1))) no(`look.${k} is [r, g, b], sRGB from 0 to 1`);
  if (l.ethnicity !== undefined) {
    const e = l.ethnicity;
    const ok = isObj(e) && !unknown(e, ETHNICITIES, "") && Object.values(e).every((w) => num(w) && w >= 0) && Object.values(e).some((w) => (w as number) > 0);
    if (!ok) no(`look.ethnicity is { ${ETHNICITIES.map((k) => `${k}?`).join(", ")} }, each a number 0 or more, not all 0`);
  }
  for (const [k, list] of [["hair_style", HAIR_STYLES], ["outfit", OUTFITS], ["footwear", FOOTWEAR]] as const)
    if (l[k] !== undefined && !oneOf(list, l[k])) no(`look.${k} is one of ${list.join(", ")}`);
  return look;
}

/** What is wrong with a goal (its fields besides `verb` and `unit`), or null. */
export function goalProblem(g: unknown): string | null {
  if (!isObj(g)) return "a goal is an object";
  if (!oneOf(GOAL_KINDS, g.do)) return `do is one of ${GOAL_KINDS.join(", ")}`;
  const kind = g.do as Goal["do"], own: readonly string[] = GOAL_FIELDS[kind];
  for (const k of Object.keys(g)) if (k !== "do" && k !== "plan" && !own.includes(k)) return `${kind} has no field ${k} (it has ${[...own, "plan"].join(", ")})`;
  if (kind === "walk" && !(Array.isArray(g.route) && g.route.length >= 1 && g.route.length <= 64 && g.route.every(point(2))))
    return "walk needs a route: 1 to 64 points [x, y] (metres)";
  if (g.speed !== undefined && !(num(g.speed) && g.speed > 0 && g.speed <= 1.6)) return "walk speed is metres a second, above 0 and at most 1.6";
  if (kind === "step" && !point(2)(g.to)) return "step needs to [x, y] (the point it steps to, metres)";
  if (kind === "turn" && !num(g.heading)) return "turn needs a heading (radians about z, from +x)";
  if (kind === "step" && g.heading !== undefined && !num(g.heading)) return "step heading is radians about z, from +x";
  if (kind === "sit" && !(point(3)(g.seat) && num(g.facing))) return "sit needs a seat [x, y, z] (where it sits, metres) and facing (the heading it sits facing, radians)";
  if (g.activity !== undefined && !oneOf(IDLE_ACTIVITIES, g.activity)) return `idle activity is one of ${IDLE_ACTIVITIES.join(", ")}`;
  if (kind === "idle" && g.at !== undefined && !point(3)(g.at)) return "idle at is a point [x, y, z] (where it types or looks, metres)";
  if (g.with !== undefined && !text(g.with)) return "idle with is the unit it talks with";
  if (kind === "reach" && !point(3)(g.at)) return "reach needs at [x, y, z] (the point it reaches for, metres)";
  if (g.hand !== undefined && !oneOf(REACH_HANDS, g.hand)) return "reach hand is left, right or both";
  if (g.seconds !== undefined && !(num(g.seconds) && g.seconds > 0)) return "seconds is a positive number";
  if (g.plan !== undefined && !(isObj(g.plan) && typeof g.plan.policy === "string" && Number.isInteger(g.plan.step))) return "plan is { policy, step }";
  return null;
}

/** Refuses what the engine would refuse of a `goal` command; returns it. */
export function checkGoal<C>(cmd: C): C {
  if (!isObj(cmd) || cmd.verb !== "goal") throw new Error("goal: a goal command is { verb: \"goal\", unit, do, … }");
  const { verb: _verb, unit, ...goal } = cmd;
  if (!text(unit)) throw new Error("goal: unit is the unit it moves");
  const no = goalProblem(goal);
  if (no) throw new Error(`goal: ${no}`);
  return cmd;
}

/** Refuses what the engine would refuse of a humanoid policy's own fields; returns it. */
export function checkHumanoidPolicy<P>(policy: P): P {
  const p = (isObj(policy) ? policy : {}) as Obj;
  const no = (why: string): never => { throw new Error(`policy ${String(p.id)}: ${why}`); };
  if (!text(p.id)) no("id is a text");
  for (const k of Object.keys(p)) if (!(HUMANOID_POLICY_FIELDS as readonly string[]).includes(k)) no(`unknown field ${k} (it has ${HUMANOID_POLICY_FIELDS.join(", ")})`);
  if (p.kind !== "humanoid") no("kind is humanoid");
  if (!text(p.unit)) no("unit is the robot it drives");
  if (p.hz !== undefined && !(num(p.hz) && p.hz > 0)) no("hz is a positive number");
  if (p.lookahead !== undefined && !(num(p.lookahead) && p.lookahead >= 0)) no("lookahead is seconds, 0 or more");
  if (p.routine !== undefined) {
    if (!Array.isArray(p.routine) || !p.routine.length) no("routine is a list of goals");
    (p.routine as unknown[]).forEach((g, i) => {
      // A step of the routine is a goal, and how long to wait once it is done (`wait`, seconds).
      const { wait, ...goal } = isObj(g) ? g : ({} as Obj);
      const why = !isObj(g) ? "a goal is an object" : wait !== undefined && !(num(wait) && wait >= 0) ? "wait is seconds, 0 or more" : goalProblem(goal);
      if (why) no(`routine[${i}]: ${why}`);
    });
  }
  if (p.repeat !== undefined && typeof p.repeat !== "boolean") no("repeat is true or false");
  return policy;
}

/** Refuses what the engine would refuse of a `motors` command's shape; returns it. */
export function checkMotors<C>(cmd: C): C {
  const no = (why: string): never => { throw new Error(`motors ${why}`); };
  if (!isObj(cmd) || cmd.verb !== "motors") no("is { verb: \"motors\", set?, path?, since? }");
  const c = cmd as Obj, set = c.set ?? {}, path = c.path ?? [];
  const bad = unknown(c, ["verb", "set", "path", "since"], "motors");
  if (bad) throw new Error(bad);
  if (!isObj(set) || !Array.isArray(path) || (!Object.keys(set).length && !path.length))
    no("needs set { <constraint>: { target | velocity, stiffness?, damping? } } or path [{ at, set: { <constraint>: target } }]");
  for (const [id, m] of Object.entries(set as Obj))
    if (!isObj(m) || unknown(m, ["target", "velocity", "stiffness", "damping"], "") || (m.target === undefined && m.velocity === undefined) || !Object.values(m).every(num))
      no(`set: ${id} is { target | velocity, stiffness?, damping? }`);
  let before = -Infinity;
  for (const pt of path as unknown[]) {
    if (!isObj(pt) || !(num(pt.at) && pt.at >= 0 && pt.at > before && pt.at <= 10) || !isObj(pt.set))
      no("path: each point is { at (seconds from now, increasing, at most 10), set: { <constraint>: target } }");
    before = (pt as Obj).at as number;
    for (const [id, v] of Object.entries((pt as Obj).set as Obj)) if (!num(v)) no(`path: ${id} target ${JSON.stringify(v)} is not a number`);
  }
  if (c.since !== undefined && !num(c.since)) no("since is the scene time its path starts at, not later than now");
  return cmd;
}

/** Refuses what the engine would refuse of an `assist` command's shape; returns it. */
export function checkAssist<C>(cmd: C): C {
  if (!isObj(cmd) || cmd.verb !== "assist") throw new Error("assist is { verb: \"assist\", body, heading }");
  const bad = unknown(cmd, ["verb", "body", "heading"], "assist");
  if (bad) throw new Error(bad);
  if (!text(cmd.body)) throw new Error("assist needs a body (the body whose balance aid it turns)");
  if (cmd.heading !== null && !num(cmd.heading)) throw new Error("assist needs a heading (radians) or null");
  return cmd;
}

/** Refuses what the engine would refuse of a `face` command's shape; returns it. */
export function checkFace<C>(cmd: C): C {
  const no = (why: string): never => { throw new Error(`face ${why}`); };
  if (!isObj(cmd) || cmd.verb !== "face") no("is { verb: \"face\", unit, set?, path?, since? }");
  const c = cmd as Obj, set = c.set ?? {}, path = c.path ?? [];
  const bad = unknown(c, ["verb", "unit", "set", "path", "since"], "face");
  if (bad) throw new Error(bad);
  if (!text(c.unit)) no("needs a unit (the person whose face it moves)");
  if (!isObj(set) || !Array.isArray(path) || (!Object.keys(set).length && !path.length))
    no("needs set { <face unit>: 0 to 1 } or path [{ at, set: { <face unit>: 0 to 1 } }]");
  const weights = (where: string, w: Obj) => {
    for (const [name, v] of Object.entries(w)) {
      if (!(FACE_UNITS as readonly string[]).includes(name)) no(`${where}: ${name} is not one of ARKit's 52 face units (browDownLeft … tongueOut)`);
      if (!(num(v) && v >= 0 && v <= 1)) no(`${where}: ${name} is a number from 0 to 1`);
    }
  };
  weights("set", set as Obj);
  let before = -Infinity;
  for (const pt of path as unknown[]) {
    if (!isObj(pt) || !(num(pt.at) && pt.at >= 0 && pt.at > before && pt.at <= 10) || !isObj(pt.set))
      no("path: each point is { at (seconds from now, increasing, at most 10), set: { <face unit>: 0 to 1 } }");
    before = (pt as Obj).at as number;
    weights("path", (pt as Obj).set as Obj);
  }
  if (c.since !== undefined && !num(c.since)) no("since is the scene time its path starts at, not later than now");
  return cmd;
}
