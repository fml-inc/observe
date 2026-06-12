import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FML_AGENT_SURFACE_MARKER =
  "<!-- fml-managed-agent-surface:v1 -->";

export type AgentSurfaceTarget = "claude" | "codex" | "pi";
export type AgentSurfaceKind = "skill" | "command";

export type AgentSurfaceInstallResult = {
  target: AgentSurfaceTarget;
  kind: AgentSurfaceKind;
  name: string;
  path: string;
  status: "installed" | "updated" | "skipped";
  reason?: string;
};

export type AgentSurfaceRemoveResult = {
  target: AgentSurfaceTarget;
  kind: AgentSurfaceKind;
  name: string;
  path: string;
  status: "removed" | "skipped";
  reason?: string;
};

type SurfaceEnv = Partial<
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

export type AgentSurfaceLocation = {
  target: AgentSurfaceTarget;
  rootDir: string;
  rootExplicit: boolean;
  skillsDir: string;
  commandsDir?: string;
};

function firstEnvValue(
  env: SurfaceEnv,
  names: Array<keyof SurfaceEnv>,
): string | undefined {
  return names.map((name) => env[name]).find((value): value is string => !!value);
}

function rootFromEnv(
  env: SurfaceEnv,
  names: Array<keyof SurfaceEnv>,
  defaultDir: string,
): { rootDir: string; rootExplicit: boolean } {
  const envRoot = firstEnvValue(env, names);
  return envRoot
    ? { rootDir: envRoot, rootExplicit: true }
    : { rootDir: defaultDir, rootExplicit: false };
}

export function agentSurfaceLocations(
  home = os.homedir(),
  env: SurfaceEnv = process.env,
): AgentSurfaceLocation[] {
  const claudeRoot = rootFromEnv(
    env,
    [
      "FML_CLAUDE_DIR",
      "CLAUDE_CONFIG_DIR",
      "PANOPTICON_CLAUDE_DIR",
    ],
    path.join(home, ".claude"),
  );
  const codexRoot = rootFromEnv(
    env,
    ["FML_CODEX_DIR", "PANOPTICON_CODEX_DIR", "CODEX_HOME"],
    path.join(home, ".codex"),
  );
  const piRoot = rootFromEnv(
    env,
    ["FML_PI_DIR", "PANOPTICON_PI_DIR", "PI_HOME"],
    path.join(home, ".pi"),
  );

  return [
    {
      target: "claude",
      ...claudeRoot,
      skillsDir: path.join(claudeRoot.rootDir, "skills"),
      commandsDir: path.join(claudeRoot.rootDir, "commands"),
    },
    {
      target: "codex",
      ...codexRoot,
      skillsDir: path.join(codexRoot.rootDir, "skills"),
    },
    {
      target: "pi",
      ...piRoot,
      skillsDir: path.join(piRoot.rootDir, "agent", "skills"),
      commandsDir: path.join(piRoot.rootDir, "agent", "prompts"),
    },
  ];
}

function readFileIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function surfaceCheckPath(kind: AgentSurfaceKind, dest: string): string {
  return kind === "skill" ? path.join(dest, "SKILL.md") : dest;
}

function sourceIsManaged(kind: AgentSurfaceKind, src: string): boolean {
  return (
    readFileIfExists(surfaceCheckPath(kind, src))?.includes(
      FML_AGENT_SURFACE_MARKER,
    ) ?? false
  );
}

function installSurface(args: {
  target: AgentSurfaceTarget;
  kind: AgentSurfaceKind;
  name: string;
  src: string;
  dest: string;
}): AgentSurfaceInstallResult {
  const checkPath = surfaceCheckPath(args.kind, args.dest);
  const existing = readFileIfExists(checkPath);
  if (existing !== null && !existing.includes(FML_AGENT_SURFACE_MARKER)) {
    return {
      target: args.target,
      kind: args.kind,
      name: args.name,
      path: checkPath,
      status: "skipped",
      reason: "existing unmanaged surface",
    };
  }
  if (existing === null && fs.existsSync(args.dest)) {
    return {
      target: args.target,
      kind: args.kind,
      name: args.name,
      path: checkPath,
      status: "skipped",
      reason: "existing unmanaged surface",
    };
  }

  fs.rmSync(args.dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(args.dest), { recursive: true });
  if (args.kind === "skill") {
    fs.cpSync(args.src, args.dest, { recursive: true });
  } else {
    fs.copyFileSync(args.src, args.dest);
  }

  return {
    target: args.target,
    kind: args.kind,
    name: args.name,
    path: checkPath,
    status: existing === null ? "installed" : "updated",
  };
}

