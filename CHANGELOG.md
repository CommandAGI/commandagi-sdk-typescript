# Changelog

One entry for each release. A release is the tag `v<version>` in this repository and the same version on npm. The
Python and Rust SDKs carry the same version number. A version promises nothing about the next one (README
§ Versions): read this file before you change the version you pin.

## Unreleased

Added

- A realtime harness: `<harness realtime={{ in, out, audio: { in, out }, fps, hz, minutes, videoMinutes }}>` says what
  its model takes and gives live (`api` only, not with `tasks`). The Python and Rust SDKs have the same `agents`
  vocabulary now.
- Tolerances. `<parameter tolerance>` and `<hole tolerance>` take `{ upper, lower }` (mm), `{ class: "H7" }` (an ISO
  286 class or `ISO 492 bore|outside|width`) or `{ basic: true }`; a tolerance given two ways is refused.
  `toleranceLimits(nominal, tol)` and `fitOf(hole, shaft)` read the classes from the shipped tables
  (`TOLERANCE_TABLES`). `<check kind="fit" hole shaft intent>` and `<check kind="stackup" chain limit method samples
  seed>` are checks of a 3D document (`Kernel.check`); a drawing sheet's `title.standard` names the GD&T standard.

## 0.6.0 (2026-10-15)

Read **Removed** first: a script that calls `eda.autoroute` stops with `unknown tool` on the platform today, with 0.5.1
too.

Added

- A schematic part states its engineering data: `partNumber`, `manufacturer`, `mpn`, `rating` and `attrs` on any part
  but a ground. Each is one KiCad property of the part (`CommandAGI IPN`, `Manufacturer`, `MPN`, `Rating`, and each
  `attrs` entry by its own name), so the BOM, the `.kicad_pcb` and a board edit carry it. `attrs` refuses a name that
  has its own attribute and the part's own `Reference`, `Value` and `Footprint`. `partFields(inputs)` and
  `PART_FIELDS` read them back.
- Declared checks. A 3D document holds the checks it must pass and what it accepts: `<check id kind>` (`interference`,
  `clearance`, `holes`, `fasteners`, `edges`, `symmetry`), `<accept>` (one finding that is right on purpose, with its
  `reason`) and `<permitted>` (the findings that a process or a purpose permits, such as the square edges of a
  laser-cut sheet). A circuit holds `<check kind="erc" | "drc">` and `<accept>`. Each is checked against the schema
  when the document is read.
- `Kernel.check(doc)` (types `CheckReport`, `CheckFinding`): the checks a 3D document declares, run on one build, with
  its `<accept>` and `<permitted>` entries applied. Each finding names its check, rule, severity, body (id, name, part
  number) and location; a check that could not run is `skipped` with its reason, never `passed`. A document that
  declares no check gets the interference check.
- Fasteners: `<fastener id part="iso-4762-m6" length at clamped receiver washer nut grip fit minEngagement>` places a
  screw from the fastener library with its washer and nut, and records what it clamps into what. The `fasteners` check
  reads that record: each clamped part's clearance hole for its `fit` (ISO 273), and the thread a tapped receiver
  engages.
- Studies (`<name>.study.tsx`): the question of an analysis of a part, never the answer: `<study kind="structural"
  part units="mm-N-MPa-t">` with `<material>`, `<fixture>`, `<loadCase>`, `<force>`, `<pressure>`, `<mesh>`,
  `<solver>`, `<criterion>` and `<revise>`; `registerStudyKind` adds a kind. A solve is a run of the `fea` kernel, a
  new kernel name beside `3d`.
- The scouts' two documents (`commandagi/design` `scouts.ts`; docs/scouts.md in the CommandAGI repository):
  - `<scout>` (`<name>.scout.tsx`): one comparison of configurations (`<configuration id model harness effort
    instructions maxTokens incumbent>`) on the cases of each `<workload id title needs sample context>` (`<case
    id from prompt system check rubric tools turns source terms>`), scored by a check (`exact`, `oneOf`, `number`,
    `contains`, `regex`, `json`, `letter`, `literal`, `tool`) or by a `<judge>` panel, with the verdict's rules
    (`budget`, `repeats`, `margin`, `relativeMargin`, `errorFloor`, `minCalls`, `minCases`, `resamples`, `alpha`,
    `seed`, `maxCases`). A case's `from` is `public`, `synthetic` or `own-run`; nothing else may be a case. A case's
    `tools` each give the answers the case returns to a call (`results: [{ when, result }]`).
  - `<replacement>` (`<name>.replacement.tsx`): what replacing a product would cost, by `<layer kind title>`
    (`visible`, `invisible`, `integrations`, `operations`, `economics`), each `<capability id title need have effort
    run labour ref note>` with its `<evidence source claim>`, and the `<decision>`, `<differentiation>` and
    `<economics>`.
