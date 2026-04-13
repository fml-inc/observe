import type { FunctionReference } from "convex/server";
import { login, canOpenBrowser } from "../auth/oauth.js";
import { deviceLogin } from "../auth/device-flow.js";
import { getValidToken, setSelectedOrg } from "../auth/token-store.js";
import { createApiClient } from "../convex-client.js";
import { resolveGitHubToken } from "../sync/client.js";
import { CONVEX_URL, getActiveEnv } from "../config.js";
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

    if (!CONVEX_URL) {
      console.warn(
        "[fml] No Convex URL configured — skipping identity link (run fml install first)",
      );
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

    console.log("You're all set! Restart Claude Code to use FML tools.");
    process.exit(0);
  } catch (err: unknown) {
    Sentry.captureException(err);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Login failed: ${msg}`);
    process.exit(1);
  }
}
