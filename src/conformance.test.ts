import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CAGI_SDK_SPEC, applyPrefix, type SdkMethod, type SdkNamespace } from "@commandagi/core";
import { createCagi, Cagi } from "./index.js";
import { CLI_COMMANDS, helpText, runCli } from "./cli.js";

/**
 * THE FOUR BINDINGS ARE ONE SURFACE — verified, not asserted in prose.
 *
 * `docs/agents/TOOL_ARCHITECTURE.md` claims the JSON tool list, `run_code`'s injected client, this published
 * developer SDK and the `cagi` CLI are the same surface differentiated only by API-key scope. The first two
 * are EMITTED from `CAGI_SDK_SPEC` and so are identical by construction. The other two are hand-written —
 * deliberately, because typed signatures and doc comments ARE the product for a developer, and because the
 * published package carries no runtime dependency on `@commandagi/core` — which makes them the two that can
 * quietly drift. They both did:
 *
 *   - the typed SDK carried `threads.kill`, which was in NO spec, so no agent snippet in either language
 *     could reach it (the old test only checked spec → SDK, never SDK → spec);
 *   - the CLI advertised `threads stop <id>` in its help while implementing `kill`, exposed neither
 *     `memory.*` nor `embodiments act`, and had no test of any kind.
 *
 * So all four directions are pinned here: every spec method exists on the client AND on the CLI, calls the
 * same tool with the same argument keys, and NOTHING public exists on either that the spec doesn't declare.
 * Both checks drive the REAL client and the REAL argv dispatcher through a recording transport rather than
 * reading source, so a method that exists but maps its arguments wrong still fails.
 */

interface Recorded {
  tool: string;
  args: Record<string, unknown>;
}

function recordingClient(threadId = "th_self"): { cagi: Cagi; calls: Recorded[] } {
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
  return { cagi: createCagi({ apiKey: "cagi_test", threadId, fetchImpl }), calls };
}

/** Positional sample values, by param name — chosen so a mis-mapped key is visible in the diff. */
const SAMPLES: Record<string, unknown> = {
  threadId: "th_1",
  text: "hello",
  query: "cameras",
  limit: 5,
  action: { type: "click" },
  integration: "github",
  fileId: "file_9",
  method: "GET",
  path: "/user/repos",
  platform: "tiktok",
  account: "@brand",
  // `run`'s snippet + its language: the CLI infers the language from the FILE EXTENSION, so these two
  // have to agree with the `.py` temp file written below or the CLI check fails on `language`.
  code: "print('hi')",
  language: "python",
};

/**
 * The options bag a spread param gets, per tool. Keys must be ones the tool genuinely accepts —
 * asserting that `post` forwards a `body` key would test the fixture's imagination, not the SDK.
 */
function optsFor(m: SdkMethod): Record<string, unknown> {
  switch (m.tool) {
    case "post":
      return { caption: "cap", title: "t", privacy: "public" };
    case "integration_call":
      return { body: { a: 1 }, query: { q: "1" }, headers: { "x-t": "1" } };
    default:
      // The pass-through tools (create_thread, launch_embodiment, observe, memory_*) forward the bag whole.
      return { label: "x", kind: "computer" };
  }
}

function callOn(target: any, m: SdkMethod): unknown {
  const args = (m.params ?? []).map((p) => (p.spread ? optsFor(m) : (SAMPLES[p.name] ?? p.name)));
  assert.equal(typeof target[m.name], "function", `the typed SDK is missing ${m.name}()`);
  return target[m.name](...args);
}

/** What the spec says the resulting tool arguments should be, independent of the SDK's implementation. */
function expectedArgs(m: SdkMethod, bound: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(m.bound ?? {})) out[key] = bound[param];
  for (const p of m.params ?? []) {
    if (p.spread) Object.assign(out, optsFor(m));
    else out[p.key ?? p.name] = applyPrefix(p, SAMPLES[p.name] ?? p.name);
  }
  // withThread methods add threadId when absent — the spec says so, so expect it.
  if (m.withThread && out.threadId === undefined) out.threadId = "th_self";
  return out;
}

