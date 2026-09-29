/**
 * Ship the CommandAGI local host inside `commandagi`: `commandagi daemon …` from npm is the same program a checkout
 * runs as `pnpm commandagi daemon …` and the desktop app runs — the workbench, files, devices, the MCP host and the
 * platform link — not a platform-link-only copy.
 *
 * The CommandAGI monorepo packs it (scripts/workbench/pack-cli.mjs there): the host in the repository layout under
 * dist/daemon/host/, the platform link's prebuilt library where the host loads it, and dist/daemon/daemon-cli.js,
 * whose `main(argv)` is the host's `daemon …` and whose `probeHost()` is the host's probe (what the TUI shows).
 * src/cli.ts loads that module only for `daemon` commands, so importing the SDK never loads a native binding; the
 * platform link's native modules are this package's `optionalDependencies` and load only when the host starts it.
 *
 * So this package builds inside the monorepo, after the workbench's apps (`pnpm workbench:models && pnpm
 * workbench:bundle`) and the platform link (`pnpm --filter @commandagi/computer-host-daemon build`, which turbo runs
 * first: it is a devDependency). Built anywhere else, or before those, this step fails loudly rather than shipping a
 * CLI whose `daemon` command is missing or has no workbench.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const monorepo = join(here, "..", "..", "..");
const packer = join(monorepo, "scripts", "workbench", "pack-cli.mjs");
const target = join(here, "..", "dist", "daemon");

if (!existsSync(packer)) {
  console.error(
    `bundle-daemon: ${packer} is missing — this package builds inside the CommandAGI monorepo (sdk/typescript), ` +
      "which packs its local host into dist/daemon/.",
  );
  process.exit(1);
}
const { packCli } = await import(pathToFileURL(packer).href);
try {
  const { out, version } = await packCli({ out: target });
  console.log(`bundle-daemon: the local host ${version} → ${out}`);
} catch (e) {
  console.error(`bundle-daemon: ${e?.message ?? e}`);
  process.exit(1);
}
