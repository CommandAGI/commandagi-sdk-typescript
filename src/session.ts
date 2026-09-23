/**
 * A LIVE SESSION on one embodiment — a computer, a robot or a sim — hand-written transport over two
 * channels the platform already has:
 *
 *   - CONTROL is a tool call: every action goes through `embodiments.act(embodimentId, action, payload)`,
 *     which the thread resolves against the controls that embodiment is live-declaring. `desktop`,
 *     `robot` and `sim` are the GENERATED typed vocabularies over that one method; `act` is the untyped
 *     form for anything a runtime declares that no vocabulary names.
 *   - FRAMES arrive over the thread's WebSocket (`/rt/thread/:id`) as `frame` messages; the socket opens
 *     on the first frame request and is read-only (control never rides it).
 */
import type { CommandAGI } from "./client.js";
import { DesktopControls, RobotControls, SimControls, type Actor, type Args } from "./generated.js";

/** One frame from a channel of this embodiment: `url` is a `data:` URL or an https URL. */
export interface Frame {
  embodimentId: string;
  channelId: string;
  url: string;
  /** When the hub received it (ms since epoch). */
  at: number;
}

/** What `controls()` reports: each live channel, the actions it accepts and their payload schemas. */
export interface ControlChannel {
  channelId: string;
  actions: string[];
  kind?: string;
  label?: string;
  payloadSchema?: unknown;
}

type Waiter = { resolve: (f: Frame) => void; reject: (e: Error) => void; after: number };

export class Session implements Actor {
  /** Computers: pointer, keyboard, waits. */
  readonly desktop: DesktopControls;
  /** Physical robots driven through a robot driver. */
  readonly robot: RobotControls;
  /** Simulated worlds and the robots inside them. */
  readonly sim: SimControls;

  private socket: WebSocket | null = null;
  private latest: Frame | null = null;
  private waiters: Waiter[] = [];
  private closed = false;
  private readonly ownsThread: boolean;

  constructor(
    private readonly client: CommandAGI,
    readonly threadId: string,
    readonly embodimentId: string,
    opts: { ownsThread: boolean },
  ) {
    this.ownsThread = opts.ownsThread;
    this.desktop = new DesktopControls(this);
    this.robot = new RobotControls(this);
    this.sim = new SimControls(this);
  }

  // ─── control ────────────────────────────────────────────────────────────────────────────────────

  /** Send one declared action to this embodiment. Refusals (undeclared, invalid payload) throw. */
  act(action: string, payload: Args = {}): Promise<unknown> {
    return this.client.embodiments.act(this.embodimentId, action, payload, this.threadId);
  }

  /** The controls this embodiment declares right now. Empty until its runtime has connected. */
  async controls(): Promise<ControlChannel[]> {
    const r = (await this.client.embodiments.controls(this.embodimentId, this.threadId)) as {
      controls?: ControlChannel[];
    };
    return r.controls ?? [];
  }

  /** The live world a sim/robot runtime reports: robots, objects, poses. */
  describe(): Promise<unknown> {
    return this.client.embodiments.describe(this.threadId);
  }

  /** Resolve once the embodiment is connected and declaring controls (a booting machine is not). */
  async ready(opts: { timeoutMs?: number; pollMs?: number } = {}): Promise<ControlChannel[]> {
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    for (;;) {
      const controls = await this.controls();
      if (controls.length) return controls;
      if (Date.now() > deadline)
        throw new Error(
          `commandagi: ${this.embodimentId} declared no controls within ${opts.timeoutMs ?? 600_000}ms — is it running?`,
        );
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 3_000));
    }
  }

  // ─── frames ─────────────────────────────────────────────────────────────────────────────────────

  private open(): void {
    if (this.socket || this.closed) return;
    if (typeof WebSocket === "undefined")
      throw new Error("commandagi: frames need a global WebSocket (Node 22+ or a browser)");
    const url =
      this.client.baseUrl.replace(/^http/, "ws") +
      `/rt/thread/${encodeURIComponent(this.threadId)}?token=${encodeURIComponent(this.client.apiKey)}`;
    const ws = new WebSocket(url);
    ws.addEventListener("message", (ev) => {
      let m: { t?: string; embodimentId?: string; channelId?: string; url?: string; at?: number };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.t !== "frame" || m.embodimentId !== this.embodimentId || typeof m.url !== "string")
        return;
      const frame: Frame = {
        embodimentId: m.embodimentId,
        channelId: m.channelId ?? "",
        url: m.url,
        at: typeof m.at === "number" ? m.at : Date.now(),
      };
      this.latest = frame;
      const ready = this.waiters.filter((w) => frame.at > w.after);
      this.waiters = this.waiters.filter((w) => frame.at <= w.after);
      for (const w of ready) w.resolve(frame);
    });
    const fail = (why: string) => {
      this.socket = null;
      const err = new Error(`commandagi: frame socket ${why}`);
      for (const w of this.waiters.splice(0)) w.reject(err);
    };
    ws.addEventListener("close", () => fail("closed"));
    ws.addEventListener("error", () => fail("errored"));
    this.socket = ws;
  }

  /**
   * The latest frame. `fresh: true` waits for one that arrives AFTER this call — what you want right
   * after acting, so you see the result and not the moment before it.
   */
  frame(opts: { fresh?: boolean; timeoutMs?: number } = {}): Promise<Frame> {
    this.open();
    if (!opts.fresh && this.latest) return Promise.resolve(this.latest);
    const after = opts.fresh ? Date.now() : 0;
    return new Promise<Frame>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, after };
      this.waiters.push(waiter);
      const timeoutMs = opts.timeoutMs ?? 30_000;
      setTimeout(() => {
        if (!this.waiters.includes(waiter)) return;
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error(`commandagi: no frame from ${this.embodimentId} within ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /** The latest frame's image bytes (JPEG/PNG), decoding a data: URL or fetching an https one. */
  async observe(opts: { fresh?: boolean; timeoutMs?: number } = {}): Promise<Uint8Array> {
    const { url } = await this.frame(opts);
    if (url.startsWith("data:")) {
      const b64 = url.slice(url.indexOf(",") + 1);
      return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    }
    const res = await this.client.fetchImpl(url, {
      headers: { authorization: "Bearer " + this.client.apiKey },
    });
    if (!res.ok) throw new Error(`commandagi: frame fetch ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Every new frame, as it arrives. */
  async *frames(): AsyncGenerator<Frame> {
    let last = 0;
    while (!this.closed) {
      const f = await this.frame({ fresh: true, timeoutMs: 3_600_000 });
      if (f.at > last) {
        last = f.at;
        yield f;
      }
    }
  }

  // ─── lifecycle ──────────────────────────────────────────────────────────────────────────────────

  /** Stop watching (closes the frame socket). The embodiment keeps running. */
  close(): void {
    this.closed = true;
    this.socket?.close();
    this.socket = null;
  }

  /** Close, and if this session LAUNCHED its world, stop the world's run and release the machine. */
  async stop(): Promise<void> {
    this.close();
    if (this.ownsThread) await this.client.threads.kill(this.threadId);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.stop();
  }
}
