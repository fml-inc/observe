import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { panopticonExec } from "../daemon-utils.js";
import { FML_DATA_DIR, FML_LOG_DIR } from "../dirs.js";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const MARKETPLACE_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "claude-plugins",
);

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function handleUninstall(opts: {
  purge?: boolean;
  target?: string;
}): void {
  const targetSpecific = opts.target && opts.target !== "all";

  console.log("Uninstalling fml...\n");

  // 1. Remove fml plugin from Claude Code settings
  if (targetSpecific) {
    console.log("[1/4] Skipping plugin settings (target-specific uninstall)");
  } else {
    console.log("[1/4] Removing plugin from Claude Code settings...");
    const settings = readJsonFile(CLAUDE_SETTINGS_PATH) as Record<
      string,
      Record<string, unknown>
    > | null;
    if (settings) {
      if (settings.enabledPlugins) {
        delete settings.enabledPlugins["fml@local-plugins"];
      }
      if (settings.extraKnownMarketplaces) {
        delete settings.extraKnownMarketplaces["local-plugins"];
      }
      writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
      console.log(`      Updated ${CLAUDE_SETTINGS_PATH}`);
    } else {
      console.log("      No settings file found, skipping");
    }
  }

  // 2. Remove marketplace symlink and manifest entry
  if (targetSpecific) {
    console.log("[2/4] Skipping marketplace (target-specific uninstall)");
  } else {
    console.log("[2/4] Removing marketplace registration...");
    const marketplaceLink = path.join(MARKETPLACE_DIR, "fml");
    try {
      fs.rmSync(marketplaceLink, { recursive: true, force: true });
      console.log(`      Removed ${marketplaceLink}`);
    } catch {
      console.log("      No marketplace link found, skipping");
    }

    const manifestPath = path.join(
      MARKETPLACE_DIR,
      ".claude-plugin",
      "marketplace.json",
    );
    const manifest = readJsonFile(manifestPath);
    if (manifest && Array.isArray(manifest.plugins)) {
      manifest.plugins = (
        manifest.plugins as Array<Record<string, unknown>>
      ).filter((p) => p.name !== "fml");
      writeJsonFile(manifestPath, manifest);
      console.log(`      Updated ${manifestPath}`);
    }
  }

  // 3. Run panopticon uninstall
  console.log("[3/4] Running panopticon uninstall...");
  const panoArgs = ["uninstall"];
  if (opts.target) panoArgs.push("--target", opts.target);
  if (opts.purge) panoArgs.push("--purge");
  const result = panopticonExec(...panoArgs, { timeout: 30_000 });
  if (result.ok) {
    for (const line of result.stdout.trim().split("\n")) {
      console.log(`      ${line}`);
    }
  } else {
    console.error("      panopticon uninstall failed:");
    for (const line of result.stdout.trim().split("\n")) {
      console.error(`      ${line}`);
    }
  }

  // 4. Remove fml data and logs (only with --purge, never for target-specific)
  if (targetSpecific) {
    console.log("[4/4] Skipping data removal (target-specific uninstall)");
  } else if (opts.purge) {
    console.log("[4/4] Removing fml data and logs...");
    for (const dir of [FML_DATA_DIR, FML_LOG_DIR]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log(`      Removed ${dir}`);
      } catch {
        console.log(`      Could not remove ${dir}`);
      }
    }
  } else {
    console.log("[4/4] Keeping fml data (use --purge to remove)");
  }

  console.log("\nDone! FML has been uninstalled.");
}
