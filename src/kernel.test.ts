// Where a Kernel's call runs, with whose credential, and what it records about where it ran. Fakes stand only for the
// 3D service and the platform's door (an edge this suite cannot run); the placement is the real one (./kernels.ts).
// The calls themselves are checked against the real service, from the built package (the CommandAGI repository's
// scripts/release/sdk-check.mjs).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { test } from "node:test";
import { Kernel, KernelError, kernelWhere, linkedParts } from "./kernel.js";

type Seen = { url?: string; method?: string; auth?: string; body: any };

/** A fake kernel: `answers[path]` → [status, body]; it records each request. */
async function fake(answers: Record<string, [number, unknown]>): Promise<{ url: string; seen: Seen[]; server: Server }> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      seen.push({ url: req.url, method: req.method, auth: req.headers.authorization, body: text ? JSON.parse(text) : null });
      const [status, answer] = answers[req.url!] ?? [404, { error: "no_such_op" }];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, seen, server };
}

const input = (text: string) => ({ id: createHash("sha256").update(text).digest("hex"), bytes: Buffer.from(text).toString("base64") });
const ran = (place: string) => ({ kernel: "3d", build: "sha256:fixture", place });

/** Run `body` with only these COMMANDAGI_* variables set, then restore the environment. */
async function withEnv(vars: Record<string, string>, body: () => Promise<void>) {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith("COMMANDAGI_")) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    await body();
  } finally {
    process.env = saved;
  }
}

test("one setting places the kernel: an argument, then a running service's URL, then COMMANDAGI_THREED, then local and cloud", () => {
  assert.deepEqual(kernelWhere(undefined, {}), { places: ["local", "cloud"] });
  assert.deepEqual(kernelWhere(undefined, { COMMANDAGI_THREED: "cloud" }), { places: ["cloud"] });
  assert.deepEqual(kernelWhere(undefined, { COMMANDAGI_THREED: "cloud, local" }), { places: ["cloud", "local"] });
  assert.deepEqual(kernelWhere(undefined, { COMMANDAGI_THREED: "local", COMMANDAGI_THREED_URL: "http://127.0.0.1:8091/" }), { places: ["local"], url: "http://127.0.0.1:8091" });
  assert.deepEqual(kernelWhere("cloud", { COMMANDAGI_THREED: "local" }), { places: ["cloud"] });
  assert.throws(() => kernelWhere(undefined, { COMMANDAGI_THREED: "platform" }), /a list of "local" and "cloud"/);
  assert.throws(() => kernelWhere(undefined, { COMMANDAGI_THREED: "local,local" }), /a list of "local" and "cloud"/);
});

test("a running service gets the contract with its own bearer, never the account's key, and its answer is recorded as local", async () => {
  const failed = { error: "build_failed", status: "failed", reason: "the build failed in 1 feature, so its geometry is not whole: cbore, a hole: hole face not found", failures: [{ feature: "cbore", type: "hole", message: "hole face not found" }] };
  // The service claims the cloud. The placement records where the request went.
  const svc = await fake({
    "/v1/export": [200, { outputs: {}, result: { content: "ISO-10303-21;" }, ran: ran("cloud") }],
    "/v1/measure": [422, { error: "measures[0]: no such body", ran: ran("local") }],
    "/v1/interference": [200, { outputs: {}, result: { clashes: [], engagements: [], close: [], pairs: 1 }, ran: ran("local") }],
    "/v1/tessellate": [422, { ...failed, ran: ran("local") }],
    "/v1/sheet": [200, { outputs: {}, result: { sheet: "sheet1", format: "pdf", contentBase64: "JVBERg==", dimensions: [] }, ran: ran("local") }],
    "/v1/bom": [200, { outputs: {}, result: { lines: [], csv: "item\n" }, ran: ran("local") }],
    "/v1/observe": [200, { outputs: {}, result: { observation: { bodies: [], errors: {} }, meshes: [], meshTris: 0 }, ran: ran("local") }],
    "/v1/check": [200, { outputs: {}, result: { declared: true, checks: [{ id: "clash", kind: "interference", status: "passed", findings: 0, limits: [] }], findings: [], errors: 0, warnings: 0, suppressed: 0, accepts: [], problems: 0 }, ran: ran("local") }],
  });
  try {
    await withEnv({ COMMANDAGI_API_KEY: "cagi_account", COMMANDAGI_THREED_URL: svc.url, COMMANDAGI_THREED_TOKEN: "service-bearer" }, async () => {
      const kernel = new Kernel();
      assert.equal(await kernel.export({ id: "3d-plate", nodes: {} }, "step", { bodies: ["body_0"] }), "ISO-10303-21;");
      assert.deepEqual(kernel.lastRan, { kernel: "3d", build: "sha256:fixture", place: "local" });
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
      const mine = [{ id: "6061-T6", densityGCm3: 2.71, source: "mill certificate 4711" }];
      assert.equal((await kernel.sheet("{}", { sheet: "sheet1", format: "pdf" })).contentBase64, "JVBERg==");
      assert.equal((await kernel.bom("{}", { parts: linkedParts({ "plate.3d.tsx": { id: "3d-plate", nodes: {} } }), materials: mine })).csv, "item\n");
      await kernel.observe("{}", { materials: mine });
      assert.equal((await kernel.check("{}")).checks[0]!.status, "passed");
      assert.ok(svc.seen.every((s) => s.auth === "Bearer service-bearer"), "the account's key never reaches a service on this computer");
      assert.deepEqual(svc.seen.map((s) => [s.url, s.body]), [
        ["/v1/export", { inputs: { doc: input('{"id":"3d-plate","nodes":{}}') }, params: { format: "step", bodies: ["body_0"] } }],
        ["/v1/measure", { inputs: { doc: input("{}") }, params: { measures: [{ quantity: "radius", a: { body: "body_9", kind: "edge", index: 0 } }] } }],
        ["/v1/interference", { inputs: { doc: input("{}") }, params: { clearance: 0.5, parts: { "3d:name:bolt.3d.tsx": { docText: '{"id":"3d-bolt","nodes":{}}' } } } }],
        ["/v1/tessellate", { inputs: { doc: input("{}") }, params: { deflection: 0.1 } }],
        ["/v1/sheet", { inputs: { doc: input("{}") }, params: { sheet: "sheet1", format: "pdf" } }],
        ["/v1/bom", { inputs: { doc: input("{}") }, params: { parts: { "3d:name:plate.3d.tsx": { docText: '{"id":"3d-plate","nodes":{}}' } }, materials: mine } }],
        ["/v1/observe", { inputs: { doc: input("{}") }, params: { digest: "", materials: mine } }],
        ["/v1/check", { inputs: { doc: input("{}") }, params: {} }],
      ]);
    });
  } finally {
    svc.server.close();
  }
});

