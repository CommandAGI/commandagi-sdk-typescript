import WebSocket from "ws";
import { RobotBridge } from "./bridge.js";

const DEFAULT_BASE_URL = "https://api.commandagi.com";

/** Built-in 3D simulation worlds (PyBullet) — a mobile robot in each scene. */
export const SIMULATIONS = ["simulation/warehouse", "simulation/house-on-fire", "simulation/school"];
export const COMPUTERS = ["computer/software-engineer", "computer/robots-engineer", "computer/video-professional"];

export class CommandAGIError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A live world you control (a 3D sim or a computer). Created by {@link CommandAGI.launch}. */
export class World {
  readonly sessionId: string;
  readonly deviceId: string;
  readonly kind: "robot" | "computer";
  private client: CommandAGI;
  private ws: WebSocket;
  private latest: Buffer | null = null;
  private opened = false;

  constructor(client: CommandAGI, sessionId: string, deviceId: string, kind: "robot" | "computer") {
    this.client = client;
    this.sessionId = sessionId;
    this.deviceId = deviceId;
    this.kind = kind;
    const base = client.baseUrl.replace(/^http/, "ws");
    this.ws = new WebSocket(`${base}/rt/session/${sessionId}?role=owner&name=sdk`);
    this.ws.on("open", () => {
      this.opened = true;
      this.ws.send(JSON.stringify({ t: "remote.request", deviceId, on: true })); // take control
    });
    this.ws.on("message", (raw) => {
      let m: any;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.t === "frame" && typeof m.url === "string" && m.url.startsWith("data:")) {
        this.latest = Buffer.from(m.url.split(",", 2)[1], "base64");
      }
    });
  }

  /** Block until a frame is available and return the latest observation (JPEG for sims, PNG for
   *  computers). With `fresh`, wait for a frame that arrives after this call. */
  async observe({ fresh = false, timeoutMs = 30_000 }: { fresh?: boolean; timeoutMs?: number } = {}): Promise<Buffer> {
    if (fresh) this.latest = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.latest) return this.latest;
      await sleep(100);
    }
    throw new CommandAGIError("no observation within timeout — is the world still live?");
  }

  /** Send a control action without waiting, e.g. `act("move", { speed: 0.8 })`. */
  act(action: string, payload: Record<string, unknown> = {}): void {
    this.ws.send(JSON.stringify({ t: "control", deviceId: this.deviceId, action, payload }));
  }

  /** Send an action, let the world advance `settleMs`, and return the next observation. */
  async step(action: string, { settleMs = 800, ...payload }: { settleMs?: number } & Record<string, unknown> = {}): Promise<Buffer> {
    this.act(action, payload);
    await sleep(settleMs);
    return this.observe({ fresh: true });
  }

  /** Reset the episode (robot back to its start pose) and return the first observation. */
  async reset({ settleMs = 1000 }: { settleMs?: number } = {}): Promise<Buffer> {
    this.act("reset");
    await sleep(settleMs);
    return this.observe({ fresh: true });
  }

  /** Stop the world and release the cloud VM. */
  async close(): Promise<void> {
    try {
      await this.client.stopSession(this.sessionId);
    } finally {
      this.ws.close();
    }
  }
}

/** Client for the CommandAGI API. Authenticate with an API key (operator scope). */
export class CommandAGI {
  readonly apiKey: string;
  readonly baseUrl: string;

  constructor(opts: { apiKey?: string; baseUrl?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.COMMANDAGI_API_KEY;
    if (!apiKey) throw new CommandAGIError("apiKey is required (pass it or set COMMANDAGI_API_KEY)");
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? process.env.COMMANDAGI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  private headers() {
    return { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" };
  }

  async post(path: string, body: unknown = {}): Promise<any> {
    const res = await fetch(this.baseUrl + path, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new CommandAGIError(`POST ${path} -> ${res.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  }

  async get(path: string): Promise<any> {
    const res = await fetch(this.baseUrl + path, { headers: this.headers() });
    const text = await res.text();
    if (!res.ok) throw new CommandAGIError(`GET ${path} -> ${res.status}: ${text}`);
    return JSON.parse(text);
  }

  /** @internal */
  async stopSession(sessionId: string): Promise<void> {
    try {
      await this.post(`/sessions/${sessionId}/stop`);
    } catch {
      /* best-effort */
    }
  }

  webUrl(): string {
    const host = this.baseUrl.split("://")[1] ?? "";
    if (host.startsWith("api-dev.")) return "https://dev.commandagi.com";
    if (host.startsWith("api.")) return "https://commandagi.com";
    return this.baseUrl;
  }

  /** Launch a world (e.g. `"simulation/warehouse"` or `"computer/software-engineer"`) and return it
   *  live, ready to control. The world has no agent — you drive it. Always `close()` it. */
  async launch(template: string, { wait = true, timeoutMs = 600_000 }: { wait?: boolean; timeoutMs?: number } = {}): Promise<World> {
    const isRobot = template.startsWith("simulation/") || template.startsWith("physical/");
    const { sessionId } = await this.post("/machines", { title: template });
    let res: any;
    try {
      res = await this.post(`/sessions/${sessionId}/${isRobot ? "robots" : "computers"}`, { templateId: template });
    } catch (e) {
      await this.stopSession(sessionId);
      throw e;
    }
    if (res.status !== "granted") {
      await this.stopSession(sessionId);
      throw new CommandAGIError(`launch was not granted: ${JSON.stringify(res)}`);
    }
    const world = new World(this, sessionId, res.deviceId, isRobot ? "robot" : "computer");
    if (wait) await this.waitUntilLive(sessionId, timeoutMs);
    return world;
  }

  /** Register YOUR robot as a device and return a {@link RobotBridge} to stream it. */
  async registerRobot(name = "my-robot"): Promise<RobotBridge> {
    const { sessionId } = await this.post("/machines", { title: name });
    let dev: any;
    try {
      dev = await this.post(`/sessions/${sessionId}/connect-device`, { kind: "robot", name });
    } catch (e) {
      await this.stopSession(sessionId);
      throw e;
    }
    return new RobotBridge(this, {
      controlUrl: dev.controlUrl,
      token: dev.token,
      deviceId: dev.deviceId,
      sessionId,
      sessionUrl: `${this.webUrl()}/machine/${sessionId}`,
    });
  }

  private async waitUntilLive(sessionId: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = await this.get(`/sessions/${sessionId}`);
      if ((s.devices ?? []).some((d: any) => d.status === "live")) return;
      await sleep(3000);
    }
  }
}
