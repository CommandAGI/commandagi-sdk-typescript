// The ontology's files in JSX declare the documents their editors edit. Pinned here: a world, a definition, a dashboard
// and a geo project are their JSON both ways (fromTree ∘ toTree is the identity on what the file says) and leave a run
// as the one shape of a document ({ format, document, sources }, each element's __source by its path); a node graph is
// the editor's own op graph, wires bound to ports with the literal kept; what a vocabulary has no words for is refused
// by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, FIRMWARE, jsx, ONTOLOGY } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });
const documentOf = (mod: Record<string, unknown>) => {
  const { graph, document } = declarationOf(mod);
  assert.deepEqual(graph.nodes, {}, "a document leaves beside an empty graph");
  return document!;
};

test("a world in JSX declares its world: units, space and a scene's bodies are elements; each __source keyed by its path", () => {
  const file = el(
    "world",
    { name: "Shop", kind: "simulation", __source: 0 },
    el("space", { origin_mm: [0, 0, 0], size_mm: [4000, 3000, 2500] }),
    el("unit", { uid: "arm", name: "arm", device: "../../devices/so-101/definition.tsx", position: [100, 0, 0], rotation: 90, __source: 2 }),
    el("scene", { hz: 240 }, el("body", { id: "cube", shape: { type: "box", hx: 0.02 }, at: [0, 0, 1] })),
  );
  const { format, document: world, sources } = documentOf({ default: () => file });
  assert.equal(format, "world");
  assert.deepEqual(sources, { "": 0, "unit#arm": 2 });
  assert.deepEqual(world, {
    name: "Shop",
    kind: "simulation",
    space: { origin_mm: [0, 0, 0], size_mm: [4000, 3000, 2500] },
    units: [{ uid: "arm", name: "arm", device: "../../devices/so-101/definition.tsx", position: [100, 0, 0], rotation: 90 }],
    scene: { hz: 240, bodies: [{ id: "cube", shape: { type: "box", hx: 0.02 }, at: [0, 0, 1] }] },
  });
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(world as never)), world, "both ways");

  // A group is what a unit stands in or on: a shelf and its level, the level inside the shelf, the unit naming its level.
  const shelved = documentOf({
    default: () =>
      el(
        "world",
        { name: "Shop", kind: "physical" },
        el("group", { uid: "shelf", name: "machine shelf", size_mm: [2440, 760, 2600], position: [0, 3600, 0], rotation: 0 }),
        el("group", { uid: "shelf-1", name: "level 1", group: "shelf", size_mm: [2440, 760, 650], position: [0, 3600, 150], rotation: 0 }),
        el("unit", { uid: "cnc-01", name: "router", device: "../../devices/cnc/definition.tsx", group: "shelf-1", position: [-900, 3600, 150], rotation: 0 }),
      ),
  }).document;
  assert.deepEqual(shelved.groups, [
    { uid: "shelf", name: "machine shelf", size_mm: [2440, 760, 2600], position: [0, 3600, 0], rotation: 0 },
    { uid: "shelf-1", name: "level 1", group: "shelf", size_mm: [2440, 760, 650], position: [0, 3600, 150], rotation: 0 },
  ]);
  assert.equal((shelved.units as Record<string, unknown>[])[0].group, "shelf-1");
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(shelved as never)), shelved, "a group both ways");
  assert.throws(
    () => declarationOf({ default: el("world", { name: "W", kind: "physical" }, el("group", { uid: "g", name: "g", device: "d" })) }),
    /<group uid="g">: device is not read/,
  );
  assert.throws(() => declarationOf({ default: el("world", { name: "W", kind: "physical" }, el("group", { uid: "g" })) }), /<group uid="g"> needs name/);

  // A world's model and the parts of it a run moves are attributes of <world>: the model a ref, the links its records.
  const links = [{ node: "ram", joint: { unit: "press-1", channel: "axes", name: "z", type: "prismatic", axis: "z", origin_mm: [0, 0, 0], home: 0 } }];
  const posed = documentOf({ default: () => el("world", { name: "Press", kind: "physical", model: "press.3d.tsx", links }) }).document;
  assert.deepEqual(posed, { name: "Press", kind: "physical", model: "press.3d.tsx", links, units: [] });
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(posed as never)), posed, "a model's links both ways");
  // A world's follow policies (docs/follow.md) are an attribute of <world>.
  const policies = [{ id: "sim-control", kind: "follow", robot: "arm", reality: "physical", leader: { unit: "arm", run: "twin" }, hz: 30 }];
  const followed = documentOf({ default: () => el("world", { name: "Cell", kind: "physical", policies }) }).document;
  assert.deepEqual(followed, { name: "Cell", kind: "physical", policies, units: [] });
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(followed as never)), followed, "a world's policies both ways");

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

