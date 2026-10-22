# commandagi — the CommandAGI SDK

Drive the whole CommandAGI platform as code: agent threads, memory and integrations, and live
**embodiments** (cloud computers, robots, simulated worlds) that you watch and control.

```bash
npm i commandagi                   # the library
export COMMANDAGI_API_KEY=cagi_... # Settings → API keys
```

This package is the library only. The `commandagi` command and the local host (the workbench, the files and devices
of this computer, the MCP host, the 3D design service) are the package `@commandagi/host`:

```bash
npm install -g @commandagi/host
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

The `commandagi` command (from `@commandagi/host`) has this SDK's surface, rendered from the same table
(`src/cli.ts`), beside the local host's own commands:

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

### Host this computer

`commandagi daemon start | status | stop | logs | run` hosts this computer: the same program the desktop app runs.
`@commandagi/host`'s README says how.

## One surface, generated

This package, the Python SDK (`pip install commandagi`) and the CLI all come from **one schema**,
`commandagi-sdk.schema.json`, which is included in this package:

- **Tools**: `cagi.threads`, `cagi.embodiments`, `cagi.memory`, `cagi.integrations`,
  `cagi.social(platform, account)`, `whoami`, `search`, `run` and `post`. Each one is a typed wrapper
  over `call(tool, args)`. Where the schema names a method's options, they are a typed interface:
  `cagi.postal.send("Letters/Ada.letter.tsx", { provider: "click2mail" })` (`PostalSendOptions`; the
  provider is `"lob"`, the default, or `"click2mail"`, US only; omitted, the account's
  `postal.providers` order picks it).
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
  Each call is one node of the 3D document's feature graph. Lengths are in mm and angles in degrees.
- **EDA**: `circuit`, `board`, `component` (reference, value, footprint, placement; its pins are its
  output ports), `net`, `connect`, and `footprints` (chip `0402`–`1206` for R, C, L, LED and D, plus pin
  headers, after KiCad's library footprints). A circuit is the graph a `.sch.tsx` and its `.pcb.tsx`
  hold. Nets say what is meant to connect; nothing is routed.
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
  `commandagi/design`; `documentOf` reads them into the document the apps use (the company, the RFC or case draft).

- **A video or a song in JSX** (a `<name>.vid.tsx` the video editor opens, a `<name>.mus.tsx` the music studio
  opens; both write each edit back): `<video>` with `<track>`, `<clip src="media/take.mp4" start in out>` (media
  stay files, named by path), `<composition src="Intro.vid.tsx" start in out inputs>` (another video, drawn live from
  its own code), `<artboard src="Poster.draw.tsx" start duration view fit>` (a drawing's page, drawn live),
  `<title>`, `<transition>`, `<effect>`, `<keyframe>` and `<marker>`; `<song tempo
  timeSignature>` with `<track>`, `<synth>`, the effects (`<gain>`, `<filter>`, `<delay>`, `<reverb>`, `<eq>`),
  `<clip>` and `<note pitch="C4" start duration velocity>`. Seconds on a video's timeline, beats in a song.
- **A 3D document in JSX** (a `<name>.3d.tsx` the CommandAGI 3D editor opens and edits): a `<part>` (or
  `<assembly>`) with `<parameter>`, `<plane>`, one element per feature named by its type (`<sketch>`,
  `<extrude>`, `<revolve>`, `<fillet>`, `<hole>`, `<linearPattern>`, `<transform>` …), a sketch's `<point>`,
  `<line>`, `<circle>`, `<arc>` and `<constraint>` as its children, `<body>` for a body's material and name, and
  `<slot name value>` for any other field. Each attribute is the field of the same name, as the 3D document holds
  it (millimetres, radians); the reader declares the document's graph itself. The editor writes each edit back into the
  file, and refuses (with the line) an edit to an attribute that is an expression or to an element in a loop.
- **2D documents in JSX** (a `.draw.tsx`, `.paint.tsx`, `.img.tsx` or `.nest.tsx` that the CommandAGI draw, paint,
  photo and nesting editors open and edit): a `<drawing>` of `<layer>`s holding `<rect>`, `<ellipse>`, `<path d>`,
  `<text>`, `<group>` and modifiers (`<blur>`, `<transform>` … wrap what they change); a `<painting>` whose `<layer>`s
  hold `<stroke points>` (`[x, y, pressure, t]` each); a `<photo>` of `<raster src>` layers (their filters inside
  them) and adjustment tags (`<exposure ev>`, `<hsl>` …); a `<nest>` of `<sheet>`, `<stock>`, `<options>` and `<part>`.
  An element is one node of the editor's own document and its attributes are that node's inputs. A pixel layer
  names its image file (`src`); pixels are never code. The editor writes each edit back into the file.
- **Office documents in JSX** (a `<name>.sheet.tsx`, `.page.tsx` or `.deck.tsx` the sheets, docs and decks editors
  open and edit): a `<workbook>` of `<sheet>`s with `<cell at value|formula …format>`, `<column>` and `<row>`; a
  `<page>` of `<h1>`–`<h3>`, `<p>`, `<bullet>`, `<numbered>`, `<todo>`, `<quote>`, `<pre>`, `<divider>` and
  `<image>`, whose text is their children (marks `<b> <i> <u> <s> <code> <a> <br />`); a `<deck>` of `<slide
  layout>`s with `<text>`, `<shape>` and `<image>` boxes (`x y w h`). They declare the editors' own documents; the
  editor writes each edit back into the file and refuses an edit to what the code computes.
- **A board in JSX** (a `<name>.pcb.tsx`): a `<board schematic="Divider.sch.tsx" width height core copper>` with
  `<component name footprint pcbX pcbY pcbRotation layer>` (the schematic's parts on the board, the board's
  millimetres, Y down), `<trace layer width points from to>` and `<via pcbX pcbY drill diameter>`. A trace's ends say
  which pin, via or trace point they land on. The circuit editor joins it onto its schematic and writes each board
  edit back into the file.
- **The ontology's files in JSX** (CommandAGI opens them where it opens their JSON, and writes each edit back into
  the code): a world (`worlds/<name>/world.tsx`: `<world name kind>` with `<space>`, `<unit uid name device
  position rotation>`, `<view>`, `<scene>` and its `<body>`s), a device definition (`devices/<name>/definition.tsx`:
  `<device>` with its `<channel>`s and their bounds), a dashboard (`<name>.dashboard.tsx`: `<dashboard>` with
  `<param>`s, one layout of `<split axis ratio>` and `<pane id kind …>`, and `<region side …>`s), a geo project
  (`<name>.geo.tsx`: `<geoproject>` with `<dateRange>`, `<camera>`, `<reference>`) and a node graph
  (`<name>.opgraph.tsx`: `<opgraph>` with `<node id type x y …ports>` and `<wire from="a:out" to="b:in">`). A
  record is an element and its fields are its attributes, verbatim. `declarationOf` gives `{ format, document,
  sources }` (a node graph: the op graph itself).
  A code form declares; the application that reads it checks and enforces it as it does the JSON.
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

Put its path in a graph's **code node** (a 3D document's `code` feature, or a `code` node in a circuit or
node graph). The editor runs the file in a sandboxed worker, with no network and a time limit, cached by the
file's content hash and the node's inputs. The node's other inputs override the `params` defaults, and
the node outputs what the file declares. The graph editor shows the node as one block naming its file,
so you change the part by editing the file. A code file may import only `commandagi/design`,
`@jscad/modeling` and `replicad`; to use another file, declare it as a code node.
`declarationOf(module, inputs)` is what the sandbox calls, and you can call it in your own tests.
The `params` a file declares are the ports of its block (typed, with their defaults; a wire overrides one).

Without a browser, evaluate a part headless in the local host's sandbox (`@commandagi/host`: a process of its own with
no network, no file writes and bounded time and memory; Python parts under the Pyodide the host ships):

```bash
commandagi code eval bracket.part.ts --input width=80     # prints its op graph and a summary as JSON
commandagi code eval blinker.circuit.ts --no-ir --out blinker.json
```

An agent connected to the host over MCP does the same with the `evaluate_code` tool.

## Engineering data: materials, standard sizes, joints, drawings

A 3D document says what a mechanical engineer needs with typed elements, checked when the file is read:

```tsx
export default () => (
  <part name="Deck plate">
    <box id="plate" center={[0, 0, 3]} size={[60, 40, 6]} operation="new" />
    <hole id="h1" face={{ kind: "face", signature: { point: [0, 0, 6], normal: [0, 0, 1] } }}
          size="M4 normal fit" style="counterbore" through consumes={["plate"]} />
    <body id="plate" engineering={{ partNumber: "EX-0001", material: "6061-T6", process: "cnc-milling", finish: "anodize clear",
          cost: { amount: 18, currency: "USD", source: "quote Q-118", date: "2026-10-13" } }} />
    <joint id="j1" kind="revolute" a="plate" anchor={[0, 0, 0]} axis={[0, 0, 1]} limits={[-1.57, 1.57]} />
    <sheet id="sheet1" size="A3" scale={2} views={[{ id: "front", view: "front" }, { id: "top", view: "top" }]} />
  </part>
);
```

- `size="M4 normal fit"` is the clearance hole of ISO 273 (4.5 mm) and, with `style="counterbore"`, the counterbore
  for an ISO 4762 screw (Ø8 × 4.4). `"M4 tap"` is the tap drill. `holeSize("M4 close fit")` gives the same row.
- `engineering.material` names a row of a materials table: `material("6061-T6")` is its density, modulus and
  strengths, and where they were read. `Kernel.observe` then says the body's mass (`mass.grams`).
- `Kernel.sheet(doc, { format: "pdf" })` draws the sheet from the build: views with hidden edges dashed, hole
  callouts, the document's dimensions and a title block. `Kernel.bom(doc)` lists the parts.
- `standardRow("iso-4762", "M4")`, `standardRow("bearings", "608")`: the dimension tables of standard parts.
  `STANDARD_SOURCES` names where each table was read; the rows with their full provenance are
  `cloud://global/standards/<table>.csv`.

