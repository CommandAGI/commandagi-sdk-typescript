/**
 * `commandagi` with no arguments — an interactive terminal session, in the manner of Claude Code or Codex.
 *
 * You talk to an agent: the first line you type starts a thread on it, every later line goes to that
 * thread, and the agent's reply streams in as it is written (`message.delta`), with what it is doing right
 * now (`agent.status`: thinking, or which tool) on a status line. Slash commands reach the rest:
 *
 *   /threads            your recent threads          /open <n|id>   continue one
 *   /new [intent]       start a fresh thread         /launch <snapshot>   a world you drive (no agent)
 *   /daemon [start|stop|status]   host this computer in the background
 *   /help   /quit
 *
 * Leaving the TUI never stops hosting: the daemon (or the desktop app) keeps running and says so on exit.
 * Zero dependencies — readline and ANSI — so installing the SDK stays light. The rendering is a small
 * state machine ({@link Transcript}) kept apart from the terminal, so it is testable.
 */
import { createInterface, type Interface } from "node:readline";
import type { CommandAGI } from "./client.js";

// ─── rendering (pure) ────────────────────────────────────────────────────────────────────────────

const ansi = {
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
};

/** A thread-socket message the TUI renders (a subset of the platform's ServerMessage). */
export type ThreadEvent =
  | {
      t: "message";
      id: string;
      role: "agent" | "user" | "system";
      text: string;
      senderName?: string;
    }
  | { t: "message.delta"; id: string; text: string; thinking?: boolean; done?: boolean }
  | { t: "message.delete"; id: string }
  | { t: "agent.status"; state: "idle" | "thinking" | "tool"; label?: string }
  | { t: "error"; code: string; message: string };

/**
 * Turns thread events into terminal output. A streaming reply arrives as the running text so far; the
 * transcript prints only the new suffix, so the reply appears to type itself, and closes the line when
 * the committed `message` for the same id lands (or the draft is deleted).
 */
export class Transcript {
  private drafts = new Map<string, number>();
  /** The live status line ("thinking…", "Editing report.md…"), or "" when idle. */
  status = "";

  constructor(private readonly write: (s: string) => void) {}

  apply(ev: ThreadEvent): void {
    switch (ev.t) {
      case "message.delta": {
        if (ev.thinking && !ev.text) return;
        const shown = this.drafts.get(ev.id);
        if (shown === undefined) {
          this.write(ansi.cyan("agent › ") + ev.text);
          this.drafts.set(ev.id, ev.text.length);
        } else if (ev.text.length > shown) {
          this.write(ev.text.slice(shown));
          this.drafts.set(ev.id, ev.text.length);
        }
        return;
      }
      case "message": {
        const shown = this.drafts.get(ev.id);
        if (shown !== undefined) {
          // The committed text may extend the draft; print what is still missing and close the line.
          if (ev.text.length > shown) this.write(ev.text.slice(shown));
          this.write("\n");
          this.drafts.delete(ev.id);
          return;
        }
        if (ev.role === "user") return; // your own line is already on screen
        const who =
          ev.role === "agent" ? ansi.cyan(`${ev.senderName ?? "agent"} › `) : ansi.dim("system › ");
        this.write(who + (ev.role === "system" ? ansi.dim(ev.text) : ev.text) + "\n");
        return;
      }
      case "message.delete":
        if (this.drafts.delete(ev.id)) this.write(ansi.dim(" (interrupted)") + "\n");
        return;
      case "agent.status":
        this.status =
          ev.state === "idle" ? "" : ev.state === "tool" ? (ev.label ?? "working…") : "thinking…";
        return;
      case "error":
        this.write(ansi.red(`error: ${ev.message}`) + "\n");
        return;
    }
  }
}

/** One parsed input line: a slash command with its argument, or text for the agent. */
export type Input =
  | { kind: "text"; text: string }
  | { kind: "command"; name: string; arg: string }
  | { kind: "empty" };

export function parseInput(line: string): Input {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "empty" };
  if (!trimmed.startsWith("/")) return { kind: "text", text: trimmed };
  const space = trimmed.indexOf(" ");
  return space === -1
    ? { kind: "command", name: trimmed.slice(1), arg: "" }
    : { kind: "command", name: trimmed.slice(1, space), arg: trimmed.slice(space + 1).trim() };
}

// ─── the session (I/O) ───────────────────────────────────────────────────────────────────────────

type DaemonModule = {
  main(argv: string[]): Promise<void>;
  probeHost(): Promise<{ state: { owner: string; direct: string; pid: number } } | null>;
};

