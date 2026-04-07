import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI_PATH = path.resolve(__dirname, "../../dist/cli.js");

function run(...args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout ?? "") + (e.stderr ?? ""),
      exitCode: e.status ?? 1,
    };
  }
}

describe("CLI integration", () => {
  describe("top-level", () => {
    it("shows help with --help", () => {
      const { stdout, exitCode } = run("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("FML agent tools for Claude Code");
      expect(stdout).toContain("install");
      expect(stdout).toContain("login");
      expect(stdout).toContain("logout");
      expect(stdout).toContain("status");
      expect(stdout).toContain("doctor");
      expect(stdout).toContain("open");
      expect(stdout).toContain("start");
      expect(stdout).toContain("stop");
      expect(stdout).toContain("sync");
    });

    it("shows version with --version", () => {
      const { stdout, exitCode } = run("--version");
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?(\+\w+)?$/);
    });

    it("shows help when no command given", () => {
      const { stdout } = run();
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("fml");
    });

    it("exits with error for unknown command", () => {
      const { stdout, exitCode } = run("nonexistent");
      expect(exitCode).not.toBe(0);
      expect(stdout).toContain("unknown command");
    });
  });

  describe("install subcommand", () => {
    it("shows help with --help", () => {
      const { stdout, exitCode } = run("install", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Register plugin, hooks, and daemons");
    });
  });

  describe("sync subcommands", () => {
    it("shows sync help", () => {
      const { stdout, exitCode } = run("sync", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("setup");
      expect(stdout).toContain("status");
      expect(stdout).toContain("reset");
    });

    it("shows sync reset help with argument", () => {
      const { stdout, exitCode } = run("sync", "reset", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("[name]");
    });
  });

  describe("logout command", () => {
    it("runs without error", () => {
      // logout is safe to call — it just tries to delete a file
      const { exitCode } = run("logout");
      expect(exitCode).toBe(0);
    });
  });
});
