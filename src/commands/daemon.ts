import {
  isDaemonRunning,
  panopticonExec,
  SYNC_PID_FILE,
} from "../daemon-utils.js";

// ── Status helpers (used by doctor, status) ─────────────────────────────────

export function parsePanopticonRunning(): boolean {
  const result = panopticonExec("status");
  const serverLine = result.stdout
    .split("\n")
    .find((l) => l.startsWith("Server:"));
  return result.ok && /running/i.test(serverLine ?? "");
}

export function isSyncRunning(): { running: boolean; pid: number | null } {
  return isDaemonRunning(SYNC_PID_FILE);
}

// ── Start / Stop (used by CLI, install, MCP) ────────────────────────────────

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
