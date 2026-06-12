import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FML_AGENT_SURFACE_MARKER,
  agentSurfaceLocations,
  agentSurfaceTargetsForUninstallTarget,
  installAgentSurfaces,
  removeAgentSurfaces,
} from "../agent-surfaces.js";
import type { AgentSurfaceTarget } from "../agent-surfaces.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makePluginRoot(): string {
  const root = tempDir("fml-agent-surfaces-plugin-");
  const skillDir = path.join(root, "skills", "fml");
  fs.mkdirSync(path.join(skillDir, "agents"), { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: fml\n---\n${FML_AGENT_SURFACE_MARKER}\n# FML\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(skillDir, "agents", "openai.yaml"),
    'interface:\n  display_name: "FML"\n',
    "utf8",
  );

  const commandDir = path.join(root, "commands");
  fs.mkdirSync(commandDir, { recursive: true });
  fs.writeFileSync(
    path.join(commandDir, "fml.md"),
    `---\ndescription: FML\n---\n${FML_AGENT_SURFACE_MARKER}\n`,
    "utf8",
  );
  return root;
}

function skillPath(home: string, target: "claude" | "codex" | "pi"): string {
  if (target === "claude") {
    return path.join(home, ".claude", "skills", "fml", "SKILL.md");
  }
  if (target === "codex") {
    return path.join(home, ".codex", "skills", "fml", "SKILL.md");
  }
  return path.join(home, ".pi", "agent", "skills", "fml", "SKILL.md");
}

function commandPath(home: string, target: "claude" | "pi"): string {
  if (target === "claude") {
    return path.join(home, ".claude", "commands", "fml.md");
  }
  return path.join(home, ".pi", "agent", "prompts", "fml.md");
}

function harnessRootPath(home: string, target: AgentSurfaceTarget): string {
  if (target === "claude") return path.join(home, ".claude");
  if (target === "codex") return path.join(home, ".codex");
  return path.join(home, ".pi");
}

function makeHarnessRoots(
  home: string,
  targets: AgentSurfaceTarget[],
): void {
  for (const target of targets) {
    fs.mkdirSync(harnessRootPath(home, target), { recursive: true });
  }
}