- A board's layout constraints, each a board fact: `<netclass>`, `<diffpair>`, `<group>`, `<keepout>`, `<thermal>`,
  `<objective>` (`commandagi/design` `pcb`; CommandAGI's `docs/eda-layout.md`). The circuit editor's placer, router,
  layout score and layout checks read them, and its edits write them back.
- The layout tools, in the client and the CLI: `eda.layout` (`pcb_layout`), `eda.layoutScore`, `eda.checkLayout`,
  `eda.constrain`, `eda.placeGroup` (`pcb_place_group`), `eda.routeNets` (`pcb_route_nets`) and `eda.ripUp`.
- `board({ …, layers: 4 })`: a circuit says its copper stack, two layers (the default) or four (`In1.Cu`, `In2.Cu`).
- `part({ …, noConnect: ["3", "4"] })` in `circuit()`: the pins a part leaves open on purpose; the ERC does not report
  them as unconnected.

Changed

- A part placed on the bottom in `circuit()` (`at: { side: "bottom" }`) holds its pads as the board holds a flipped
  part: mirrored, each `F.` layer swapped for its `B.` layer. Before, its pads stayed on the front copper.
- The 3D kernel has a third place, `page`: the workbench page's own kernel (it answers `observe` only).
  `COMMANDAGI_THREED` and `kernels.3d.place` accept `page`, `local` and `cloud`. This SDK has no transport to a page,
  so it passes `page` over and the default order stays this computer, then the cloud. The `fea` kernel has no page.
- An example of a task proposal names a simulated run of the world it asks for (`worlds/shop/runs/…`), not a run of
  a second world.

Removed

- `eda.autoroute` (`pcb_autoroute`, and the CLI's `eda autoroute`). The board has one router: `eda.routeNets` routes
  what is open of the nets from the copper they have, on the copper layers given (`layers`); `ripUp: true` routes them
  whole.
- The platform tools `pcb_optimize_routing` and `pcb_optimize_placement` (no SDK method called them; `call()` with
  their names now gets `unknown tool`). Use `eda.routeNets`, `eda.placeGroup` and `eda.layout`.

## 0.5.1 (2026-10-15)

No change in this SDK. The version moves with the Python SDK, which carries the same number (its 0.5.1 fixes its
install message and its fixed call timeout). This client has no fixed timeout: a call waits as long as `fetch` does.

## 0.5.0 (2026-10-14)

The first release with the design layer. 0.5.0 was prepared on 2026-10-13 and not published; this entry holds all of it.

Added

- A 3D document's engineering vocabulary (`commandagi/design`, checked against the one schema):
  - `<body engineering={{ … }}>`: what a part is, apart from how it looks: `material` (a grade: the id of a row of a
    materials table), `process`, `finish`, `vendor`, `cost` (amount, currency, source, date), `partNumber`, `mass`.
  - `<joint>`: a joint between two bodies: `fixed`, `revolute`, `prismatic`, `cylindrical`, `planar`, `screw`,
    `spherical` or `universal`, with its anchor, axis, limits and the geometry it binds (`refA`, `refB`).
  - `<mate>`: a mate between two components of an assembly.
  - `<sheet>`: an engineering drawing sheet: standard views, the document's dimensions and a title block.
  - `<hole size="M4 close fit">`: a hole by its standard name. The size gives the diameter and, for a counterbore
    or a countersink, the head.
- `material`, `massGrams`, `holeSize`, `sizedHole`, `standardRow`, `MATERIALS`, `HOLE_SIZES`, `STANDARD_TABLES`,
  `STANDARD_SOURCES`: the material grades, the standard holes and the dimension tables of standard parts (ISO 4762,
  7380-1, 10642, 4014/4017, 4026, 4032, 4035, 7089, 7093-1, 273, 2306; DIN 974-1; ASME B18.3, B18.2.8; bearings,
  MGN linear guides, T-slot profiles, heat-set inserts, parallel pins). Each table names where its rows were read.
- `hole(body, { at, size: "M4 close fit", depth })` in the code-part primitives.
- `Kernel.sheet` (a drawing sheet as SVG, DXF or PDF), `Kernel.bom` (the bill of materials), and
  `Kernel.observe(doc, { materials })`: a body's `mass.grams` is its volume × the density of its material.

Changed

- This package is the SDK only, and declares no `commandagi` command. The command and the local host it carried
  (`daemon`, `code`, `threed` …) are the package `@commandagi/host` (`npm install -g @commandagi/host`). `Kernel`'s
  local place is that host's 3D design service: the one installed beside this package, else the `commandagi` on PATH.
  The package is 0.44 MB packed (it was 148.5 MB with the host).
- A joint's kinds are named as mechanisms are: `hinge` is `revolute`, `slider` is `prismatic`, `ball` is
  `spherical`. A document's joints and mates are `<joint>` and `<mate>` elements: the reader refuses `joints` in
  `<slot name="dynamics">` and `mates` in `<slot name="assembly">`, and says which element to write.
- 3D documents: a hole's `positions` and `sketch`; faces and edges chosen by a query, `{ kind, select: { … } }`,
  beside the pick; a part is built in the order of its elements (a feature that names no `consumes` follows every
  body-making feature written before it).
- `Kernel.interference`, `Kernel.measureAll`, `linkedParts`; `parts` on every call (an assembly's files);
  `KernelError.failures`.

Changed

- `Kernel.measure(doc, quantity, a, b)` works with the platform too (the service takes `measures`).
- `Kernel.export`, `measure`, `drawing` and `tessellate` refuse a build in which a feature failed. `tessellate`
  answers each body's triangles, not only their count.
- The call form (`part`, `subtract`, `hole`, `fillet` …) wires a feature to the heads of its body and to its last
  feature: about two wires a feature, where a plate of 129 holes was 566 kB. `Body.state` is gone; `Body.heads` and
  `Body.actsOn()` are what it has.
- A union's refusal names the field at fault (`edges/0/select/vertical: is not one of its fields`).


The first release that contains `commandagi/design`. npm 0.4.1 was built on 2026-09-24, before the design layer was
written; the version in the source stayed at 0.4.1 for the 125 commits after it, so the source and the package had
one number and different contents. npm 0.4.1 also carried the platform link only (`dist/daemon/chunks`); this one
carries the whole local host.

Added

- `commandagi/design`: documents declared in code.
  - The code-part primitives: CAD, EDA, any graph; the importers for `tscircuit`, `@jscad/modeling` and `replicad`.
  - The document vocabularies in JSX (`commandagi/jsx-runtime`, `commandagi/threed/jsx-runtime`): schematic, board,
    3D part and assembly, machining and slicing setups, workbook, page, deck, drawing, painting, photo, nest, video,
    song, world, device definition, dashboard, geo project, node graph, company, RFC, case, task, project, monitor,
    contract, product instance, letter, postcard, PDF, agent, harness, infrastructure.
- `Kernel` (`import { Kernel } from "commandagi"`): `observe`, `export`, `measure`, `drawing` and `tessellate` of a 3D
  document, by the CommandAGI 3D design service (OpenCascade). `COMMANDAGI_THREED` chooses the service: `platform`
  (the default, with an API key), `local` (this computer, offline, no account) or the URL of a running one.
- `commandagi threed install | status | serve`: the 3D design service from this package, with no checkout of the
  CommandAGI repository. `install` downloads its dependencies (OpenCascade as WebAssembly, about 130 MB) once.
- `commandagi daemon …` is the whole CommandAGI local host (workbench, files, devices, MCP, account link), and
  `commandagi code eval <file>` evaluates a code file headless in its sandbox.
- Client namespaces: `computer`, `billing`, `web`, `postal`, `social`, `phone`, `vpn`; agent constraints; the agent
  command center (`commandagi` with no arguments).
- `LICENSE` (MIT, as `package.json` states), this file, and § Versions in the README.

Changed

- The desktop control vocabulary has `mouse_down` and `mouse_up`.
- `@nut-tree-fork/nut-js` and `screenshot-desktop` are no longer optional dependencies.

Fixed

- The installed `commandagi` command runs. Through npm's link (`node_modules/.bin/commandagi`, a global install) it
  ran nothing and exited 0, in 0.4.1 too: the file compared its own path with the link's.

Known limits

- `Kernel.measure` works with a local service only: the platform's route cannot be told which measurement.

## 0.4.1 (2026-09-24)

The generated client, `Session` over the thread WebSocket, and the `commandagi` CLI.

## 0.1.0 (2026-08-29)

The first publish of the name.
