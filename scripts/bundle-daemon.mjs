/**
 * Ship the host daemon inside `commandagi`: copy the host package's prebuilt bundle into dist/daemon/.
 *
 * `commandagi daemon …` (hosting this computer in the background) is the one part of this package that is
 * not SDK: its source is the CommandAGI host (deployments/clients/computer-host-daemon in the CommandAGI
 * monorepo), which also runs inside the desktop app. It is bundled there — its private workspace
 * dependencies inlined, its native modules left external, which is why they are this package's
 * `optionalDependencies` — and loaded by src/cli.ts only for `daemon` commands, so importing the SDK
 * never loads a native binding.
 *
 * So this package builds inside the monorepo (turbo builds the host first: it is a devDependency). Built
 * anywhere else, this step fails loudly rather than shipping a CLI whose `daemon` command is missing.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(
  here,
  "..",
  "..",
  "..",
  "deployments",
  "clients",
  "computer-host-daemon",
  "dist",
);
const target = join(here, "..", "dist", "daemon");

if (!existsSync(join(source, "daemon-cli.js"))) {
  console.error(
    `bundle-daemon: ${source}/daemon-cli.js is missing — build the host first ` +
      "(`pnpm --filter @commandagi/computer-host-daemon build`, which turbo does for a normal build).",
  );
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
// Exactly the daemon's entry and the chunks it imports (esbuild splitting) — not the host's library
// entry, its type declarations, or anything an older host build left in its dist/.
cpSync(join(source, "daemon-cli.js"), join(target, "daemon-cli.js"));
cpSync(join(source, "chunks"), join(target, "chunks"), {
  recursive: true,
  filter: (p) => !p.endsWith(".map"),
});
console.log(`bundle-daemon: ${source} → ${target}`);
