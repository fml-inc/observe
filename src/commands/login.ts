import type { FunctionReference } from "convex/server";
import {
  addTarget,
  loadSyncConfig,
  saveSyncConfig,
} from "@fml-inc/panopticon/sync";
import { login, canOpenBrowser } from "../auth/oauth.js";
import { deviceLogin } from "../auth/device-flow.js";
import { getValidToken, setSelectedOrg } from "../auth/token-store.js";
import { createApiClient } from "../convex-client.js";
import { resolveGitHubToken } from "../sync/client.js";
import {
  CONVEX_URL,
  DEFAULT_SYNC_URL,
  getActiveEnv,
  isValidEnvName,
} from "../config.js";
import { Sentry } from "../sentry.js";

/**
 * After login, link the user's GitHub identity to their FML account
 * so that sync data (authenticated via GitHub token) can be attributed.
 */
async function linkGitHubIdentity(): Promise<void> {
  const token = resolveGitHubToken();
  if (!token) {
    console.warn("[fml] No GitHub token available — skipping identity link");
    return;
  }

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) {
      console.warn(
        `[fml] GitHub API returned ${response.status} — skipping identity link`,
      );
      return;
    }

    const user = (await response.json()) as {
      login: string;
      id: number;
      email: string | null;
    };

    const fmlToken = await getValidToken();
    if (!fmlToken) {
      console.warn("[fml] No FML token available — skipping identity link");
      return;
    }

    // Service tokens (device flow) can't call JWT-authenticated Convex mutations.
    // Identity is already attributed server-side via actAsExternalId on the token.
    if (fmlToken.startsWith("fml_st_")) {
      return;
    }

    const { ConvexHttpClient } = await import("convex/browser");
    const client = new ConvexHttpClient(CONVEX_URL);
    client.setAuth(fmlToken);

    const ref =
      "user/panopticon:linkGitHubIdentity" as unknown as FunctionReference<"mutation">;
    await client.mutation(ref, {
      githubUsername: user.login,
      githubId: user.id,
      githubEmail: user.email ?? undefined,
    });

    console.log(`Linked GitHub account: ${user.login}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[fml] Failed to link GitHub identity: ${msg}`);
  }
}

// Config snapshots are now synced automatically via panopticon sync —
// no manual upload needed after login.

/**
 * After a successful login, pin the active env's sync target to
 * `fml sync-token --env <activeEnv>` so panopticon always reads the auth
 * file for that env (even when the user later switches active envs).
 *
 * - Target missing entirely → add one pointing at prod with the pinned cmd.
 * - Target is URL-only or uses the legacy `fml sync-token` (no --env) →
 *   upgrade to the pinned form.
 * - Target has an unrelated tokenCommand (gh auth token, custom) or a
 *   static token → leave it alone; the user made an explicit choice.
 */
// Exported for unit testing; called from within handleLogin otherwise.
export function upgradeSyncTargetAfterLogin(): void {
  try {
    const { name: envName } = getActiveEnv();
    // envName is interpolated into tokenCommand, which panopticon shells out.
    // Guard against metacharacters in a corrupted env.json.
    if (!isValidEnvName(envName)) {
      console.warn(
        `[fml] Skipping sync-target upgrade: env name "${envName}" contains unsafe characters.`,
      );
      return;
    }
    const pinnedCmd = `fml sync-token --env ${envName}`;
    const config = loadSyncConfig();
    const existing = config.targets.find((t) => t.name === envName);
    if (!existing) {
      addTarget({
        name: envName,
        url: DEFAULT_SYNC_URL,
        tokenCommand: pinnedCmd,
      });
      console.log(`Sync target "${envName}" configured with ${pinnedCmd}.`);
      console.log("Restart panopticon to apply: fml stop && fml start");
      return;
    }
    if (existing.token) return;
    if (existing.tokenCommand === pinnedCmd) return;
    if (existing.tokenCommand && existing.tokenCommand !== "fml sync-token") {
      // Preserve explicit choices (e.g. `gh auth token`, custom commands).
      return;
    }
    existing.tokenCommand = pinnedCmd;
    saveSyncConfig(config);
    console.log(`Sync target "${envName}" now using ${pinnedCmd}.`);
    console.log("Restart panopticon to apply: fml stop && fml start");
  } catch (err: unknown) {
    // Non-fatal — login itself succeeded, worst case sync stays URL-only
    // and the user can run `fml sync setup` manually.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[fml] Could not update sync target: ${msg}`);
  }
}

/**
 * After login, select and persist the user's org.
 * Single-org users get auto-selected; multi-org users get the first org
 * (can be changed later via `fml org`).
 */
async function selectOrg(): Promise<void> {
  try {
    const token = await getValidToken();
    if (!token) return;

    const api = createApiClient(token);
    const orgs = await api.queryOrgs();
    if (orgs.length === 0) return;

    const org = orgs[0];
    const slug = org.slug ?? org.name;
    setSelectedOrg(slug);
    console.log(`Selected org: ${org.name} (${slug})`);
  } catch {
    // Non-fatal — org selection can happen later via `fml org`
  }
}

export async function handleLogin(opts?: { device?: boolean }): Promise<void> {
  const { name: envName } = getActiveEnv();

  // Skip OAuth if already authenticated — still run post-login tasks
  const existingToken = await getValidToken();
  if (existingToken) {
    const { readTokens } = await import("../auth/token-store.js");
    const stored = readTokens();
    console.log(
      `Already logged in as ${stored?.user.name} (${stored?.user.email}) on ${envName}.`,
    );

    await linkGitHubIdentity();
    await selectOrg();
    upgradeSyncTargetAfterLogin();

    console.log("You're all set! Restart Claude Code to use FML tools.");
    process.exit(0);
  }

  console.log(`Signing in to FML (${envName})...`);
  try {
    const useDeviceFlow = opts?.device || !(await canOpenBrowser());
    let result: { email: string; name: string };

    if (useDeviceFlow) {
      result = await deviceLogin();
    } else {
      result = await login();
    }

    console.log(`\nLogged in as ${result.name} (${result.email})`);

    await linkGitHubIdentity();
    await selectOrg();
    upgradeSyncTargetAfterLogin();

    console.log("You're all set! Restart Claude Code to use FML tools.");
    process.exit(0);
  } catch (err: unknown) {
    Sentry.captureException(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Login failed: ${msg}`);
    process.exit(1);
  }
}
