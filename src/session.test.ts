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

test("a computer's screenshot and action answers keep their images (the agent sees what it acts on)", async () => {
  const png = btoa("PNG-bytes");
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const answers: Record<string, unknown[]> = {
    computer_screenshot: [{ type: "text", text: "frame f-1a2b3c4d 1280×720; coordinates are its pixels" }, { type: "image", data: png, mimeType: "image/png" }],
    computer_act: [{ type: "text", text: JSON.stringify({ status: "sent", changed: true, region: { x: 1, y: 2, width: 3, height: 4 } }) }, { type: "image", data: png, mimeType: "image/png" }],
  };
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ tool: body.params.name, args: body.params.arguments });
    return { async json() { return { jsonrpc: "2.0", id: 1, result: { content: answers[body.params.name] } }; } } as unknown as Response;
  }) as unknown as typeof fetch;
  const s = new CommandAGI({ apiKey: "cagi_test", fetchImpl }).session("th_world", "emb_pc");
  const shot = await s.screenshot();
  assert.match(shot.text, /1280×720/);
  assert.equal(new TextDecoder().decode(shot.image), "PNG-bytes");
  const done = await s.computer("click", { x: 412, y: 300 });
  assert.deepEqual((done.result as { changed: boolean }).changed, true);
  assert.equal(done.mimeType, "image/png");
  assert.deepEqual(calls.map((c) => [c.tool, c.args]), [
    ["computer_screenshot", { threadId: "th_world", embodimentId: "emb_pc" }],
    ["computer_act", { threadId: "th_world", embodimentId: "emb_pc", action: "click", payload: { x: 412, y: 300 } }],
  ]);
});

/** A WebSocket the test speaks for: every socket a session opens, and a way to send it a message. */
function fakeSockets() {
  const opened: { url: string; send(m: unknown): void }[] = [];
  class Fake {
    private on = new Map<string, ((ev: { data: string }) => void)[]>();
    constructor(public url: string) {
      opened.push({ url, send: (m) => (this.on.get("message") ?? []).forEach((f) => f({ data: JSON.stringify(m) })) });
    }
    addEventListener(type: string, f: (ev: { data: string }) => void) {
      this.on.set(type, [...(this.on.get(type) ?? []), f]);
    }
    close() {}
  }
  const real = globalThis.WebSocket;
  (globalThis as { WebSocket: unknown }).WebSocket = Fake;
  return { opened, restore: () => ((globalThis as { WebSocket: unknown }).WebSocket = real) };
}

test("a simulation's frames are kept by channel: the camera's picture, its depth, another camera; fresh waits for the next", async () => {
  const sockets = fakeSockets();
  try {
    const { cagi } = scripted({});
    const s = cagi.session("th_world", "emb_sim");
    const first = s.frame({ timeoutMs: 1_000 });
    const [ws] = sockets.opened;
    assert.match(ws!.url, /\/rt\/thread\/th_world\?token=cagi_test$/);
    const jpeg = "data:image/jpeg;base64,/9j/AA==", png = "data:image/png;base64,iVBORw==";
    ws!.send({ t: "data", embodimentId: "emb_sim", channelId: "depth", kind: "depth", format: "image/png", url: png, at: 1 });
    ws!.send({ t: "frame", embodimentId: "emb_other", channelId: "cam-head", url: "data:image/jpeg;base64,AA==", at: 2 });
    ws!.send({ t: "frame", embodimentId: "emb_sim", channelId: "cam-head", url: jpeg, at: 3 });
    assert.equal((await first).url, jpeg, "a depth image is not the picture a plain frame() answers, nor another embodiment's");
    ws!.send({ t: "frame", embodimentId: "emb_sim", channelId: "top", url: "data:image/jpeg;base64,/9j/AQ==", at: 4 });
    assert.equal((await s.frame({ channel: "cam-head" })).url, jpeg, "a channel's own newest");
    assert.equal((await s.frame({ channel: "depth" })).url, png);
    assert.deepEqual([...(await s.observe({ channel: "depth" }))], [0x89, 0x50, 0x4e, 0x47]);
    const fresh = s.frame({ fresh: true, channel: "cam-head", timeoutMs: 1_000 });
    ws!.send({ t: "frame", embodimentId: "emb_sim", channelId: "top", url: "data:image/jpeg;base64,/9j/Ag==", at: 5 });
    ws!.send({ t: "frame", embodimentId: "emb_sim", channelId: "cam-head", url: "data:image/jpeg;base64,/9j/Aw==", at: 6 });
    assert.equal((await fresh).at, 6, "fresh is the next frame of that channel");
    await assert.rejects(() => s.frame({ fresh: true, channel: "depth", timeoutMs: 50 }), /no frame from emb_sim on depth within 50ms/);
    s.close();
  } finally {
    sockets.restore();
  }
});
