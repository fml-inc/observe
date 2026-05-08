#!/usr/bin/env node
// Cross-platform npm/pnpm postinstall entry. The bash form
// `[ ! -d dist ] || (node ./dist/postinstall.js && ...)` doesn't work on
// Windows cmd.exe, so we do the existence check in Node.
//
// dist/postinstall.js → calls `fml install`, which handles claude plugin
// registration. No need to invoke `claude` again from here.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const distEntry = path.resolve(__dirname, "..", "dist", "postinstall.js");
if (!fs.existsSync(distEntry)) {
  // Source repo before first build — nothing to do.
  process.exit(0);
}

try {
  execFileSync(process.execPath, [distEntry], {
    stdio: "inherit",
    timeout: 120_000,
  });
} catch {
  // Best-effort: never fail install over a postinstall hook.
}
