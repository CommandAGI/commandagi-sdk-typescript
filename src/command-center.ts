/**
 * The agent command center — every thread you can reach, at a glance, in a full-screen view of the TUI
 * (`/agents` inside `commandagi`, or `commandagi agents` straight from the shell).
 *
 * Each thread falls in exactly one bucket, in this precedence (the web's status dot, threadDotStatus.ts,
 * with its two quiet states split in time):
 *
 *   Needs you  — an open error, or an unread notification pointing at the thread (an agent asking for
 *                a file, an approval, an answer). A human is the blocker.
 *   Working    — its run is live (`status: "running"`, mirrored from the thread's Durable Object).
 *   Ready      — idle, and touched within the last day: the agent finished and the next move is yours.
 *   Inactive   — idle for longer than that.
 *
 * Threads are grouped by where they live (`ownerScope`: your personal account, each org, or someone
 * else's thread shared with you) — `g` toggles grouping off — and the right pane shows the selected
 * thread's detail. Enter opens it in the chat; `n` starts a new one; esc goes back.
 *
 * Like ./tui, rendering is a pure function of a state ({@link renderCenter}) kept apart from the
 * terminal; {@link runCommandCenter} is the only half that touches stdin/stdout.
 */
import { emitKeypressEvents } from "node:readline";
import type { CommandAGI } from "./client.js";

// ─── the model ───────────────────────────────────────────────────────────────────────────────────

export type Bucket = "needs" | "working" | "ready" | "inactive";
export const BUCKETS: readonly Bucket[] = ["needs", "working", "ready", "inactive"];
const BUCKET_LABEL: Record<Bucket, string> = {
  needs: "Needs you",
  working: "Working",
  ready: "Ready",
  inactive: "Inactive",
};
/** How long an idle thread stays "Ready" before it counts as inactive. */
export const READY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A `list_threads` row — the fields the command center reads. */
export interface ThreadRow {
  id: string;
  title?: string | null;
  status?: string | null;
  ownerScope?: string | null;
  createdAt?: number | null;
  startedAt?: number | null;
  lastActivityAt?: number | null;
  lastEvent?: { text: string; role: string; at: number } | null;
  error?: { text: string; at: number } | null;
  agents?: { name?: string; modelId?: string }[];
  embodiments?: { id?: string; kind?: string; name?: string; status?: string }[];
}

export interface Notice {
  threadId: string | null;
  title: string;
  body?: string | null;
  read: boolean;
  createdAt: number;
}

export interface CenterEntry {
  id: string;
  title: string;
  bucket: Bucket;
  /** Why it needs you (the error, or the newest unread notification), when it does. */
  reason: string | null;
  updatedAt: number;
  group: string;
  thread: ThreadRow;
}

export function classify(
  t: ThreadRow,
  unread: ReadonlyMap<string, Notice>,
  now: number,
): { bucket: Bucket; reason: string | null; updatedAt: number } {
  const updatedAt = t.lastActivityAt ?? t.startedAt ?? t.createdAt ?? 0;
  const notice = unread.get(t.id);
  if (t.error) return { bucket: "needs", reason: t.error.text, updatedAt };
  if (notice)
    return {
      bucket: "needs",
      reason: notice.body ? `${notice.title}: ${notice.body}` : notice.title,
      updatedAt: Math.max(updatedAt, notice.createdAt),
    };
  if (t.status === "running") return { bucket: "working", reason: null, updatedAt };
  return {
    bucket: now - updatedAt <= READY_WINDOW_MS ? "ready" : "inactive",
    reason: null,
    updatedAt,
  };
}

/** Name a thread's `ownerScope` for a group header. */
export function scopeLabel(
  scope: string | null | undefined,
  meId: string,
  orgNames: ReadonlyMap<string, string>,
): string {
  if (!scope || scope === `user:${meId}`) return "Personal";
  if (scope.startsWith("org:")) return orgNames.get(scope) ?? scope;
  return "Shared with you";
}

