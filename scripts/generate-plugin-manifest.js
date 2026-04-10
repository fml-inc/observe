#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const manifest = {
  name: "fml",
  version: pkg.version,
  description: "FML agent tools for Claude Code",
  mcpServers: {
    fml: {
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/bin/mcp-server"],
    },
  },
};

mkdirSync(".claude-plugin", { recursive: true });
writeFileSync(
  ".claude-plugin/plugin.json",
  `${JSON.stringify(manifest, null, 2)}\n`,
);