export async function runTui(
  cagi: CommandAGI,
  loadDaemon: () => Promise<DaemonModule>,
): Promise<void> {
  const out = (s: string) => process.stdout.write(s);
  const transcript = new Transcript(out);
  let threadId: string | null = null;
  let socket: WebSocket | null = null;
  let recent: { threadId: string; title?: string }[] = [];

  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  let closed = false;
  rl.on("close", () => (closed = true));
  const refreshPrompt = () => {
    if (closed) return; // a late event (a reply, a finished command) after /quit must not redraw
    process.stdout.write("\r\x1b[2K"); // redraw in place: prompt(true) re-renders what you've typed
    rl.setPrompt((transcript.status ? ansi.dim(`[${transcript.status}] `) : "") + ansi.bold("› "));
    rl.prompt(true);
  };
  /** Print above the prompt without mangling what the user is typing. */
  const say = (s: string) => {
    process.stdout.write("\r\x1b[2K");
    out(s.endsWith("\n") ? s : s + "\n");
    refreshPrompt();
  };

  const attach = (id: string) => {
    socket?.close();
    threadId = id;
    const url =
      cagi.baseUrl.replace(/^http/, "ws") +
      `/rt/thread/${encodeURIComponent(id)}?token=${encodeURIComponent(cagi.apiKey)}`;
    const ws = new WebSocket(url);
    ws.addEventListener("message", (ev) => {
      let m: ThreadEvent;
      try {
        m = JSON.parse(String(ev.data)) as ThreadEvent;
      } catch {
        return;
      }
      if (!["message", "message.delta", "message.delete", "agent.status", "error"].includes(m.t))
        return;
      process.stdout.write("\r\x1b[2K");
      transcript.apply(m);
      refreshPrompt();
    });
    ws.addEventListener("close", () => {
      if (socket === ws) say(ansi.dim("(disconnected from the thread — /open to reconnect)"));
    });
    socket = ws;
  };

  const hosting = async (): Promise<string> => {
    try {
      const found = await (await loadDaemon()).probeHost();
      return found
        ? `hosted by the ${found.state.owner} (pid ${found.state.pid}, share=${found.state.direct})`
        : "not hosted — /daemon start shares it";
    } catch {
      return "daemon unavailable in this build";
    }
  };

  const commands: Record<string, (arg: string) => Promise<void>> = {
    help: async () =>
      say(
        [
          "Type to talk to the agent. The first line starts a thread; later lines continue it.",
          "  /threads            your recent threads",
          "  /open <n|id>        continue a thread",
          "  /new [intent]       start a fresh thread",
          "  /launch <snapshot>  launch a world you drive (e.g. simulation/warehouse)",
          "  /daemon [start|stop|status]   host this computer in the background",
          "  /quit               leave (hosting keeps running)",
        ].join("\n"),
      ),
    threads: async () => {
      const r = (await cagi.threads.list()) as {
        threads?: { threadId?: string; id?: string; title?: string }[];
      };
      recent = (r.threads ?? [])
        .slice(0, 15)
        .map((t) => ({ threadId: String(t.threadId ?? t.id), title: t.title }));
      say(
        recent.length
          ? recent
              .map((t, i) => `  ${i + 1}. ${t.title ?? "(untitled)"}  ${ansi.dim(t.threadId)}`)
              .join("\n")
          : "no threads yet",
      );
    },
    open: async (arg) => {
      const n = Number(arg);
      const id = Number.isInteger(n) && n >= 1 && recent[n - 1] ? recent[n - 1]!.threadId : arg;
      if (!id) return say("usage: /open <n|threadId>  (see /threads)");
      attach(id);
      say(ansi.dim(`continuing ${id}`));
    },
    new: async (arg) => {
      socket?.close();
      socket = null;
      threadId = null;
      if (arg) await send(arg);
      else say(ansi.dim("next line starts a new thread"));
    },
    launch: async (arg) => {
      if (!arg) return say("usage: /launch <snapshotId>  (e.g. simulation/warehouse)");
      say(ansi.dim(`launching ${arg}… (waits until it is live)`));
      const world = await cagi.launch(arg);
      const controls = await world.controls();
      say(
        `live: thread ${world.threadId}, embodiment ${world.embodimentId}\n` +
          controls.map((c) => `  ${c.channelId}: ${c.actions.join(", ")}`).join("\n") +
          `\n${ansi.dim(`drive it from code: cagi.session("${world.threadId}", "${world.embodimentId}")`)}`,
      );
    },
    daemon: async (arg) => {
      const sub = arg || "status";
      if (sub === "status") return say(`this computer: ${await hosting()}`);
      const mod = await loadDaemon();
      const lines: string[] = [];
      const original = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((s: string) => (
        lines.push(String(s)),
        true
      )) as typeof process.stdout.write;
      try {
        await mod.main([sub]);
      } finally {
        process.stdout.write = original;
      }
      say(sub === "start" || sub === "stop" ? `this computer: ${await hosting()}` : lines.join(""));
    },
    quit: async () => rl.close(),
  };

  const send = async (text: string) => {
    if (!threadId) {
      const created = (await cagi.threads.create({ intent: text, title: text.slice(0, 60) })) as {
        threadId: string;
      };
      attach(created.threadId);
      say(ansi.dim(`thread ${created.threadId}`));
    } else {
      await cagi.threads.send(threadId, text);
    }
  };

  const me = (await cagi.whoami().catch((e: Error) => ({ error: e.message }))) as {
    email?: string;
    name?: string;
    id?: string;
    error?: string;
  };
  if (me.error) {
    out(ansi.red(`could not sign in: ${me.error}`) + "\n");
    rl.close();
    return;
  }
  out(
    `${ansi.bold("CommandAGI")} — ${me.email ?? me.name ?? `signed in (${me.id})`}\n` +
      ansi.dim(`this computer: ${await hosting()}\n`) +
      ansi.dim("type to talk to an agent · /help for commands · /quit to leave\n"),
  );
  refreshPrompt();

  rl.on("line", (line) => {
    const input = parseInput(line);
    const run =
      input.kind === "empty"
        ? Promise.resolve()
        : input.kind === "text"
          ? send(input.text)
          : (commands[input.name] ?? (async () => say(`unknown command /${input.name} — /help`)))(
              input.arg,
            );
    run.catch((e: Error) => say(ansi.red(`error: ${e.message}`))).finally(refreshPrompt);
  });

  await new Promise<void>((resolve) => rl.on("close", resolve));
  (socket as WebSocket | null)?.close();
  out("\n" + ansi.dim(`bye — this computer: ${await hosting()}`) + "\n");
}
