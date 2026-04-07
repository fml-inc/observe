/**
 * Converts a ClaudeCodeConfig (scanner output) into the shape expected by
 * the uploadConfigSnapshot mutation, with secret redaction.
 */

import os from "node:os";
import path from "node:path";
import { readConfig } from "@fml-inc/panopticon/scanner";
import type { ClaudeCodeConfig } from "@fml-inc/panopticon/scanner";
import { resolveRepoFromCwd } from "@fml-inc/panopticon/repo";

// ── Secret detection ────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /token/i,
  /secret/i,
  /\bkey\b/i,
  /password/i,
  /credential/i,
  /api_key/i,
  /apikey/i,
  /auth/i,
  /https?:\/\/[^@\s]+:[^@\s]+@/, // URLs with embedded credentials
];

function containsSecret(text: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(text));
}

function redactContent(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          // Redact env var values: KEY=value -> KEY=<redacted>
          if (/^[A-Z_]+=/.test(line.trim())) {
            return line.replace(/=.*/, "=<redacted>");
          }
          return "<redacted>";
        }
      }
      return line;
    })
    .join("\n");
}

// ── Snapshot shape ──────────────────────────────────────────────────────────

export interface UploadableSnapshot {
  hooks: Array<{ event: string; matcher?: string; type: string }>;
  mcpServers: Array<{ name: string; command: string }>;
  commands: Array<{ name: string; content: string }>;
  agents: Array<{ name: string; content: string }>;
  rules: Array<{ name: string; content: string }>;
  skills: Array<{ name: string; content: string }>;
  permissions: { allow: string[]; ask: string[]; deny: string[] };
  instructions: Array<{
    path: string;
    lineCount: number;
    content?: string;
  }>;
  enabledPlugins: Array<{ pluginName: string; marketplace: string }>;
}

// ── Builder ─────────────────────────────────────────────────────────────────

function redactNamedContent(
  items: Array<{ name: string; content: string }>,
): Array<{ name: string; content: string }> {
  return items.map((item) => ({
    name: item.name,
    content: redactContent(item.content),
  }));
}

function filterSecretPatterns(patterns: string[]): string[] {
  return patterns.filter((p) => !containsSecret(p));
}

/** Parse enabledPlugins from settings JSON: { "name@marketplace": true } */
function parseEnabledPlugins(
  settings: Record<string, unknown> | null,
): UploadableSnapshot["enabledPlugins"] {
  const raw = settings?.enabledPlugins;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([key]) => {
      const idx = key.lastIndexOf("@");
      return idx > 0
        ? { pluginName: key.slice(0, idx), marketplace: key.slice(idx + 1) }
        : { pluginName: key, marketplace: "unknown" };
    });
}

/**
 * Merge named content arrays from multiple layers, deduplicating by name.
 * Earlier layers take precedence (project overrides user).
 */
function mergeNamed(
  ...layers: Array<Array<{ name: string; content: string }>>
): Array<{ name: string; content: string }> {
  const seen = new Set<string>();
  const result: Array<{ name: string; content: string }> = [];
  for (const layer of layers) {
    for (const item of layer) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        result.push(item);
      }
    }
  }
  return result;
}

/**
 * Merge permission arrays from multiple layers, deduplicating.
 */
function mergePermissions(
  ...layers: Array<{ allow: string[]; ask: string[]; deny: string[] }>
): { allow: string[]; ask: string[]; deny: string[] } {
  return {
    allow: [...new Set(layers.flatMap((l) => l.allow))],
    ask: [...new Set(layers.flatMap((l) => l.ask))],
    deny: [...new Set(layers.flatMap((l) => l.deny))],
  };
}

/**
 * Build an uploadable snapshot from scanner output.
 * Merges user and project layers — captures the full picture of
 * how this person has Claude Code configured.
 * Redacts secrets, converts absolute paths to relative.
 */
export function buildSnapshot(config: ClaudeCodeConfig): UploadableSnapshot {
  const user = config.user;
  const project = config.project;
  const cwd = process.cwd();

  // Hooks — merge project + user, deduplicate by event+matcher+type
  const hookSet = new Set<string>();
  const hooks: UploadableSnapshot["hooks"] = [];
  for (const layer of [project, user]) {
    if (!layer) continue;
    for (const h of layer.hooks) {
      const key = `${h.event}:${h.matcher ?? ""}:${h.type}`;
      if (!hookSet.has(key)) {
        hookSet.add(key);
        hooks.push({
          event: h.event,
          matcher: h.matcher ?? undefined,
          type: h.type,
        });
      }
    }
  }

  // MCP servers — merge by name, project wins
  const mcpSet = new Set<string>();
  const mcpServers: UploadableSnapshot["mcpServers"] = [];
  for (const layer of [project, user]) {
    if (!layer) continue;
    for (const s of layer.mcpServers) {
      if (!mcpSet.has(s.name)) {
        mcpSet.add(s.name);
        mcpServers.push(s);
      }
    }
  }

  // Named content — merge project + user, redact
  const commands = redactNamedContent(
    mergeNamed(project?.commands ?? [], user.commands),
  );
  const agents = redactNamedContent(
    mergeNamed(project?.agents ?? [], user.agents),
  );
  const rules = redactNamedContent(
    mergeNamed(project?.rules ?? [], user.rules),
  );
  const skills = redactNamedContent(
    mergeNamed(project?.skills ?? [], user.skills),
  );

  // Permissions — merge all layers, strip secrets
  const merged = mergePermissions(
    project?.permissions ?? { allow: [], ask: [], deny: [] },
    user.permissions,
  );
  const permissions = {
    allow: filterSecretPatterns(merged.allow),
    ask: filterSecretPatterns(merged.ask),
    deny: filterSecretPatterns(merged.deny),
  };

  // Instructions — convert paths to relative, redact content
  const instructions = config.instructions.map((inst) => ({
    path: path.isAbsolute(inst.path)
      ? path.relative(cwd, inst.path)
      : inst.path,
    lineCount: inst.lineCount,
    content: redactContent(inst.content),
  }));

  return {
    hooks,
    mcpServers,
    commands,
    agents,
    rules,
    skills,
    permissions,
    instructions,
    enabledPlugins: parseEnabledPlugins(config.user.settings),
  };
}

// ── Full scan ──────────────────────────────────────────────────────────────

export interface ScannedSnapshot {
  snapshot: UploadableSnapshot;
  deviceName: string;
  repoFullName: string | undefined;
}

/**
 * Read config from a working directory, build a redacted snapshot, and resolve
 * the repo name. This is the single entry-point for "capture what this user
 * has configured right now in this directory."
 */
export function scanSnapshot(cwd?: string): ScannedSnapshot {
  const dir = cwd ?? process.cwd();
  const config = readConfig(dir);
  const snapshot = buildSnapshot(config);
  const repoInfo = resolveRepoFromCwd(dir);

  return {
    snapshot,
    deviceName: os.hostname(),
    repoFullName: repoInfo?.repo ?? undefined,
  };
}
