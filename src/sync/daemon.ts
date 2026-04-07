#!/usr/bin/env node

/**
 * Standalone sync daemon. Spawned as a detached background process
 * by `fml daemon start`.
 */

import { ensureNativeModules } from "../native-check.js";
ensureNativeModules();

import { initSentry, Sentry } from "../sentry.js";
import { startSync, stopSync } from "./sync.js";

await initSentry();

console.error(`[fml-sync] Daemon started (PID ${process.pid})`);

try {
  startSync({ keepAlive: true });
} catch (err) {
  Sentry.captureException(err);
  console.error(
    `[fml-sync] Failed to start: ${err instanceof Error ? err.message : err}`,
  );
  process.exit(1);
}

const shutdown = () => {
  console.error("[fml-sync] Shutting down");
  stopSync();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
