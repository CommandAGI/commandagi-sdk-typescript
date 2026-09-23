/**
 * The TypeScript client's TRANSPORT — the only hand-written half of the SDK.
 *
 * Every typed method (`cagi.threads.create`, `cagi.embodiments.act`, …) and every control vocabulary
 * (`session.desktop.click`, `session.sim.ik`, …) is GENERATED from the CommandAGI SDK schema into
 * ./generated.ts, identically for every language. What lives here is what cannot be generated: `call`
 * (JSON-RPC over `POST /mcp`), reading the environment, and opening a live {@link Session}.
 */
import { DEFAULT_BASE_URL, ENV, GeneratedClient, type Args } from "./generated.js";
import { Session } from "./session.js";

export interface CommandAGIConfig {
  /** A `cagi_…` API key. Defaults to `$COMMANDAGI_API_KEY`. Its scopes decide what every call may do. */
  apiKey?: string;
  /** API origin. Defaults to `$COMMANDAGI_BASE_URL`, then https://api.commandagi.com. */
  baseUrl?: string;
  /** Default thread for self-thread methods (act/observe/launch/…). Defaults to `$COMMANDAGI_THREAD_ID`. */
  threadId?: string;
  /** Override the fetch implementation (tests / non-standard runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** A tool call that failed — carries the tool name and the platform's error detail. */
export class CommandAGIError extends Error {
  constructor(
    public readonly tool: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "CommandAGIError";
  }
}

const env = (name: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[name] || undefined : undefined;

export class CommandAGI extends GeneratedClient {
  readonly baseUrl: string;
  /** @internal */ readonly apiKey: string;
  readonly threadId?: string;
  /** @internal */ readonly fetchImpl: typeof fetch;
  private id = 0;

  constructor(cfg: CommandAGIConfig = {}) {
    super();
    const apiKey = cfg.apiKey ?? env(ENV.apiKey);
    if (!apiKey) throw new Error(`commandagi: pass apiKey or set ${ENV.apiKey}`);
    this.apiKey = apiKey;
    this.baseUrl = (cfg.baseUrl ?? env(ENV.baseUrl) ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.threadId = cfg.threadId ?? env(ENV.threadId);
    this.fetchImpl = cfg.fetchImpl ?? (globalThis.fetch as typeof fetch);
    if (!this.fetchImpl)
      throw new Error("commandagi: no fetch implementation available (pass fetchImpl)");
  }

  /** Run ANY platform tool by name — the universal escape hatch. Returns its parsed JSON result. */
  async call<T = unknown>(tool: string, args: Args = {}): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + this.apiKey,
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.id,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
    });
    let j: {
      error?: { message?: string };
      result?: { isError?: boolean; content?: { text?: string }[] };
    } = {};
    try {
      j = (await res.json()) as typeof j;
    } catch {
      throw new CommandAGIError(tool, `${tool}: non-JSON response (HTTP ${res.status})`);
    }
    if (j.error)
      throw new CommandAGIError(tool, `${tool}: ${j.error.message ?? "tool error"}`, j.error);
    const text = (j.result?.content ?? []).map((c) => c.text ?? "").join("\n");
    if (j.result?.isError) throw new CommandAGIError(tool, `${tool}: ${text}`, text);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /** Default `threadId` to the client's own thread when the caller didn't name one. */
  withThread(args: Args): Args {
    return this.threadId && args.threadId === undefined
      ? { ...args, threadId: this.threadId }
      : args;
  }

  /** Open a live session on an embodiment that already exists: its frames, and typed control. */
  session(threadId: string, embodimentId: string): Session {
    return new Session(this, threadId, embodimentId, { ownsThread: false });
  }

  /**
   * Launch a world YOU drive — a computer (`computer/…`) or a sim/robot (`simulation/…`) snapshot — in a
   * new agentless thread, and return its live session. Waits until the world declares its controls (it
   * is booted and connected) unless `wait: false`. Stop it with `session.stop()`, or `await using`.
   */
  async launch(
    snapshotId: string,
    opts: { title?: string; wait?: boolean; timeoutMs?: number } = {},
  ): Promise<Session> {
    const created = await this.threads.create({
      agentless: true,
      snapshotId,
      title: opts.title ?? snapshotId,
    });
    const { threadId, launched } = created as {
      threadId: string;
      launched?: { embodimentId?: string } | null;
    };
    const embodimentId = launched?.embodimentId;
    if (!embodimentId)
      throw new CommandAGIError(
        "create_thread",
        `launch of ${snapshotId} started no embodiment`,
        created,
      );
    const session = new Session(this, threadId, embodimentId, { ownsThread: true });
    if (opts.wait !== false) await session.ready({ timeoutMs: opts.timeoutMs });
    return session;
  }
}

/** Construct a client: `const cagi = createClient()` reads `$COMMANDAGI_API_KEY`. */
export function createClient(cfg: CommandAGIConfig = {}): CommandAGI {
  return new CommandAGI(cfg);
}
