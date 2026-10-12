// VPN exits in JSX declare the ExitDoc of docs/vpn.md § exits as code (the CommandAGI repository). Pinned here: a
// provider's exits share a component, so one exit is one line; what the file does not say stays absent and
// `exitWithDefaults` fills it; what the vocabulary has no words for, or a value out of range, is refused by name.
import assert from "node:assert/strict";
import { test } from "node:test";

import { declarationOf, exitWithDefaults, INFRA, jsx, sessionWithDefaults } from "./index.js";

const el = (tag: unknown, props: Record<string, unknown> = {}, ...children: unknown[]) => jsx(tag as string, { ...props, ...(children.length ? { children } : {}) });

const HetznerExit = ({ name, region, country, continent, size = "cax11", enabled }: Record<string, unknown>) =>
  el("exit", { name, provider: "hetzner", region, country, continent, size, image: "debian-12", protocol: "wireguard", enabled, __source: 0 });

test("an exit in JSX: a provider is a component, one exit is one line, and the run gives the ExitDoc", () => {
  const { graph, document } = declarationOf({ default: () => el(HetznerExit, { name: "fsn-1", region: "fsn1", country: "DE", continent: "EU" }) });
  assert.deepEqual(graph.nodes, {}, "an exit leaves beside an empty graph");
  assert.equal(document!.format, "exit");
  assert.deepEqual(document!.document, { name: "fsn-1", provider: "hetzner", region: "fsn1", country: "DE", continent: "EU", size: "cax11", image: "debian-12", protocol: "wireguard" });
  assert.deepEqual(INFRA.exit.fromTree(INFRA.exit.toTree(document!.document as never)), document!.document, "both ways");
  assert.deepEqual(exitWithDefaults(document!.document as never), {
    name: "fsn-1", provider: "hetzner", region: "fsn1", country: "DE", continent: "EU", size: "cax11", image: "debian-12", protocol: "wireguard", enabled: true, price: null, maxMonthlyUsd: null,
  });
  const off = declarationOf({ default: () => el(HetznerExit, { name: "nrt-1", region: "nrt", country: "JP", enabled: false }) });
  assert.equal(exitWithDefaults(off.document!.document as never).enabled, false, "a declared false stays");
});

test("an exit refuses by name what it has no words for, and values out of range", () => {
  const exit = (props: Record<string, unknown>) => () =>
    declarationOf({ default: el("exit", { name: "x-1", provider: "hetzner", region: "fsn1", country: "DE", size: "cax11", image: "debian-12", ...props }) });
  assert.doesNotThrow(exit({}));
  assert.throws(exit({ name: undefined }), /<exit> needs name/);
  assert.throws(exit({ name: "Fsn 1" }), /name is lower-case letters/);
  assert.throws(exit({ provider: "linode" }), /provider is "hetzner", "vultr"/);
  assert.throws(exit({ country: "de" }), /country is an ISO 3166 code in capitals/);
  assert.throws(exit({ continent: "Europe" }), /continent is "AF"/);
  assert.throws(exit({ protocol: "openvpn" }), /protocol is "wireguard"/);
  assert.throws(exit({ enabled: "yes" }), /enabled is true or false/);
  assert.throws(exit({ maxMonthlyUsd: "6.99" }), /maxMonthlyUsd is a price in USD/);
  assert.throws(exit({ ip: "1.2.3.4" }), /ip is not read/);
});

test("a logged-in state in JSX: a browser profile or a snapshot, the monitors that use it, and no credential", () => {
  const { document } = declarationOf({
    default: () => el("session", { name: "x-web", site: "https://x.com", kind: "browser-profile", profile: "x-web", refreshed: "2026-10-12" }, el("uses", { monitor: "../../../social/x/nvidia" })),
  });
  assert.equal(document!.format, "session");
  assert.deepEqual(document!.document, { name: "x-web", site: "https://x.com", kind: "browser-profile", profile: "x-web", refreshed: "2026-10-12", uses: [{ monitor: "../../../social/x/nvidia" }] });
  assert.deepEqual(INFRA.session.fromTree(INFRA.session.toTree(document!.document as never)), document!.document, "both ways");
  assert.deepEqual(sessionWithDefaults(document!.document as never), {
    name: "x-web", site: "https://x.com", kind: "browser-profile", host: null, profile: "x-web", snapshot: null, refreshed: "2026-10-12", note: null, uses: ["../../../social/x/nvidia"],
  });
  const session = (props: Record<string, unknown>) => () => declarationOf({ default: el("session", { name: "s-1", site: "https://example.com", kind: "vm-snapshot", snapshot: "genesis", ...props }) });
  assert.doesNotThrow(session({}));
  assert.throws(session({ kind: "cookie-jar" }), /kind is "browser-profile", "vm-snapshot", "android-snapshot"/);
  assert.throws(session({ snapshot: undefined }), /a vm-snapshot names its snapshot/);
  assert.throws(session({ kind: "browser-profile", snapshot: undefined }), /a browser-profile names its profile/);
  assert.throws(session({ kind: "browser-profile", profile: "p" }), /a browser-profile has a profile, not a snapshot/);
  assert.throws(session({ profile: "studio" }), /a vm-snapshot has a snapshot, not a profile/);
  assert.equal(sessionWithDefaults(declarationOf({ default: el("session", { name: "s-1", site: "https://example.com", kind: "vm-snapshot", snapshot: "genesis", host: "store-reader" }) }).document!.document as never).host, "store-reader");
  assert.throws(session({ site: "x.com" }), /site is an https address/);
  assert.throws(session({ refreshed: "yesterday" }), /refreshed is a day/);
  assert.throws(session({ password: "hunter2" }), /password is not read/);
});
