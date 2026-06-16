import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "smol-toml";
import { resolveBin } from "./bin-utils.js";

const DEFAULT_CODEX_DIR = path.join(os.homedir(), ".codex");

function codexDir(): string {
  return process.env.FML_CODEX_DIR ?? DEFAULT_CODEX_DIR;
}

export function codexConfigPath(): string {
  return path.join(codexDir(), "config.toml");
}

function readTomlFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

function writeTomlFile(filePath: string, data: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${stringify(data)}\n`);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isCodexPresent(): boolean {
  return !!resolveBin("codex") || fs.existsSync(codexDir());
}

export interface CodexMcpConfigResult {
  status: "installed" | "removed" | "skipped" | "error";
  configPath: string;
  detail: string;
}

export function installCodexMcp(pluginRoot: string): CodexMcpConfigResult {
  const configPath = codexConfigPath();
  if (!isCodexPresent()) {
    return {
      status: "skipped",
      configPath,
      detail: "Codex CLI not found",
    };
  }

  try {
    const config = readTomlFile(configPath);
    const servers = asRecord(config.mcp_servers) ?? {};
    const existingFml = asRecord(servers.fml) ?? {};
    servers.fml = {
      ...existingFml,
      command: "node",
      args: [path.join(pluginRoot, "bin", "mcp-server")],
    };
    config.mcp_servers = servers;
    writeTomlFile(configPath, config);
    return {
      status: "installed",
      configPath,
      detail: `Configured ${configPath}`,
    };
  } catch (err) {
    return {
      status: "error",
      configPath,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface CodexMcpCheckResult {
  status: "ok" | "warn" | "fail";
  detail: string;
}

export function checkCodexMcp(): CodexMcpCheckResult {
  if (!isCodexPresent()) {
    return { status: "ok", detail: "Codex CLI not found, skipping" };
  }

  const configPath = codexConfigPath();
  let config: Record<string, unknown>;
  try {
    config = readTomlFile(configPath);
  } catch (err) {
    return {
      status: "warn",
      detail: `Could not read ${configPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  const servers = asRecord(config.mcp_servers);
  const fml = asRecord(servers?.fml);
  if (!fml) {
    return {
      status: "warn",
      detail: `Missing mcp_servers.fml in ${configPath}. Run \`fml install\``,
    };
  }

  const command = fml.command;
  const args = fml.args;
  if (typeof command !== "string" || !Array.isArray(args)) {
    return {
      status: "warn",
      detail: `mcp_servers.fml is malformed in ${configPath}. Run \`fml install --force\``,
    };
  }

  const mcpBin = args.find((arg): arg is string => typeof arg === "string");
  if (!mcpBin) {
    return {
      status: "warn",
      detail: `mcp_servers.fml has no server path in ${configPath}. Run \`fml install --force\``,
    };
  }

  if (!fs.existsSync(mcpBin)) {
    return {
      status: "warn",
      detail: `Configured server path does not exist: ${mcpBin}`,
    };
  }

  return { status: "ok", detail: `Configured in ${configPath}` };
}

export function uninstallCodexMcp(): CodexMcpConfigResult {
  const configPath = codexConfigPath();
  if (!fs.existsSync(configPath)) {
    return {
      status: "skipped",
      configPath,
      detail: "Codex config not found",
    };
  }

  try {
    const config = readTomlFile(configPath);
    const servers = asRecord(config.mcp_servers);
    if (!servers?.fml) {
      return {
        status: "skipped",
        configPath,
        detail: "mcp_servers.fml not present",
      };
    }

    delete servers.fml;
    if (Object.keys(servers).length === 0) {
      delete config.mcp_servers;
    }
    writeTomlFile(configPath, config);
    return {
      status: "removed",
      configPath,
      detail: `Removed mcp_servers.fml from ${configPath}`,
    };
  } catch (err) {
    return {
      status: "error",
      configPath,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
