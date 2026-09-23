/**
 * `commandagi` — the CommandAGI SDK for TypeScript and JavaScript.
 *
 *   import { CommandAGI } from "commandagi";
 *   const cagi = new CommandAGI();                    // reads $COMMANDAGI_API_KEY
 *
 *   await cagi.threads.create({ intent: "Summarise this week's robotics news" });
 *
 *   await using world = await cagi.launch("simulation/warehouse");  // a world YOU drive
 *   await world.sim.ik({ target: [0.3, 0, 0.4] });
 *   const jpeg = await world.observe({ fresh: true });
 *
 * One surface for developers and agents alike — an API key's scopes are the only difference. Tool
 * namespaces and control vocabularies are generated from the CommandAGI SDK schema
 * (./commandagi-sdk.schema.json), identically for every language; `call(tool, args)` reaches any tool.
 */
export { CommandAGI, CommandAGIError, createClient, type CommandAGIConfig } from "./client.js";
export { Session, type Frame, type ControlChannel } from "./session.js";
export * from "./generated.js";
export { CommandAGI as default } from "./client.js";
