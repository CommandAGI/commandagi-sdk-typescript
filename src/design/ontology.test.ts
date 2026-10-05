// The ontology's files in JSX declare the documents their editors edit. Pinned here: a world, a definition, a dashboard
// and a geo project are their JSON both ways (fromTree ∘ toTree is the identity on what the file says) and leave a run
// as the one shape of a document ({ format, document, sources }, each element's __source by its path); a node graph is
// the editor's own op graph, wires bound to ports with the literal kept; what a vocabulary has no words for is refused
// by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, jsx, ONTOLOGY } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const documentOf = (mod: Record<string, unknown>) => {
  const { graph, document } = declarationOf(mod);
  assert.deepEqual(graph.nodes, {}, "a document leaves beside an empty graph");
  return document!;
};

test("a world in JSX is its world.json: units, space and a scene's bodies are elements; each __source keyed by its path", () => {
  const file = el(
    "world",
    { name: "Shop", kind: "simulation", __source: 0 },
    el("space", { origin_mm: [0, 0, 0], size_mm: [4000, 3000, 2500] }),
    el("unit", { uid: "arm", name: "arm", device: "../../devices/so-101/definition.json", position: [100, 0, 0], rotation: 90, __source: 2 }),
    el("scene", { hz: 240 }, el("body", { id: "cube", shape: { type: "box", hx: 0.02 }, at: [0, 0, 1] })),
  );
  const { format, document: world, sources } = documentOf({ default: () => file });
  assert.equal(format, "world");
  assert.deepEqual(sources, { "": 0, "unit#arm": 2 });
  assert.deepEqual(world, {
    name: "Shop",
    kind: "simulation",
    space: { origin_mm: [0, 0, 0], size_mm: [4000, 3000, 2500] },
    units: [{ uid: "arm", name: "arm", device: "../../devices/so-101/definition.json", position: [100, 0, 0], rotation: 90 }],
    scene: { hz: 240, bodies: [{ id: "cube", shape: { type: "box", hx: 0.02 }, at: [0, 0, 1] }] },
  });
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(world as never)), world, "both ways");

  const world_ = (...children: unknown[]) => () => declarationOf({ default: el("world", { name: "W", kind: "physical" }, ...children) });
  assert.throws(() => declarationOf({ default: el("world", { name: "W" }) }), /<world> needs kind/);
  assert.throws(() => declarationOf({ default: el("world", { name: "W", kind: "real" }) }), /physical" or "simulation", said explicitly/);
  assert.throws(world_(el("unit", { uid: "a", name: "a", device: "d.json", speed: 3 })), /<unit uid="a">: speed is not read/);
  assert.throws(world_(el("unit", { uid: "a", name: "a", device: "d" }), el("unit", { uid: "a", name: "b", device: "d" })), /two <unit> in <world> have uid "a"/);
  assert.throws(world_(el("body", { id: "b" })), /<body> stands in <scene>, not in <world>/);
  assert.throws(world_(el("lamp", {})), /<lamp> is not a tag of a world/);
});

test("a device definition's channels are <channel> elements; its bounds are attributes, declared and not enforced here", () => {
  const def = el(
    "device",
    { name: "Arm", interface: "USB serial", model: { file: "model.glb" } },
    el("channel", { id: "joints", dir: "duplex", medium: "records", format: "servo-bus", transport: "serial", limits: { j1: [-90, 90] }, minIntervalMs: 20 }),
  );
  const doc = documentOf({ default: def }).document;
  assert.deepEqual(doc, { name: "Arm", interface: "USB serial", model: { file: "model.glb" }, channels: [{ id: "joints", dir: "duplex", medium: "records", format: "servo-bus", transport: "serial", limits: { j1: [-90, 90] }, minIntervalMs: 20 }] });
  assert.throws(() => declarationOf({ default: el("device", { name: "A", channels: [] }) }), /each channel as a <channel> element/);
});