function removeSurface(args: {
  target: AgentSurfaceTarget;
  kind: AgentSurfaceKind;
  name: string;
  dest: string;
}): AgentSurfaceRemoveResult {
  const checkPath = surfaceCheckPath(args.kind, args.dest);
  const existing = readFileIfExists(checkPath);
  if (existing === null) {
    return {
      target: args.target,
      kind: args.kind,
      name: args.name,
      path: checkPath,
      status: "skipped",
      reason: "not installed",
    };
  }
  if (!existing.includes(FML_AGENT_SURFACE_MARKER)) {
    return {
      target: args.target,
      kind: args.kind,
      name: args.name,
      path: checkPath,
      status: "skipped",
      reason: "existing unmanaged surface",
    };
  }

  fs.rmSync(args.dest, { recursive: true, force: true });
  return {
    target: args.target,
    kind: args.kind,
    name: args.name,
    path: checkPath,
    status: "removed",
  };
}

function selectedLocations(
  targets: AgentSurfaceTarget[] | undefined,
  home: string,
  env: SurfaceEnv,
  requireHarnessRoot = false,
): AgentSurfaceLocation[] {
  const targetSet = targets ? new Set(targets) : null;
  return agentSurfaceLocations(home, env).filter(
    (location) =>
      (!targetSet || targetSet.has(location.target)) &&
      (!requireHarnessRoot ||
        location.rootExplicit ||
        fs.existsSync(location.rootDir)),
  );
}

export function installAgentSurfaces(
  pluginRoot: string,
  home = os.homedir(),
  env: SurfaceEnv = process.env,
): AgentSurfaceInstallResult[] {
  const locations = selectedLocations(undefined, home, env, true);
  const results: AgentSurfaceInstallResult[] = [];

  const skillsSource = path.join(pluginRoot, "skills");
  if (fs.existsSync(skillsSource)) {
    for (const skillName of fs.readdirSync(skillsSource)) {
      const src = path.join(skillsSource, skillName);
      if (!fs.statSync(src).isDirectory()) continue;
      if (!sourceIsManaged("skill", src)) continue;
      for (const location of locations) {
        results.push(
          installSurface({
            target: location.target,
            kind: "skill",
            name: skillName,
            src,
            dest: path.join(location.skillsDir, skillName),
          }),
        );
      }
    }
  }

  const commandsSource = path.join(pluginRoot, "commands");
  if (fs.existsSync(commandsSource)) {
    for (const commandFile of fs.readdirSync(commandsSource)) {
      if (!commandFile.endsWith(".md")) continue;
      const src = path.join(commandsSource, commandFile);
      if (!fs.statSync(src).isFile()) continue;
      if (!sourceIsManaged("command", src)) continue;
      for (const location of locations) {
        if (!location.commandsDir) continue;
        results.push(
          installSurface({
            target: location.target,
            kind: "command",
            name: commandFile,
            src,
            dest: path.join(location.commandsDir, commandFile),
          }),
        );
      }
    }
  }

  return results;
}

export function removeAgentSurfaces(
  pluginRoot: string,
  targets?: AgentSurfaceTarget[],
  home = os.homedir(),
  env: SurfaceEnv = process.env,
): AgentSurfaceRemoveResult[] {
  const locations = selectedLocations(targets, home, env);
  const results: AgentSurfaceRemoveResult[] = [];

  const skillsSource = path.join(pluginRoot, "skills");
  if (fs.existsSync(skillsSource)) {
    for (const skillName of fs.readdirSync(skillsSource)) {
      const src = path.join(skillsSource, skillName);
      if (!fs.statSync(src).isDirectory()) continue;
      if (!sourceIsManaged("skill", src)) continue;
      for (const location of locations) {
        results.push(
          removeSurface({
            target: location.target,
            kind: "skill",
            name: skillName,
            dest: path.join(location.skillsDir, skillName),
          }),
        );
      }
    }
  }

  const commandsSource = path.join(pluginRoot, "commands");
  if (fs.existsSync(commandsSource)) {
    for (const commandFile of fs.readdirSync(commandsSource)) {
      if (!commandFile.endsWith(".md")) continue;
      const src = path.join(commandsSource, commandFile);
      if (!fs.statSync(src).isFile()) continue;
      if (!sourceIsManaged("command", src)) continue;
      for (const location of locations) {
        if (!location.commandsDir) continue;
        results.push(
          removeSurface({
            target: location.target,
            kind: "command",
            name: commandFile,
            dest: path.join(location.commandsDir, commandFile),
          }),
        );
      }
    }
  }

  return results;
}

export function agentSurfaceTargetsForUninstallTarget(
  target?: string,
): AgentSurfaceTarget[] | undefined {
  if (!target || target === "all") return undefined;
  if (target === "claude" || target === "codex" || target === "pi") {
    return [target];
  }
  return [];
}

export function formatAgentSurfaceResult(
  result: AgentSurfaceInstallResult | AgentSurfaceRemoveResult,
): string {
  const suffix = result.reason ? ` (${result.reason})` : "";
  return `${result.target} ${result.kind} ${result.name}: ${result.status}${suffix} - ${result.path}`;
}
