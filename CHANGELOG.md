# Changelog

One entry for each release. A release is the tag `v<version>` in this repository and the same version on npm. The
Python and Rust SDKs carry the same version number. A version promises nothing about the next one (README
§ Versions): read this file before you change the version you pin.

## Unreleased

Added

- The scouts' two documents (`commandagi/design` `scouts.ts`; docs/scouts.md in the CommandAGI repository):
  - `<scout>` (`<name>.scout.tsx`): one comparison of configurations (`<configuration id model harness effort
    instructions maxTokens incumbent>`) on the cases of each `<workload>` (`<case id from prompt check rubric source
    terms>`), scored by a check or by a `<judge>` panel, with the verdict's rules (`budget`, `repeats`, `margin`,
    `relativeMargin`, `errorFloor`, `minCalls`, `minCases`, `resamples`, `alpha`, `seed`, `maxCases`). A case's `from` is `public`,
    `synthetic` or `own-run`; nothing else may be a case.
  - `<replacement>` (`<name>.replacement.tsx`): what replacing a product would cost, by `<layer kind title>`
    (`visible`, `invisible`, `integrations`, `operations`, `economics`), each `<capability id title need have effort
    run labour ref note>` with its `<evidence source claim>`, and the `<decision>`, `<differentiation>` and
    `<economics>`.

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
