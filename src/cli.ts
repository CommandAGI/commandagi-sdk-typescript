#!/usr/bin/env node
/**
 * `commandagi` — the CommandAGI CLI: the same surface as the SDK, from a terminal (and from inside the
 * platform's own agent runtimes, which inject the same environment).
 *
 * Auth is the SDK's: a `cagi_…` API key in $COMMANDAGI_API_KEY whose scopes decide reach — a developer's
 * broad key or an agent's session-restricted key, no code difference. Every command prints JSON, so it
 * pipes through jq and into scripts.
 *
 * THE COMMAND TABLE IS GENERATED (`CLI_COMMANDS` in ./generated.ts, one row per schema method), and help is
 * rendered from it, so the CLI cannot advertise or implement anything the SDK does not. This file is only
 * the argv dispatcher: it resolves a row's params from the command line and calls the TYPED METHOD.
 *
 * One flag rule, everywhere: A FLAG IS THE TOOL'S OWN ARGUMENT NAME. `--fileId`, not `--file`; nothing is
 * aliased or renamed on the way through, so what you type is what the tool receives.
 *
 *   commandagi whoami
 *   commandagi threads list
 *   commandagi threads create --intent "research X"
 *   commandagi embodiments act emb_1 click '{"x":10,"y":20}'
 *   commandagi call <tool> --json '{...}'          # the universal escape hatch — ANY platform tool
 *   commandagi run script.py                       # run a snippet server-side (stdin with -)
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { CommandAGI } from "./client.js";
import { CLI_COMMANDS, ENV, type CliParam, type Command } from "./generated.js";

interface Parsed {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

/** File extension → run_code `language`. Mirrors the hostless runtimes in @commandagi/core. */
const EXT_LANGUAGE: Record<string, string | undefined> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".ts": "typescript",
  ".py": "python",
};

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function out(v: unknown): void {
  process.stdout.write(JSON.stringify(v, null, 2) + "\n");
}

class CliError extends Error {}

function fail(msg: string): never {
  throw new CliError(msg);
}

/** `commandagi threads send <id> <text…>` → the usage line the table implies. */
function usage(c: Command): string {
  const head = [
    c.group,
    ...(c.factory ?? []).filter((f) => f.from === "positional").map((f) => `<${f.name}>`),
    c.verb,
  ]
    .filter(Boolean)
    .join(" ");
  const args = (c.params ?? [])
    .filter((p) => p.from !== "flag" && p.from !== "language")
    .map((p) =>
      p.from === "join" ? `<${p.name}…>` : p.from === "file" ? "<file|->" : `<${p.name}>`,
    );
  const flagged = [
    ...(c.params ?? [])
      .filter((p) => p.from === "flag" || p.from === "language")
      .map((p) => `[--${p.name} X]`),
    ...(c.factory ?? []).filter((f) => f.from === "flag").map((f) => `[--${f.name} X]`),
    ...(c.spread ? ["[--key value …] [--json '{…}']"] : []),
  ];
  return ["commandagi", head, ...args, ...flagged].join(" ");
}

export function helpText(): string {
  const rows = CLI_COMMANDS.map((c) => ({ left: usage(c), doc: c.doc }));
  const width = Math.max(...rows.map((r) => r.left.length));
  return [
    "commandagi — the CommandAGI CLI",
    "",
    "Usage: commandagi <group> <verb> [args] [--flags]      (a --flag is the tool's own argument name)",
    "",
    ...rows.map((r) => "  " + r.left.padEnd(width) + "   " + r.doc),
    "  " +
      "commandagi call <tool> [--json '{…}'] [--key value …]".padEnd(width) +
      "   Any platform tool by name — the escape hatch.",
    "",
    "  commandagi daemon start | status | stop | logs   Host this computer in the background (share it, drive it).",
    "",
    `Env: ${ENV.apiKey} (required), ${ENV.baseUrl}, ${ENV.threadId}`,
    "",
  ].join("\n");
}

