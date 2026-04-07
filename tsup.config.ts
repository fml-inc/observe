import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

function getPluginVersion(): string {
  const { version } = JSON.parse(readFileSync("package.json", "utf-8"));
  if (version?.includes("+")) return version;
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
    }).trim();
    return `${version}+${sha}`;
  } catch {
    return version ?? "unknown";
  }
}

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "mcp/server": "src/mcp/server.ts",
    postinstall: "src/postinstall.ts",
  },
  define: {
    __FML_PLUGIN_VERSION__: JSON.stringify(getPluginVersion()),
    __SENTRY_DSN__: JSON.stringify(
      "https://4c243521c03917c886d0bf33bc0038c8@o4510167429873664.ingest.us.sentry.io/4511078213156864",
    ),
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  splitting: true,
  clean: true,
  sourcemap: true,
  shims: true,
  noExternal: ["@sentry/core"],
  external: ["better-sqlite3", /^@fml-inc\/panopticon/],
});
