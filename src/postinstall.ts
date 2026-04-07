#!/usr/bin/env node
/**
 * Lightweight postinstall script — runs BEFORE any @fml-inc/panopticon imports.
 *
 * 1. Bootstrap panopticon globally if missing or outdated
 * 2. Spawn `fml install` (which can now resolve panopticon)
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function bootstrapPanopticon(): void {
  const npmEnv = { ...process.env };
  delete npmEnv.npm_config_registry; // Let scoped registry from .npmrc take effect

  // Check if panopticon is installed globally
  let globalVersion: string | null = null;
  try {
    const json = execFileSync(
      "npm",
      ["ls", "-g", "@fml-inc/panopticon", "--json", "--depth=0"],
      { encoding: "utf-8", timeout: 15_000, stdio: "pipe", env: npmEnv },
    );
    const parsed = JSON.parse(json);
    globalVersion =
      parsed?.dependencies?.["@fml-inc/panopticon"]?.version ?? null;
  } catch {
    // Not installed globally or npm ls failed
  }

  if (!globalVersion) {
    console.log("[postinstall] Installing @fml-inc/panopticon globally...");
    try {
      execFileSync("npm", ["install", "-g", "@fml-inc/panopticon@latest"], {
        encoding: "utf-8",
        timeout: 120_000,
        stdio: "pipe",
        env: npmEnv,
      });
      console.log("[postinstall] Installed @fml-inc/panopticon");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[postinstall] Failed to install panopticon: ${msg}`);
      console.error(
        "[postinstall] Install manually: npm install -g @fml-inc/panopticon@latest",
      );
      return;
    }
  } else {
    // Check if outdated (best effort)
    let isOutdated = false;
    try {
      execFileSync("npm", ["outdated", "-g", "@fml-inc/panopticon"], {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: "pipe",
        env: npmEnv,
      });
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e.status === 1) isOutdated = true;
    }

    if (isOutdated) {
      console.log("[postinstall] Updating @fml-inc/panopticon...");
      try {
        execFileSync("npm", ["install", "-g", "@fml-inc/panopticon@latest"], {
          encoding: "utf-8",
          timeout: 120_000,
          stdio: "pipe",
          env: npmEnv,
        });
        console.log("[postinstall] Updated @fml-inc/panopticon");
      } catch {
        // Not fatal — continue with current version
      }
    } else {
      console.log(
        `[postinstall] @fml-inc/panopticon@${globalVersion} (up to date)`,
      );
    }
  }
}

// Step 1: Bootstrap panopticon
bootstrapPanopticon();

// Step 2: Run fml install (panopticon is now resolvable)
const fmlBin = join(__dirname, "..", "bin", "fml");
try {
  execFileSync("node", [fmlBin, "install"], {
    stdio: "inherit",
    timeout: 120_000,
  });
} catch {
  // fml install failed — not fatal for postinstall
}