function assertArgs(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  where: string,
): void {
  // Undefined-valued optional keys are noise; compare only what the spec pins.
  for (const [k, v] of Object.entries(expected)) {
    assert.deepEqual(actual[k], v, `${where} → arg '${k}' mismatched`);
  }
}

// ─── spec → typed SDK ──────────────────────────────────────────────────────────

test("every spec namespace method exists on the typed SDK and maps to the same tool + args", async () => {
  for (const ns of CAGI_SDK_SPEC.namespaces) {
    if (ns.factory) continue; // factories are covered below
    for (const m of ns.methods) {
      const { cagi, calls } = recordingClient();
      const target = (cagi as any)[ns.name];
      assert.ok(target, `the typed SDK is missing the ${ns.name} namespace`);
      await callOn(target, m);
      assert.equal(calls.length, 1, `cagi.${ns.name}.${m.name} made ${calls.length} calls`);
      assert.equal(calls[0]!.tool, m.tool, `cagi.${ns.name}.${m.name} called the wrong tool`);
      assertArgs(calls[0]!.args, expectedArgs(m), `cagi.${ns.name}.${m.name}`);
    }
  }
});

test("every spec root method exists on the typed SDK with the same mapping", async () => {
  for (const m of CAGI_SDK_SPEC.root) {
    const { cagi, calls } = recordingClient();
    await callOn(cagi, m);
    assert.equal(calls[0]!.tool, m.tool, `cagi.${m.name} called the wrong tool`);
    assertArgs(calls[0]!.args, expectedArgs(m), `cagi.${m.name}`);
  }
});

test("factory namespaces bind their own params into every call (cagi.social)", async () => {
  for (const ns of CAGI_SDK_SPEC.namespaces.filter((n) => n.factory)) {
    const boundValues = Object.fromEntries(
      (ns.factory ?? []).map((p) => [p.name, SAMPLES[p.name] ?? p.name]),
    );
    for (const m of ns.methods) {
      const { cagi, calls } = recordingClient();
      const facade = (cagi as any)[ns.name](
        ...(ns.factory ?? []).map((p) => SAMPLES[p.name] ?? p.name),
      );
      await callOn(facade, m);
      assert.equal(calls[0]!.tool, m.tool, `cagi.${ns.name}().${m.name} called the wrong tool`);
      assertArgs(calls[0]!.args, expectedArgs(m, boundValues), `cagi.${ns.name}().${m.name}`);
    }
  }
});

// ─── typed SDK → spec (the direction that was missing) ─────────────────────────

/**
 * Transport primitives every binding hand-writes, so they are deliberately absent from the spec:
 * `call` (the escape hatch) and `withThread` (its private helper). Anything else public on the client
 * is a capability, and a capability that only ONE binding has is the drift this file exists to stop.
 */
const NOT_SUGAR = new Set(["constructor", "call", "withThread"]);

test("the typed SDK exposes NOTHING the spec doesn't declare — drift is caught in both directions", () => {
  const { cagi } = recordingClient();
  const factories = new Set(CAGI_SDK_SPEC.namespaces.filter((n) => n.factory).map((n) => n.name));
  const namespaces = new Map(CAGI_SDK_SPEC.namespaces.map((n) => [n.name, n] as const));
  const rootNames = new Set(CAGI_SDK_SPEC.root.map((m) => m.name));

  for (const name of Object.getOwnPropertyNames(Cagi.prototype)) {
    if (NOT_SUGAR.has(name)) continue;
    assert.ok(
      rootNames.has(name) || factories.has(name),
      `cagi.${name}() is not in CAGI_SDK_SPEC — no agent snippet can reach it`,
    );
  }
  for (const [name, value] of Object.entries(cagi as unknown as Record<string, unknown>)) {
    if (NOT_SUGAR.has(name) || typeof value !== "object" || value === null) continue;
    const ns = namespaces.get(name);
    assert.ok(ns, `the cagi.${name} namespace is not in CAGI_SDK_SPEC`);
    const declared = new Set(ns.methods.map((m) => m.name));
    for (const method of Object.keys(value as Record<string, unknown>)) {
      assert.ok(
        declared.has(method),
        `cagi.${name}.${method}() is not in CAGI_SDK_SPEC — no agent snippet can reach it`,
      );
    }
  }
  for (const ns of CAGI_SDK_SPEC.namespaces.filter((n) => n.factory)) {
    const facade = (cagi as any)[ns.name]("tiktok", "@brand");
    const declared = new Set(ns.methods.map((m) => m.name));
    for (const method of Object.keys(facade)) {
      assert.ok(declared.has(method), `cagi.${ns.name}().${method}() is not in CAGI_SDK_SPEC`);
    }
  }
});

