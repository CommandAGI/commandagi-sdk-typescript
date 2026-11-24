/**
 * A LIVE SESSION on one embodiment — a computer, a robot or a sim — hand-written transport over two
 * channels the platform already has:
 *
 *   - CONTROL is a tool call: every action goes through `embodiments.act(embodimentId, action, payload)`,
 *     which the thread resolves against the controls that embodiment is live-declaring. `desktop`,
 *     `robot` and `sim` are the GENERATED typed vocabularies over that one method; `act` is the untyped
 *     form for anything a runtime declares that no vocabulary names.
 *   - FRAMES arrive over the thread's WebSocket (`/rt/thread/:id`) as `frame` messages; the socket opens
 *     on the first frame request and is read-only (control never rides it). Each channel keeps its newest
 *     frame: a simulation's first camera is `cam-head` (a JPEG), its depth is `depth` (a 16-bit PNG of
 *     millimetres, sent as `data` of an image format), and every other camera of its scene is a channel of its id.
 */
import type { CommandAGI, ToolContent } from "./client.js";
import { DesktopControls, RobotControls, SimControls, type Actor, type Args } from "./generated.js";

/** One frame from a channel of this embodiment: `url` is a `data:` URL or an https URL. */
export interface Frame {
  embodimentId: string;
  channelId: string;
  url: string;
  /** When the hub received it (ms since epoch). */
  at: number;
}

/** A kept frame: whether it is a picture (a `frame`, not a depth image) and when it arrived here, by this clock. */
interface Kept extends Frame {
  picture: boolean;
  received: number;
}

/** What `controls()` reports: each live channel, the actions it accepts and their payload schemas. */
export interface ControlChannel {
  channelId: string;
  actions: string[];
  kind?: string;
  label?: string;
  payloadSchema?: unknown;
}

type Waiter = { resolve: (f: Frame) => void; reject: (e: Error) => void; after: number; channel: string | undefined };

export class Session implements Actor {
  /** Computers: pointer, keyboard, waits. */
  readonly desktop: DesktopControls;
  /** Physical robots driven through a robot driver. */
  readonly robot: RobotControls;
  /** Simulated worlds and the robots inside them. */
  readonly sim: SimControls;

  private socket: WebSocket | null = null;
  /** The newest frame of each channel, by channel id. */
  private latest = new Map<string, Kept>();
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

  // ─── computer use (docs/computer-use.md in the CommandAGI repository) ───────────────────────────────

  /**
   * See a computer: its screen now, as the frame an agent acts in. `text` names the frame's id and size and the
   * coordinate rule (coordinates are pixels of this frame); `image` is its bytes.
   */
  async screenshot(): Promise<{ text: string; image: Uint8Array; mimeType: string }> {
    const parts = await this.client.callContent("computer_screenshot", { threadId: this.threadId, embodimentId: this.embodimentId });
    return { text: textOf(parts), ...imageOf(parts) };
  }

  /**
   * One computer-use action (`click`, `drag`, `type`, `key` … in pixels of the latest frame), answered with what it
   * changed (`{ status, changed, region, settle, frame }`) and the frame after it. The host records the action
   * before it sends it and sends it once.
   */
  async computer(action: string, payload: Args = {}): Promise<{ result: unknown; image: Uint8Array | null; mimeType: string | null }> {
    const parts = await this.client.callContent("computer_act", { threadId: this.threadId, embodimentId: this.embodimentId, action, payload });
    let result: unknown = textOf(parts);
    try {
      result = JSON.parse(result as string);
    } catch {
      /* the answer was not JSON: keep its text */
    }
    const img = parts.some((p) => p.type === "image") ? imageOf(parts) : { image: null, mimeType: null };
    return { result, ...img };
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
    ws.addEventListener("message", (ev) => this.take(String(ev.data)));
    const fail = (why: string) => {
      this.socket = null;
      const err = new Error(`commandagi: frame socket ${why}`);
      for (const w of this.waiters.splice(0)) w.reject(err);
    };
    ws.addEventListener("close", () => fail("closed"));
    ws.addEventListener("error", () => fail("errored"));
    this.socket = ws;
  }

  /** One message of the thread's socket: a frame of this embodiment is kept as its channel's newest. */
  private take(raw: string): void {
    let m: { t?: string; embodimentId?: string; channelId?: string; url?: string; at?: number; format?: string };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    // A picture is a `frame`; a depth image comes as `data` of an image format (it is not a picture to show).
    const picture = m.t === "frame";
    if (!(picture || (m.t === "data" && String(m.format ?? "").startsWith("image/")))) return;
    if (m.embodimentId !== this.embodimentId || typeof m.url !== "string") return;
    const kept: Kept = {
      embodimentId: m.embodimentId,
      channelId: m.channelId ?? "",
      url: m.url,
      at: typeof m.at === "number" ? m.at : Date.now(),
      picture,
      // When it arrived here, by this computer's clock: what `fresh` compares, so another clock never decides.
      received: Date.now(),
    };
    this.latest.set(kept.channelId, kept);
    const ready = this.waiters.filter((w) => this.matches(kept, w.channel) && kept.received >= w.after);
    this.waiters = this.waiters.filter((w) => !ready.includes(w));
    for (const w of ready) w.resolve(frameOf(kept));
  }

  private matches(f: Kept, channel: string | undefined): boolean {
    return channel === undefined ? f.picture : f.channelId === channel;
  }

  private newest(channel: string | undefined): Kept | null {
    let best: Kept | null = null;
    for (const f of this.latest.values())
      if (this.matches(f, channel) && (!best || f.received > best.received)) best = f;
    return best;
  }

  /**
   * The latest frame of `channel` (default: the newest picture of any channel). `fresh: true` waits for one
   * that arrives AFTER this call — what you want right after acting, so you see the result and not the
   * moment before it.
   */
  frame(opts: { fresh?: boolean; timeoutMs?: number; channel?: string } = {}): Promise<Frame> {
    this.open();
    const newest = this.newest(opts.channel);
    if (!opts.fresh && newest) return Promise.resolve(frameOf(newest));
    const after = opts.fresh ? Date.now() : 0;
    return new Promise<Frame>((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, after, channel: opts.channel };
      this.waiters.push(waiter);
      const timeoutMs = opts.timeoutMs ?? 30_000;
      setTimeout(() => {
        if (!this.waiters.includes(waiter)) return;
        this.waiters = this.waiters.filter((w) => w !== waiter);
        const on = opts.channel === undefined ? "" : ` on ${opts.channel}`;
        reject(new Error(`commandagi: no frame from ${this.embodimentId}${on} within ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /** The latest frame's image bytes (JPEG/PNG), decoding a data: URL or fetching an https one. */
  async observe(opts: { fresh?: boolean; timeoutMs?: number; channel?: string } = {}): Promise<Uint8Array> {
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

  /** Every new frame (of `channel`), as it arrives. */
  async *frames(opts: { channel?: string } = {}): AsyncGenerator<Frame> {
    let last = 0;
    while (!this.closed) {
      const f = await this.frame({ fresh: true, timeoutMs: 3_600_000, channel: opts.channel });
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

const frameOf = ({ embodimentId, channelId, url, at }: Kept): Frame => ({ embodimentId, channelId, url, at });
const textOf = (parts: ToolContent[]) => parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
function imageOf(parts: ToolContent[]): { image: Uint8Array; mimeType: string } {
  const img = parts.find((p): p is Extract<ToolContent, { type: "image" }> => p.type === "image");
  if (!img) throw new Error("commandagi: the answer has no image");
  return { image: Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0)), mimeType: img.mimeType };
}
