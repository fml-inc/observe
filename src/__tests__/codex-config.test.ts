import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import {
  checkCodexMcp,
  codexConfigPath,
  installCodexMcp,
  uninstallCodexMcp,
} from "../codex-config.js";

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

describe("Codex MCP config", () => {
  let tmpCodexDir = "";
  let tmpPluginRoot = "";

  afterEach(() => {
    delete process.env.FML_CODEX_DIR;
    for (const dir of [tmpCodexDir, tmpPluginRoot]) {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpCodexDir = "";
    tmpPluginRoot = "";
  });

  function setupDirs() {
    tmpCodexDir = fs.mkdtempSync(path.join(os.tmpdir(), "fml-codex-"));
    tmpPluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fml-plugin-"));
    process.env.FML_CODEX_DIR = tmpCodexDir;
    fs.mkdirSync(path.join(tmpPluginRoot, "bin"), { recursive: true });
    fs.writeFileSync(path.join(tmpPluginRoot, "bin", "mcp-server"), "");
  }

  it("adds fml MCP server and preserves existing servers", () => {
    setupDirs();
    fs.writeFileSync(
      codexConfigPath(),
      [
        'model = "gpt-5.5"',
        "",
        "[mcp_servers.panopticon]",
        'command = "node"',
        'args = ["/opt/panopticon/bin/mcp-server"]',
        "",
      ].join("\n"),
    );

    const result = installCodexMcp(tmpPluginRoot);
    expect(result.status).toBe("installed");

    const config = parse(fs.readFileSync(codexConfigPath(), "utf-8"));
    const servers = asRecord(asRecord(config).mcp_servers);
    expect(asRecord(servers.panopticon).args).toEqual([
      "/opt/panopticon/bin/mcp-server",
    ]);
    expect(asRecord(servers.fml)).toMatchObject({
      command: "node",
      args: [path.join(tmpPluginRoot, "bin", "mcp-server")],
    });
    expect(checkCodexMcp().status).toBe("ok");
  });

  it("warns when Codex is present but fml MCP is missing", () => {
    setupDirs();

    const result = checkCodexMcp();
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("mcp_servers.fml");
  });

  it("does not replace malformed Codex config during install", () => {
    setupDirs();
    fs.writeFileSync(codexConfigPath(), "[mcp_servers.fml\n");

    const result = installCodexMcp(tmpPluginRoot);
    expect(result.status).toBe("error");
    expect(fs.readFileSync(codexConfigPath(), "utf-8")).toBe(
      "[mcp_servers.fml\n",
    );
  });

  it("removes only fml MCP server on uninstall", () => {
    setupDirs();
    fs.writeFileSync(
      codexConfigPath(),
      [
        "[mcp_servers.panopticon]",
        'command = "node"',
        'args = ["/opt/panopticon/bin/mcp-server"]',
        "",
      ].join("\n"),
    );
    installCodexMcp(tmpPluginRoot);

    const result = uninstallCodexMcp();
    expect(result.status).toBe("removed");

    const config = parse(fs.readFileSync(codexConfigPath(), "utf-8"));
    const servers = asRecord(asRecord(config).mcp_servers);
    expect(servers.fml).toBeUndefined();
    expect(asRecord(servers.panopticon).command).toBe("node");
  });
});