## The 3D kernel: `Kernel`

`commandagi/design` declares a part and builds nothing. `Kernel` asks the CommandAGI 3D kernel (OpenCascade) to
build it, on this computer or in the cloud.

```ts
import { Kernel } from "commandagi";

const kernel = new Kernel();                                  // reads COMMANDAGI_THREED
const { observation } = await kernel.observe(graph);          // bodies, faces, edges, mass properties; status and failures
if (observation.status === "failed") throw new Error(JSON.stringify(observation.failures));
const step = await kernel.export(graph, "step");              // refused (KernelError.failures) when a feature failed
kernel.lastRan;                                               // { kernel: "3d", build, place: "local" | "cloud" }
```

`graph` is what a `.3d.tsx` declares (`commandagi code eval "Plate.3d.tsx"` prints it), or its JSON text. One setting
places the kernel: the places to try, in order (the CommandAGI setting `kernels.3d.place`):

| `COMMANDAGI_THREED` | where it runs | needs |
| --- | --- | --- |
| `local,cloud` (the default) | this computer when its kernel is installed, else the cloud | one of the two below |
| `local` | this computer, offline, no account. `Kernel` starts it and it stops with your process | once: `npm install -g @commandagi/host`, then `commandagi threed install` (it downloads OpenCascade as WebAssembly, about 130 MB) |
| `cloud` | the platform's kernel door (`/kernels/3d/v1/<op>`) | the network and `COMMANDAGI_API_KEY` |
| a URL (or `COMMANDAGI_THREED_URL`) | one that runs already: `commandagi threed serve --port 8091` (the local place) | `COMMANDAGI_THREED_TOKEN`, the bearer you started it with |