test("bounds and interlocks are elements: a <bound> folds into its channel, an <interlock> into the definition's or the world's list", () => {
  const requires = [{ channel: "switches", field: "home", eq: true }];
  const def = el(
    "device",
    { name: "Hatch" },
    el("channel", { id: "gate", dir: "duplex", medium: "records", format: "json-records" }),
    el("channel", { id: "switches", dir: "out", medium: "records", format: "json-records" }),
    el("bound", { channel: "gate", field: "lift", min: 0, max: 420, maxRate: 200 }),
    el("interlock", { name: "gate-closes-only-with-shuttle-home", channel: "gate", when: { field: "lift", lt: 420 }, requires, why: "the gate would close on the tray" }),
  );
  const doc = documentOf({ default: def }).document as Record<string, unknown>;
  assert.deepEqual(doc.channels, [
    { id: "gate", dir: "duplex", medium: "records", format: "json-records", bounds: [{ field: "lift", min: 0, max: 420, maxRate: 200 }] },
    { id: "switches", dir: "out", medium: "records", format: "json-records" },
  ]);
  assert.deepEqual(doc.interlocks, [{ name: "gate-closes-only-with-shuttle-home", channel: "gate", when: { field: "lift", lt: 420 }, requires, why: "the gate would close on the tray" }]);
  assert.deepEqual(ONTOLOGY.device.fromTree(ONTOLOGY.device.toTree(doc as never)), doc, "both ways");
  assert.throws(() => declarationOf({ default: el("device", { name: "A" }, el("bound", { channel: "x", field: "f", max: 1 })) }), /channel "x" is not a <channel> of this device/);
  assert.throws(() => declarationOf({ default: el("device", { name: "A" }, el("channel", { id: "c", bounds: [] })) }), /each bound as a <bound channel="c">/);
  assert.throws(() => declarationOf({ default: el("device", { name: "A", interlocks: [] }) }), /each interlock as an <interlock> element/);
  const world = documentOf({
    default: el("world", { name: "Unit", kind: "physical" }, el("unit", { uid: "tray", name: "tray", device: "d" }), el("interlock", { name: "shuttle-needs-hatch-open", unit: "tray", channel: "shuttle", requires: [{ unit: "hatch", channel: "gate", field: "open", eq: true }], why: "the tray would strike the gate" })),
  }).document as Record<string, unknown>;
  assert.deepEqual(world.interlocks, [{ name: "shuttle-needs-hatch-open", unit: "tray", channel: "shuttle", requires: [{ unit: "hatch", channel: "gate", field: "open", eq: true }], why: "the tray would strike the gate" }]);
  assert.deepEqual(ONTOLOGY.world.fromTree(ONTOLOGY.world.toTree(world as never)), world, "a world's interlocks both ways");
});

