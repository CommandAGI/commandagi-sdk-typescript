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

## Design in code: `commandagi/design`

Compositional primitives that **declare structure** as the op graph every CommandAGI editor stores (plain
JSON: `{ id, nodes: { <id>: { id, type, label?, inputs } }, outputs?, meta? }`, where a port holds a literal
or one wire `{ "wire": { node, port } }`). The package holds the declaration only. It has no geometry
kernel, solver, router or renderer; the editor that opens your file evaluates what you declare.

- **CAD**: `part`, `assembly`, `instance` (a part declared by another file), `box`, `cylinder`, `sphere`,
  `cone`, `sketch` (`rect`, `circle`, `polygon`, `slot`), `extrude`, `revolve`, `union`, `subtract`,
  `intersect`, `hole`, `fillet`, `chamfer`, `shell`, `copy`, `linearPattern`, `circularPattern`, `mirror`.
  Each call is one node of the 3D feature graph a `.3dx` holds. Lengths are in mm and angles in degrees.
- **EDA**: `circuit`, `board`, `component` (reference, value, footprint, placement; its pins are its
  output ports), `net`, `connect`, and `footprints` (chip `0402`–`1206` for R, C, L, LED and D, plus pin
  headers, after KiCad's library footprints). A circuit is the graph a `.sch.json` + `.pcb.json` pair
  holds. Nets say what is meant to connect; nothing is routed.
- **A schematic in JSX** (a `<name>.sch.tsx` the CommandAGI circuit editor opens and edits): a `<group>` with
  `<resistor>`, `<capacitor>`, `<inductor>`, `<voltagesource>`, `<currentsource>`, `<ground name="#PWR1">`, each
  placed with `schX` / `schY` (the sheet's millimetres, Y down) and `schRotation`, `<junction>`, `<trace from to>`
  and `<netlabel net connection>`. They declare the circuit's own sheet. The editor writes each edit back into the
  file; an attribute that is an expression is never replaced with a literal (the edit is refused with its line).
- **A company, an RFC or a case in JSX** (`<Name>.company.tsx`, `<name>.rfc.tsx`, `<name>.case.tsx`, which the
  company app and the contract editor open and edit): `<Company name about files dashboard>` with `<Entity
  jurisdiction form formed fiscalYearEnd …>`, `<Registration kind jurisdiction id issued expires file>` and the
  standard's parts, which ref their files (`<Books journal>`, `<CapTable ocf>`, `<People folder>`, `<Calendar
  folder>`, `<Matters folder>`); `<Rfc title target body id>` with `<Option title summary>` and `<Change op
  parameter value …>`; `<Case respondent … id>` with `<Harm>` and `<Relief>`. Import the tags from
  `commandagi/design`; `documentOf` reads them into the native document (`.company`, the RFC or case draft).

- **A video or a song in JSX** (a `<name>.vid.tsx` the video editor opens, a `<name>.mus.tsx` the music studio
  opens; both write each edit back): `<video>` with `<track>`, `<clip src="media/take.mp4" start in out>` (media
  stay files, named by path), `<title>`, `<transition>`, `<effect>`, `<keyframe>` and `<marker>`; `<song tempo
  timeSignature>` with `<track>`, `<synth>`, the effects (`<gain>`, `<filter>`, `<delay>`, `<reverb>`, `<eq>`),
  `<clip>` and `<note pitch="C4" start duration velocity>`. Seconds on a video's timeline, beats in a song.
- **Any graph**: `graph`, `node(type, inputs)`, `input` (a graph input), `code` (a node that runs another
  file), `channels(set, values)` (the numbered ports `set.1 … set.N`).
- **Importers** read other frameworks into the same graph: tscircuit JSX (`<board>`, `<resistor>`, `<led>`,
  `<trace>` …, compiled against `commandagi/jsx-runtime`), `@jscad/modeling` (primitives, booleans,
  translations and `extrudeLinear`) and `replicad` (drawings, `sketchOnPlane`, `extrude`, `cut`, `fuse`).
  They refuse, by name, what they cannot read, rather than guessing.

A **code part** is a file that exports what it declares, and optionally its parameters:

```ts
import { part, box, hole } from "commandagi/design";

export const params = { width: { default: 60, unit: "mm", min: 30 } };

export default ({ width }: { width: number }) =>
  part("Plate", () => {
    let plate = box({ size: [width, 40, 4], center: [0, 0, 2] });
    for (const x of [-1, 1]) plate = hole(plate, { at: [x * (width / 2 - 8), 0, 4], diameter: 3.2, depth: 4 });
    return plate;
  });
```

Put its path in a graph's **code node** (a `.3dx` `code` feature, or a `code` node in a circuit or node
graph). The editor runs the file in a sandboxed worker, with no network and a time limit, cached by the
file's content hash and the node's inputs. The node's other inputs override the `params` defaults, and
the node outputs what the file declares. The graph editor shows the node as one block naming its file,
so you change the part by editing the file. A code file may import only `commandagi/design`,
`@jscad/modeling` and `replicad`; to use another file, declare it as a code node.
`declarationOf(module, inputs)` is what the sandbox calls, and you can call it in your own tests.
The `params` a file declares are the ports of its block (typed, with their defaults; a wire overrides one).

Without a browser, evaluate a part headless in the local host's sandbox (a process of its own with no
network, no file writes and bounded time and memory; Python parts under the Pyodide the host ships):

```bash
commandagi code eval bracket.part.ts --input width=80     # prints its op graph and a summary as JSON
commandagi code eval Blinker.sch.json --no-ir --out blinker.json
```

An agent connected to the host over MCP does the same with the `evaluate_code` tool.

## Environment

`COMMANDAGI_API_KEY` (your `cagi_…` key; its scopes decide what every call may do), `COMMANDAGI_BASE_URL`
(default `https://api.commandagi.com`) and `COMMANDAGI_THREAD_ID` (the default thread for self-thread
methods). The platform sets all three when your code runs inside it.