A place where the kernel is not installed, or that has no key, is passed over. A refusal of the op (a build that is
not whole) is the answer, and is not sent to the next place. `kernel.lastRan.place` says where the last answer ran.
The placement sets it from where it sent the request, not from what the service says: a result made on this
computer is `local` and is never a cloud result. `kernel.call(op, doc, params)` gives the whole answer
(`{ outputs, result, ran }`).

`observe(doc)`, `export(doc, "step" | "iges", { bodies })`, `measure(doc, "distance" | "angle" | "radius" | "closest",
a, b)`, `measureAll(doc, [{ quantity, a, b }, …])` (many on one build), `interference(doc, { clearance, bodies })`,
`drawing(doc, { direction, up, section })`, `tessellate(doc, deflection)`. An entity is `{ body: "body_0",
kind: "face" | "edge" | "vertex" | "body", index }`, with the index as `observe` lists it.

- **A build in which a feature failed is not whole.** `observe` answers it with `status: "failed"` and `failures`.
  Every other call refuses it: `KernelError` with `status` 422 and `failures` (each failed feature, with why).
- **`interference`** compares every pair of bodies: `clashes` (shared volume), `engagements` (shared volume that all
  lies in a declared `thread`: a screw in a tapped hole) and, with `clearance`, `close` (nearer than it). Each body
  has its part's name.
