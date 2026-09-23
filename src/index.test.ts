import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, CommandAGI, CommandAGIError } from "./index.js";

/** A fake fetch that records the last request and returns a canned MCP tools/call envelope. */
function fakeFetch(reply: unknown, opts: { isError?: boolean } = {}) {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return {
      async json() {
        return {
          jsonrpc: "2.0",
          id: 1,
          result: {
            isError: opts.isError ?? false,
            content: [{ type: "text", text: JSON.stringify(reply) }],
          },
        };
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { f, calls };
}

test("call() posts a JSON-RPC tools/call to /mcp with the bearer + parses the text result", async () => {
  const { f, calls } = fakeFetch({ ok: true, threads: [] });
  const cagi = createClient({
    apiKey: "cagi_test",
    baseUrl: "https://api.example.com/",
    fetchImpl: f,
  });
  const res = await cagi.call<{ ok: boolean }>("list_threads", { a: 1 });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.example.com/mcp"); // trailing slash trimmed
  assert.equal(calls[0]!.body.method, "tools/call");
  assert.equal(calls[0]!.body.params.name, "list_threads");
  assert.deepEqual(calls[0]!.body.params.arguments, { a: 1 });
});

test("threadId auto-fills for self-thread helpers but not for explicit ids", async () => {
  const { f, calls } = fakeFetch({ ok: true });
  const cagi = new CommandAGI({ apiKey: "cagi_test", threadId: "th_123", fetchImpl: f });
  await cagi.embodiments.observe();
  assert.equal(calls[0]!.body.params.arguments.threadId, "th_123");
  await cagi.embodiments.observe({ threadId: "th_other" });
  assert.equal(calls[1]!.body.params.arguments.threadId, "th_other");
});

test("social(platform, account).post maps to the post tool with the account bound", async () => {
  const { f, calls } = fakeFetch({ ok: true, id: "vid1" });
  const cagi = createClient({ apiKey: "cagi_test", fetchImpl: f });
  await cagi.social("tiktok", "@brand").post("file_9", { privacy: "public", caption: "hi" });
  const a = calls[0]!.body.params.arguments;
  assert.equal(calls[0]!.body.params.name, "post");
  assert.deepEqual(
    { integration: a.integration, account: a.account, fileId: a.fileId, privacy: a.privacy },
    {
      integration: "tiktok",
      account: "@brand",
      fileId: "file_9",
      privacy: "public",
    },
  );
});

test("an isError result throws a CommandAGIError carrying the tool name", async () => {
  const { f } = fakeFetch({ error: "tool_not_allowed" }, { isError: true });
  const cagi = createClient({ apiKey: "cagi_test", fetchImpl: f });
  await assert.rejects(
    () => cagi.call("kill_process", { pid: "thread:x" }),
    (e) => e instanceof CommandAGIError && e.tool === "kill_process",
  );
});