test("a dashboard's layout is nested <split>s of <pane>s; its params and regions are elements", () => {
  const file = el(
    "dashboard",
    { name: "cockpit", focus: "b" },
    el("param", { id: "unit", type: "unit" }),
    el("split", { axis: "x", ratio: 0.5 }, el("pane", { id: "a", kind: "world", world: "${unit.world}" }), el("pane", { id: "b", kind: "devices", theater: true })),
    el("region", { side: "left", tab: "nav" }),
  );
  const { document: doc } = documentOf({ default: file });
  assert.deepEqual(doc, {
    format: "commandagi-dashboard",
    name: "cockpit",
    focus: "b",
    params: [{ id: "unit", type: "unit" }],
    layout: { kind: "split", axis: "x", ratio: 0.5, children: [{ kind: "leaf", paneId: "a" }, { kind: "leaf", paneId: "b" }] },
    panes: { a: { kind: "world", world: "${unit.world}" }, b: { kind: "devices", theater: true } },
    regions: { left: { tab: "nav" } },
  });
  assert.deepEqual(ONTOLOGY.dashboard.fromTree(ONTOLOGY.dashboard.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("dashboard", { name: "x" }, el("split", { axis: "x", ratio: 0.5 }, el("pane", { id: "a" }))) }), /a <split> has two sides/);
});

test("a geo project's manifest: its date range and camera are elements", () => {
  const doc = documentOf({ default: el("geoproject", { id: "p1", name: "Chokepoints" }, el("dateRange", { start: "2015-01", end: "2030-01" }), el("camera", { centerLng: 40, centerLat: 25, scale: 320 })) }).document;
  assert.deepEqual(doc, { type: "geoeconomics/project", schemaVersion: "1.0", id: "p1", name: "Chokepoints", data: { defaultDateRange: { start: "2015-01", end: "2030-01" }, defaultCamera: { centerLng: 40, centerLat: 25, scale: 320 } } });
});

test("a node graph in JSX is the editor's own op graph: positions in meta, wires into ports with the literal kept", () => {
  const file = el(
    "opgraph",
    { name: "Mix" },
    el("node", { id: "g", type: "gradient", x: 40, y: 80, shadeA: 40, __source: 1 }),
    el("node", { id: "b", type: "blur", x: 300, y: 80, radius: 6, output: true }),
    el("node", { id: "m", type: "mix", inputs: { "layers.2": null } }),
    el("wire", { from: "g:out", to: "b:in", __source: 4 }),
    el("wire", { from: "g:out", to: "b:radius" }),
    el("wire", { from: "b:out", to: "m:layers.1" }),
  );
  const { graph } = declarationOf({ default: file });
  assert.deepEqual(graph, {
    id: "nodegraph",
    nodes: {
      g: { id: "g", type: "gradient", inputs: { shadeA: 40 }, meta: { x: 40, y: 80, source: 1 } },
      b: { id: "b", type: "blur", inputs: { radius: { wire: { node: "g", port: "out" }, value: 6 }, in: { wire: { node: "g", port: "out" } } }, meta: { x: 300, y: 80, sources: { "wire:in": 4 } } },
      m: { id: "m", type: "mix", inputs: { "layers.2": null, "layers.1": { wire: { node: "b", port: "out" } } } },
    },
    outputs: ["b"],
    meta: { name: "Mix", domain: "nodegraph" },
  });
  const back = ONTOLOGY.opgraph.toTree(graph);
  assert.deepEqual(back.children.map((c) => [c.tag, c.attrs]), [
    ["node", { id: "g", type: "gradient", x: 40, y: 80, shadeA: 40 }],
    ["node", { id: "b", type: "blur", x: 300, y: 80, output: true, radius: 6 }],
    ["node", { id: "m", type: "mix", inputs: { "layers.2": null } }],
    ["wire", { from: "g:out", to: "b:radius" }],
    ["wire", { from: "g:out", to: "b:in" }],
    ["wire", { from: "b:out", to: "m:layers.1" }],
  ]);
  assert.equal(back.children[4]!.source, 4, "a wire's element rides in its target's meta.sources");
  assert.throws(() => declarationOf({ default: el("opgraph", {}, el("node", { id: "a", type: "t", inputs: { radius: 1 } })) }), /write radius as an attribute/);
  assert.throws(() => declarationOf({ default: el("opgraph", {}, el("node", { id: "a", type: "t" }), el("wire", { from: "a:out", to: "z:in" })) }), /no <node id="z">/);
  assert.throws(() => declarationOf({ default: el("opgraph", {}, el("node", { id: "a", type: "t" }), el("wire", { from: "a", to: "a:in" })) }), /"node:port"/);
});
