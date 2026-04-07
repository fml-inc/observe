#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";

const manifest = {
  name: "fml",
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
