/**
 * The 3D kernel: what a 3D document IS once OpenCascade has built it.
 *
 * `commandagi/design` declares a part; it builds nothing. `Kernel` asks the CommandAGI 3D design service to build it:
 * its solids, their exact volume, area and mass, a STEP file, a measurement, a drawing sheet, a bill of materials. One service, in one of three
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
    /** For a build that is not whole: each feature that failed, in the order they were built. Otherwise empty. */
    readonly failures: BuildFailure[] = [],
  ) {
    super(message);
    this.name = "KernelError";
  }
}

/** One feature the build could not make. */
export interface BuildFailure {
  feature: string;
  name?: string;
  type?: string;
  message: string;
}

/**
 * The files an assembly places (`<externalPart fileName="bolt.3d.tsx">`), which the service cannot read: each under
 * the key its placement resolves to. `linkedParts` makes it.
 */
export type LinkedParts = Record<string, { docText: string } | { format: "step" | "iges"; data: string }>;

/**
 * The `parts` of a call, from the files an assembly places, by the name each placement gives (`fileName` or `path`):
 * a 3D document (its graph, or the graph's text) or, for a `.step` / `.stp` / `.iges` / `.igs` name, the file's text.
 * A document placed inside a placed document is listed here too.
 */
export function linkedParts(files: Record<string, string | object>): LinkedParts {
  const out: LinkedParts = {};
  for (const [name, value] of Object.entries(files)) {
    const lower = name.toLowerCase();
    const format = /\.(step|stp)$/.test(lower) ? "step" : /\.(iges|igs)$/.test(lower) ? "iges" : null;
    if (format) {
      if (typeof value !== "string") throw new Error(`${name}: a ${format.toUpperCase()} file is given as its text`);
      out[`${format}:name:${name}`] = { format, data: value };
    } else if (/\.3d\.(tsx|jsx|py|rs)$/.test(lower)) out[`3d:name:${name}`] = { docText: docText(value) };
    else throw new Error(`${name}: a placed file the kernel builds is a 3D document (.3d.tsx, .3d.py, .3d.rs), a STEP file or an IGES file`);
  }
  return out;
}

/** One measurement: `distance`, `angle` or `closest` between two entities, or the `radius` of one. */
export interface Measure {
  quantity: "distance" | "angle" | "radius" | "closest";
  a: EntityRef;
  b?: EntityRef;
}
export interface Measured {
  value?: number;
  points?: { a: [number, number, number]; b: [number, number, number] };
}

interface Pair {
  a: { id: string; name: string };
  b: { id: string; name: string };
}
/** Which bodies occupy the same space, engage in a thread, or are nearer than a clearance. */
export interface InterferenceReport {
  bodies: { id: string; name: string; volume: number }[];
  clashes: (Pair & { volume: number; outsideThreads: number; bounds: { min: [number, number, number]; max: [number, number, number] } })[];
  engagements: (Pair & { volume: number; threads: string[] })[];
  close: (Pair & { distance: number; points: { a: [number, number, number]; b: [number, number, number] } })[];
  clearance: number | null;
  pairs: number;
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

/** A drawn sheet: the file, and what the sheet measured on the build. */
export interface SheetFile {
  sheet: string;
  format: "svg" | "dxf" | "pdf";
  mime: string;
  extension: string;
  content?: string;
  contentBase64?: string;
  dimensions: { view: string; kind: "overall" | "hole" | "linear" | "radial" | "note"; value?: number; text: string; of?: string; count?: number }[];
  views: { id: string; view: string; at: [number, number]; scale: number; visible: number; hidden: number }[];
  title: Record<string, string>;
  warnings: string[];
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
      let failures: BuildFailure[] = [];
      try {
        const said = JSON.parse(text) as { error?: string; reason?: string; failures?: BuildFailure[] };
        why = said.error && said.reason ? `${said.error}: ${said.reason}` : (said.error ?? said.reason ?? why);
        if (Array.isArray(said.failures)) failures = said.failures;
      } catch {
        /* not JSON: its text says why */
      }
      if (res.status === 503 && this.where === "platform" && Date.now() + 3000 < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw new KernelError(`${route}: ${why} (HTTP ${res.status})`, res.status, failures);
    }
  }

