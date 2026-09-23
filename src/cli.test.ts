import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandAGI } from "./client.js";
import { CLI_COMMANDS, SDK_SCHEMA } from "./generated.js";
import { helpText, runCli } from "./cli.js";

/**
 * The CLI table is GENERATED from the schema, so it cannot drift from the SDK by construction. What still
 * needs a test is the hand-written DISPATCHER: that an argv resolves every row's params the way the row
 * says and lands on the right tool with the right arguments. These drive the REAL dispatcher through a
 * recording transport — a table that merely looks right is worth nothing.
 */

interface Recorded {
  tool: string;
  args: Record<string, unknown>;
}

function recordingClient(threadId = "th_self"): { cagi: CommandAGI; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ tool: body.params.name, args: body.params.arguments ?? {} });
    return {
      async json() {
        return { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "{}" }] } };
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { cagi: new CommandAGI({ apiKey: "cagi_test", threadId, fetchImpl }), calls };
}

/** Sample values by param name — distinct, so a mis-mapped key shows up in the diff. */
const SAMPLES: Record<string, unknown> = {
  threadId: "th_1",
  embodimentId: "emb_1",
  text: "hello",
  query: "cameras",
  limit: 5,
  action: "click",
  payload: { x: 10, y: 20 },
  integration: "github",
  fileId: "file_9",
  method: "GET",
  path: "/user/repos",
  platform: "tiktok",
  account: "@brand",
  code: "print('hi')",
  language: "python",
};

type SchemaMethod = (typeof SDK_SCHEMA.tools.root)[number];
type SchemaParam = SchemaMethod["params"][number];

function allMethods() {
  return [
    ...SDK_SCHEMA.tools.root.map((m) => ({ group: "", factory: null, m })),
    ...SDK_SCHEMA.tools.namespaces.flatMap((ns) =>
      ns.methods.map((m) => ({ group: ns.name, factory: ns.factory, m })),
    ),
  ];
}

const OPTS = { label: "x", kind: "computer" };

/** What the schema says the resulting tool arguments are — independent of the SDK's implementation. */
function expectedArgs(m: SchemaMethod): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, from] of Object.entries(m.bound as Record<string, string>))
    out[key] = SAMPLES[from];
  for (const p of m.params as readonly SchemaParam[]) {
    if (p.spread) Object.assign(out, OPTS);
    else if (p.key === "threadId" && !p.required)
      continue; // the self-thread default, asserted below
    else {
      const v = SAMPLES[p.name] ?? p.name;
      out[p.key!] = p.prefix ? p.prefix + String(v) : v;
    }
  }
  if (m.withThread && out.threadId === undefined) out.threadId = "th_self";
  return out;
}

function argvFor(cmd: (typeof CLI_COMMANDS)[number], codeFile: string): string[] {
  const argv: string[] = [];
  if (cmd.group) argv.push(cmd.group);
  for (const f of cmd.factory ?? [])
    if (f.from === "positional") argv.push(String(SAMPLES[f.name] ?? f.name));
  argv.push(cmd.verb);
  const flags: string[] = [];
  for (const f of cmd.factory ?? [])
    if (f.from === "flag") flags.push(`--${f.name}`, String(SAMPLES[f.name] ?? f.name));
  for (const p of cmd.params ?? []) {
    // An optional trailing `threadId` is the self-thread override; leaving it off exercises the default.
    if (p.name === "threadId" && p.from === "flag") continue;
    const sample = SAMPLES[p.name] ?? p.name;
    switch (p.from ?? "positional") {
      case "flag":
        flags.push(`--${p.name}`, String(sample));
        break;
      case "language":
        break; // inferred from the file extension — asserting that inference is the point
      case "file":
        argv.push(codeFile);
        break;
      case "json":
        argv.push(JSON.stringify(sample));
        break;
      default:
        argv.push(String(sample));
    }
  }
  return [...argv, ...flags];
}

test("every CLI command drives the tool its schema row names, with the schema's arguments", async () => {
  const codeFile = join(mkdtempSync(join(tmpdir(), "commandagi-cli-")), "snippet.py");
  writeFileSync(codeFile, String(SAMPLES.code));
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    for (const { group, m } of allMethods()) {
      const cmd = CLI_COMMANDS.find((c) => c.group === group && c.verb === m.name);
      assert.ok(cmd, `no CLI row for ${group} ${m.name}`);
      const argv = argvFor(cmd, codeFile);
      if (cmd.spread) argv.push("--json", JSON.stringify(OPTS));
      const { cagi, calls } = recordingClient();
      await runCli(argv, cagi);
      const where = `\`commandagi ${argv.join(" ")}\``;
      assert.equal(calls.length, 1, `${where} made ${calls.length} calls`);
      assert.equal(calls[0]!.tool, m.tool, `${where} called the wrong tool`);
      assert.deepEqual(calls[0]!.args, expectedArgs(m), where);
    }
  } finally {
    process.stdout.write = write;
  }
});

test("help is rendered from the generated table: every command, nothing invented", () => {
  const help = helpText();
  for (const c of CLI_COMMANDS) {
    const line = [
      "commandagi",
      c.group,
      c.factory?.some((f) => f.from === "positional") ? `<${c.factory[0]!.name}>` : "",
      c.verb,
    ]
      .filter(Boolean)
      .join(" ");
    assert.ok(help.includes(line), `\`${line}\` is missing from help`);
  }
  assert.ok(!help.includes("threads stop"), "help advertises a verb that does not exist");
  assert.match(help, /COMMANDAGI_API_KEY/);
});

test("a flag with nowhere to go is an error, and nothing is dispatched", async () => {
  const { cagi, calls } = recordingClient();
  await assert.rejects(
    () => runCli(["threads", "get", "th_1", "--intent", "x"], cagi),
    /unknown flag/,
  );
  assert.equal(calls.length, 0);
});
