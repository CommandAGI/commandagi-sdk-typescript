#!/usr/bin/env node
/**
 * `commandagi` — the CommandAGI CLI. The THIRD binding of @commandagi/sdk (SDK for code, run_code for the
 * chat kernel, this CLI for the terminal / the CLI-based agent kernel in the runtime image).
 *
 * Same auth model as the SDK: a `cagi_...` API key (env CAGI_API_KEY) whose scopes decide reach — a
 * developer's broad key or an agent's session-restricted key, no code difference. Every command speaks
 * JSON on stdout (usesocial.dev-shaped), so it pipes cleanly through jq and into agent scripts.
 *
 * THE COMMAND TABLE IS THE SURFACE, and it is not free-form. `CLI_COMMANDS` below is one row per method in
 * `CAGI_SDK_SPEC` (@commandagi/core), and `conformance.test.ts` fails if the two ever disagree — same
 * group, same verb, same tool, same argument keys. Help text is RENDERED from the table rather than
 * written beside it, because the two drifted the moment they were separate things: the old help
 * advertised `threads stop <id>` for a verb that was implemented as `kill`.
 *
 * (The table is a literal rather than a walk of the imported spec because this package publishes to npm
 * with ZERO runtime dependencies — `@commandagi/core` is a devDependency, reachable from the test but
 * not from the shipped binary. The test is what makes the duplication safe.)
 *
 * One flag rule, everywhere: A FLAG IS THE TOOL'S OWN ARGUMENT NAME. `--fileId`, not `--file`; nothing
 * is aliased or renamed on the way through, so what you type is what the tool receives.
 *
 *   commandagi whoami
 *   commandagi threads list
 *   commandagi threads create --intent "research X"
 *   commandagi threads kill th_123
 *   commandagi social tiktok post file_9 --privacy public --account @brand
 *   commandagi call <tool> --json '{...}'          # the universal escape hatch — ANY platform tool
 *   commandagi run script.py                       # Code Mode: run a snippet server-side (stdin with -)
 *
 * Env: CAGI_API_KEY (required), CAGI_API_BASE (default https://api.commandagi.com), CAGI_THREAD_ID.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createCagi, type Cagi } from "./index.js";

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

/**
 * Where a named parameter's value comes from on a command line.
 *   - `positional` — the next bare word.
 *   - `join`       — every remaining bare word, joined (a message, a query); stdin when none are given.
 *   - `json`       — the next bare word, parsed as JSON (a structured argument like an `act` action).
 *   - `file`       — a file path (or `-` for stdin), read into the value.
 *   - `language`   — `--language`, else inferred from the `file` param's extension.
 *   - `flag`       — `--<name>` (`number: true` coerces it).
 */
type Source = "positional" | "join" | "json" | "file" | "language" | "flag";

interface CliParam {
  name: string;
  from?: Source;
  /** Coerce a `flag` value to a number. */
  number?: boolean;
}

export interface Command {
  /** Namespace name, or "" for a method on the client itself. */
  group: string;
  /** The typed-SDK method name — the CLI CALLS that method, so mapping lives in exactly one place. */
  verb: string;
  /** The platform tool it must end up calling — pinned against the spec by the conformance test. */
  tool: string;
  /** A factory namespace's own params, bound before the verb (`commandagi social <platform> post …`). */
  factory?: { name: string; from: "positional" | "flag" }[];
  /** The method's positional params, in signature order. */
  params?: CliParam[];
  /** The method takes a trailing options bag: remaining `--flags` (plus `--json`) fill it. */
  spread?: boolean;
  doc: string;
}

