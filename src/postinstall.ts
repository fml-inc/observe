#!/usr/bin/env node
/**
 * Lightweight postinstall — runs `fml install` to set up fml-specific
 * config (directories, marketplace, plugin cache, sync target).
 *
 * Panopticon setup is handled by @fml-inc/panopticon's own postinstall
 * which npm runs automatically as a dependency.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fmlBin = join(__dirname, "..", "bin", "fml");

try {
  execFileSync("node", [fmlBin, "install"], {
    stdio: "inherit",
    timeout: 120_000,
  });
} catch {
  // fml install failed — not fatal for postinstall
}
