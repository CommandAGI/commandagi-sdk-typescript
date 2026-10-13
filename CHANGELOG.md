# Changelog

One entry for each release. A release is the tag `v<version>` in this repository and the same version on npm. The
Python and Rust SDKs carry the same version number. A version promises nothing about the next one (README
§ Versions): read this file before you change the version you pin.

## Unreleased

Added

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

## 0.5.0 (2026-10-13)

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