export function buildEntries(
  threads: readonly ThreadRow[],
  notices: readonly Notice[],
  meId: string,
  orgNames: ReadonlyMap<string, string>,
  now: number,
): CenterEntry[] {
  const unread = new Map<string, Notice>();
  for (const n of notices) {
    if (n.read || !n.threadId) continue;
    const seen = unread.get(n.threadId);
    if (!seen || n.createdAt > seen.createdAt) unread.set(n.threadId, n);
  }
  return threads.map((t) => {
    const c = classify(t, unread, now);
    return {
      id: t.id,
      title: t.title?.replace(/\s+/g, " ").trim() || "Untitled thread",
      ...c,
      group: scopeLabel(t.ownerScope, meId, orgNames),
      thread: t,
    };
  });
}

export interface CenterState {
  entries: CenterEntry[];
  filter: "all" | Bucket;
  grouped: boolean;
  /** The selected thread's id (selection follows the thread across refreshes, not the row index). */
  selectedId: string | null;
  /** The thread the chat is attached to, tagged "current". */
  currentId: string | null;
  /** First visible list row. */
  scroll: number;
  help: boolean;
  /** A transient line under the list (a failed refresh, "refreshing…"). */
  notice: string | null;
  now: number;
}

type Row =
  | { kind: "group"; label: string; count: number }
  | { kind: "gap" }
  | { kind: "entry"; e: CenterEntry };

/** The list as rows: filtered, newest first, under group headers when grouped. */
export function visibleRows(s: CenterState): Row[] {
  const shown = s.entries
    .filter((e) => s.filter === "all" || e.bucket === s.filter)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!s.grouped) return shown.map((e) => ({ kind: "entry", e }));
  // Groups ordered by their freshest thread, so where you are working now sits on top.
  const groups = new Map<string, CenterEntry[]>();
  for (const e of shown) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
  const rows: Row[] = [];
  for (const [label, es] of groups) {
    if (rows.length) rows.push({ kind: "gap" });
    rows.push({ kind: "group", label, count: es.length });
    for (const e of es) rows.push({ kind: "entry", e });
  }
  return rows;
}

export function selectable(s: CenterState): CenterEntry[] {
  return visibleRows(s).flatMap((r) => (r.kind === "entry" ? [r.e] : []));
}

/** Keep the selection on a visible thread (the first one when it fell out of the filter). */
export function normalize(s: CenterState): CenterState {
  const sel = selectable(s);
  const selectedId = sel.some((e) => e.id === s.selectedId) ? s.selectedId : (sel[0]?.id ?? null);
  return { ...s, selectedId };
}

export function moveSelection(s: CenterState, delta: number): CenterState {
  const sel = selectable(s);
  if (!sel.length) return s;
  const i = Math.max(
    0,
    sel.findIndex((e) => e.id === s.selectedId),
  );
  const next = sel[Math.min(sel.length - 1, Math.max(0, i + delta))]!;
  return { ...s, selectedId: next.id };
}

export function cycleFilter(s: CenterState, delta: 1 | -1): CenterState {
  const order: CenterState["filter"][] = ["all", ...BUCKETS];
  const i = order.indexOf(s.filter);
  const filter = order[(i + delta + order.length) % order.length]!;
  return normalize({ ...s, filter, scroll: 0 });
}

// ─── rendering (pure) ────────────────────────────────────────────────────────────────────────────

const esc = (code: string) => (s: string) => `\x1b[${code}m${s}\x1b[0m`;
const c = {
  bold: esc("1"),
  dim: esc("2"),
  inverse: esc("7"),
  red: esc("31"),
  green: esc("32"),
  yellow: esc("33"),
  cyan: esc("36"),
  boldCyan: esc("1;36"),
  selected: esc("1;7"),
};

/** Printable width, by code point (the TUI's titles are prose, not CJK art). */
const width = (s: string) => [...s].length;

/** Fit to exactly `w` columns: truncate with an ellipsis, or pad. */
export function fit(s: string, w: number): string {
  if (w <= 0) return "";
  const cps = [...s.replace(/[\t\r\n]+/g, " ")];
  if (cps.length > w) return cps.slice(0, Math.max(0, w - 1)).join("") + "…";
  return cps.join("") + " ".repeat(w - cps.length);
}

function wrap(text: string, w: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (width(line) + 1 + width(word) <= w) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const out = lines.map((l) => (width(l) > w ? fit(l, w) : l));
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = fit(kept[maxLines - 1]! + " …", w).trimEnd();
    return kept;
  }
  return out;
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

