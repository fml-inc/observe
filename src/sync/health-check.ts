#!/usr/bin/env node

/**
 * Sync daemon health check — ensures the sync daemon is running.
 *
 * Installed as a SessionStart hook so the sync daemon is lazily started
 * whenever a new Claude Code session begins, mirroring panopticon's
 * own lazy-start pattern in its hook handler.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  SYNC_PID_FILE,
  SYNC_LOG_FILE,
  isDaemonRunning,
} from "../daemon-utils.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function startSyncDaemon(): void {
  const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const daemonScript = path.resolve(distDir, "daemon.js");

  if (!fs.existsSync(daemonScript)) return;

  fs.mkdirSync(path.dirname(SYNC_LOG_FILE), { recursive: true });
  const logFd = fs.openSync(SYNC_LOG_FILE, "a");

  const child = spawn("node", [daemonScript], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env },
  });

  if (child.pid) {
    fs.mkdirSync(path.dirname(SYNC_PID_FILE), { recursive: true });
    fs.writeFileSync(SYNC_PID_FILE, String(child.pid));
  }
  child.unref();
  fs.closeSync(logFd);
}

async function main(): Promise<void> {
  // Consume stdin (required by hook protocol) but we don't need it
  const input = await readStdin();
  if (!input.trim()) {
    process.exit(0);
  }

  try {
    const data = JSON.parse(input);
    const eventType = data.hook_event_name ?? "";

    if (eventType === "SessionStart" || eventType === "session_start") {
      const { running } = isDaemonRunning(SYNC_PID_FILE);
      if (!running) {
        startSyncDaemon();
      }
    }
  } catch {
    // Hooks must not block the calling CLI
  }

  // Output empty JSON — this hook has no response payload
  process.stdout.write(JSON.stringify({}));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}));
});
