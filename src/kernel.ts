/**
 * The 3D kernel: what a 3D document IS once OpenCascade has built it.
 *
 * `commandagi/design` declares a part; it builds nothing. `Kernel` asks the CommandAGI 3D kernel to build it: its
 * solids, their exact volume, area and mass, a STEP file, a measurement, a drawing sheet, a bill of materials. Every
 * call is the kernel contract (`POST <kernel>/v1/<op>`, the CommandAGI repository's docs/local-platform.md § kernels),
 * placed by the one placement function (./kernels.ts, generated from the repository's
 * packages/domain/world/kernels.js) at the places one setting names (`COMMANDAGI_THREED`, or `where`):
 *
 *   local,cloud  (the default) this computer when its 3D service is installed (`commandagi threed install`, once),
 *                else the platform's kernel door with your COMMANDAGI_API_KEY
 *   local        this computer only, offline, no account. The SDK starts `commandagi threed serve` (the local host's
 *                CLI, npm `@commandagi/host`: the one installed beside this package, else the one on PATH) and stops
 *                it when the process exits
 *   cloud        the platform only (`/kernels/3d/v1/<op>`), with your COMMANDAGI_API_KEY
 *   a URL        a service that already runs (`commandagi threed serve`), with COMMANDAGI_THREED_TOKEN as its bearer:
 *                the local place. COMMANDAGI_THREED_URL names it too, as it does for the local host.
 *
 * A place where the kernel is not installed, or has no key, is passed over. A refusal of the op itself (a build that
 * is not whole) is the answer and is never sent to the next place.
 *
 *   const kernel = new Kernel();                       // reads COMMANDAGI_THREED
 *   const { observation } = await kernel.observe(graph);
 *   const step = await kernel.export(graph, "step");
 *   kernel.lastRan;                                    // { kernel: "3d", build, place: "local" | "cloud" }
 *
 * `doc` is a 3D document's graph (what a `.3d.tsx` declares, `commandagi code eval` prints it) or its JSON text.
 */
import { DEFAULT_BASE_URL, ENV } from "./generated.js";
import { callKernel, kernelPlaces } from "./kernels.js";

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

type Vec3 = [number, number, number];
/** One finding of a design check. */
export interface CheckFinding {
  check: string;
  kind: string;
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  body?: { id: string; name: string; partNumber?: string };
  other?: { id: string; name: string; partNumber?: string };
  /** Where, in model coordinates, and in the body's own frame. */
  world?: Vec3;
  local?: Vec3;
  data?: Record<string, unknown>;
  /** The `<accept>` or the `<permitted>` that covers it: it stays listed and is not counted. */
  suppressedBy?: string;
  permittedBy?: string;
}
/** What the checks a document declares found. */
export interface CheckReport {
  declared: boolean;
  checks: { id: string; kind: string; status: "passed" | "warned" | "failed" | "skipped"; reason?: string; findings: number; limits: string[] }[];
  findings: CheckFinding[];
  errors: number;
  warnings: number;
  suppressed: number;
  accepts: { id: string; status: "used" | "unused" | "refused"; reason?: string }[];
  problems: number;
}

/**
 * The device definitions a document's manufacturability checks name (`<check kind="mill" options={{ device }}>`), by
 * the ref as written: each definition's `process` block, which you read (the kernel has no files). A check whose
 * device is not given is skipped with that reason.
 */
export type CheckDevices = Record<string, { process: Record<string, unknown> | null } | { error: string }>;

/** A mill setup: its tools (the smallest makes the corners) and the stock's top (default: the part's top). */
export interface MillSetup {
  tools?: { id?: string; diameter_mm: number }[];
  stock_top_z?: number;
}

/** One manufacturability check's finding (docs/formats.md § manufacturability checks). */
export interface DfmFinding {
  check: string;
  status: "pass" | "fail" | "unknown";
  value: number | null;
  limit: number | null;
  unit: string;
  /** Where: the body, the B-rep face indices the editor paints, a point (mm), and the check's own measure. */
  where: { part?: string; body?: string; faces?: number[]; at?: number[]; [measure: string]: unknown }[];
  message: string;
}

