import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FML_SKILL_NAME = "fml";
export const FML_SKILL_MANAGED_MARKER = "<!-- fml-managed-skill:v1 -->";

export const FML_SKILL_CONTENT = [
  FML_SKILL_MANAGED_MARKER,
  "---",
  "name: fml",
  'description: "Use the FML CLI and dynamic backend tool catalog from agent sessions."',
  "---",
  "",
  "# FML Agent Tools",
  "",
  "Use FML when you need engineering activity, session timelines, spending, integrations, messages, config snapshots, or backend tools that are available through the user's FML account.",
  "",
  "## Setup checks",
  "",
  "1. Check local status first:",
  "   ```bash",
  "   fml status",
  "   ```",
  "2. If not authenticated, use the device flow in agent/sandbox sessions:",
  "   ```bash",
  "   fml login --device",
  "   ```",
  "   Relay the verification URL to the human user. Do not open the URL yourself. Do not print or read FML auth token files.",
  "3. For deeper diagnostics:",
  "   ```bash",
  "   fml doctor",
  "   ```",
  "",
  "## Dynamic backend tool catalog",
  "",
  "Prefer the dynamic catalog when a dedicated command or MCP tool does not exist:",
  "",
  "```bash",
  "fml tools list --json",
  "fml tools describe <tool-name> --json",
  `fml tools call <tool-name> --args '{"key":"value"}'`,
  "```",
  "",
  "Workflow:",
  "",
  "1. Run `fml tools list --json` to discover available backend tools.",
  "2. Run `fml tools describe <tool-name> --json` before calling a tool so you know the input schema.",
  "3. Run `fml tools call <tool-name> --args '<json>'` with valid JSON arguments.",
  "4. Keep tool output concise in your final answer; summarize large JSON unless the user asks for raw output.",
  "",
  "## Common CLI shortcuts",
  "",
  "```bash",
  "fml activity --since 24h",
  "fml sessions --since 24h --limit 20",
  "fml timeline <session-id>",
  "fml spending --since 7d",
  'fml search "query text" --since 7d',
  "fml sync status",
  "fml org",
  "fml env",
  "```",
  "",
  "## Safety rules",
  "",
  "- Never print, copy, or summarize files named like `auth.*.json` under the FML data directory.",
  "- Do not export or invent tokens. Use `fml login --device` or `fml sync-token` only when a command requires it.",
  "- Use `--json` for machine-readable output when you need to parse results.",
  "- If a command reports an auth, network, or sync error, surface the exact command and error to the user instead of retrying indefinitely.",
  "",
].join("\n");

export type AgentSkillTarget = "claude" | "codex" | "pi";

export type AgentSkillInstallResult = {
  target: AgentSkillTarget;
  path: string;
  status: "installed" | "updated" | "skipped";
  reason?: string;
};

export type AgentSkillRemoveResult = {
  target: AgentSkillTarget;
  path: string;
  status: "removed" | "skipped";
  reason?: string;
};

type SkillEnv = Partial<
  Record<
    | "FML_CLAUDE_DIR"
    | "CLAUDE_CONFIG_DIR"
    | "PANOPTICON_CLAUDE_DIR"
    | "FML_CODEX_DIR"
    | "PANOPTICON_CODEX_DIR"
    | "CODEX_HOME"
    | "FML_PI_DIR"
    | "PANOPTICON_PI_DIR"
    | "PI_HOME",
    string | undefined
  >
>;

function firstEnv(env: SkillEnv, names: Array<keyof SkillEnv>): string | undefined {
  return names.map((name) => env[name]).find((value): value is string => !!value);
}

export function agentSkillLocations(
  home = os.homedir(),
  env: SkillEnv = process.env,
): Array<{
  target: AgentSkillTarget;
  dir: string;
}> {
  const claudeDir = firstEnv(env, [
    "FML_CLAUDE_DIR",
    "CLAUDE_CONFIG_DIR",
    "PANOPTICON_CLAUDE_DIR",
  ]) ?? path.join(home, ".claude");
  const codexDir = firstEnv(env, [
    "FML_CODEX_DIR",
    "PANOPTICON_CODEX_DIR",
    "CODEX_HOME",
  ]) ?? path.join(home, ".codex");
  const piDir = firstEnv(env, ["FML_PI_DIR", "PANOPTICON_PI_DIR", "PI_HOME"]) ??
    path.join(home, ".pi");

  return [
    { target: "claude", dir: path.join(claudeDir, "skills", FML_SKILL_NAME) },
    { target: "codex", dir: path.join(codexDir, "skills", FML_SKILL_NAME) },
    { target: "pi", dir: path.join(piDir, "agent", "skills", FML_SKILL_NAME) },
  ];
}

function skillPath(dir: string): string {
  return path.join(dir, "SKILL.md");
}

function isManagedSkill(content: string): boolean {
  return content.includes(FML_SKILL_MANAGED_MARKER);
}

export function installAgentSkills(
  home = os.homedir(),
  env: SkillEnv = process.env,
): AgentSkillInstallResult[] {
  const results: AgentSkillInstallResult[] = [];
  for (const location of agentSkillLocations(home, env)) {
    const filePath = skillPath(location.dir);
    let existing: string | null = null;
    try {
      existing = fs.readFileSync(filePath, "utf8");
    } catch {}

    if (existing !== null && !isManagedSkill(existing)) {
      results.push({
        target: location.target,
        path: filePath,
        status: "skipped",
        reason: "existing unmanaged skill",
      });
      continue;
    }

    fs.mkdirSync(location.dir, { recursive: true });
    fs.writeFileSync(filePath, FML_SKILL_CONTENT, "utf8");
    results.push({
      target: location.target,
      path: filePath,
      status: existing === null ? "installed" : "updated",
    });
  }
  return results;
}

export function removeAgentSkills(
  home = os.homedir(),
  targets?: AgentSkillTarget[],
  env: SkillEnv = process.env,
): AgentSkillRemoveResult[] {
  const targetSet = targets ? new Set(targets) : null;
  const results: AgentSkillRemoveResult[] = [];
  for (const location of agentSkillLocations(home, env)) {
    if (targetSet && !targetSet.has(location.target)) continue;
    const filePath = skillPath(location.dir);
    let existing: string;
    try {
      existing = fs.readFileSync(filePath, "utf8");
    } catch {
      results.push({
        target: location.target,
        path: filePath,
        status: "skipped",
        reason: "not installed",
      });
      continue;
    }

    if (!isManagedSkill(existing)) {
      results.push({
        target: location.target,
        path: filePath,
        status: "skipped",
        reason: "existing unmanaged skill",
      });
      continue;
    }

    fs.rmSync(filePath, { force: true });
    try {
      fs.rmdirSync(location.dir);
    } catch {
      // Leave the directory if the user added other files next to SKILL.md.
    }
    results.push({ target: location.target, path: filePath, status: "removed" });
  }
  return results;
}

export function agentSkillTargetsForUninstallTarget(
  target?: string,
): AgentSkillTarget[] | undefined {
  if (!target || target === "all") return undefined;
  if (target === "claude" || target === "codex" || target === "pi") {
    return [target];
  }
  return [];
}
