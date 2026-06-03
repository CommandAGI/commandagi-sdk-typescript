/**
 * CommandAGI Node/TypeScript SDK.
 *
 * Launch cloud computers and 3D robot simulations and control them, or bring your own robot online.
 *
 *   import { CommandAGI } from "commandagi";
 *   const cagi = new CommandAGI({ apiKey: "cagi_…" });
 *   const world = await cagi.launch("simulation/warehouse");
 *   let obs = await world.observe();
 *   obs = await world.step("move", { speed: 0.8 });
 *   await world.close();
 */
export { CommandAGI, World, CommandAGIError, SIMULATIONS, COMPUTERS } from "./client.js";
export { RobotBridge } from "./bridge.js";
export type { BridgeRunOpts } from "./bridge.js";
