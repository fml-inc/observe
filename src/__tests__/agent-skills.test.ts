import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FML_SKILL_CONTENT,
  FML_SKILL_MANAGED_MARKER,
  agentSkillLocations,
  agentSkillTargetsForUninstallTarget,
  installAgentSkills,
  removeAgentSkills,
} from "../agent-skills.js";

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fml-skills-test-"));
}

function skillPath(home: string, target: "claude" | "codex" | "pi"): string {
  if (target === "claude") return path.join(home, ".claude", "skills", "fml", "SKILL.md");
  if (target === "codex") return path.join(home, ".codex", "skills", "fml", "SKILL.md");
  return path.join(home, ".pi", "agent", "skills", "fml", "SKILL.md");
}

describe("agent skill installation", () => {
  it("installs FML-managed skills into known user-level locations", () => {
    const home = tempHome();
    const results = installAgentSkills(home, {});

    expect(results.map((r) => [r.target, r.status])).toEqual([
      ["claude", "installed"],
      ["codex", "installed"],
      ["pi", "installed"],
    ]);
    for (const target of ["claude", "codex", "pi"] as const) {
      expect(fs.readFileSync(skillPath(home, target), "utf8")).toBe(
        FML_SKILL_CONTENT,
      );
    }
  });

  it("updates existing FML-managed skills", () => {
    const home = tempHome();
    const file = skillPath(home, "claude");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${FML_SKILL_MANAGED_MARKER}\nold`, "utf8");

    const result = installAgentSkills(home, {}).find((r) => r.target === "claude");

    expect(result?.status).toBe("updated");
    expect(fs.readFileSync(file, "utf8")).toBe(FML_SKILL_CONTENT);
  });

  it("does not overwrite an unmanaged existing skill", () => {
    const home = tempHome();
    const file = skillPath(home, "codex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "# My local FML notes\n", "utf8");

    const result = installAgentSkills(home, {}).find((r) => r.target === "codex");

    expect(result).toMatchObject({
      target: "codex",
      status: "skipped",
      reason: "existing unmanaged skill",
    });
    expect(fs.readFileSync(file, "utf8")).toBe("# My local FML notes\n");
  });

  it("removes only FML-managed skills", () => {
    const home = tempHome();
    installAgentSkills(home, {});
    const unmanaged = skillPath(home, "pi");
    fs.writeFileSync(unmanaged, "# User-owned skill\n", "utf8");

    const results = removeAgentSkills(home, undefined, {});

    expect(results.find((r) => r.target === "claude")?.status).toBe("removed");
    expect(results.find((r) => r.target === "codex")?.status).toBe("removed");
    expect(results.find((r) => r.target === "pi")).toMatchObject({
      status: "skipped",
      reason: "existing unmanaged skill",
    });
    expect(fs.existsSync(skillPath(home, "claude"))).toBe(false);
    expect(fs.existsSync(skillPath(home, "codex"))).toBe(false);
    expect(fs.readFileSync(unmanaged, "utf8")).toBe("# User-owned skill\n");
  });

  it("honors custom agent directory environment overrides", () => {
    const home = tempHome();
    const locations = agentSkillLocations(home, {
      FML_CLAUDE_DIR: path.join(home, "custom-claude"),
      PANOPTICON_CODEX_DIR: path.join(home, "custom-codex"),
      FML_PI_DIR: path.join(home, "custom-pi"),
    });

    expect(locations).toEqual([
      {
        target: "claude",
        dir: path.join(home, "custom-claude", "skills", "fml"),
      },
      {
        target: "codex",
        dir: path.join(home, "custom-codex", "skills", "fml"),
      },
      {
        target: "pi",
        dir: path.join(home, "custom-pi", "agent", "skills", "fml"),
      },
    ]);
  });

  it("maps uninstall targets to skill targets", () => {
    expect(agentSkillTargetsForUninstallTarget()).toBeUndefined();
    expect(agentSkillTargetsForUninstallTarget("all")).toBeUndefined();
    expect(agentSkillTargetsForUninstallTarget("claude")).toEqual(["claude"]);
    expect(agentSkillTargetsForUninstallTarget("codex")).toEqual(["codex"]);
    expect(agentSkillTargetsForUninstallTarget("pi")).toEqual(["pi"]);
    expect(agentSkillTargetsForUninstallTarget("gemini")).toEqual([]);
  });
});
