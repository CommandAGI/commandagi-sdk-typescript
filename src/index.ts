/**
 * @commandagi/sdk — THE CommandAGI SDK.
 *
 * One typed surface over the whole platform, for TWO consumers:
 *   - a DEVELOPER, holding a general-purpose API key (broad scopes), calling from their own code;
 *   - an AGENT, holding a session-restricted key, calling the same SDK from inside `run_code`.
 *
 * There is no separate "agent API" and "developer API" — an agent is just another principal holding a
 * scoped credential (docs/agents/AUTONOMY.md). The ONLY difference between the two is what the key is allowed
 * to do: a call the key's scopes don't cover comes back as a clean 403 the SDK surfaces as a CagiError.
 *
 * Transport: the platform's MCP endpoint (`POST {baseUrl}/mcp`, JSON-RPC `tools/call`), authenticated
 * with a `cagi_...` API key. `call(tool, args)` is the universal escape hatch — every platform tool by
 * name; the namespaces below (threads / embodiments / integrations / memory / social) are ergonomic sugar
 * over the hot tools. Discover the long tail with `search(query)` (the search_tools catalog search).
 */

export interface CagiConfig {
  /** A CommandAGI API key (`cagi_...`). Its scopes decide what every call may do. */
  apiKey: string;
  /** API origin. Defaults to https://api.commandagi.com (use https://api-dev.commandagi.com for dev). */
  baseUrl?: string;
  /** Default thread id for self-thread helpers (observe/act/launch) when one isn't passed. */
  threadId?: string;
  /** Override the fetch implementation (tests / non-standard runtimes). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** A tool call that failed — carries the tool name and the platform's error detail. */
export class CagiError extends Error {
  constructor(
    public readonly tool: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "CagiError";
  }
}

type Args = Record<string, unknown>;

export type SocialPlatform =
  | "tiktok"
  | "youtube"
  | "x"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "reddit"
  | (string & {});
export type Privacy = "public" | "unlisted" | "friends" | "followers" | "private";

export interface PostOptions {
  integration: SocialPlatform;
  fileId: string;
  account?: string;
  caption?: string;
  title?: string;
  privacy?: Privacy;
  project?: string;
}

export interface IntegrationCallOptions {
  account?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  project?: string;
}

/**
 * A per-account social facade (usesocial.dev-shaped): `cagi.social("tiktok", "@brand").post(fileId)`.
 * `post` publishes a video in one call; `call` drives the provider's raw API as that specific account.
 */
export interface SocialFacade {
  post(
    fileId: string,
    opts?: { caption?: string; title?: string; privacy?: Privacy },
  ): Promise<unknown>;
  call(
    method: string,
    path: string,
    opts?: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string> },
  ): Promise<unknown>;
}

export class Cagi {
  private readonly base: string;
  private readonly key: string;
  private readonly threadId?: string;
  private readonly f: typeof fetch;
  private id = 0;

  constructor(cfg: CagiConfig) {
    if (!cfg?.apiKey) throw new Error("cagi: apiKey is required");
    this.base = (cfg.baseUrl ?? "https://api.commandagi.com").replace(/\/+$/, "");
    this.key = cfg.apiKey;
    this.threadId = cfg.threadId;
    this.f = cfg.fetchImpl ?? (globalThis.fetch as typeof fetch);
    if (!this.f)
      throw new Error("cagi: no fetch implementation available (pass fetchImpl on older runtimes)");
  }

  /** Run ANY platform tool by name — the universal escape hatch. Returns its parsed JSON result. */
  async call<T = unknown>(tool: string, args: Args = {}): Promise<T> {
    const res = await this.f(this.base + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + this.key,
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
      throw new CagiError(tool, `cagi.${tool}: non-JSON response (HTTP ${res.status})`);
    }
    if (j.error)
      throw new CagiError(tool, `cagi.${tool}: ${j.error.message ?? "tool error"}`, j.error);
    const content = j.result?.content ?? [];
    const text = content.map((c) => c.text ?? "").join("\n");
    if (j.result?.isError) throw new CagiError(tool, `cagi.${tool}: ${text}`, text);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  }

  /** Default the thread id to the config's threadId when the caller didn't pass one. */
  private withThread(args: Args = {}): Args {
    if (this.threadId && args.threadId === undefined) return { ...args, threadId: this.threadId };
    return args;
  }

  /** The account this key belongs to — the cheapest way to check a key works and what it is. */
  whoami() {
    return this.call("whoami", {});
  }

  /** Search the full tool catalog by keyword — discover tools not covered by the namespaces below. */
  search(query: string, limit?: number) {
    return this.call("search_tools", { query, limit });
  }

  /**
   * Run a snippet server-side in the sandbox — the same Code Mode an agent uses, with your own key's
   * authority. The snippet gets its own `cagi` client; `language` defaults to JavaScript.
   */
  run(code: string, language?: "javascript" | "typescript" | "python") {
    return this.call("run_code", this.withThread({ code, language }));
  }

  readonly threads = {
    list: () => this.call("list_threads", {}),
    get: (threadId: string) => this.call("get_thread", { threadId }),
    create: (opts: Args) => this.call("create_thread", opts),
    kill: (threadId: string) => this.call("kill_process", { pid: `thread:${threadId}` }),
    send: (threadId: string, text: string) => this.call("send_message", { threadId, text }),
    events: (threadId: string) => this.call("thread_events", { threadId }),
  };

  readonly embodiments = {
    list: () => this.call("list_embodiments", {}),
    launch: (opts: Args = {}) => this.call("launch_embodiment", this.withThread(opts)),
    observe: (opts: Args = {}) => this.call("observe", this.withThread(opts)),
    act: (action: unknown) => this.call("act", this.withThread({ action })),
  };

  readonly memory = {
    search: (query: string) => this.call("memory_search", { query }),
    remember: (opts: Args) => this.call("memory_remember", opts),
    link: (opts: Args) => this.call("memory_link", opts),
  };

  readonly integrations = {
    list: () => this.call("list_integrations", {}),
    call: (integration: string, opts: IntegrationCallOptions = {}) =>
      this.call("integration_call", { integration, ...opts }),
  };

  /** Publish a video to a connected social account in one call (TikTok / YouTube). */
  post(opts: PostOptions) {
    return this.call("post", opts as unknown as Args);
  }

  /** A per-account social facade — `cagi.social("tiktok", "@brand").post(fileId, { privacy: "public" })`. */
  social(platform: SocialPlatform, account?: string): SocialFacade {
    return {
      // Spread `opts` rather than enumerating its keys: the typed signature is what documents the
      // common fields, but a provider gains options faster than this file does, and an enumerated
      // list silently DROPS anything newer — the one divergence from the emitted run_code clients
      // (which spread) that a caller could never see from the type.
      post: (fileId, opts = {}) =>
        this.call("post", { integration: platform, account, fileId, ...opts }),
      call: (method, path, opts = {}) =>
        this.call("integration_call", { integration: platform, account, method, path, ...opts }),
    };
  }
}

/** Construct a client: `const cagi = createCagi({ apiKey })`. */
export function createCagi(cfg: CagiConfig): Cagi {
  return new Cagi(cfg);
}

export default createCagi;