const DOT: Record<Bucket, string> = {
  needs: c.red("●"),
  working: c.yellow("●"),
  ready: c.green("○"),
  inactive: c.dim("○"),
};

const HELP = [
  "Agent command center — every thread you can reach.",
  "",
  "  tab / shift+tab   next / previous filter",
  "  ↑ ↓  k j          move            pgup / pgdn   page",
  "  enter             open the thread in the chat",
  "  n                 start a new thread",
  "  g                 group by where it lives (on / off)",
  "  r                 refresh now (it also refreshes every few seconds)",
  "  esc  q            back",
  "",
  "Needs you  an open error, or an unread notification from the thread's agent",
  "Working    its run is live",
  "Ready      idle, active within the last day",
  "Inactive   idle for longer",
];

/** Rows between the three header lines and the footer. */
const bodyRowsFor = (rows: number) => Math.max(2, rows - 4);

/**
 * The first visible list row: the stored scroll, moved just enough to keep the selection (and the
 * group header above it, when it fits) on screen.
 */
export function scrollFor(s: CenterState, rows: Row[], listRows: number): number {
  const sel = rows.findIndex((r) => r.kind === "entry" && r.e.id === s.selectedId);
  let scroll = Math.min(s.scroll, Math.max(0, rows.length - listRows));
  if (sel >= 0 && sel < scroll) scroll = Math.max(0, sel - 1);
  if (sel >= 0 && sel >= scroll + listRows - 1) scroll = sel - listRows + 2;
  return Math.max(0, scroll);
}

