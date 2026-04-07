import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verify that better-sqlite3's native addon matches the running Node version.
 * If mismatched (e.g. user upgraded Node), attempt an automatic rebuild.
 * Call this before any code that imports better-sqlite3.
 */
export function ensureNativeModules(): void {
  const require = createRequire(import.meta.url);
  try {
    require("better-sqlite3");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("NODE_MODULE_VERSION")) {
      throw err;
    }

    console.error(
      "[fml] better-sqlite3 was compiled for a different Node.js version, rebuilding...",
    );

    const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

    // Remove stale build directory to avoid EEXIST errors from node-gyp
    const sqlitePath = dirname(require.resolve("better-sqlite3/package.json"));
    rmSync(join(sqlitePath, "build"), { recursive: true, force: true });

    try {
      execSync("npm rebuild better-sqlite3", {
        cwd: pkgRoot,
        stdio: "inherit",
        timeout: 60_000,
      });
      console.error("[fml] Rebuild complete.");
    } catch {
      console.error(
        "[fml] Automatic rebuild failed. Please run manually:\n" +
          `  cd ${pkgRoot} && rm -rf node_modules/better-sqlite3/build && npm rebuild better-sqlite3`,
      );
      process.exit(1);
    }
  }
}