export interface DfmReport {
  process: "print" | "mill";
  part: string | null;
  findings: DfmFinding[];
  verdict: "pass" | "fail" | "unknown";
}

export interface KernelConfig {
  /** The places (`local`, `cloud`, `local,cloud`) or the URL of a running service. Default: the environment (see above). */
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

/** A place where a kernel runs. `page` is the workbench page's own kernel: the SDK has no transport for it and passes it over. */
export type KernelPlace = "page" | "local" | "cloud";
/** Where an answer ran: set by the placement from the place the request went to, never from the answer. */
export interface KernelRan {
  kernel: string;
  build: string | null;
  place: KernelPlace;
}
type Answer = { status: number; body: Record<string, any> & { ran?: KernelRan } };
type Transport = (path: string, request: object | null) => Promise<{ status: number; body: unknown }>;

/**
 * Where the 3D kernel runs: an argument wins, then COMMANDAGI_THREED_URL (a service that runs already: the local
 * place), then COMMANDAGI_THREED (a list of places, or a running service's URL), then the default: the page (which
 * this SDK passes over), local, then cloud.
 */
export function kernelWhere(where: string | undefined, env: Env): { places: KernelPlace[]; url?: string } {
  const chosen = (where || env[ENV_THREED_URL] || env[ENV_THREED] || "").trim();
  if (/^https?:\/\//.test(chosen)) return { places: ["local"], url: chosen.replace(/\/+$/, "") };
  try {
    return { places: kernelPlaces("3d", chosen) as KernelPlace[] };
  } catch {
    throw new Error(`${ENV_THREED} is a list of "page", "local" and "cloud" (each once, joined by ","; this SDK passes "page" over) or the URL of a running service, not ${JSON.stringify(chosen)}`);
  }
}

const docText = (doc: Doc) => (typeof doc === "string" ? doc : JSON.stringify(doc));
const absent = (why: string) => Object.assign(new Error(why), { absent: true });

/** How to run the local host's `commandagi` command: a program, and the arguments that come before the command's. */
interface HostCli {
  file: string;
  args: string[];
  shell: boolean;
}

/**
 * The local host's `commandagi` (npm `@commandagi/host`, which carries the 3D service): the one installed beside this
 * package, else the one on PATH, else null.
 */
async function hostCli(env: Env): Promise<HostCli | null> {
  const [{ createRequire }, { existsSync, readFileSync }, path] = await Promise.all([import("node:module"), import("node:fs"), import("node:path")]);
  try {
    const manifest = createRequire(import.meta.url).resolve("@commandagi/host/package.json");
    const bin = (JSON.parse(readFileSync(manifest, "utf8")) as { bin?: Record<string, string> }).bin?.commandagi;
    if (bin) return { file: process.execPath, args: [path.join(path.dirname(manifest), bin)], shell: false };
  } catch {
    // Not installed beside this package.
  }
  const names = process.platform === "win32" ? ["commandagi.cmd", "commandagi.exe"] : ["commandagi"];
  for (const dir of (env.PATH ?? "").split(path.delimiter).filter(Boolean))
    for (const name of names)
      if (existsSync(path.join(dir, name))) return { file: path.join(dir, name), args: [], shell: name.endsWith(".cmd") };
  return null;
}

const INSTALL = "npm install -g @commandagi/host, then commandagi threed install";

/** The host whose 3D service is installed, or why the local place cannot run. Asked once a process: `threed status`. */
let localHost: Promise<HostCli | string> | null = null;

async function findLocal(env: Env): Promise<HostCli | string> {
  const cli = await hostCli(env);
  if (!cli) return `the local 3D service is not installed: it is the local host's (${INSTALL})`;
  const { execFile } = await import("node:child_process");
  const said = await new Promise<string>((resolve) =>
    execFile(cli.file, [...cli.args, "threed", "status"], { shell: cli.shell, timeout: 60_000 }, (_e, stdout) => resolve(String(stdout ?? ""))),
  );
  try {
    if ((JSON.parse(said) as { installed?: unknown }).installed === true) return cli;
  } catch {
    return `\`commandagi threed status\` gave no status (${INSTALL})`;
  }
  return "the local 3D service is not installed (commandagi threed install)";
}

/** The one service this process started (`commandagi threed serve`), shared by every local Kernel. */
let local: Promise<{ url: string; token: string }> | null = null;

async function startLocal(cli: HostCli, startTimeoutMs: number): Promise<{ url: string; token: string }> {
  const [{ spawn }, { randomBytes }] = await Promise.all([import("node:child_process"), import("node:crypto")]);
  // The bearer is made here and lives in this process and the child's environment only.
  const token = randomBytes(32).toString("hex");
  const child = spawn(cli.file, [...cli.args, "threed", "serve", "--port", "0", "--with-parent"], {
    env: { ...process.env, [ENV_THREED_TOKEN]: token, [ENV_THREED_URL]: "" },
    stdio: ["pipe", "pipe", "pipe"],
    shell: cli.shell,
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

/** One HTTP request of a transport → { status, body }; no answer at all throws a KernelError. */
async function ask(url: string, bearer: string, request: object | null, signal: AbortSignal): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: request ? "POST" : "GET",
      headers: { authorization: `Bearer ${bearer}`, ...(request ? { "content-type": "application/json" } : {}) },
      ...(request ? { body: JSON.stringify(request) } : {}),
      signal,
    });
  } catch (e) {
    throw new KernelError(`no answer from ${url} (${(e as Error)?.message ?? e})`);
  }
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: { error: text.slice(0, 300) || `HTTP ${res.status}` } };
  }
}

