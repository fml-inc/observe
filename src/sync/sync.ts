/**
 * Sync — thin wrapper around panopticon's createSyncLoop.
 * Resolves GitHub token for auth and maps fml sync config to panopticon's format.
 */

import {
  createSyncLoop,
  loadSyncConfig,
  type SyncHandle,
} from "@fml-inc/panopticon/sync";
import { resolveGitHubToken } from "./client.js";

let handle: SyncHandle | null = null;

export function startSync(opts?: { keepAlive?: boolean }): void {
  if (handle) return;

  const config = loadSyncConfig();
  const token = resolveGitHubToken();

  handle = createSyncLoop({
    targets: config.targets.map((t) => ({
      ...t,
      token: t.token ?? token ?? undefined,
    })),
    filter: config.filter,
    // ENG-605: disabled — causes data loss for sessions without hooks and
    // counts diverge even when hooks are present. Needs per-session dedup.
    // hooksInstalled: true,
    keepAlive: opts?.keepAlive ?? false,
  });

  handle.start();
}

export function stopSync(): void {
  if (handle) {
    handle.stop();
    handle = null;
  }
}
