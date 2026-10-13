// Which 3D service a Kernel calls, and with whose credential. The calls themselves are checked against the real
// service, from the built package (the CommandAGI repository's scripts/release/sdk-check.mjs).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Kernel, KernelError, kernelWhere } from "./kernel.js";

test("one setting chooses the service: an argument, then a running service's URL, then COMMANDAGI_THREED, then the platform", () => {
  assert.equal(kernelWhere(undefined, {}), "platform");
  assert.equal(kernelWhere(undefined, { COMMANDAGI_THREED: "local" }), "local");
  assert.equal(kernelWhere(undefined, { COMMANDAGI_THREED: "local", COMMANDAGI_THREED_URL: "http://127.0.0.1:8091/" }), "http://127.0.0.1:8091");
  assert.equal(kernelWhere("platform", { COMMANDAGI_THREED: "local" }), "platform");
  assert.throws(() => kernelWhere(undefined, { COMMANDAGI_THREED: "cloud" }), /"platform", "local" or the URL/);
});

test("a service on this computer gets its own bearer and never the account's API key", async () => {
  const seen: { url?: string; auth?: string; body: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(text) });
      res.writeHead(req.url === "/export" ? 200 : 422, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url === "/export" ? { content: "ISO-10303-21;" } : { error: "no such body" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const saved = { ...process.env };
  try {
    const { port } = server.address() as { port: number };
    process.env.COMMANDAGI_API_KEY = "cagi_account";
    process.env.COMMANDAGI_THREED_URL = `http://127.0.0.1:${port}`;
    process.env.COMMANDAGI_THREED_TOKEN = "service-bearer";
    const kernel = new Kernel();
    assert.equal(await kernel.export({ id: "3d-plate", nodes: {} }, "step", { bodies: ["body_0"] }), "ISO-10303-21;");
    await assert.rejects(
      kernel.measure("{}", "radius", { body: "body_9", kind: "edge", index: 0 }),
      (e: unknown) => e instanceof KernelError && e.status === 422 && /no such body/.test(e.message),
    );
    assert.deepEqual(seen, [
      { url: "/export", auth: "Bearer service-bearer", body: { docText: '{"id":"3d-plate","nodes":{}}', format: "step", bodies: ["body_0"] } },
      { url: "/measure", auth: "Bearer service-bearer", body: { docText: "{}", op: "radius", a: { body: "body_9", kind: "edge", index: 0 } } },
    ]);
  } finally {
    process.env = saved;
    server.close();
  }
});

test("the platform is asked with the API key, and refuses by name without one", () => {
  const saved = { ...process.env };
  try {
    delete process.env.COMMANDAGI_API_KEY;
    delete process.env.COMMANDAGI_THREED;
    delete process.env.COMMANDAGI_THREED_URL;
    assert.throws(() => new Kernel(), /needs an API key.*COMMANDAGI_THREED=local/);
  } finally {
    process.env = saved;
  }
});