/** Locate the command an argv addresses, and the positionals left over for its params. */
function match(
  positionals: string[],
): { cmd: Command; factoryValues: string[]; rest: string[] } | null {
  const [a, b, c] = positionals;
  if (!a) return null;
  for (const cmd of CLI_COMMANDS) {
    if (cmd.group === "") {
      if (cmd.verb === a) return { cmd, factoryValues: [], rest: positionals.slice(1) };
      continue;
    }
    if (cmd.group !== a) continue;
    const positionalFactory = (cmd.factory ?? []).filter((f) => f.from === "positional").length;
    // A factory namespace puts its own params between the group and the verb: `social <platform> post`.
    const verbAt = 1 + positionalFactory;
    const verb = positionalFactory ? c : b;
    if (verb === cmd.verb)
      return {
        cmd,
        factoryValues: positionals.slice(1, verbAt),
        rest: positionals.slice(verbAt + 1),
      };
  }
  return null;
}

/** A positional cursor plus the path a `file` param consumed (which is what `language` infers from). */
interface Cursor {
  i: number;
  path?: string;
}

/** Resolve one named param's value, consuming positionals as it goes. */
function valueOf(
  p: CliParam,
  cmd: Command,
  rest: string[],
  cursor: Cursor,
  flags: Record<string, string | boolean>,
): unknown {
  switch (p.from ?? "positional") {
    case "join": {
      const joined = rest.slice(cursor.i).join(" ");
      cursor.i = rest.length;
      return joined || readStdin().trim() || fail(usage(cmd));
    }
    case "json": {
      const raw = rest[cursor.i++] ?? fail(usage(cmd));
      try {
        return JSON.parse(raw);
      } catch {
        return fail(`${cmd.verb}: <${p.name}> must be JSON (got: ${raw})`);
      }
    }
    case "file": {
      const path = rest[cursor.i++];
      cursor.path = path; // remembered so `language` can infer from the extension
      const src = !path || path === "-" ? readStdin() : readFileSync(path, "utf8");
      return src.trim()
        ? src
        : fail(
            `${cmd.verb}: no code (pass a file path, or pipe code to \`commandagi ${cmd.verb} -\`)`,
          );
    }
    case "language": {
      // The extension is the intent: `commandagi run script.py` must not run Python through the JS engine,
      // which is a syntax error 40 lines deep instead of an obvious mistake. --language wins; stdin
      // with no flag stays JavaScript (the run_code default).
      const path = cursor.path ?? "";
      return flags.language ?? EXT_LANGUAGE[path.slice(path.lastIndexOf(".")).toLowerCase()];
    }
    case "flag": {
      const v = flags[p.name];
      if (v === undefined || v === true) return undefined;
      return p.number ? Number(v) : v;
    }
    default: {
      const v = rest[cursor.i++];
      return v === undefined ? fail(usage(cmd)) : v;
    }
  }
}

/** Flag names this command consumes as named/factory params — everything else is the options bag. */
function consumedFlags(cmd: Command): Set<string> {
  const consumed = new Set<string>(["json"]);
  for (const f of cmd.factory ?? []) if (f.from === "flag") consumed.add(f.name);
  for (const p of cmd.params ?? [])
    if (p.from === "flag" || p.from === "language") consumed.add(p.name);
  return consumed;
}

/**
 * Run one argv against a client. Exported so the conformance test can drive the REAL dispatcher — a table
 * that merely looks right is worth nothing; what matters is which tool the command line actually calls.
 *
 * The dispatcher calls the TYPED METHOD, never the tool directly. Everything the spec says about argument
 * mapping — key names, `withThread`, a `prefix` like `thread:` — is already implemented once, in the typed
 * SDK; going around it to `cagi.call(tool, …)` would be a second implementation of the same rules, and a
 * second thing to keep in step.
 */