- **An assembly's files** go with the call: `{ parts: linkedParts({ "bolt.3d.tsx": boltGraph, "bracket.step": text }) }`,
  each under the name its `<externalPart>` gives.
- **A STEP file names its parts**: each body is a product of its part's name, an assembly the product they are
  components of.
- **`dfm(doc, { process: "print" | "mill", limits, setup })`** says whether a machine can make the part: `limits` are
  a device definition's `process.print` or `process.mill`, `setup.tools` the mill's tool diameters
  (`[{ diameter_mm: 3.175 }]`). Each finding is `pass`, `fail` or `unknown` (never `pass` when a limit or a tool is
  missing) with its value, limit and `where` (the body, the B-rep `faces`, a point); `verdict` sums them.
- **`check(doc, { devices })`**: a `<check kind="printability" | "mill" options={{ device }}>` reads its limits from
  `devices`, `{ [ref]: { process } }`, the definitions you read; without them the check is skipped and says why.

The local place is the local host's 3D design service (`@commandagi/host`, which needs no checkout of the CommandAGI
repository). `Kernel` uses the host installed beside this package, else the `commandagi` command on PATH.
`commandagi threed status` says whether the service is installed.

## Environment

`COMMANDAGI_API_KEY` (your `cagi_…` key; its scopes decide what every call may do), `COMMANDAGI_BASE_URL`
(default `https://api.commandagi.com`) and `COMMANDAGI_THREAD_ID` (the default thread for self-thread
methods). The platform sets all three when your code runs inside it.

`COMMANDAGI_THREED` places the 3D kernel `Kernel` calls (`local,cloud`, `local`, `cloud` or a URL); `COMMANDAGI_THREED_URL` and
`COMMANDAGI_THREED_TOKEN` name a 3D design service that runs already, and its bearer.

## Versions

- A release is the tag `v<version>` in this repository and the same version on npm. Pin an exact version:
  `npm install --save-exact commandagi@0.6.6`. A range (`^`, `~=`, `>=`) takes the next release without asking you.
- After an upgrade, check what runs: `npm ls commandagi`, and `commandagi --version` for the host that runs the local
  3D kernel (`npm install -g @commandagi/host@0.6.6`). The two are upgraded apart, and a kernel of another version may
  read a document differently.
- The three SDKs (Python, TypeScript, Rust) carry one version number. A vocabulary at version X in one language is
  the vocabulary at version X in the others.
- A version promises nothing about the next one. CommandAGI keeps no compatibility layers: a release may rename or
  remove a function, an element or an attribute, with no alias and no migration. `CHANGELOG.md` says what changed.
- So a document belongs with the version that reads it. Keep the pin in the project that holds the documents, and
  change both together. A document you open in a CommandAGI editor is read by the SDK that editor ships.

## Licence

MIT (`LICENSE`).
