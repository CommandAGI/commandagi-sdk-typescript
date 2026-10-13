// Which 3D service a Kernel calls, and with whose credential. The calls themselves are checked against the real
// service, from the built package (the CommandAGI repository's scripts/release/sdk-check.mjs).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { Kernel, KernelError, kernelWhere, linkedParts } from "./kernel.js";

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
      const failed = { error: "build_failed", status: "failed", reason: "the build failed in 1 feature, so its geometry is not whole: cbore, a hole: hole face not found", failures: [{ feature: "cbore", type: "hole", message: "hole face not found" }] };
      const answers: Record<string, [number, unknown]> = {
        "/export": [200, { content: "ISO-10303-21;" }],
        "/measure": [422, { error: "measures[0]: no such body" }],
        "/interference": [200, { clashes: [], engagements: [], close: [], pairs: 1 }],
        "/tessellate": [422, failed],
        "/sheet": [200, { sheet: "sheet1", format: "pdf", contentBase64: "JVBERg==", dimensions: [] }],
        "/bom": [200, { lines: [], csv: "item\n" }],
        "/observe": [200, { observation: { bodies: [], errors: {} }, meshes: [], meshTris: 0 }],
      };
      const [status, answer] = answers[req.url!]!;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer));
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
    const parts = linkedParts({ "bolt.3d.tsx": { id: "3d-bolt", nodes: {} } });
    assert.equal((await kernel.interference("{}", { clearance: 0.5, parts })).pairs, 1);
    // A build that is not whole is refused, and the refusal lists what failed.
    await assert.rejects(
      kernel.tessellate("{}", 0.1),
      (e: unknown) => e instanceof KernelError && e.status === 422 && e.failures[0]!.feature === "cbore" && /the build failed in 1 feature/.test(e.message),
    );
    assert.deepEqual(seen.slice(0, 3), [
      { url: "/export", auth: "Bearer service-bearer", body: { docText: '{"id":"3d-plate","nodes":{}}', format: "step", bodies: ["body_0"] } },
      { url: "/measure", auth: "Bearer service-bearer", body: { docText: "{}", measures: [{ quantity: "radius", a: { body: "body_9", kind: "edge", index: 0 } }] } },
      { url: "/interference", auth: "Bearer service-bearer", body: { docText: "{}", clearance: 0.5, parts: { "3d:name:bolt.3d.tsx": { docText: '{"id":"3d-bolt","nodes":{}}' } } } },
    ]);
    // A drawing sheet, a bill of materials with an assembly's linked part, and an observation with the caller's own
    // materials table (the density a body's mass uses).
    const mine = [{ id: "6061-T6", densityGCm3: 2.71, source: "mill certificate 4711" }];
    assert.equal((await kernel.sheet("{}", { sheet: "sheet1", format: "pdf" })).contentBase64, "JVBERg==");
    assert.equal((await kernel.bom("{}", { parts: linkedParts({ "plate.3d.tsx": { id: "3d-plate", nodes: {} } }), materials: mine })).csv, "item\n");
    await kernel.observe("{}", { materials: mine });
    assert.deepEqual(seen.slice(-3), [
      { url: "/sheet", auth: "Bearer service-bearer", body: { docText: "{}", sheet: "sheet1", format: "pdf" } },
      { url: "/bom", auth: "Bearer service-bearer", body: { docText: "{}", parts: { "3d:name:plate.3d.tsx": { docText: '{"id":"3d-plate","nodes":{}}' } }, materials: mine } },
      { url: "/observe", auth: "Bearer service-bearer", body: { docText: "{}", digest: "", materials: mine } },
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
