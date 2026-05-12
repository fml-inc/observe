#!/usr/bin/env node
/**
 * Opt-in postinstall entrypoint. By default this intentionally does nothing:
 * npm lifecycle scripts should not mutate user config, start daemons, install
 * additional global packages, or prompt unless the user explicitly opts in.
 *
 * Run `fml install` after installation to configure the CLI, or set
 * FML_ENABLE_POSTINSTALL=1 if you intentionally want npm postinstall setup.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.FML_ENABLE_POSTINSTALL !== "1") {
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmlBin = join(__dirname, "..", "bin", "fml");

try {
  execFileSync(process.execPath, [fmlBin, "install"], {
    stdio: "inherit",
    timeout: 120_000,
  });
} catch {
  // fml install failed — not fatal for postinstall
}