/** ONE ROW PER SPEC METHOD. Adding a method to `CAGI_SDK_SPEC` fails the conformance test until it lands here. */
export const CLI_COMMANDS: Command[] = [
  { group: "", verb: "whoami", tool: "whoami", doc: "The account this key belongs to." },
  {
    group: "",
    verb: "search",
    tool: "search_tools",
    params: [
      { name: "query", from: "join" },
      { name: "limit", from: "flag", number: true },
    ],
    doc: "Search the whole tool catalog by keyword.",
  },
  {
    group: "",
    verb: "run",
    tool: "run_code",
    params: [
      { name: "code", from: "file" },
      { name: "language", from: "language" },
    ],
    doc: "Run a snippet server-side — a file path, or `-` for stdin.",
  },
  {
    group: "",
    verb: "post",
    tool: "post",
    spread: true,
    doc: "Publish a file to a connected social account.",
  },

  { group: "threads", verb: "list", tool: "list_threads", doc: "Your threads." },
  {
    group: "threads",
    verb: "get",
    tool: "get_thread",
    params: [{ name: "threadId" }],
    doc: "One thread's detail.",
  },
  { group: "threads", verb: "create", tool: "create_thread", spread: true, doc: "Spawn a thread." },
  {
    group: "threads",
    verb: "send",
    tool: "send_message",
    params: [{ name: "threadId" }, { name: "text", from: "join" }],
    doc: "Message a thread.",
  },
  {
    group: "threads",
    verb: "events",
    tool: "thread_events",
    params: [{ name: "threadId" }],
    doc: "A thread's event log.",
  },
  {
    group: "threads",
    verb: "kill",
    tool: "kill_process",
    params: [{ name: "threadId" }],
    doc: "Stop a thread's run (the thread itself persists).",
  },

  { group: "embodiments", verb: "list", tool: "list_embodiments", doc: "Attached embodiments." },
  {
    group: "embodiments",
    verb: "launch",
    tool: "launch_embodiment",
    spread: true,
    doc: "Launch a embodiment into the thread.",
  },
  {
    group: "embodiments",
    verb: "observe",
    tool: "observe",
    spread: true,
    doc: "Look at a embodiment.",
  },
  {
    group: "embodiments",
    verb: "act",
    tool: "act",
    params: [{ name: "action", from: "json" }],
    doc: "Drive a embodiment.",
  },

  {
    group: "memory",
    verb: "search",
    tool: "memory_search",
    params: [{ name: "query", from: "join" }],
    doc: "Recall by query.",
  },
  {
    group: "memory",
    verb: "remember",
    tool: "memory_remember",
    spread: true,
    doc: "Store a memory.",
  },
  { group: "memory", verb: "link", tool: "memory_link", spread: true, doc: "Relate two memories." },

  { group: "integrations", verb: "list", tool: "list_integrations", doc: "What's connected." },
  {
    group: "integrations",
    verb: "call",
    tool: "integration_call",
    params: [{ name: "integration" }],
    spread: true,
    doc: "Drive a provider's API (--method/--path/--body).",
  },

  {
    group: "social",
    verb: "post",
    tool: "post",
    factory: [
      { name: "platform", from: "positional" },
      { name: "account", from: "flag" },
    ],
    params: [{ name: "fileId" }],
    spread: true,
    doc: "Publish a stored file to this account.",
  },
  {
    group: "social",
    verb: "call",
    tool: "integration_call",
    factory: [
      { name: "platform", from: "positional" },
      { name: "account", from: "flag" },
    ],
    params: [{ name: "method" }, { name: "path" }],
    spread: true,
    doc: "Raw API call as this account.",
  },
];

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
    "Env: CAGI_API_KEY (required), CAGI_API_BASE, CAGI_THREAD_ID",
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
        : fail(`${cmd.verb}: no code (pass a file path, or pipe code to \`commandagi ${cmd.verb} -\`)`);
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
export async function runCli(argv: string[], cagi: Cagi): Promise<unknown> {
  const { positionals, flags } = parseArgs(argv);
  const [group] = positionals;

  if (!group || group === "help" || flags.help) {
    process.stdout.write(helpText());
    return undefined;
  }

  // The transport primitive, deliberately outside the spec: `call` IS `cagi.call`, every tool by name.
  if (group === "call") {
    const tool = positionals[1] ?? fail("usage: commandagi call <tool> [--json '{…}'] [--key value …]");
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
    fail(`commandagi ${[cmd.group, cmd.verb].filter(Boolean).join(" ")}: the SDK has no such method`);
  return out(await (method as Fn).apply(owner, args));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const first = argv[0];
  if (!first || first === "help" || argv.includes("--help")) {
    process.stdout.write(helpText());
    return;
  }
  const apiKey = process.env.CAGI_API_KEY;
  if (!apiKey) fail("set CAGI_API_KEY (a cagi_ API key from Settings → API keys)");
  const cagi = createCagi({
    apiKey,
    baseUrl: process.env.CAGI_API_BASE,
    threadId: process.env.CAGI_THREAD_ID,
  });
  await runCli(argv, cagi);
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
