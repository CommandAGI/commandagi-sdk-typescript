/**
 * The 3D kernel: what a 3D document IS once OpenCascade has built it.
 *
 * `commandagi/design` declares a part; it builds nothing. `Kernel` asks the CommandAGI 3D design service to build it:
 * its solids, their exact volume and area, a STEP file, a measurement, a drawing view. One service, in one of three
 * places, chosen by one setting (`COMMANDAGI_THREED`, or `where`):
 *
 *   platform   (the default) the hosted service, with your COMMANDAGI_API_KEY. Needs the network and an account.
 *   local      this computer, offline, no account. The SDK starts `commandagi threed serve` (this package's CLI;
 *              run `commandagi threed install` once) and stops it when the process exits.
 *   a URL      a service that already runs (`commandagi threed serve`), with COMMANDAGI_THREED_TOKEN as its bearer.
 *              COMMANDAGI_THREED_URL names it too, as it does for the local host.
 *
 *   const kernel = new Kernel();                       // reads COMMANDAGI_THREED
 *   const { observation } = await kernel.observe(graph);
 *   const step = await kernel.export(graph, "step");
 *
 * `doc` is a 3D document's graph (what a `.3d.tsx` declares, `commandagi code eval` prints it) or its JSON text.
 */
import { DEFAULT_BASE_URL, ENV } from "./generated.js";

export const ENV_THREED = "COMMANDAGI_THREED";
export const ENV_THREED_URL = "COMMANDAGI_THREED_URL";
export const ENV_THREED_TOKEN = "COMMANDAGI_THREED_TOKEN";

/** The service refused or could not be reached: `status` is its HTTP status (0 when there was no answer). */
export class KernelError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "KernelError";
  }
}

export interface KernelConfig {
  /** `platform`, `local` or the URL of a running service. Default: the environment (see above). */
  where?: string;
  apiKey?: string;
  baseUrl?: string;
  /** The bearer of a running service (`where` a URL). */
  token?: string;
  /** How long one call may take, with the platform's wait for a host: ms. */
  timeoutMs?: number;
  /** How long the local service may take to start: ms. */
  startTimeoutMs?: number;
}

/** How a call names one entity: a body id of the observation, and the index observe lists the entity at. */
export interface EntityRef {
  body: string;
  kind: "body" | "face" | "edge" | "vertex";
  index?: number;
}

type Env = Record<string, string | undefined>;
type Doc = string | object;

/** Which service: an argument wins, then COMMANDAGI_THREED_URL (a service that runs already), then
 *  COMMANDAGI_THREED, then the platform. */
