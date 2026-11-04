// The local host a Kernel starts: the first whose 3D service is installed. Its own file, because the SDK finds the
// local host once a process.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Kernel } from "./kernel.js";

/** A stand-in `commandagi` on PATH: `threed status` says `installed`, `threed serve` names `url` and waits on stdin. */
function host(installed: boolean, url: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "cagi-host-"));
  const file = path.join(dir, "commandagi");
  writeFileSync(
    file,
    `#!/bin/sh
if [ "$1 $2" = "threed status" ]; then echo '{"installed":${installed}}'; exit 0; fi
if [ "$1 $2" = "threed serve" ]; then echo '{"url":"${url}"}'; exec cat; fi
exit 2
`,
  );
  chmodSync(file, 0o755);
  return dir;
}

test("a host without its 3D service does not hide one further on PATH that has it", { skip: process.platform === "win32" }, async () => {
  const server = createServer((req, res) => {
    req.resume().on("end", () => {
      res.writeHead(req.url === "/v1/export" ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify(req.url === "/v1/export" ? { outputs: {}, result: { content: "FROM-THE-SECOND" }, ran: { kernel: "3d", build: "sha256:fixture", place: "local" } } : { error: "no_such_op" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const first = host(false, "http://127.0.0.1:1");
  const second = host(true, url);
  const saved = { ...process.env };
  try {
    for (const k of Object.keys(process.env)) if (k.startsWith("COMMANDAGI_")) delete process.env[k];
    Object.assign(process.env, { COMMANDAGI_THREED: "local", PATH: [first, second, ...(saved.PATH ?? "").split(path.delimiter)].join(path.delimiter) });
    assert.equal(await new Kernel().export("{}"), "FROM-THE-SECOND");
  } finally {
    process.env = saved;
    server.close();
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
