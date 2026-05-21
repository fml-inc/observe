import { panopticonExec } from "../daemon-utils.js";

// ── Status helpers (used by doctor, status) ─────────────────────────────────

export function parsePanopticonRunning(): boolean {
  const result = panopticonExec("status");
  const serverLine = result.stdout
    .split("\n")
    .find((l) => l.startsWith("Server:"));
  return result.ok && /running/i.test(serverLine ?? "");
}

// ── Panopticon server start / stop (used by CLI, env restart, install, MCP) ──

export async function handleStart(): Promise<void> {
  const startResult = panopticonExec("start");
  console.log(
    startResult.stdout.trim() ||
      (startResult.ok ? "Panopticon started" : "Failed to start panopticon"),
  );
}

export function handleStop(): void {
  const stopResult = panopticonExec("stop");
  console.log(stopResult.stdout.trim() || "Panopticon stopped");
}

// ── Sync start / stop (used by `fml sync start|stop`) ───────────────────────
// Sync runs inside the panopticon server; these toggle the persisted
// sync-enabled flag via panopticon, independent of the server lifecycle.

export function handleSyncStart(): void {
  const result = panopticonExec("sync", "enable");
  console.log(
    result.stdout.trim() ||
      (result.ok ? "Sync enabled" : "Failed to enable sync"),
  );
}

export function handleSyncStop(): void {
  const result = panopticonExec("sync", "disable");
  console.log(
    result.stdout.trim() ||
      (result.ok ? "Sync disabled" : "Failed to disable sync"),
  );
}
