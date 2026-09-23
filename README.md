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

### Host this computer in the background

```bash
commandagi daemon start     # share this machine with your account; returns at once, keeps running
commandagi daemon status    # who is hosting it (this daemon, or the desktop app) and how
commandagi daemon stop
```

One machine is hosted by one process at a time. If the CommandAGI desktop app is installed, it takes
over hosting when it starts, because it can do more (on-screen overlays, clipboard, notifications),
and `daemon status` shows that. The native modules the daemon needs are `optionalDependencies`, which
it loads only for `daemon` commands, so importing the SDK never loads them.

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
