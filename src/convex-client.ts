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

export function createApiClient(token: string) {
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
        if (isServiceToken) {
          // Service token path: POST to HTTP endpoint (Convex can't validate non-JWT tokens)
          // Thread user identity from sandbox agent if available
          const userExternalId = process.env.FML_USER_EXTERNAL_ID;
          const res = await fetch(`${getSiteUrl()}/api/tools/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              toolName,
              args,
              ...(userExternalId && { userExternalId }),
            }),
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
          return data;
        }

        // JWT path: standard Convex action
        const client = await getClient();
        const actionArgs: Record<string, unknown> = { toolName, args };
        // Explicit org > stored org selection > repo-based inference
        const org = opts?.org ?? getSelectedOrg();
        if (org) actionArgs.org = org;
        const repo = resolveRepoFromCwd(process.cwd());
        if (repo) actionArgs.repo = repo.repo;

        const result = await client.action(
          ref<"action">("user/tool_gateway:executeTool"),
          actionArgs,
        );
        return { ok: true, result };
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
  return createApiClient(token);
}