export async function runCli(argv: string[], cagi: CommandAGI): Promise<unknown> {
  const { positionals, flags } = parseArgs(argv);
  const [group] = positionals;

  if (!group || group === "help" || flags.help) {
    process.stdout.write(helpText());
    return undefined;
  }

  // The transport primitive, deliberately outside the spec: `call` IS `cagi.call`, every tool by name.
  if (group === "call") {
    const tool =
      positionals[1] ?? fail("usage: commandagi call <tool> [--json '{…}'] [--key value …]");
    const args: Record<string, unknown> = {};
    if (typeof flags.json === "string") Object.assign(args, JSON.parse(flags.json));
    for (const [k, v] of Object.entries(flags)) if (k !== "json") args[k] = v;
    return out(await cagi.call(tool, args));
  }

  const found = match(positionals);
  if (!found) fail(`unknown command: ${positionals.join(" ")} (try: commandagi help)`);
  const { cmd, factoryValues, rest } = found;

  const cursor: Cursor = { i: 0 };
  const args: unknown[] = (cmd.params ?? []).map((p) => valueOf(p, cmd, rest, cursor, flags));
  if (cursor.i < rest.length)
    fail(`${usage(cmd)}   (unexpected: ${rest.slice(cursor.i).join(" ")})`);

  const consumed = consumedFlags(cmd);
  if (cmd.spread) {
    const bag: Record<string, unknown> = {};
    if (typeof flags.json === "string") Object.assign(bag, JSON.parse(flags.json));
    for (const [k, v] of Object.entries(flags)) if (!consumed.has(k)) bag[k] = v;
    args.push(bag);
  } else {
    // No options bag means there is nowhere for a stray flag to go — say so instead of ignoring it.
    const stray = Object.keys(flags).filter((k) => !consumed.has(k));
    if (stray.length)
      fail(`${usage(cmd)}   (unknown flag${stray.length > 1 ? "s" : ""}: --${stray.join(", --")})`);
  }

  type Bag = Record<string, unknown>;
  type Fn = (...a: unknown[]) => unknown;
  const client = cagi as unknown as Bag;
  const factoryArgs = (cmd.factory ?? []).map((f) =>
    f.from === "positional" ? factoryValues.shift() : flags[f.name],
  );
  const owner = cmd.factory
    ? ((client[cmd.group] as Fn).call(client, ...factoryArgs) as Bag)
    : cmd.group
      ? (client[cmd.group] as Bag)
      : client;
  const method = owner?.[cmd.verb];
  if (typeof method !== "function")
    fail(
      `commandagi ${[cmd.group, cmd.verb].filter(Boolean).join(" ")}: the SDK has no such method`,
    );
  return out(await (method as Fn).apply(owner, args));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];
  if (!first || first === "help" || argv.includes("--help")) {
    process.stdout.write(helpText());
    return;
  }
  if (first === "daemon") return runDaemon(argv.slice(1));
  if (!process.env[ENV.apiKey])
    fail(`set ${ENV.apiKey} (a cagi_ API key from Settings → API keys)`);
  const cagi = new CommandAGI();
  await runCli(argv, cagi);
}

/**
 * `commandagi daemon …` — host this computer in the background. The host is not SDK: it is prebuilt into
 * dist/daemon/ (scripts/bundle-daemon.mjs) and loaded only here, so importing the SDK never loads the
 * native modules it needs. A path in a variable, so the compiler does not look for it in src/.
 */
async function runDaemon(argv: string[]): Promise<void> {
  const entry = "./daemon/daemon-cli.js";
  const mod = (await import(new URL(entry, import.meta.url).href)) as {
    main(argv: string[]): Promise<void>;
  };
  await mod.main(argv);
}

// Run ONLY when invoked as the binary. The conformance test imports this module to drive `runCli`
// against a recording client, and a top-level `main()` would try to dispatch the test runner's own argv.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    const detail =
      e && typeof e === "object" && "detail" in e ? (e as { detail: unknown }).detail : undefined;
    process.stderr.write("commandagi: " + String((e as Error)?.message ?? e) + "\n");
    if (detail !== undefined) process.stderr.write(JSON.stringify(detail, null, 2) + "\n");
    process.exit(1);
  });
}