test("a definition names its firmware and revision; a firmware declares its channels and the revisions it supports", () => {
  const def = documentOf({ default: el("device", { name: "Cam", firmware: "../../firmware/cam", revision: "rev-a" }, el("channel", { id: "cam", dir: "out", medium: "video", format: "video" })) }).document;
  assert.deepEqual(def, { name: "Cam", firmware: "../../firmware/cam", revision: "rev-a", channels: [{ id: "cam", dir: "out", medium: "video", format: "video" }] });
  const fw = documentOf({ default: el("firmware", { name: "cam" }, el("supports", { revision: "rev-a" }), el("channel", { id: "cam", dir: "out", medium: "video", format: "video" })) }).document;
  assert.deepEqual(fw, { name: "cam", supports: [{ revision: "rev-a" }], channels: [{ id: "cam", dir: "out", medium: "video", format: "video" }] });
  assert.deepEqual(FIRMWARE.firmware.fromTree(FIRMWARE.firmware.toTree(fw as never)), fw, "both ways");
  assert.throws(() => declarationOf({ default: el("firmware", {}) }), /states its name/);
  assert.throws(() => declarationOf({ default: el("firmware", { name: "f", version: "1.0" }) }), /<firmware> needs image, sha256, sbom, device/);
  assert.throws(() => declarationOf({ default: el("firmware", { name: "f" }, el("unit", { uid: "a" })) }), /<unit> is not a tag of a firmware/);
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

test("a pane with repeat is one pane per live stream, and names no file of its own", () => {
  const { document: live } = documentOf({ default: el("dashboard", { name: "everything live" }, el("pane", { id: "live", kind: "files", repeat: "live-stream" })) });
  assert.deepEqual((live as { panes: Record<string, unknown> }).panes.live, { kind: "files", repeat: "live-stream" });
  const paneOf = (attrs: Record<string, unknown>) => () => declarationOf({ default: el("dashboard", { name: "x" }, el("pane", { id: "live", ...attrs })) });
  assert.throws(paneOf({ kind: "files", repeat: "runs" }), /repeat is "live-stream"/);
  assert.throws(paneOf({ kind: "files", repeat: "live-stream", selected: "runs/r/run.json" }), /names no file of its own/);
  assert.throws(paneOf({ kind: "devices", repeat: "live-stream" }), /shows files/);
});

test("a geo project's manifest: its date range and camera are elements", () => {
  const doc = documentOf({ default: el("geoproject", { id: "p1", name: "Chokepoints" }, el("dateRange", { start: "2015-01", end: "2030-01" }), el("camera", { centerLng: 40, centerLat: 25, scale: 320 })) }).document;
  assert.deepEqual(doc, { type: "geoeconomics/project", schemaVersion: "1.0", id: "p1", name: "Chokepoints", data: { defaultDateRange: { start: "2015-01", end: "2030-01" }, defaultCamera: { centerLng: 40, centerLat: 25, scale: 320 } } });
});

test("a geo project's shock, scenario, model and parameter set: fields are attributes, a model's parameters are elements", () => {
  const shock = documentOf({ default: el("shock", { id: "closure", name: "Hormuz closure", eventType: "route-disruption", targets: ["cp-hormuz"], start: "2028-03", magnitude: 0.7 }) });
  assert.equal(shock.format, "shock");
  assert.deepEqual(shock.document, { type: "geoeconomics/event", schemaVersion: "1.0", id: "closure", name: "Hormuz closure", data: { eventType: "route-disruption", targets: ["cp-hormuz"], start: "2028-03", magnitude: 0.7 } });
  // The studio's envelope carries times; the code holds none, so a changed target is the one attribute that changes.
  const clicked = { ...shock.document, createdAt: "2026-11-06T00:00:00.000Z", updatedAt: "2026-11-06T00:00:01.000Z", data: { ...(shock.document.data as object), targets: ["cp-hormuz", "IR"] } };
  assert.deepEqual(ONTOLOGY.shock.toTree(clicked as never).attrs, { id: "closure", name: "Hormuz closure", eventType: "route-disruption", targets: ["cp-hormuz", "IR"], start: "2028-03", magnitude: 0.7 });

  const scenario = documentOf({ default: el("scenario", { id: "s", name: "Hormuz", baselineDate: "2028-03", timeHorizon: { start: "2028-03", end: "2030-03" }, events: ["./shocks/closure.shock.tsx"], models: ["../../models/commodity-shock.geomodel.tsx"] }) });
  assert.deepEqual(scenario.document.data, { baselineDate: "2028-03", timeHorizon: { start: "2028-03", end: "2030-03" }, events: ["./shocks/closure.shock.tsx"], models: ["../../models/commodity-shock.geomodel.tsx"] });

  const model = documentOf({ default: el("geomodel", { id: "m", name: "Commodity shock", runtime: "commodity-shock", version: "1.0", compatibleEvents: ["route-disruption"] }, el("parameter", { name: "priceElasticity", default: 0.2, min: 0.05, max: 0.6 }), el("reference", { role: "paper", path: "../notes/methodology.md" })) });
  assert.deepEqual(model.document, {
    type: "geoeconomics/model",
    schemaVersion: "1.0",
    id: "m",
    name: "Commodity shock",
    references: [{ role: "paper", path: "../notes/methodology.md" }],
    data: { runtime: "commodity-shock", version: "1.0", compatibleEvents: ["route-disruption"], parameterSchema: { priceElasticity: { default: 0.2, min: 0.05, max: 0.6 } } },
  });
  const back = ONTOLOGY.geomodel.toTree(model.document as never);
  assert.deepEqual(back.children.map((c) => [c.tag, c.attrs]), [["parameter", { name: "priceElasticity", default: 0.2, min: 0.05, max: 0.6 }], ["reference", { role: "paper", path: "../notes/methodology.md" }]]);
  assert.deepEqual(ONTOLOGY.geomodel.fromTree(back), model.document);

  const params = documentOf({ default: el("geoparams", { id: "p", name: "Severe", forModel: "commodity-shock", values: { priceElasticity: 0.25 } }) });
  assert.deepEqual(params.document.data, { forModel: "commodity-shock", values: { priceElasticity: 0.25 } });

  assert.throws(() => ONTOLOGY.shock.toTree({ ...shock.document, data: { ...(shock.document.data as object), colour: "red" } } as never), /colour of a shock has no element/);
  assert.throws(() => documentOf({ default: el("shock", { id: "x", name: "x", colour: "red" }) }), /colour is not read/);
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
