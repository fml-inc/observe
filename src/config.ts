import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FML_DATA_DIR } from "./dirs.js";

// ── Default production deployment ───────────────────────────────────────────

export const DEFAULT_PROD_URL =
  "https://trustworthy-chihuahua-382.convex.cloud";

/** Default sync target name created by `fml install` */
export const DEFAULT_TARGET_NAME = "fml";

// ── Persistent env selection ────────────────────────────────────────────────

interface EnvConfig {
  /** Name of the active sync target */
  active: string;
}

const ENV_CONFIG_PATH = path.join(FML_DATA_DIR, "env.json");

function readEnvConfig(): EnvConfig {
  try {
    const raw = fs.readFileSync(ENV_CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as EnvConfig;
  } catch {
    return { active: DEFAULT_TARGET_NAME };
  }
}

export function writeEnvConfig(config: EnvConfig): void {
  const dir = path.dirname(ENV_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(ENV_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

/**
 * Resolve the active environment by looking up the sync target.
 * Derives the .convex.cloud URL from the target's .convex.site URL.
 * Returns null convexUrl if the target is not found (panopticon not installed).
 */
export function getActiveEnv(): { name: string; convexUrl: string | null } {
  const config = readEnvConfig();
  const name = config.active;

  try {
    const panoDataDir =
      process.env.PANOPTICON_DATA_DIR ??
      (process.platform === "darwin"
        ? path.join(
            os.homedir(),
            "Library",
            "Application Support",
            "panopticon",
          )
        : process.platform === "win32"
          ? path.join(
              process.env.APPDATA ??
                path.join(os.homedir(), "AppData", "Roaming"),
              "panopticon",
            )
          : path.join(os.homedir(), ".local", "share", "panopticon"));
    const raw = fs.readFileSync(path.join(panoDataDir, "config.json"), "utf-8");
    const panoConf = JSON.parse(raw) as {
      sync?: { targets?: Array<{ name: string; url: string }> };
    };
    const target = panoConf.sync?.targets?.find((t) => t.name === name);
    if (target) {
      const convexUrl = target.url.replace(".convex.site", ".convex.cloud");
      return { name, convexUrl };
    }
  } catch {
    // Panopticon config not available
  }

  return { name, convexUrl: null };
}

/**
 * Require a resolved Convex URL. Exits with an error if the sync target
 * is not configured (panopticon not installed).
 */
export function requireConvexUrl(): string {
  const { name, convexUrl } = getActiveEnv();
  if (!convexUrl) {
    console.error(
      `Sync target "${name}" not found. Run \`fml install\` or \`fml sync setup\`.`,
    );
    process.exit(1);
  }
  return convexUrl;
}

// ── Exports ─────────────────────────────────────────────────────────────────

const env = getActiveEnv();

/**
 * Convex deployment URL (switches with `fml env`).
 *
 * Resolution order:
 *   1. `FML_CONVEX_URL` env var (dev/preview overrides)
 *   2. Active panopticon sync target
 *   3. `DEFAULT_PROD_URL` — lets a fresh `npm install -g` log in against
 *      prod before `fml install` has had a chance to seed a sync target.
 */
export const CONVEX_URL: string = (
  process.env.FML_CONVEX_URL ??
  env.convexUrl ??
  DEFAULT_PROD_URL
).replace(/\/$/, "");

/** WorkOS API base URL */
export const WORKOS_API_URL = "https://api.workos.com";

/** WorkOS authorization base URL */
export const WORKOS_AUTH_URL = "https://auth.fml.inc";

/** Path to auth token store (per-environment) */
export const AUTH_STORE_PATH = path.join(FML_DATA_DIR, `auth.${env.name}.json`);

/** Convex site URL (HTTP actions) — derived from CONVEX_URL */
export function getSiteUrl(): string {
  return CONVEX_URL.replace(".convex.cloud", ".convex.site").replace(
    /:\d+$/,
    "",
  );
}