test("local, then cloud: a local refusal is the answer, and a place with no kernel passes to the cloud's door with the account's key", async () => {
  const local = await fake({
    "/v1/export": [422, { error: "build_failed", status: "failed", reason: "the build failed", failures: [{ feature: "f1", message: "x" }], ran: ran("local") }],
  });
  const cloud = await fake({
    "/kernels/3d/v1/export": [200, { outputs: {}, result: { content: "CLOUD" }, ran: ran("cloud") }],
    "/kernels/3d/v1/measure": [200, { outputs: {}, result: { results: [{ value: 2 }] }, ran: ran("cloud") }],
  });
  try {
    // The local service refuses the op: that is the answer, and nothing goes to the cloud.
    await withEnv({ COMMANDAGI_API_KEY: "cagi_account", COMMANDAGI_BASE_URL: cloud.url, COMMANDAGI_THREED: "local,cloud" }, async () => {
      const kernel = new Kernel({ where: local.url, token: "service-bearer" });
      await assert.rejects(kernel.export("{}"), (e: unknown) => e instanceof KernelError && e.status === 422 && e.failures[0]!.feature === "f1");
      assert.equal(cloud.seen.length, 0, "a refusal of the op is never sent to the next place");
    });
    // No local host is installed (none beside this package, none on PATH): the cloud answers.
    await withEnv({ COMMANDAGI_API_KEY: "cagi_account", COMMANDAGI_BASE_URL: cloud.url, COMMANDAGI_THREED: "local,cloud", PATH: "" }, async () => {
      const kernel = new Kernel();
      assert.equal((await kernel.measure("{}", "radius", { body: "body_0", kind: "edge", index: 0 })).value, 2);
      assert.deepEqual(kernel.lastRan, { kernel: "3d", build: "sha256:fixture", place: "cloud" });
      assert.deepEqual(cloud.seen.map((s) => [s.url, s.auth]), [["/kernels/3d/v1/measure", "Bearer cagi_account"]]);
      assert.deepEqual(cloud.seen[0]!.body.inputs, { doc: input("{}") });
    });
    // No key and no local kernel: no place runs it, and the error says why for each place.
    await withEnv({ COMMANDAGI_THREED: "local,cloud", PATH: "" }, async () => {
      await assert.rejects(new Kernel().export("{}"), (e: unknown) => e instanceof KernelError && e.status === 503 && /kernel_unavailable: no place ran 3d export: local: the local 3D service is not installed: it is the local host.s \(npm install -g @commandagi\/host, then commandagi threed install\); cloud: no such place here/.test(e.message));
    });
  } finally {
    local.server.close();
    cloud.server.close();
  }
});

test("a running service named by URL asks for its bearer", async () => {
  await withEnv({ COMMANDAGI_THREED_URL: "http://127.0.0.1:1" }, async () => {
    assert.throws(() => new Kernel(), /asks for its bearer/);
  });
});
