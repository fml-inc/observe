import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI_PATH = path.resolve(__dirname, "../../dist/cli.js");

// Isolate the CLI's data/log dirs so integration tests — notably `logout`,
// which deletes the auth token — operate on a throwaway dir and can NEVER
// touch the real ~/Library/Application Support/fml/auth.<env>.json.
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fml-cli-test-"));

function run(...args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
      encoding: "utf-8",
      timeout: 10_000,
      env: {
        ...process.env,
        NODE_NO_WARNINGS: "1",
        FML_DATA_DIR: TEST_DATA_DIR,
        FML_LOG_DIR: TEST_DATA_DIR,
      },
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
      expect(stdout).toContain("FML CLI and agent tools");
      expect(stdout).toContain("install");
      expect(stdout).toContain("login");
      expect(stdout).toContain("logout");
      expect(stdout).toContain("status");
      expect(stdout).toContain("doctor");
      expect(stdout).toContain("open");
      expect(stdout).toContain("start");
      expect(stdout).toContain("stop");
      expect(stdout).toContain("tools");
      expect(stdout).toContain("tour");
      expect(stdout).not.toContain("commands");
      expect(stdout).not.toMatch(/\n\s+panopticon\s/);
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

    it("shows dynamic backend tool commands in tools help", () => {
      const { stdout, exitCode } = run("tools", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("List backend tools available via the dynamic catalog");
      expect(stdout).toContain("describe");
      expect(stdout).toContain("call");
    });

    it("lists hidden/internal CLI commands via commands", () => {
      const { stdout, exitCode } = run("commands");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("tools list");
      expect(stdout).toContain("tools describe");
      expect(stdout).toContain("sync-token");
    });
  });

  describe("install subcommand", () => {
    it("shows help with --help", () => {
      const { stdout, exitCode } = run("install", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Set up FML for local agent use");
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

  describe("tour command", () => {
    it("prints the whole tour on the non-TTY path", () => {
      // execFileSync pipes stdio, so this exercises the non-interactive
      // fallback AND the dist-relative ../tour lesson resolution that every
      // installed copy depends on.
      const { stdout, exitCode } = run("tour");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Lesson 1/8: What is FML?");
      expect(stdout).toContain("Lesson 8/8");
    });

    it("references only resolvable CLI commands from lesson try-it lines", () => {
      // Lessons advertise copy-paste commands; a rename (hidden commands
      // included) must fail here, not in a user's onboarding session.
      const tourDir = path.resolve(__dirname, "../../tour");
      const tryClis = fs
        .readdirSync(tourDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => fs.readFileSync(path.join(tourDir, f), "utf-8"))
        .map((raw) => raw.match(/^tryCli:\s*(.+)$/m)?.[1])
        .filter((cmd): cmd is string => Boolean(cmd));
      expect(tryClis.length).toBeGreaterThan(0);
      for (const cmd of tryClis) {
        const words = cmd.split(" ").slice(1); // drop the leading "fml"
        const subcommand = [];
        for (const word of words) {
          if (word.startsWith("-")) break;
          subcommand.push(word);
        }
        const { exitCode } = run(...subcommand, "--help");
        expect(exitCode, `tryCli not resolvable: ${cmd}`).toBe(0);
      }
    });
  });
});
