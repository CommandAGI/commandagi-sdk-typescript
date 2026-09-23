import { test } from "node:test";
import assert from "node:assert/strict";
import { CommandAGI } from "./client.js";

/** A client over a scripted /mcp: `replies[tool]` answers a call to that tool. */
function scripted(replies: Record<string, unknown>) {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ tool: body.params.name, args: body.params.arguments ?? {} });
    return {
      async json() {
        const reply = replies[body.params.name] ?? {};
        return {
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: JSON.stringify(reply) }] },
        };
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { cagi: new CommandAGI({ apiKey: "cagi_test", threadId: "th_mine", fetchImpl }), calls };
}

test("launch creates an AGENTLESS thread with the snapshot and binds the session to what it started", async () => {
  const { cagi, calls } = scripted({
    create_thread: {
      threadId: "th_world",
      launched: { status: "granted", embodimentId: "emb_sim" },
    },
  });
  const world = await cagi.launch("simulation/warehouse", { wait: false });
  assert.deepEqual(calls[0], {
    tool: "create_thread",
    args: { agentless: true, snapshotId: "simulation/warehouse", title: "simulation/warehouse" },
  });
  assert.equal(world.threadId, "th_world");
  assert.equal(world.embodimentId, "emb_sim");
});

test("a launch that starts nothing is an error, not a session on nothing", async () => {
  const { cagi } = scripted({ create_thread: { threadId: "th_world", launched: null } });
  await assert.rejects(
    () => cagi.launch("simulation/warehouse", { wait: false }),
    /started no embodiment/,
  );
});

test("typed vocabulary methods are act() on the session's OWN thread and embodiment", async () => {
  const { cagi, calls } = scripted({});
  const s = cagi.session("th_world", "emb_1");
  await s.sim.ik({ target: [0.3, 0, 0.4], robotId: "arm" });
  await s.desktop.click({ x: 10, y: 20 });
  await s.sim.reset();
  assert.deepEqual(
    calls.map((c) => c.args),
    [
      {
        embodimentId: "emb_1",
        action: "ik",
        payload: { target: [0.3, 0, 0.4], robotId: "arm" },
        threadId: "th_world",
      },
      { embodimentId: "emb_1", action: "click", payload: { x: 10, y: 20 }, threadId: "th_world" },
      { embodimentId: "emb_1", action: "reset", payload: {}, threadId: "th_world" },
    ],
  );
  assert.ok(calls.every((c) => c.tool === "act"));
});

test("stop() kills the run only for a world the session launched", async () => {
  const { cagi, calls } = scripted({
    create_thread: { threadId: "th_world", launched: { embodimentId: "emb_sim" } },
  });
  await cagi.session("th_other", "emb_x").stop();
  assert.equal(calls.length, 0, "an attached session must not kill someone else's thread");
  const world = await cagi.launch("simulation/warehouse", { wait: false });
  await world.stop();
  assert.deepEqual(calls.at(-1), { tool: "kill_process", args: { pid: "thread:th_world" } });
});

test("ready() resolves once the embodiment declares controls", async () => {
  let n = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const controls =
      body.params.name === "list_controls" && ++n >= 2
        ? [{ channelId: "ctrl", actions: ["reset"] }]
        : [];
    return {
      async json() {
        return {
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: JSON.stringify({ controls }) }] },
        };
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  const cagi = new CommandAGI({ apiKey: "cagi_test", fetchImpl });
  const controls = await cagi.session("th", "emb").ready({ pollMs: 1 });
  assert.deepEqual(controls, [{ channelId: "ctrl", actions: ["reset"] }]);
});
