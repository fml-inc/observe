import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addTarget, listTargets } from "@fml-inc/panopticon/sync";
import { printBanner } from "../banner.js";
import {
  DEFAULT_PROD_URL,
  DEFAULT_TARGET_NAME,
  writeEnvConfig,
} from "../config.js";
import { panopticonExec } from "../daemon-utils.js";
import { FML_DATA_DIR, FML_LOG_DIR } from "../dirs.js";
import { resolveGitHubToken } from "../sync/client.js";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const MARKETPLACE_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "claude-plugins",
);

function getPluginRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  // At runtime we're in dist/ (tsup bundles into entry point), go up one level
  dir = path.resolve(dir, "..");
  return dir;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function handleInstall(): Promise<void> {
  const pluginRoot = getPluginRoot();
  console.log("Installing fml...\n");

  // 1. Run panopticon install (DB, pricing, hooks, marketplace, skills, server)
  console.log("[1/4] Running panopticon install...");
  const result = panopticonExec("install", { timeout: 60_000 });
  if (result.ok) {
    // Indent panopticon output for readability
    for (const line of result.stdout.trim().split("\n")) {
      console.log(`      ${line}`);
    }
  } else {
    console.error("      panopticon install failed:");
    for (const line of result.stdout.trim().split("\n")) {
      console.error(`      ${line}`);
    }
  }
  console.log();

  // 2. Ensure fml-specific directories exist
  console.log("[2/4] Creating fml directories...");
  for (const dir of [FML_DATA_DIR, FML_LOG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`      ${FML_DATA_DIR}`);
  console.log(`      ${FML_LOG_DIR}\n`);

  // 3. Register fml plugin in local marketplace + Claude Code settings
  console.log("[3/4] Setting up fml plugin...");
  fs.mkdirSync(path.join(MARKETPLACE_DIR, ".claude-plugin"), {
    recursive: true,
  });

  const manifestPath = path.join(
    MARKETPLACE_DIR,
    ".claude-plugin",
    "marketplace.json",
  );
  const manifest = readJsonFile(manifestPath) ?? {
    name: "local-plugins",
    owner: { name: os.userInfo().username },
    plugins: [],
  };

  const plugins = (manifest.plugins as Array<Record<string, unknown>>) ?? [];
  if (!plugins.some((p) => p.name === "fml")) {
    plugins.push({
      name: "fml",
      source: "./fml",
      description: "FML agent tools for Claude Code",
    });
    manifest.plugins = plugins;
  }
  writeJsonFile(manifestPath, manifest);

  // Symlink plugin source into marketplace
  const marketplaceLink = path.join(MARKETPLACE_DIR, "fml");
  try {
    fs.unlinkSync(marketplaceLink);
  } catch {}
  fs.rmSync(marketplaceLink, { recursive: true, force: true });
  fs.symlinkSync(pluginRoot, marketplaceLink, "dir");
  console.log(`      Marketplace: ${MARKETPLACE_DIR}`);
  console.log(`      Plugin: ${pluginRoot}`);

  // Layer fml-specific settings on top for Claude Code
  const settings = (readJsonFile(CLAUDE_SETTINGS_PATH) ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces ?? {};
  settings.extraKnownMarketplaces["local-plugins"] = {
    source: { source: "directory", path: MARKETPLACE_DIR },
  };
  settings.enabledPlugins = settings.enabledPlugins ?? {};
  settings.enabledPlugins["fml@local-plugins"] = true;
  writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
  console.log(`      Claude settings: ${CLAUDE_SETTINGS_PATH}\n`);

  // 4. Auto-configure sync target (best-effort)
  console.log("[4/4] Configuring sync target...");
  const prodSyncUrl = DEFAULT_PROD_URL.replace(".cloud", ".site");
  const existingTargets = listTargets();
  const existingProd = existingTargets.find((t) => t.url === prodSyncUrl);
  if (existingProd) {
    console.log(`      Production target already configured`);
  } else {
    const ghToken = resolveGitHubToken();
    if (ghToken) {
      addTarget({
        name: DEFAULT_TARGET_NAME,
        url: prodSyncUrl,
        tokenCommand: "gh auth token",
      });
      console.log(`      Target "${DEFAULT_TARGET_NAME}": ${prodSyncUrl}`);
      console.log("      Auth: gh auth token");
    } else {
      console.log(
        "      Skipped (no GitHub token). Run `fml sync setup` later.",
      );
    }
  }

  // Set active env to the default sync target
  writeEnvConfig({ active: DEFAULT_TARGET_NAME });

  console.log("");
  printBanner();
  console.log("Done! Start a new coding session to activate.\n");
  console.log("\nNext steps:");
  console.log("  fml login          Sign in to your FML account");
  console.log("  fml org            Select organization");
  console.log("  fml sync status    Check sync status");
  console.log("  fml status         Verify setup");
}
