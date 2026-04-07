import fs from "node:fs";
import path from "node:path";
import { AUTH_STORE_PATH, CONVEX_URL, WORKOS_API_URL } from "../config.js";
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
}

function ensureDir(): void {
  const dir = path.dirname(AUTH_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function readTokens(): StoredAuth | null {
  try {
    const data = fs.readFileSync(AUTH_STORE_PATH, "utf-8");
    return JSON.parse(data) as StoredAuth;
  } catch {
    return null;
  }
}

export function writeTokens(auth: StoredAuth): void {
  ensureDir();
  fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(auth, null, 2), {
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

let serviceTokenCache: ServiceTokenCache | null = null;
let serviceRefreshPromise: Promise<string | null> | null = null;

/** File where the current access token is written for panopticon's tokenCommand */
const SERVICE_ACCESS_TOKEN_PATH = path.join(FML_DATA_DIR, "access_token");

function getSiteUrl(): string {
  const explicit = process.env.CONVEX_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return CONVEX_URL.replace(".convex.cloud", ".convex.site");
}

async function refreshServiceToken(
  refreshToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${getSiteUrl()}/api/tokens/refresh`, {
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

    serviceTokenCache = {
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
    };

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

// Mutex to prevent concurrent token refresh races
let refreshPromise: Promise<string | null> | null = null;

/**
 * Get a valid access token, refreshing if expired.
 *
 * Three paths:
 * 1. FML_TOKEN=fml_srt_* → exchange refresh token for short-lived access token
 * 2. FML_TOKEN=fml_st_*  → use directly (legacy/CI)
 * 3. No FML_TOKEN         → OAuth flow (interactive user)
 */
export async function getValidToken(): Promise<string | null> {
  const envToken = process.env.FML_TOKEN;

  // Service refresh token → exchange for short-lived access token
  if (envToken?.startsWith("fml_srt_")) {
    if (
      serviceTokenCache &&
      serviceTokenCache.expiresAt > Date.now() + 60_000
    ) {
      return serviceTokenCache.accessToken;
    }

    if (serviceRefreshPromise) return serviceRefreshPromise;
    serviceRefreshPromise = refreshServiceToken(envToken);
    try {
      return await serviceRefreshPromise;
    } finally {
      serviceRefreshPromise = null;
    }
  }

  // Static service token (legacy) or plain env override
  if (envToken) return envToken;

  // OAuth path (interactive user)
  const stored = readTokens();
  if (!stored) {
    console.error("[fml] Auth: no stored tokens");
    return null;
  }

  // If token expires in more than 60 seconds, use it
  if (stored.expiresAt > Date.now() + 60_000) {
    return stored.accessToken;
  }

  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = refreshToken(stored);
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function refreshToken(stored: StoredAuth): Promise<string | null> {
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

    writeTokens(refreshed);
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