  private op<T>(op: string, doc: Doc, fields: Record<string, unknown>): Promise<T> {
    const body = { docText: docText(doc), ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
    return this.where === "platform" ? this.post<T>("/threed/op", { op, ...body }) : this.post<T>(`/${op}`, body);
  }

  /**
   * Build the document. `observation`: each body's bounds, mass properties, faces, edges and vertices;
   * `observation.status` (`"built"`, or `"failed"`: a body is then built from what did not fail) and
   * `observation.failures` (each failed feature, with why). `meshes`: the triangles.
   *
   * Every other call REFUSES a build in which a feature failed: a `KernelError` with `status` 422 and `failures`. A
   * STEP file cannot say that two features are missing from it.
   *
   * A body whose `engineering.material` names a grade has its mass: `mass.grams` is its volume × that grade's density,
   * and `mass.massFrom` says the row and its source. `materials` are the rows of your own tables, nearest first
   * (`commandagi/design` `material`); the shipped table is read after them. A body with no grade has `mass.noMass`.
   */
  observe(doc: Doc, opts: { docId?: string; materials?: readonly object[] } = {}): Promise<{ observation: Record<string, any>; meshes: unknown[]; meshTris: number }> {
    const text = docText(doc);
    const materials = opts.materials?.length ? { materials: opts.materials } : {};
    if (this.where !== "platform") return this.post("/observe", { docText: text, digest: "", ...materials });
    let docId = opts.docId;
    if (!docId) {
      try {
        docId = String((JSON.parse(text) as { id?: unknown }).id || "sdk");
      } catch {
        docId = "sdk";
      }
    }
    return this.post("/threed/observe", { docId, docText: text, digest: "", ...materials });
  }

  /**
   * An engineering drawing sheet the document declares (`<sheet>`), as a file: `content` is its text (SVG, DXF),
   * `contentBase64` its bytes (PDF). The views are projected from this build with hidden edges dashed, the
   * dimensions are measured on it (`dimensions`: each one's value and text) and the title block is the document's
   * engineering data. A document with a failed feature draws no sheet.
   */
  sheet(doc: Doc, opts: { sheet?: string; format?: "svg" | "dxf" | "pdf"; materials?: readonly object[]; parts?: LinkedParts } = {}): Promise<SheetFile> {
    return this.op<SheetFile>("sheet", doc, { sheet: opts.sheet, format: opts.format ?? "svg", materials: opts.materials, parts: opts.parts });
  }

  /**
   * The bill of materials: a line per part with its engineering data and its mass from this build, and the same table
   * as CSV. `parts` are the files an assembly places (`linkedParts`): each placed 3D document is the lines of its own
   * parts, and a file that is not given is a line with its name. `failures`: each feature that failed to build (a
   * line's mass is then of what was built).
   */
  bom(doc: Doc, opts: { parts?: LinkedParts; materials?: readonly object[] } = {}): Promise<{ lines: Record<string, unknown>[]; csv: string; failures: Record<string, string> }> {
    return this.op("bom", doc, { parts: opts.parts, materials: opts.materials });
  }

  /**
   * The document as a STEP or IGES file's text; `bodies` keeps only those body ids. A STEP file names each body as a
   * product of its part's name, and an assembly as the product they are components of.
   */
  async export(doc: Doc, format: "step" | "iges" = "step", opts: { bodies?: string[]; parts?: LinkedParts } = {}): Promise<string> {
    return (await this.op<{ content: string }>("export", doc, { format, ...opts })).content;
  }

  /** `distance`, `angle` or `closest` between two entities, or the `radius` of one. */
  async measure(doc: Doc, quantity: Measure["quantity"], a: EntityRef, b?: EntityRef, opts: { parts?: LinkedParts } = {}): Promise<Measured> {
    return (await this.measureAll(doc, [{ quantity, a, ...(b ? { b } : {}) }], opts))[0]!;
  }

  /** Many measurements on ONE build, answered in the same order. */
  async measureAll(doc: Doc, measures: Measure[], opts: { parts?: LinkedParts } = {}): Promise<Measured[]> {
    return (await this.op<{ results: Measured[] }>("measure", doc, { measures, ...opts })).results;
  }

  /**
   * Every pair of bodies, compared on one build. `clashes`: pairs that occupy the same space. `engagements`: pairs
   * whose shared volume all lies in a declared thread (a screw in a tapped hole: a `thread` feature on the hole or on
   * the screw says so; without it the same overlap is a clash). `close`: with `clearance` (mm), pairs that share no
   * volume and are nearer than it.
   */
  interference(doc: Doc, opts: { clearance?: number; bodies?: string[]; parts?: LinkedParts } = {}): Promise<InterferenceReport> {
    return this.op<InterferenceReport>("interference", doc, opts);
  }

  /** A drawing view with hidden lines removed: the visible and hidden edges projected along `direction`. */
  async drawing(
    doc: Doc,
    opts: { direction?: [number, number, number]; up?: [number, number, number]; bodies?: string[]; section?: { origin: [number, number, number]; normal: [number, number, number] }; parts?: LinkedParts } = {},
  ): Promise<unknown> {
    return (await this.op<{ projection: unknown }>("drawing", doc, opts)).projection;
  }

  /** Each body's triangles at this chord deflection (mm). */
  async tessellate(doc: Doc, deflection: number, opts: { bodies?: string[]; parts?: LinkedParts } = {}): Promise<{ id: string; name: string; triangles: number; mesh: unknown }[]> {
    return (await this.op<{ bodies: { id: string; name: string; triangles: number; mesh: unknown }[] }>("tessellate", doc, { deflection, ...opts })).bodies;
  }
}