/** The whole screen as `rows` lines of at most `cols` printable columns. */
export function renderCenter(s: CenterState, cols: number, rows: number): string[] {
  const out: string[] = [];
  const all = s.entries;
  const count = (b: Bucket) => all.filter((e) => e.bucket === b).length;

  // Header: title + grouping, then the filter tabs.
  out.push(
    c.bold("Agent command center") +
      c.dim("  Group: ") +
      (s.grouped ? "Where it lives" : "None") +
      c.dim("  g"),
  );
  const tabs: [CenterState["filter"], string][] = [
    ["all", `All ${all.length}`],
    ...BUCKETS.map((b) => [b, `${BUCKET_LABEL[b]} ${count(b)}`] as [Bucket, string]),
  ];
  const tabText = tabs.map(([f, label]) =>
    f === s.filter ? c.inverse(` ${label} `) : ` ${label} `,
  );
  const tabWidth = tabs.reduce((n, [, l]) => n + width(l) + 2, 0) + tabs.length - 1;
  const hint = c.bold("tab/shift+tab") + " filter";
  const gap = cols - tabWidth - width("tab/shift+tab filter");
  out.push(tabText.join(" ") + (gap > 1 ? " ".repeat(gap) + hint : ""));
  out.push(c.dim("─".repeat(cols)));

  const bodyRows = bodyRowsFor(rows);
  const footer =
    `${c.bold("?")} help  ${c.bold("esc")} back  ${c.bold("↑/↓")} move  ` +
    `${c.bold("enter")} open  ${c.bold("n")} new  ${c.bold("r")} refresh`;

  if (s.help) {
    const lines = HELP.map((l) => fit(l, cols));
    while (lines.length < bodyRows) lines.push("");
    return [...out, ...lines.slice(0, bodyRows), footer];
  }

  // Two panes: the list, a │ rule, the details.
  const detailW = cols >= 90 ? Math.min(46, Math.floor(cols * 0.36)) : 0;
  const listW = detailW ? cols - detailW - 3 : cols;
  const statusW = 10;
  const updatedW = 9;
  const titleW = Math.max(8, listW - 4 - statusW - updatedW - 2);

  const list: string[] = [];
  list.push(
    c.dim(
      fit("   Threads", titleW + 3) +
        " " +
        fit("Status", statusW) +
        "Updated".padStart(updatedW - 1),
    ),
  );
  const rowsAll = visibleRows(s);
  const listRows = bodyRows - 1; // under the column header
  const scroll = scrollFor(s, rowsAll, listRows);
  const window = rowsAll.slice(scroll, scroll + listRows);
  if (!rowsAll.length)
    list.push(
      c.dim(
        fit(s.filter === "all" ? "   no threads yet — n starts one" : "   nothing here", listW),
      ),
    );
  window.forEach((r, i) => {
    if (i === window.length - 1 && scroll + listRows < rowsAll.length) {
      list.push(c.dim("  ↓")); // more below
      return;
    }
    switch (r.kind) {
      case "gap":
        list.push("");
        return;
      case "group":
        list.push(c.bold(fit(r.label, Math.max(1, listW - 8)).trimEnd()) + c.dim(`  ${r.count}`));
        return;
      case "entry": {
        const e = r.e;
        const cur = e.id === s.currentId ? " current" : "";
        const title = fit(e.title, titleW - width(cur)) + cur;
        const status = fit(BUCKET_LABEL[e.bucket], statusW);
        const updated = ago(e.updatedAt, s.now).padStart(updatedW - 1);
        if (e.id === s.selectedId) {
          list.push(
            c.selected(
              fit(
                `› ${e.bucket === "needs" || e.bucket === "working" ? "●" : "○"} ${title} ${status}${updated}`,
                listW,
              ),
            ),
          );
        } else {
          const t = e.bucket === "inactive" ? title : c.bold(title);
          list.push(`  ${DOT[e.bucket]} ${t} ${status}${c.dim(updated)}`);
        }
        return;
      }
    }
  });
  while (list.length < bodyRows) list.push(" ".repeat(listW));
  if (s.notice) list[list.length - 1] = c.dim(fit(s.notice, listW));

  if (!detailW) return [...out, ...list, footer];

  const detail = renderDetail(
    s.entries.find((e) => e.id === s.selectedId) ?? null,
    detailW,
    bodyRows,
    s,
  );
  const body = list.map((l, i) => {
    const pad = listW - width(l.replace(/\x1b\[[0-9;]*m/g, ""));
    return l + " ".repeat(Math.max(0, pad)) + c.dim(" │ ") + (detail[i] ?? "");
  });
  return [...out, ...body, footer];
}

function renderDetail(e: CenterEntry | null, w: number, rows: number, s: CenterState): string[] {
  const out: string[] = [c.bold("Thread details"), ""];
  if (!e) return out;
  const t = e.thread;
  const section = (label: string, lines: string[]) => {
    if (out.length > 2) out.push("");
    out.push(c.dim(label));
    out.push(...lines);
  };
  out.push(...wrap(e.title, w, 2).map(c.boldCyan));
  out.push(
    `${DOT[e.bucket]} ${BUCKET_LABEL[e.bucket]}${e.id === s.currentId ? c.dim("  (current)") : ""}`,
  );
  if (e.reason) out.push(...wrap(e.reason, w, 3).map(e.thread.error ? c.red : c.yellow));
  section("Where", [fit(e.group, w).trimEnd(), c.dim(fit(e.id, w).trimEnd())]);
  const agents = (t.agents ?? []).map((a) => `${a.name ?? "agent"}: ${a.modelId ?? "?"}`);
  section(
    "Agent",
    agents.length ? agents.map((a) => fit(a, w).trimEnd()) : [c.dim("none — a world you drive")],
  );
  const bodies = (t.embodiments ?? []).map((d) =>
    fit(`${d.name ?? d.kind ?? d.id ?? "?"}${d.status ? ` · ${d.status}` : ""}`, w).trimEnd(),
  );
  if (bodies.length) section("Embodiments", bodies.slice(0, 4));
  const latest = t.lastEvent;
  section(
    latest ? `Latest · ${latest.role} · ${ago(latest.at, s.now)}` : "Latest",
    latest ? wrap(latest.text, w, Math.max(1, rows - out.length - 3)) : [c.dim("No messages yet.")],
  );
  return out.slice(0, rows);
}

// ─── the terminal (I/O) ──────────────────────────────────────────────────────────────────────────

export type CenterResult = { kind: "open"; threadId: string } | { kind: "new" } | { kind: "back" };

/** How often the open view re-lists threads and notifications. */
const REFRESH_MS = 5000;

/**
 * Take over the terminal (alternate screen, raw keys) until the user opens a thread, starts a new one,
 * or backs out. The caller must not be reading stdin meanwhile (the TUI parks its readline).
 */
export async function runCommandCenter(
  cagi: CommandAGI,
  opts: { meId: string; currentThreadId: string | null },
): Promise<CenterResult> {
  const stdin = process.stdin;
  const stdout = process.stdout;
  let state: CenterState = {
    entries: [],
    filter: "all",
    grouped: true,
    selectedId: opts.currentThreadId,
    currentId: opts.currentThreadId,
    scroll: 0,
    help: false,
    notice: "loading…",
    now: Date.now(),
  };
  let orgNames = new Map<string, string>();

  const draw = () => {
    const cols = stdout.columns || 100;
    const rows = stdout.rows || 30;
    state.now = Date.now();
    state.scroll = scrollFor(state, visibleRows(state), bodyRowsFor(rows) - 1);
    const lines = renderCenter(state, cols, rows);
    stdout.write("\x1b[H" + lines.map((l) => l + "\x1b[K").join("\r\n") + "\x1b[J");
  };

  const refresh = async () => {
    try {
      const [threads, notes, orgs] = await Promise.all([
        cagi.threads.list() as Promise<{ threads?: ThreadRow[] }>,
        cagi.call<{ notifications?: Notice[] }>("list_notifications", {}),
        orgNames.size
          ? null
          : cagi.call<{ orgs?: { id: string; name: string }[] }>("list_orgs", {}),
      ]);
      if (orgs) orgNames = new Map((orgs.orgs ?? []).map((o) => [o.id, o.name]));
      state = normalize({
        ...state,
        entries: buildEntries(
          threads.threads ?? [],
          notes.notifications ?? [],
          opts.meId,
          orgNames,
          Date.now(),
        ),
        notice: null,
      });
    } catch (e) {
      state = { ...state, notice: `refresh failed: ${(e as Error).message}` };
    }
    draw();
  };

  stdout.write("\x1b[?1049h\x1b[?25l"); // alternate screen, hide cursor
  emitKeypressEvents(stdin);
  const wasRaw = stdin.isRaw;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  draw();
  void refresh();
  const timer = setInterval(() => void refresh(), REFRESH_MS);
  const onResize = () => draw();
  stdout.on("resize", onResize);

  try {
    return await new Promise<CenterResult>((resolve) => {
      const onKey = (
        str: string | undefined,
        key: { name?: string; shift?: boolean; ctrl?: boolean } = {},
      ) => {
        const page = Math.max(1, (stdout.rows || 30) - 6);
        const done = (r: CenterResult) => {
          stdin.off("keypress", onKey);
          resolve(r);
        };
        if (state.help) {
          state = { ...state, help: false };
          if (key.ctrl && key.name === "c") return done({ kind: "back" });
          return draw();
        }
        switch (true) {
          case key.ctrl && key.name === "c":
          case key.name === "escape":
          case str === "q":
            return done({ kind: "back" });
          case key.name === "return":
            return state.selectedId
              ? done({ kind: "open", threadId: state.selectedId })
              : undefined;
          case str === "n":
            return done({ kind: "new" });
          case key.name === "tab":
            state = cycleFilter(state, key.shift ? -1 : 1);
            break;
          case key.name === "up" || str === "k":
            state = moveSelection(state, -1);
            break;
          case key.name === "down" || str === "j":
            state = moveSelection(state, 1);
            break;
          case key.name === "pageup":
            state = moveSelection(state, -page);
            break;
          case key.name === "pagedown":
            state = moveSelection(state, page);
            break;
          case str === "g":
            state = normalize({ ...state, grouped: !state.grouped, scroll: 0 });
            break;
          case str === "r":
            state = { ...state, notice: "refreshing…" };
            void refresh();
            break;
          case str === "?":
            state = { ...state, help: true };
            break;
          default:
            return;
        }
        draw();
      };
      stdin.on("keypress", onKey);
    });
  } finally {
    clearInterval(timer);
    stdout.off("resize", onResize);
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
    stdout.write("\x1b[?25h\x1b[?1049l"); // cursor back, leave the alternate screen
  }
}
