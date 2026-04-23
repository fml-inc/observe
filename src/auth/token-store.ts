import fs from "node:fs";
import path from "node:path";
import {
  CONVEX_URL,
  WORKOS_API_URL,
  authStorePath,
  authStorePathFor,
  resolveEnvConvexUrl,
} from "../config.js";
import { FML_DATA_DIR } from "../dirs.js";
import { Sentry } from "../sentry.js";

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in ms
  user: {
    id: string;
    email: string;
    name: string;
  };
  orgSlug?: string;
  /** WorkOS client ID used to obtain these tokens (needed for refresh) */
  workosClientId?: string;
  /** Token type: "oauth" (default) for WorkOS JWT, "service" for device flow tokens */
  tokenType?: "oauth" | "service";
}

function storePathFor(envName?: string): string {
  return envName ? authStorePathFor(envName) : authStorePath();
}

function ensureDir(envName?: string): void {
  const dir = path.dirname(storePathFor(envName));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function readTokens(envName?: string): StoredAuth | null {
  try {
    const data = fs.readFileSync(storePathFor(envName), "utf-8");
    return JSON.parse(data) as StoredAuth;
  } catch {
    return null;
  }
}

export function writeTokens(auth: StoredAuth, envName?: string): void {
  ensureDir(envName);
  fs.writeFileSync(storePathFor(envName), JSON.stringify(auth, null, 2), {
    mode: 0o600,
  });
}

export function getSelectedOrg(): string | null {
  return readTokens()?.orgSlug ?? null;
}

export function setSelectedOrg(orgSlug: string): void {
  const stored = readTokens();
  if (!stored) return;
  writeTokens({ ...stored, orgSlug });
}

// ── Service Token Refresh (sandbox fml_srt_* → fml_st_*) ────────────────────

interface ServiceTokenCache {
  accessToken: string;
  expiresAt: number;
}

/**
 * Caches and refresh-deduplication promises are keyed by env so in-process
 * callers that read multiple envs (`getValidToken({ env: "a" })` followed by
 * `getValidToken({ env: "b" })`) don't cross-contaminate. The sentinel
 * "__active__" stands in for calls with no explicit env.
 */
const ACTIVE_KEY = "__active__";
const serviceTokenCaches = new Map<string, ServiceTokenCache>();
const serviceRefreshPromises = new Map<string, Promise<string | null>>();
const oauthRefreshPromises = new Map<string, Promise<string | null>>();
const cacheKey = (envName?: string): string => envName ?? ACTIVE_KEY;

/** File where the current access token is written for panopticon's tokenCommand */
const SERVICE_ACCESS_TOKEN_PATH = path.join(FML_DATA_DIR, "access_token");

function getSiteUrl(envName?: string): string {
  const explicit = process.env.CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (envName) {
    const envConvexUrl = resolveEnvConvexUrl(envName);
    if (envConvexUrl) {
      return envConvexUrl.replace(".convex.cloud", ".convex.site");
    }
  }
  return CONVEX_URL.replace(".convex.cloud", ".convex.site");
}

async function refreshServiceToken(
  refreshToken: string,
  envName?: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${getSiteUrl(envName)}/api/tokens/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshToken}`,
      },
    });

    if (!response.ok) {
      console.error(
        `[fml] Service token refresh failed: HTTP ${response.status}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      ok: boolean;
      accessToken: string;
      expiresAt: number;
      error?: string;
    };

    if (!data.ok || !data.accessToken) {
      console.error(`[fml] Service token refresh error: ${data.error}`);
      return null;
    }

    serviceTokenCaches.set(cacheKey(envName), {
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
    });

    // Write to file for panopticon's tokenCommand
    try {
      const dir = path.dirname(SERVICE_ACCESS_TOKEN_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(SERVICE_ACCESS_TOKEN_PATH, data.accessToken, {
        mode: 0o600,
      });
    } catch {
      // Non-fatal — in-memory cache still works for the plugin itself
    }

    return data.accessToken;
  } catch (err: unknown) {
    Sentry.captureException(err);
    console.error(`[fml] Service token refresh error: ${err}`);
    return null;
  }
}