export function kernelWhere(where: string | undefined, env: Env): string {
  const chosen = (where || env[ENV_THREED_URL] || env[ENV_THREED] || "platform").trim();
  if (chosen === "platform" || chosen === "local" || /^https?:\/\//.test(chosen)) return chosen.replace(/\/+$/, "");
  throw new Error(`${ENV_THREED} is "platform", "local" or the URL of a running service, not ${JSON.stringify(chosen)}`);
}

const docText = (doc: Doc) => (typeof doc === "string" ? doc : JSON.stringify(doc));

/** The one service this process started (`commandagi threed serve`), shared by every local Kernel. */
let local: Promise<{ url: string; token: string }> | null = null;

async function startLocal(startTimeoutMs: number): Promise<{ url: string; token: string }> {
  const [{ spawn }, { randomBytes }, { fileURLToPath }] = await Promise.all([
    import("node:child_process"),
    import("node:crypto"),
    import("node:url"),
  ]);
  // The bearer is made here and lives in this process and the child's environment only.
  const token = randomBytes(32).toString("hex");
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  const child = spawn(process.execPath, [cli, "threed", "serve", "--port", "0", "--with-parent"], {
    env: { ...process.env, [ENV_THREED_TOKEN]: token, [ENV_THREED_URL]: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // It stops when this process ends, however that happens: `--with-parent` watches the pipe this process holds.
  child.unref();
  for (const stream of [child.stdin, child.stdout, child.stderr]) (stream as unknown as { unref?: () => void }).unref?.();
  let words = "";
  child.stderr.on("data", (c: Buffer) => (words = (words + c).slice(-2000)));
  return new Promise((resolve, reject) => {
    let said = "";
    const fail = (why: string) => {
      clearTimeout(timer);
      child.kill();
      local = null;
      reject(new KernelError(`\`commandagi threed serve\` did not start: ${why}${words.trim() ? `: ${words.trim().split("\n").slice(-3).join(" ")}` : ""}`));
    };
    const timer = setTimeout(() => fail(`no answer within ${Math.round(startTimeoutMs / 1000)} s`), startTimeoutMs);
    child.once("error", (e) => fail(String(e.message)));
    child.once("exit", (code) => {
      local = null;
      fail(`it exited (${code ?? "signal"})`);
    });
    child.stdout.on("data", (c: Buffer) => {
      said += c;
      const line = said.split("\n").find((l) => l.trim().startsWith("{"));
      if (!line || !said.includes("\n")) return;
      try {
        const { url } = JSON.parse(line) as { url: string };
        clearTimeout(timer);
        resolve({ url, token });
      } catch {
        fail("its first line is not its address");
      }
    });
  });
}

export class Kernel {
  readonly where: string;
  private readonly base: string = "";
  private readonly key: string = "";
  private readonly timeoutMs: number;
  private readonly startTimeoutMs: number;

  constructor(cfg: KernelConfig = {}) {
    const env: Env = typeof process !== "undefined" ? process.env : {};
    this.where = kernelWhere(cfg.where, env);
    this.timeoutMs = cfg.timeoutMs ?? 300_000;
    this.startTimeoutMs = cfg.startTimeoutMs ?? 180_000;
    if (this.where === "platform") {
      this.key = cfg.apiKey ?? env[ENV.apiKey] ?? "";
      if (!this.key)
        throw new KernelError(`the platform's 3D service needs an API key: pass apiKey or set ${ENV.apiKey}, or set ${ENV_THREED}=local`);
      this.base = (cfg.baseUrl ?? env[ENV.baseUrl] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    } else if (this.where !== "local") {
      this.key = cfg.token ?? env[ENV_THREED_TOKEN] ?? "";
      if (!this.key) throw new KernelError(`a running 3D service asks for its bearer: pass token or set ${ENV_THREED_TOKEN}`);
      this.base = this.where;
    }
  }

  private async post<T>(route: string, body: object): Promise<T> {
    let base = this.base;
    let key = this.key;
    if (this.where === "local") {
      const started = await (local ??= startLocal(this.startTimeoutMs));
      base = started.url;
      key = started.token;
    }
    // The platform starts a host for the first caller and answers 503 until it is up: ask again until the time is
    // spent. A service on this computer is asked once.
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      let res: Response;
      try {
        res = await fetch(base + route, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
        });
      } catch (e) {
        throw new KernelError(`${route}: no answer from ${base} (${(e as Error)?.message ?? e})`);
      }
      const text = await res.text();
      if (res.ok) return JSON.parse(text) as T;
      let why = text.slice(0, 300);
      try {
        const said = JSON.parse(text) as { error?: string; reason?: string };
        why = said.error && said.reason ? `${said.error}: ${said.reason}` : (said.error ?? said.reason ?? why);
      } catch {
        /* not JSON: its text says why */
      }
      if (res.status === 503 && this.where === "platform" && Date.now() + 3000 < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw new KernelError(`${route}: ${why} (HTTP ${res.status})`, res.status);
    }
  }

  private op<T>(op: string, doc: Doc, fields: Record<string, unknown>): Promise<T> {
    const body = { docText: docText(doc), ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
    return this.where === "platform" ? this.post<T>("/threed/op", { op, ...body }) : this.post<T>(`/${op}`, body);
  }

  /**
   * Build the document. `observation`: each body's bounds, mass properties, faces, edges and vertices, and each failed
   * feature's error by its id (`observation.errors`: read it, a body is built from what did not fail). `meshes`: the
   * triangles.
   */
  observe(doc: Doc, opts: { docId?: string } = {}): Promise<{ observation: Record<string, any>; meshes: unknown[]; meshTris: number }> {
    const text = docText(doc);
    if (this.where !== "platform") return this.post("/observe", { docText: text, digest: "" });
    let docId = opts.docId;
    if (!docId) {
      try {
        docId = String((JSON.parse(text) as { id?: unknown }).id || "sdk");
      } catch {
        docId = "sdk";
      }
    }
    return this.post("/threed/observe", { docId, docText: text, digest: "" });
  }

  /** The document as a STEP or IGES file's text; `bodies` keeps only those body ids. */
  async export(doc: Doc, format: "step" | "iges" = "step", opts: { bodies?: string[] } = {}): Promise<string> {
    return (await this.op<{ content: string }>("export", doc, { format, bodies: opts.bodies })).content;
  }

  /** `distance`, `angle` or `closest` between two entities, or the `radius` of one. */
  measure(
    doc: Doc,
    op: "distance" | "angle" | "radius" | "closest",
    a: EntityRef,
    b?: EntityRef,
  ): Promise<{ value?: number; points?: { a: [number, number, number]; b: [number, number, number] } }> {
    // The platform's route reads `op` as the operation ("measure") and hands the same field to the service, which
    // reads it as the measurement: it cannot say which one.
    if (this.where === "platform")
      return Promise.reject(new KernelError(`the platform's 3D service cannot be asked which measurement yet; measure with ${ENV_THREED}=local`));
    return this.post("/measure", { docText: docText(doc), op, a, ...(b ? { b } : {}) });
  }

  /** A drawing view with hidden lines removed: the visible and hidden edges projected along `direction`. */
  async drawing(
    doc: Doc,
    opts: { direction?: [number, number, number]; up?: [number, number, number]; bodies?: string[]; section?: { origin: [number, number, number]; normal: [number, number, number] } } = {},
  ): Promise<unknown> {
    return (await this.op<{ projection: unknown }>("drawing", doc, opts)).projection;
  }

  /** Each body's triangle count at this chord deflection (mm). */
  async tessellate(doc: Doc, deflection: number): Promise<{ id: string; triangles: number }[]> {
    return (await this.op<{ bodies: { id: string; triangles: number }[] }>("tessellate", doc, { deflection })).bodies;
  }
}
