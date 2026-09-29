# commandagi — the CommandAGI SDK and CLI

Drive the whole CommandAGI platform as code: agent threads, memory and integrations, and live
**embodiments** (cloud computers, robots, simulated worlds) that you watch and control.

```bash
npm i commandagi                   # the library (and the `commandagi` CLI)
export COMMANDAGI_API_KEY=cagi_... # Settings → API keys
```

```ts
import { CommandAGI } from "commandagi";

const cagi = new CommandAGI(); // reads COMMANDAGI_API_KEY

// Agents: start one on a goal and follow along.
const { threadId } = (await cagi.threads.create({
  intent: "Summarise this week's robotics news",
})) as {
  threadId: string;
};
await cagi.threads.send(threadId, "Add a link for each one.");

// Embodiments: launch a world YOU drive (no agent in it), watch it, control it.
await using world = await cagi.launch("simulation/warehouse");
console.log(await world.controls()); // what it accepts right now, with payload schemas
await world.sim.ik({ target: [0.3, 0, 0.4] }); // typed robot/sim control
const jpeg = await world.observe({ fresh: true }); // the next frame, after the move

// Anything else: every platform tool by name.
await cagi.call("list_snapshots");
```

## The CLI

```bash
commandagi whoami
commandagi threads create --intent "research X"
commandagi embodiments act emb_1 click '{"x":10,"y":20}'
commandagi call <tool> --json '{…}'     # any platform tool by name
commandagi help                         # every command, rendered from the schema
```

### The interactive session and the agent command center

`commandagi` with no arguments is an interactive chat with an agent (`/help` lists its commands).
`commandagi agents` — or `/agents` inside it — opens the **agent command center**: every thread you
can reach, grouped by where it lives (personal, each org, shared with you), filtered by what it needs:

| filter    | means                                                            |
| --------- | ---------------------------------------------------------------- |
| Needs you | an open error, or an unread notification from the thread's agent |
| Working   | its run is open and it acted in the last ten minutes             |
| Ready     | idle, active within the last day                                 |
| Inactive  | idle for longer                                                  |

`tab`/`shift+tab` filter, `↑`/`↓` move, `enter` opens the thread in the chat, `n` starts a new one,
`g` toggles grouping, `?` help, `esc` back. It refreshes itself every few seconds.

### Host this computer in the background

`commandagi daemon` is the CommandAGI local host — the same program the desktop app runs: the workbench
in your browser, the files of the folder you open, the devices on this machine, the MCP host your CLI
agents connect to, and the link to your CommandAGI account.

```bash
commandagi daemon start     # host this machine; returns at once, keeps running in the background
commandagi daemon status    # who hosts it (the daemon, the desktop app, or a dev checkout) and how
commandagi daemon logs      # the background host's log
commandagi daemon stop
commandagi daemon run       # the same host in the foreground (what `start` runs detached)
```

`start` and `run` take `--port N` (the workbench's port), `--project DIR` (the folder to open),
`--name X` (this machine's name on your account), `--monetize` (offer it for rent) and
`--no-platform` (host locally, with no account link). The account key lives in
`~/.commandagi/host.json` (a sign-in in the desktop app or the workbench puts it there;
`COMMANDAGI_API_KEY` also works); the user folder is `~/.commandagi` (`COMMANDAGI_USER_DIR`).

One machine is hosted by one process at a time, found through `~/.commandagi/daemon.json`. The desktop
app takes over hosting when it starts, and `daemon status` shows that. The native modules the account
link needs (screen capture and input) are `optionalDependencies`, loaded only when the host starts that
link, so importing the SDK never loads them.

## One surface, generated

This package, the Python SDK (`pip install commandagi`) and the CLI all come from **one schema**,
`commandagi-sdk.schema.json`, which is included in this package:

- **Tools**: `cagi.threads`, `cagi.embodiments`, `cagi.memory`, `cagi.integrations`,
  `cagi.social(platform, account)`, `whoami`, `search`, `run` and `post`. Each one is a typed wrapper
  over `call(tool, args)`.
- **Control vocabularies** on a live `Session`: `session.desktop` for computers, `session.robot` for
  physical robots, and `session.sim` for simulated worlds. Each method sends one action. The platform
  checks it against what the embodiment currently declares, which `session.controls()` lists; for
  anything else, use `session.act(action, payload)`.

`src/generated.ts` is regenerated from the schema in the CommandAGI monorepo. Don't edit it.

## Environment

`COMMANDAGI_API_KEY` (your `cagi_…` key; its scopes decide what every call may do), `COMMANDAGI_BASE_URL`
(default `https://api.commandagi.com`) and `COMMANDAGI_THREAD_ID` (the default thread for self-thread
methods). The platform sets all three when your code runs inside it.
