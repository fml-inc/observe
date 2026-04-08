import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing the module under test
const mockExecFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

import { bootstrapPanopticon } from "../postinstall.js";

describe("bootstrapPanopticon", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("installs globally when not already installed", () => {
    // npm ls fails (not installed)
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "ls") throw new Error("not found");
      return "";
    });

    bootstrapPanopticon();

    // Should have called npm install -g
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "@fml-inc/panopticon@latest"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Installing"),
    );
  });

  it("skips install when up to date", () => {
    // npm ls returns version
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "ls") {
        return JSON.stringify({
          dependencies: { "@fml-inc/panopticon": { version: "0.1.8" } },
        });
      }
      // npm outdated exits 0 = not outdated
      if (args[0] === "outdated") return "";
      return "";
    });

    bootstrapPanopticon();

    // Should NOT have called npm install
    const installCalls = mockExecFileSync.mock.calls.filter(
      (call: unknown[]) => {
        const args = call[1] as string[];
        return args[0] === "install";
      },
    );
    expect(installCalls).toHaveLength(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("up to date"),
    );
  });

  it("updates when outdated", () => {
    // npm ls returns version
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "ls") {
        return JSON.stringify({
          dependencies: { "@fml-inc/panopticon": { version: "0.1.4" } },
        });
      }
      // npm outdated exits 1 = outdated
      if (args[0] === "outdated") {
        const err = new Error("outdated") as Error & { status: number };
        err.status = 1;
        throw err;
      }
      return "";
    });

    bootstrapPanopticon();

    // Should have called npm install -g
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "@fml-inc/panopticon@latest"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Updating"),
    );
  });

  it("logs error but continues when install fails", () => {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "ls") throw new Error("not found");
      if (args[0] === "install") throw new Error("EACCES");
      return "";
    });

    // Should not throw
    bootstrapPanopticon();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to install"),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Install manually"),
    );
  });

  it("continues silently when outdated check fails with non-1 exit", () => {
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "ls") {
        return JSON.stringify({
          dependencies: { "@fml-inc/panopticon": { version: "0.1.7" } },
        });
      }
      // npm outdated fails with network error (not exit code 1)
      if (args[0] === "outdated") {
        const err = new Error("network error") as Error & { status: number };
        err.status = 2;
        throw err;
      }
      return "";
    });

    bootstrapPanopticon();

    // Should treat as "not outdated" — no install attempt
    const installCalls = mockExecFileSync.mock.calls.filter(
      (call: unknown[]) => {
        const args = call[1] as string[];
        return args[0] === "install";
      },
    );
    expect(installCalls).toHaveLength(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("up to date"),
    );
  });

  it("strips npm_config_registry from env", () => {
    process.env.npm_config_registry = "https://private.registry.com";

    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "ls") throw new Error("not found");
      return "";
    });

    bootstrapPanopticon();

    // All npm calls should have env without npm_config_registry
    for (const call of mockExecFileSync.mock.calls) {
      const opts = call[2] as { env?: Record<string, string> };
      expect(opts.env).toBeDefined();
      expect(opts.env!.npm_config_registry).toBeUndefined();
    }

    delete process.env.npm_config_registry;
  });
});
