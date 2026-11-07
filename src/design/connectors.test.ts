// A connector in JSX declares the document the platform's and the host's connector engine runs. Pinned here: each
// element is its record both ways, and a connector that would make an impolite or unreadable request is refused with
// why. The Python SDK's tests/test_connectors.py and the Rust SDK's tests/connectors.rs declare the same example.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CONNECTORS, declarationOf, jsx } from "./index.js";

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag, { ...props, ...(children.length ? { children } : {}) });

const EXAMPLE = {
  name: "Poly Haven",
  base: "https://api.polyhaven.com",
  rate: 2,
  cache: 86400,
  home: "https://polyhaven.com",
  hosts: ["dl.polyhaven.org"],
  licence: "CC0-1.0",
  credit: "Poly Haven",
  credential: { service: "data-gov", field: "API_KEY", query: "api_key", optional: true },
  licences: [{ value: "CC0", spdx: "CC0-1.0" }],
  folders: [
    { path: "", produce: [{ kind: "dir", name: "models" }] },
    {
      path: "models",
      get: "/assets?type=models",
      produce: [{ kind: "each", in: "$", as: "a", produce: [{ kind: "dir", name: "{a}", title: "{a/name}", author: "{a/authors|keys|join:, }" }] }],
    },
    {
      path: "models/{slug}",
      get: "/files/{slug}",
      requests: [{ as: "info", get: "/info/{slug}" }],
      here: { source: "https://polyhaven.com/a/{slug}" },
      produce: [
        {
          kind: "each",
          in: "$/gltf",
          as: "res",
          produce: [
            { kind: "file", path: "{res}/{slug}_{res}.gltf", url: "{res/gltf/url}", size: "{res/gltf/size}" },
            { kind: "file", path: "{res}/pack.zip/a.glb", zip: "{res/zip/url}", member: "a.glb" },
          ],
        },
      ],
    },
  ],
};

test("a connector in JSX: each element is its record, its fields the attributes, both ways", () => {
  const file = el(
    "connector",
    { name: "Poly Haven", base: "https://api.polyhaven.com", rate: 2, cache: 86400, home: "https://polyhaven.com", hosts: ["dl.polyhaven.org"], licence: "CC0-1.0", credit: "Poly Haven", __source: 0 },
    el("credential", { service: "data-gov", field: "API_KEY", query: "api_key", optional: true }),
    el("licence", { value: "CC0", spdx: "CC0-1.0" }),
    el("folder", { path: "" }, el("dir", { name: "models" })),
    el("folder", { path: "models", get: "/assets?type=models", __source: 1 }, el("each", { in: "$", as: "a" }, el("dir", { name: "{a}", title: "{a/name}", author: "{a/authors|keys|join:, }" }))),
    el(
      "folder",
      { path: "models/{slug}", get: "/files/{slug}" },
      el("request", { as: "info", get: "/info/{slug}" }),
      el("here", { source: "https://polyhaven.com/a/{slug}" }),
      el(
        "each",
        { in: "$/gltf", as: "res" },
        el("file", { path: "{res}/{slug}_{res}.gltf", url: "{res/gltf/url}", size: "{res/gltf/size}" }),
        el("file", { path: "{res}/pack.zip/a.glb", zip: "{res/zip/url}", member: "a.glb" }),
      ),
    ),
  );
  const { graph, document } = declarationOf({ default: () => file });
  assert.deepEqual(graph.nodes, {}, "a connector leaves beside an empty graph");
  assert.equal(document!.format, "connector");
  assert.equal(document!.sources[""], 0);
  assert.equal(document!.sources["folder#models"], 1);
  assert.deepEqual(document!.document, EXAMPLE);
  assert.deepEqual(CONNECTORS.connector.fromTree(CONNECTORS.connector.toTree(EXAMPLE as never)), EXAMPLE, "both ways");
});

test("a connector that does not read is refused with why", () => {
  const root = { name: "S", base: "https://api.example.com", rate: 1, cache: 3600 };
  const bad = (attrs: Record<string, unknown>, ...children: unknown[]) => () => declarationOf({ default: el("connector", attrs, ...(children.length ? children : [el("folder", { path: "" })])) });
  assert.throws(bad({ ...root, base: "http://api.example.com" }), /base is the API's https url/);
  assert.throws(bad({ ...root, rate: 50 }), /rate is the requests a second it makes at most/);
  assert.throws(bad({ ...root, cache: 5 }), /cache is the seconds a listing is kept/);
  assert.throws(bad(root, el("dir", { name: "x" })), /<dir> stands in <folder> or <each>, not in <connector>/);
  assert.throws(() => declarationOf({ default: el("connector", root) }), /declares no <folder>/);
  assert.throws(bad(root, el("folder", { path: "a//b" })), /path is names and \{var\} segments/);
  assert.throws(bad(root, el("folder", { path: "" }, el("file", { path: "x.glb" }))), /reads its bytes from url, or from zip and member/);
  assert.throws(bad(root, el("folder", { path: "" }, el("file", { path: "x.glb", zip: "https://a/x.zip" }))), /zip and member go together/);
  assert.throws(bad(root, el("folder", { path: "" }, el("each", { in: "$", as: "$" }))), /as is a name/);
  assert.throws(bad(root, el("folder", { path: "", get: "/x", page: "start" })), /it needs pageSize/);
  assert.throws(bad(root, el("credential", { service: "data-gov", field: "API_KEY" }), el("folder", { path: "" })), /a query parameter or a header/);
  assert.throws(bad(root, el("folder", { path: "" }), el("folder", { path: "" })), /two <folder> in <connector> have path ""|has two <folder path="">/);
});
