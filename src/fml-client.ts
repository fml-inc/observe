import type { FunctionReference } from "convex/server";
import { resolveRepoFromCwd } from "@fml-inc/panopticon/repo";
import { getSelectedOrg, getValidToken } from "./auth/token-store.js";
import { CONVEX_URL } from "./config.js";
import type {
  RepoConfigSnapshotDetail,
  RepoConfigSnapshotSummary,
  ResolvedRepo,
  UserConfigSnapshotDetail,
  UserConfigSnapshotSummary,
} from "./types.js";

// ── Shared plumbing ─────────────────────────────────────────────────────────

export type ToolCategory =
  | "messages"
  | "slack"
  | "skills"
  | "analysis"
  | "integrations"
  | "engineering"
  | "memory"
  | "automations"
  | "amplitude"
  | "posthog"
  | "meta-ads";

export interface PublicToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: ToolCategory;
  experimental?: boolean;
}

export interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface OrgInfo {
  _id: string;
  name: string;
  slug?: string;
  repos?: Array<{
    _id: string;
    fullName: string;
    owner: string;
    name: string;
    private: boolean;
  }>;
}

function ref<T extends "query" | "mutation" | "action">(
  path: string,
): FunctionReference<T> {
  return path as unknown as FunctionReference<T>;
}

// ── API client factory ──────────────────────────────────────────────────────