// ── Token Resolution ────────────────────────────────────────────────────────

/**
 * Get a valid access token, refreshing if expired.
 *
 * Three paths:
 * 1. FML_TOKEN=fml_srt_* → exchange refresh token for short-lived access token
 * 2. FML_TOKEN=fml_st_*  → use directly (legacy/CI)
 * 3. No FML_TOKEN         → OAuth flow (interactive user)
 */
export async function getValidToken(opts?: {
  env?: string;
}): Promise<string | null> {
  const envName = opts?.env;
  const key = cacheKey(envName);
  const envToken = process.env.FML_TOKEN;

  // Service refresh token → exchange for short-lived access token
  if (envToken?.startsWith("fml_srt_")) {
    const cached = serviceTokenCaches.get(key);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    const inflight = serviceRefreshPromises.get(key);
    if (inflight) return inflight;
    const promise = refreshServiceToken(envToken, envName);
    serviceRefreshPromises.set(key, promise);
    try {
      return await promise;
    } finally {
      serviceRefreshPromises.delete(key);
    }
  }

  // Static service token (legacy) or plain env override
  if (envToken) return envToken;

  // Stored token path (OAuth or device flow)
  const stored = readTokens(envName);
  if (!stored) {
    console.error(
      envName
        ? `[fml] Auth: no stored tokens for env "${envName}"`
        : "[fml] Auth: no stored tokens",
    );
    return null;
  }

  // If token expires in more than 60 seconds, use it
  if (stored.expiresAt > Date.now() + 60_000) {
    return stored.accessToken;
  }

  // Device flow tokens: refresh via /api/tokens/refresh (same as sandbox tokens)
  if (stored.tokenType === "service") {
    const inflight = serviceRefreshPromises.get(key);
    if (inflight) return inflight;
    const promise = (async () => {
      const newAccessToken = await refreshServiceToken(
        stored.refreshToken,
        envName,
      );
      const cached = serviceTokenCaches.get(key);
      if (newAccessToken && cached) {
        writeTokens(
          {
            ...stored,
            accessToken: newAccessToken,
            expiresAt: cached.expiresAt,
          },
          envName,
        );
      }
      return newAccessToken;
    })();
    serviceRefreshPromises.set(key, promise);
    try {
      return await promise;
    } finally {
      serviceRefreshPromises.delete(key);
    }
  }

  // OAuth tokens: refresh via WorkOS
  const inflight = oauthRefreshPromises.get(key);
  if (inflight) return inflight;
  const promise = refreshToken(stored, envName);
  oauthRefreshPromises.set(key, promise);
  try {
    return await promise;
  } finally {
    oauthRefreshPromises.delete(key);
  }
}

async function refreshToken(
  stored: StoredAuth,
  envName?: string,
): Promise<string | null> {
  if (!stored.workosClientId) {
    console.error(
      "[fml] Auth: token expired, missing workosClientId — run `fml login`",
    );
    return null;
  }

  try {
    const response = await fetch(
      `${WORKOS_API_URL}/user_management/authenticate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: stored.workosClientId,
          refresh_token: stored.refreshToken,
        }),
      },
    );

    if (!response.ok) {
      console.error(
        `[fml] Auth: refresh failed (HTTP ${response.status}) — token preserved`,
      );
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: {
        id: string;
        email: string;
        first_name?: string;
        last_name?: string;
      };
    };

    const userName = [data.user.first_name, data.user.last_name]
      .filter(Boolean)
      .join(" ");

    const refreshed: StoredAuth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 300) * 1000,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: userName || stored.user.name,
      },
      orgSlug: stored.orgSlug,
      workosClientId: stored.workosClientId,
    };

    writeTokens(refreshed, envName);
    return refreshed.accessToken;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[fml] Auth: refresh failed (network error: ${msg}) — token preserved`,
    );
    Sentry.captureException(err);
    return null;
  }
}
