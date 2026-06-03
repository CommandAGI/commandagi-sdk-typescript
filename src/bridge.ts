import WebSocket from "ws";
import type { CommandAGI } from "./client.js";

function dataUrl(frame: Buffer): string {
  const png = frame.length > 8 && frame[0] === 0x89 && frame[1] === 0x50;
  return `data:${png ? "image/png" : "image/jpeg"};base64,${frame.toString("base64")}`;
}

export interface BridgeRunOpts {
  /** Returns the robot's latest camera frame as JPEG/PNG bytes. */
  camera: () => Buffer | Promise<Buffer>;
  /** Applies an incoming control action to your hardware. */
  onAction: (action: string, payload: Record<string, unknown>) => void;
  fps?: number;
  channel?: string;
}

/**
 * Bring-your-own-robot: stream YOUR robot's camera into a CommandAGI session and receive actions.
 * Created by {@link CommandAGI.registerRobot}; call {@link run}.
 */
export class RobotBridge {
  readonly controlUrl: string;
  readonly token: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly sessionUrl: string;
  private client: CommandAGI;
  private ws?: WebSocket;
  private timer?: ReturnType<typeof setInterval>;
  private channel = "cam-head";

  constructor(client: CommandAGI, o: { controlUrl: string; token: string; deviceId: string; sessionId: string; sessionUrl: string }) {
    this.client = client;
    this.controlUrl = o.controlUrl;
    this.token = o.token;
    this.deviceId = o.deviceId;
    this.sessionId = o.sessionId;
    this.sessionUrl = o.sessionUrl;
  }

  private wsUrl(): string {
    const base = this.controlUrl.replace(/^http/, "ws");
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}runtime=1&role=agent&token=${this.token}`;
  }

  /** Start streaming. Publishes `camera()` frames at `fps` and calls `onAction` for each control
   *  message. Non-blocking (returns immediately); call {@link close} to take the robot offline. */
  run({ camera, onAction, fps = 10, channel = "cam-head" }: BridgeRunOpts): RobotBridge {
    this.channel = channel;
    this.ws = new WebSocket(this.wsUrl());
    this.ws.on("open", () => {
      this.ws!.send(JSON.stringify({ type: "status", status: "live" }));
      this.ws!.send(JSON.stringify({ type: "channels", channels: [{ channelId: channel, label: "Camera", kind: "camera" }] }));
      this.timer = setInterval(async () => {
        try {
          const frame = await camera();
          if (frame && frame.length) this.ws!.send(JSON.stringify({ type: "frame", channelId: channel, url: dataUrl(frame) }));
        } catch {
          /* keep streaming */
        }
      }, 1000 / Math.max(0.5, fps));
    });
    this.ws.on("message", (raw) => {
      let m: any;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.type === "control") {
        try {
          onAction(m.action ?? "", m.payload ?? {});
        } catch {
          /* swallow user handler errors */
        }
      }
    });
    return this;
  }

  /** Stop streaming (without releasing the session). */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.ws?.close();
  }

  /** Stop streaming and release the session (the robot goes offline). */
  async close(): Promise<void> {
    this.stop();
    await this.client.stopSession(this.sessionId);
  }
}
