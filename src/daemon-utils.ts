import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { FML_DATA_DIR, FML_LOG_DIR } from "./dirs.js";

export const SYNC_PID_FILE = path.join(FML_DATA_DIR, "sync.pid");
export const SYNC_LOG_FILE = path.join(FML_LOG_DIR, "sync.log");

export function isDaemonRunning(pidFile: string): {
  running: boolean;
  pid: number | null;
} {
  if (!fs.existsSync(pidFile)) return { running: false, pid: null };
  const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false, pid };
  }
}

/** Resolve the panopticon CLI binary from PATH (globally installed). */
export function resolvePanopticonBin(): string | null {
  try {
    const result = execFileSync("which", ["panopticon"], {
      encoding: "utf-8",
      timeout: 5_000,
    }).trim();
    if (result) return result;
  } catch {}

  return null;
}

/** Run a panopticon CLI command and return stdout. */
export function panopticonExec(...args: string[]): {
  ok: boolean;
  stdout: string;
};
export function panopticonExec(
  ...argsAndOpts: [...string[], { timeout?: number }]
): { ok: boolean; stdout: string };
export function panopticonExec(
  ...argsAndOpts: Array<string | { timeout?: number }>
): {
  ok: boolean;
  stdout: string;
} {
  let timeout = 10_000;
  const args: string[] = [];
  for (const a of argsAndOpts) {
    if (typeof a === "string") args.push(a);
    else timeout = a.timeout ?? timeout;
  }
  const bin = resolvePanopticonBin();
  if (!bin) return { ok: false, stdout: "panopticon binary not found" };
  try {
    const stdout = execFileSync("node", [bin, ...args], {
      encoding: "utf-8",
      timeout,
    });
    return { ok: true, stdout };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { ok: false, stdout: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}