export function createFmlClient(token: string) {
  const isServiceToken = token.startsWith("fml_st_");

  let clientPromise: Promise<{
    query: <T>(
      ref: FunctionReference<"query">,
      args: Record<string, unknown>,
    ) => Promise<T>;
    mutation: <T>(
      ref: FunctionReference<"mutation">,
      args: Record<string, unknown>,
    ) => Promise<T>;
    action: <T>(
      ref: FunctionReference<"action">,
      args: Record<string, unknown>,
    ) => Promise<T>;
  }> | null = null;

  function getClient() {
    if (!clientPromise) {
      clientPromise = import("convex/browser").then(({ ConvexHttpClient }) => {
        const client = new ConvexHttpClient(CONVEX_URL);
        client.setAuth(token);
        return client;
      });
    }
    return clientPromise;
  }

  /**
   * Derive the Convex site URL (HTTP actions) from the cloud URL.
   * Convex uses paired domains: *.convex.cloud for client APIs,
   * *.convex.site for HTTP actions. This is a stable Convex convention.
   */
  function getSiteUrl(): string {
    return CONVEX_URL.replace(".convex.cloud", ".convex.site").replace(
      /\/$/,
      "",
    );
  }

  /** Authed fetch to a fml-be HTTP action, parsing the JSON envelope. */
  async function fetchContext(
    pathAndQuery: string,
    init: RequestInit,
  ): Promise<ToolResult> {
    try {
      const res = await fetch(`${getSiteUrl()}${pathAndQuery}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      if (!res.ok) {
        const err = (data as { error?: string }).error;
        return { ok: false, error: err ?? `HTTP ${res.status}` };
      }
      return { ok: true, result: data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    // ── Orgs ──────────────────────────────────────────────────────────────

    async queryOrgs(): Promise<OrgInfo[]> {
      if (isServiceToken) {
        // Service tokens can't call Convex actions directly — org is embedded in the token
        return [];
      }
      const client = await getClient();
      return await client.query(ref("user/plugin:getMyOrgsAndRepos"), {});
    },

    // ── Tool gateway ─────────────────────────────────────────────────────

    async callBackend(
      toolName: string,
      args: Record<string, unknown>,
      opts?: { org?: string },
    ): Promise<ToolResult> {
      try {
        // Unified CLI/MCP path: POST to the dual-auth HTTP endpoint for both
        // service tokens and WorkOS/JWT user tokens. This keeps command
        // handlers independent of token class and matches the backend's agent
        // tool contract.
        const body: Record<string, unknown> = { toolName, args };

        // Explicit org > stored org selection > repo-based inference.
        const org = opts?.org ?? getSelectedOrg();
        if (org) body.org = org;
        const repo = resolveRepoFromCwd(process.cwd());
        if (repo) body.repo = repo.repo;

        // Thread user identity for service-token-backed sandbox agents. For
        // JWT callers this is ignored by the backend; for service tokens the
        // backend validates membership before honoring the override.
        if (isServiceToken) {
          const { readTokens } = await import("./auth/token-store.js");
          const userExternalId =
            process.env.FML_USER_EXTERNAL_ID ?? readTokens()?.user.id;
          if (userExternalId) body.userExternalId = userExternalId;
        }

        const res = await fetch(`${getSiteUrl()}/api/tools/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        let data: ToolResult;
        try {
          data = JSON.parse(text) as ToolResult;
        } catch {
          return {
            ok: false,
            error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
          };
        }
        if (!res.ok && !data.error) {
          return { ok: false, error: `HTTP ${res.status}` };
        }
        // The HTTP tool endpoint reports auth failures in its JSON envelope.
        // The catch block below keeps the same user-friendly message for
        // thrown auth-shaped errors (network/client/future helper failures).
        if (
          !data.ok &&
          data.error &&
          (data.error.includes("Unauthorized") ||
            data.error.includes("not authenticated"))
        ) {
          return {
            ok: false,
            error:
              "Authentication expired. Run `fml login` to sign in again, then restart Claude Code.",
          };
        }
        return data;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unauthorized") || msg.includes("not authenticated")) {
          return {
            ok: false,
            error:
              "Authentication expired. Run `fml login` to sign in again, then restart Claude Code.",
          };
        }
        return { ok: false, error: msg };
      }
    },

    // ── Tool catalog ─────────────────────────────────────────────────────

    async listTools(pluginVersion?: string): Promise<PublicToolDescriptor[]> {
      try {
        // Always use the HTTP catalog endpoint — it accepts both a service
        // token and a user WorkOS JWT. A raw client.query rejects the user
        // JWT (no `aud` claim, which Convex's client-protocol auth requires),
        // so the httpAction path is the only one that works for both.
        const url = new URL(`${getSiteUrl()}/api/tools/list`);
        if (pluginVersion) url.searchParams.set("pluginVersion", pluginVersion);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let data: {
          ok: boolean;
          descriptors?: PublicToolDescriptor[];
          error?: string;
        };
        try {
          data = JSON.parse(text) as typeof data;
        } catch {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        if (!data.ok || !data.descriptors) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        return data.descriptors;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Unauthorized") || msg.includes("not authenticated")) {
          throw new Error(
            "Authentication expired. Run `fml login` to sign in again, then restart Claude Code.",
          );
        }
        throw err;
      }
    },

    // ── Anamnesis ground-truth context ───────────────────────────────────

    /**
     * Call a read-only anamnesis context endpoint
     * (/v1/anamnesis/context/{path,commit,pr}). Sends the current token
     * (service token or user JWT) — the endpoint accepts either.
     */
    async anamnesisContext(
      kind: "path" | "commit" | "pr",
      params: Record<string, string | number | undefined>,
    ): Promise<ToolResult> {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v != null) qs.set(k, String(v));
      }
      return fetchContext(`/v1/anamnesis/context/${kind}?${qs.toString()}`, {
        method: "GET",
      });
    },

    /** POST /v1/anamnesis/context/query — generic predicate query. */
    async anamnesisQuery(body: Record<string, unknown>): Promise<ToolResult> {
      return fetchContext("/v1/anamnesis/context/query", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    // ── Repo resolution ──────────────────────────────────────────────────

    async resolveRepo(
      orgSlug: string,
      repoFullName: string,
    ): Promise<ResolvedRepo | null> {
      const client = await getClient();
      return await client.query(ref("user/cli:resolveRepo"), {
        orgSlug,
        repoFullName,
      });
    },

    // ── Config snapshots ─────────────────────────────────────────────────

    async listUserConfigSnapshots(
      orgSlug: string,
    ): Promise<UserConfigSnapshotSummary[]> {
      const client = await getClient();
      const result = await client.query<UserConfigSnapshotSummary[] | null>(
        ref("user/config_snapshots:listUserSnapshots"),
        { orgSlug },
      );
      return result ?? [];
    },

    async getUserConfigDetail(
      orgSlug: string,
      githubUsername: string,
    ): Promise<UserConfigSnapshotDetail | null> {
      const client = await getClient();
      return await client.query(ref("user/config_snapshots:getUserDetail"), {
        orgSlug,
        githubUsername,
      });
    },

    async listRepoConfigSnapshots(
      orgSlug: string,
      repository?: string,
    ): Promise<RepoConfigSnapshotSummary[]> {
      const client = await getClient();
      const result = await client.query<RepoConfigSnapshotSummary[] | null>(
        ref("user/config_snapshots:listRepoSnapshots"),
        { orgSlug, repository },
      );
      return result ?? [];
    },

    async getRepoConfigDetail(
      orgSlug: string,
      repository: string,
    ): Promise<RepoConfigSnapshotDetail | null> {
      const client = await getClient();
      return await client.query(ref("user/config_snapshots:getRepoDetail"), {
        orgSlug,
        repository,
      });
    },
  };
}

// ── Convenience: auto-authenticated client ──────────────────────────────────

/**
 * Create an API client using the stored auth token.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedClient() {
  const token = await getValidToken();
  if (!token) return null;
  return createFmlClient(token);
}
