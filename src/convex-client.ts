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
        if (isServiceToken) {
          // Service token path: POST to HTTP endpoint (Convex can't validate non-JWT tokens)
          // Thread user identity: sandbox agents set FML_USER_EXTERNAL_ID;
          // device-flow logins fall back to the id stashed on the stored token
          // so tools can execute with the real user context even though the
          // token's actAsExternalId is the namespaced system:cli:* string.
          const { readTokens } = await import("./auth/token-store.js");
          const userExternalId =
            process.env.FML_USER_EXTERNAL_ID ?? readTokens()?.user.id;
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

    // ── Tool catalog ─────────────────────────────────────────────────────

    async listTools(pluginVersion?: string): Promise<PublicToolDescriptor[]> {
      try {
        if (isServiceToken) {
          const url = new URL(`${getSiteUrl()}/api/tools/list`);
          if (pluginVersion) url.searchParams.set("pluginVersion", pluginVersion);
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const text = await res.text();
          let data: { ok: boolean; descriptors?: PublicToolDescriptor[]; error?: string };
          try {
            data = JSON.parse(text) as typeof data;
          } catch {
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
          }
          if (!data.ok || !data.descriptors) {
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          return data.descriptors;
        }

        const client = await getClient();
        return await client.query<PublicToolDescriptor[]>(
          ref<"query">("user/plugin_tools:listTools"),
          pluginVersion ? { pluginVersion } : {},
        );
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
     * (/v1/anamnesis/context/{path,commit,pr}). Requires a service token —
     * the endpoint only accepts `fml_st_` bearers.
     */
    async anamnesisContext(
      kind: "path" | "commit" | "pr",
      params: Record<string, string | number | undefined>,
    ): Promise<ToolResult> {
      if (!isServiceToken) {
        return {
          ok: false,
          error:
            "Anamnesis context requires a service token. Run `fml login` on a machine/CI with a service token (fml_st_…).",
        };
      }
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
      if (!isServiceToken) {
        return {
          ok: false,
          error:
            "Anamnesis context requires a service token. Run `fml login` on a machine/CI with a service token (fml_st_…).",
        };
      }
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
  return createApiClient(token);
}