// ─── spec ↔ CLI ────────────────────────────────────────────────────────────────

/** Every spec method, flattened with the namespace it belongs to (`""` for a root method). */
function allMethods(): { group: string; ns?: SdkNamespace; m: SdkMethod }[] {
  return [
    ...CAGI_SDK_SPEC.root.map((m) => ({ group: "", m })),
    ...CAGI_SDK_SPEC.namespaces.flatMap((ns) => ns.methods.map((m) => ({ group: ns.name, ns, m }))),
  ];
}

test("the CLI command table is exactly the spec — no missing verb, no invented one", () => {
  const specKeys = allMethods()
    .map(({ group, m }) => `${group}:${m.name}`)
    .sort();
  const cliKeys = CLI_COMMANDS.map((c) => `${c.group}:${c.verb}`).sort();
  assert.deepEqual(
    cliKeys,
    specKeys,
    "the cagi CLI and CAGI_SDK_SPEC disagree about which commands exist",
  );

  for (const { group, m } of allMethods()) {
    const cmd = CLI_COMMANDS.find((c) => c.group === group && c.verb === m.name)!;
    assert.equal(cmd.tool, m.tool, `cagi ${group} ${m.name} points at the wrong tool`);
    assert.equal(
      !!cmd.spread,
      !!(m.params ?? []).some((p) => p.spread),
      `cagi ${group} ${m.name} disagrees about its options bag`,
    );
  }
});

test("the help text is rendered from the table, so it lists every command and invents none", () => {
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
    assert.ok(help.includes(line), `\`${line}\` is missing from commandagi help`);
  }
  // The regression that motivated this: help advertised a verb that did not exist.
  assert.ok(
    !help.includes("threads stop"),
    "help advertises `threads stop`, which is not a command",
  );
});

/** Build the argv a command expects, from the same SAMPLES the SDK checks use. */
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

test("every CLI command drives the same tool with the same arguments as the SDK", async () => {
  // `run` reads its snippet off disk, and its language comes from the extension — so the fixture is a
  // real `.py` file whose contents are the sampled code.
  const codeFile = join(mkdtempSync(join(tmpdir(), "cagi-cli-")), "snippet.py");
  writeFileSync(codeFile, String(SAMPLES.code));

  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write; // the CLI prints its result envelope
  try {
    for (const { group, ns, m } of allMethods()) {
      const cmd = CLI_COMMANDS.find((c) => c.group === group && c.verb === m.name)!;
      const argv = argvFor(cmd, codeFile);
      if (cmd.spread) argv.push("--json", JSON.stringify(optsFor(m)));
      const { cagi, calls } = recordingClient();
      await runCli(argv, cagi);
      const where = `\`cagi ${argv.join(" ")}\``;
      assert.equal(calls.length, 1, `${where} made ${calls.length} calls`);
      assert.equal(calls[0]!.tool, m.tool, `${where} called the wrong tool`);
      const bound = Object.fromEntries(
        (ns?.factory ?? []).map((p) => [p.name, SAMPLES[p.name] ?? p.name]),
      );
      assertArgs(calls[0]!.args, expectedArgs(m, bound), where);
    }
  } finally {
    process.stdout.write = write;
  }
});

test("a flag with nowhere to go is an error, not a silent no-op", async () => {
  const { cagi, calls } = recordingClient();
  await assert.rejects(
    () => runCli(["threads", "get", "th_1", "--intent", "x"], cagi),
    /unknown flag/,
  );
  assert.equal(
    calls.length,
    0,
    "the call must not be dispatched when an argument was not understood",
  );
});