describe("agent surface installation", () => {
  it("installs FML-managed skills and commands only into present harness locations", () => {
    const home = tempDir("fml-agent-surfaces-home-");
    const pluginRoot = makePluginRoot();
    makeHarnessRoots(home, ["claude"]);

    const results = installAgentSurfaces(pluginRoot, home, {});

    expect(results.map((r) => [r.target, r.kind, r.name, r.status])).toEqual([
      ["claude", "skill", "fml", "installed"],
      ["claude", "command", "fml.md", "installed"],
    ]);
    expect(fs.readFileSync(skillPath(home, "claude"), "utf8")).toContain(
      FML_AGENT_SURFACE_MARKER,
    );
    expect(fs.readFileSync(commandPath(home, "claude"), "utf8")).toContain(
      FML_AGENT_SURFACE_MARKER,
    );
    expect(fs.existsSync(skillPath(home, "codex"))).toBe(false);
    expect(fs.existsSync(skillPath(home, "pi"))).toBe(false);
  });

  it("installs into explicit agent directory overrides even when roots are absent", () => {
    const home = tempDir("fml-agent-surfaces-home-");
    const pluginRoot = makePluginRoot();
    const customCodex = path.join(home, "custom-codex");
    const customPi = path.join(home, "custom-pi");

    const results = installAgentSurfaces(pluginRoot, home, {
      FML_CODEX_DIR: customCodex,
      PANOPTICON_PI_DIR: customPi,
    });

    expect(results.map((r) => [r.target, r.kind, r.name, r.status])).toEqual([
      ["codex", "skill", "fml", "installed"],
      ["pi", "skill", "fml", "installed"],
      ["pi", "command", "fml.md", "installed"],
    ]);
    expect(
      fs.readFileSync(path.join(customCodex, "skills", "fml", "SKILL.md"), "utf8"),
    ).toContain(FML_AGENT_SURFACE_MARKER);
    expect(
      fs.readFileSync(
        path.join(customPi, "agent", "prompts", "fml.md"),
        "utf8",
      ),
    ).toContain(FML_AGENT_SURFACE_MARKER);
  });

  it("updates managed surfaces but does not overwrite unmanaged local files", () => {
    const home = tempDir("fml-agent-surfaces-home-");
    const pluginRoot = makePluginRoot();
    fs.mkdirSync(path.dirname(skillPath(home, "claude")), { recursive: true });
    fs.writeFileSync(
      skillPath(home, "claude"),
      `${FML_AGENT_SURFACE_MARKER}\nold`,
      "utf8",
    );
    fs.mkdirSync(path.dirname(commandPath(home, "pi")), { recursive: true });
    fs.writeFileSync(commandPath(home, "pi"), "# user prompt\n", "utf8");

    const results = installAgentSurfaces(pluginRoot, home, {});

    expect(results.find((r) => r.target === "claude" && r.kind === "skill"))
      .toMatchObject({ status: "updated" });
    expect(results.find((r) => r.target === "pi" && r.kind === "command"))
      .toMatchObject({
        status: "skipped",
        reason: "existing unmanaged surface",
      });
    expect(fs.readFileSync(commandPath(home, "pi"), "utf8")).toBe(
      "# user prompt\n",
    );
  });

  it("ignores unmarked plugin-only command files", () => {
    const home = tempDir("fml-agent-surfaces-home-");
    const pluginRoot = makePluginRoot();
    makeHarnessRoots(home, ["claude"]);
    fs.writeFileSync(
      path.join(pluginRoot, "commands", "tour.md"),
      "---\ndescription: Tour\n---\n# Tour\n",
      "utf8",
    );

    const results = installAgentSurfaces(pluginRoot, home, {});

    expect(results.some((r) => r.name === "tour.md")).toBe(false);
    expect(fs.existsSync(path.join(home, ".claude", "commands", "tour.md")))
      .toBe(false);
  });

  it("removes only FML-managed surfaces and honors target filters", () => {
    const home = tempDir("fml-agent-surfaces-home-");
    const pluginRoot = makePluginRoot();
    makeHarnessRoots(home, ["claude", "codex", "pi"]);
    installAgentSurfaces(pluginRoot, home, {});
    fs.writeFileSync(skillPath(home, "codex"), "# user skill\n", "utf8");

    const results = removeAgentSurfaces(pluginRoot, ["claude", "codex"], home, {});

    expect(results.find((r) => r.target === "claude" && r.kind === "skill"))
      .toMatchObject({ status: "removed" });
    expect(results.find((r) => r.target === "claude" && r.kind === "command"))
      .toMatchObject({ status: "removed" });
    expect(results.find((r) => r.target === "codex" && r.kind === "skill"))
      .toMatchObject({
        status: "skipped",
        reason: "existing unmanaged surface",
      });
    expect(fs.existsSync(skillPath(home, "claude"))).toBe(false);
    expect(fs.existsSync(commandPath(home, "claude"))).toBe(false);
    expect(fs.readFileSync(skillPath(home, "codex"), "utf8")).toBe(
      "# user skill\n",
    );
    expect(fs.existsSync(skillPath(home, "pi"))).toBe(true);
  });

  it("honors custom agent directory environment overrides", () => {
    const home = tempDir("fml-agent-surfaces-home-");
    const claudeRoot = path.join(home, "custom-claude");
    const codexRoot = path.join(home, "custom-codex");
    const piRoot = path.join(home, "custom-pi");
    const locations = agentSurfaceLocations(home, {
      FML_CLAUDE_DIR: claudeRoot,
      PANOPTICON_CODEX_DIR: codexRoot,
      FML_PI_DIR: piRoot,
    });

    expect(locations).toEqual([
      {
        target: "claude",
        rootDir: claudeRoot,
        rootExplicit: true,
        skillsDir: path.join(claudeRoot, "skills"),
        commandsDir: path.join(claudeRoot, "commands"),
      },
      {
        target: "codex",
        rootDir: codexRoot,
        rootExplicit: true,
        skillsDir: path.join(codexRoot, "skills"),
      },
      {
        target: "pi",
        rootDir: piRoot,
        rootExplicit: true,
        skillsDir: path.join(piRoot, "agent", "skills"),
        commandsDir: path.join(piRoot, "agent", "prompts"),
      },
    ]);
  });

  it("maps uninstall targets to agent surface targets", () => {
    expect(agentSurfaceTargetsForUninstallTarget()).toBeUndefined();
    expect(agentSurfaceTargetsForUninstallTarget("all")).toBeUndefined();
    expect(agentSurfaceTargetsForUninstallTarget("claude")).toEqual(["claude"]);
    expect(agentSurfaceTargetsForUninstallTarget("codex")).toEqual(["codex"]);
    expect(agentSurfaceTargetsForUninstallTarget("pi")).toEqual(["pi"]);
    expect(agentSurfaceTargetsForUninstallTarget("gemini")).toEqual([]);
    expect(agentSurfaceTargetsForUninstallTarget("claude-desktop")).toEqual([]);
  });
});
