import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addTarget, listTargets } from "@fml-inc/panopticon/sync";
import { printBanner } from "../banner.js";
import {
  DEFAULT_SYNC_URL,
  DEFAULT_TARGET_NAME,
  writeEnvConfig,
} from "../config.js";
import { panopticonExec } from "../daemon-utils.js";
import { FML_DATA_DIR, FML_LOG_DIR } from "../dirs.js";
import { resolveSyncTokenCommand } from "../sync/client.js";

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

  // 1. Ensure panopticon is installed globally and up to date
  console.log("[1/5] Setting up panopticon...");
  const { resolvePanopticonBin } = await import("../daemon-utils.js");
  let freshInstall = false;
  const bin = resolvePanopticonBin();
  let needsInstall = !bin;
  if (bin) {
    // Check version — upgrade if below the minimum required by this build
    const MIN_PANOPTICON = "0.2.2";
    const vResult = panopticonExec("--version", { timeout: 5_000 });
    const installed = vResult.ok ? vResult.stdout.trim().split("+")[0] : "0.0.0";
    if (installed < MIN_PANOPTICON) {
      console.log(`      Found panopticon ${installed}, need >=${MIN_PANOPTICON}`);
      needsInstall = true;
    }
  }
  if (needsInstall) {
    console.log(
      bin
        ? "      Upgrading @fml-inc/panopticon..."
        : "      Installing @fml-inc/panopticon globally...",
    );
    try {
      execFileSync("npm", ["install", "-g", "@fml-inc/panopticon@latest"], {
        encoding: "utf-8",
        timeout: 120_000,
        stdio: "pipe",
      });
      freshInstall = true;
      console.log("      Installed @fml-inc/panopticon");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`      Failed to install panopticon: ${msg}`);
      console.error("      Install manually: npm install -g @fml-inc/panopticon@latest");
    }
  }
  // npm postinstall already ran panopticon install for fresh installs;
  // only re-run for existing installs to pick up config changes.
  if (!freshInstall) {
    const result = panopticonExec("install", { timeout: 60_000 });
    if (result.ok) {
      for (const line of result.stdout.trim().split("\n")) {
        console.log(`      ${line}`);
      }
    } else {
      console.error("      panopticon install failed:");
      for (const line of result.stdout.trim().split("\n")) {
        console.error(`      ${line}`);
      }
    }
  }
  console.log();

  // 2. Ensure fml-specific directories exist
  console.log("[2/5] Creating fml directories...");
  for (const dir of [FML_DATA_DIR, FML_LOG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`      ${FML_DATA_DIR}`);
  console.log(`      ${FML_LOG_DIR}\n`);

  // 3. Ensure plugin manifest has the current version
  console.log("[3/5] Writing plugin manifest...");
  const pkgJson = readJsonFile(path.join(pluginRoot, "package.json"));
  const version = (pkgJson?.version as string) ?? "0.0.0-dev";
  const pluginManifestDir = path.join(pluginRoot, ".claude-plugin");
  fs.mkdirSync(pluginManifestDir, { recursive: true });
  writeJsonFile(path.join(pluginManifestDir, "plugin.json"), {
    name: "fml",
    version,
    description: "FML agent tools for Claude Code",
    mcpServers: {
      fml: {
        command: "node",
        args: ["${CLAUDE_PLUGIN_ROOT}/bin/mcp-server"],
      },
    },
  });
  console.log(`      Version: ${version}\n`);

  // 4. Register fml plugin in local marketplace + Claude Code settings
  console.log("[4/5] Setting up fml plugin...");
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
  console.log(`      Claude settings: ${CLAUDE_SETTINGS_PATH}`);

  // Register plugin with Claude Code (install if new, update if existing)
  try {
    try {
      execFileSync("claude", ["plugin", "install", "fml@local-plugins"], {
        stdio: "pipe",
        timeout: 15_000,
      });
    } catch {
      execFileSync("claude", ["plugin", "update", "fml@local-plugins"], {
        stdio: "pipe",
        timeout: 15_000,
      });
    }
    console.log("      Plugin registered via Claude Code CLI");
  } catch {
    console.log("      warn: claude CLI not found, run 'claude plugin install fml@local-plugins' manually");
  }
  console.log();

  // 5. Auto-configure sync target (best-effort)
  console.log("[5/5] Configuring sync target...");
  const existingTargets = listTargets();
  const existingProd = existingTargets.find((t) => t.url === DEFAULT_SYNC_URL);
  if (existingProd) {
    console.log(`      Production target already configured`);
  } else {
    const tokenCommand = resolveSyncTokenCommand();
    addTarget({
      name: DEFAULT_TARGET_NAME,
      url: DEFAULT_SYNC_URL,
      tokenCommand,
    });
    console.log(`      Target "${DEFAULT_TARGET_NAME}": ${DEFAULT_SYNC_URL}`);
    if (tokenCommand) {
      console.log(`      Auth: ${tokenCommand}`);
    } else {
      // No gh and no fml login yet — target is URL-only. `fml login` will
      // back-patch it to `fml sync-token` once the user signs in.
      console.log(
        "      Auth: not configured — run `fml login` to enable sync.",
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