export class Kernel {
  /** The places tried, in order. */
  readonly places: KernelPlace[];
  /** Where the last answer ran (`place: "local"` is this computer's result, never a cloud one), or null. */
  lastRan: KernelRan | null = null;
  private readonly url: string | undefined;
  private readonly token: string;
  private readonly base: string;
  private readonly key: string;
  private readonly timeoutMs: number;
  private readonly startTimeoutMs: number;

  constructor(cfg: KernelConfig = {}) {
    const env: Env = typeof process !== "undefined" ? process.env : {};
    const where = kernelWhere(cfg.where, env);
    this.places = where.places;
    this.url = where.url;
    this.timeoutMs = cfg.timeoutMs ?? 300_000;
    this.startTimeoutMs = cfg.startTimeoutMs ?? 180_000;
    this.token = cfg.token ?? env[ENV_THREED_TOKEN] ?? "";
    if (this.url && !this.token) throw new KernelError(`a running 3D service asks for its bearer: pass token or set ${ENV_THREED_TOKEN}`);
    this.key = cfg.apiKey ?? env[ENV.apiKey] ?? "";
    this.base = (cfg.baseUrl ?? env[ENV.baseUrl] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /** This computer's 3D service: the running one named by URL, else the one this process starts when installed. */
  private localTransport(signal: AbortSignal): Transport {
    return async (path, request) => {
      if (this.url) return ask(this.url + path, this.token, request, signal);
      const host = await (localHost ??= findLocal(typeof process !== "undefined" ? process.env : {}));
      if (typeof host === "string") throw absent(host);
      const started = await (local ??= startLocal(host, this.startTimeoutMs));
      return ask(started.url + path, started.token, request, signal);
    };
  }

  /**
   * The platform's kernel door, with the account's key, or null with no key. The platform starts a host for the
   * first caller and answers 503 until it is up: ask again until the time is spent. A 503 `kernel_unavailable` says
   * no place there has the kernel, so it is the answer at once.
   */
  private cloudTransport(signal: AbortSignal, deadline: number): Transport | null {
    if (!this.key) return null;
    return async (path, request) => {
      for (;;) {
        const out = await ask(`${this.base}/kernels/3d${path}`, this.key, request, signal);
        const error = (out.body as { error?: unknown } | null)?.error;
        if (out.status === 503 && error !== "kernel_unavailable" && Date.now() + 3000 < deadline) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        return out;
      }
    };
  }

  /**
   * One op of the kernel, placed → the whole answer: `{ outputs, result, ran }`. `ran.place` is where the request
   * went (a result that ran on this computer says `local`, whatever the service claims). A refusal is a KernelError.
   */
  async call(op: string, doc: Doc, params: Record<string, unknown> = {}): Promise<{ outputs: Record<string, { id: string; bytes?: string }>; result: any; ran: KernelRan }> {
    const deadline = Date.now() + this.timeoutMs;
    const signal = AbortSignal.timeout(this.timeoutMs);
    const fields = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
    const out = (await callKernel({
      kernel: "3d",
      op,
      files: { doc: docText(doc) },
      params: fields,
      places: this.places,
      at: { local: this.localTransport(signal), cloud: this.cloudTransport(signal, deadline) },
    })) as Answer;
    if (out.body.ran) this.lastRan = out.body.ran;
    if (out.status === 200) return out.body as { outputs: Record<string, { id: string; bytes?: string }>; result: any; ran: KernelRan };
    const said = out.body as { error?: string; reason?: string; failures?: BuildFailure[] };
    const why = said.error && said.reason ? `${said.error}: ${said.reason}` : (said.error ?? said.reason ?? "no reason given");
    throw new KernelError(`${op}: ${why} (HTTP ${out.status})`, out.status, Array.isArray(said.failures) ? said.failures : []);
  }

  private async result<T>(op: string, doc: Doc, params: Record<string, unknown>): Promise<T> {
    return (await this.call(op, doc, params)).result as T;
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
  observe(doc: Doc, opts: { materials?: readonly object[] } = {}): Promise<{ observation: Record<string, any>; meshes: unknown[]; meshTris: number }> {
    return this.result("observe", doc, { digest: "", ...(opts.materials?.length ? { materials: opts.materials } : {}) });
  }

  /**
   * An engineering drawing sheet the document declares (`<sheet>`), as a file: `content` is its text (SVG, DXF),
   * `contentBase64` its bytes (PDF). The views are projected from this build with hidden edges dashed, the
   * dimensions are measured on it (`dimensions`: each one's value and text) and the title block is the document's
   * engineering data. A document with a failed feature draws no sheet.
   */
  sheet(doc: Doc, opts: { sheet?: string; format?: "svg" | "dxf" | "pdf"; materials?: readonly object[]; parts?: LinkedParts } = {}): Promise<SheetFile> {
    return this.result<SheetFile>("sheet", doc, { sheet: opts.sheet, format: opts.format ?? "svg", materials: opts.materials, parts: opts.parts });
  }

  /**
   * The bill of materials: a line per part with its engineering data and its mass from this build, and the same table
   * as CSV. `parts` are the files an assembly places (`linkedParts`): each placed 3D document is the lines of its own
   * parts, and a file that is not given is a line with its name. `failures`: each feature that failed to build (a
   * line's mass is then of what was built).
   */
  bom(doc: Doc, opts: { parts?: LinkedParts; materials?: readonly object[] } = {}): Promise<{ lines: Record<string, unknown>[]; csv: string; failures: Record<string, string> }> {
    return this.result("bom", doc, { parts: opts.parts, materials: opts.materials });
  }

  /**
   * The document as a STEP or IGES file's text; `bodies` keeps only those body ids. A STEP file names each body as a
   * product of its part's name, and an assembly as the product they are components of.
   */
  async export(doc: Doc, format: "step" | "iges" = "step", opts: { bodies?: string[]; parts?: LinkedParts } = {}): Promise<string> {
    return (await this.result<{ content: string }>("export", doc, { format, ...opts })).content;
  }

  /** `distance`, `angle` or `closest` between two entities, or the `radius` of one. */
  async measure(doc: Doc, quantity: Measure["quantity"], a: EntityRef, b?: EntityRef, opts: { parts?: LinkedParts } = {}): Promise<Measured> {
    return (await this.measureAll(doc, [{ quantity, a, ...(b ? { b } : {}) }], opts))[0]!;
  }

  /** Many measurements on ONE build, answered in the same order. */
  async measureAll(doc: Doc, measures: Measure[], opts: { parts?: LinkedParts } = {}): Promise<Measured[]> {
    return (await this.result<{ results: Measured[] }>("measure", doc, { measures, ...opts })).results;
  }

  /**
   * Every pair of bodies, compared on one build. `clashes`: pairs that occupy the same space. `engagements`: pairs
   * whose shared volume all lies in a declared thread (a screw in a tapped hole: a `thread` feature on the hole or on
   * the screw says so; without it the same overlap is a clash). `close`: with `clearance` (mm), pairs that share no
   * volume and are nearer than it.
   */
  interference(doc: Doc, opts: { clearance?: number; bodies?: string[]; parts?: LinkedParts } = {}): Promise<InterferenceReport> {
    return this.result<InterferenceReport>("interference", doc, opts);
  }

  /**
   * The checks the document declares (`<check kind … />`), run on one build, with its `<accept>` and `<permitted>`
   * applied: each finding with its check, rule, severity, body (id, name, part number), world and body-local location;
   * each check's status (`skipped` with its reason when it could not run, never `passed`) and its limits. `problems`
   * counts the standing errors and the skipped checks. A document that declares none gets the interference check.
   * A manufacturability check (`printability`, `mill`) that names a device definition reads its limits from `devices`.
   */
  check(doc: Doc, opts: { parts?: LinkedParts; devices?: CheckDevices } = {}): Promise<CheckReport> {
    return this.result<CheckReport>("check", doc, opts);
  }

  /**
   * Can this process make this part: the manufacturability checks of the built bodies, judged by `limits` (a device
   * definition's `process.print` or `process.mill`, each number with its `source`). `print` (FDM): build volume, a
   * closed surface, overhangs, bridges, walls, vertical holes. `mill` (3-axis from +Z, `setup.tools` the tool
   * diameters): travel, a closed surface, reach, inside corners, depth, walls. Each finding is `pass`, `fail` or
   * `unknown` (a limit not declared, no tool: never `pass`) with its value, its limit and where: the body, the B-rep
   * faces and a point. `verdict` is `fail` when any fails, else `unknown` when any is unknown, else `pass`. The part is
   * checked as it stands in the model: Z is the build or spindle axis.
   */
  dfm(doc: Doc, opts: { process: "print" | "mill"; limits: Record<string, unknown>; setup?: MillSetup; part?: string; bodies?: string[]; parts?: LinkedParts }): Promise<DfmReport> {
    return this.result<DfmReport>("dfm", doc, opts);
  }

  /** A drawing view with hidden lines removed: the visible and hidden edges projected along `direction`. */
  async drawing(
    doc: Doc,
    opts: { direction?: [number, number, number]; up?: [number, number, number]; bodies?: string[]; section?: { origin: [number, number, number]; normal: [number, number, number] }; parts?: LinkedParts } = {},
  ): Promise<unknown> {
    return (await this.result<{ projection: unknown }>("drawing", doc, opts)).projection;
  }

  /** Each body's triangles at this chord deflection (mm). */
  async tessellate(doc: Doc, deflection: number, opts: { bodies?: string[]; parts?: LinkedParts } = {}): Promise<{ id: string; name: string; triangles: number; mesh: unknown }[]> {
    return (await this.result<{ bodies: { id: string; name: string; triangles: number; mesh: unknown }[] }>("tessellate", doc, { deflection, ...opts })).bodies;
  }
}
