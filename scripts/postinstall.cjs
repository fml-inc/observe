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

// npm runs lifecycle scripts with *piped* stdio by default — the output is
// captured and replayed after the script finishes. That hides our install
// logs and, worse, makes `process.stdin.isTTY` false inside `fml install`,
// so the auto-login branch never fires even when the user is sitting at a
// real terminal.
//
// Open /dev/tty directly and hand it to the child so `fml install` sees a
// TTY and can prompt. Falls back to stdio:"inherit" on platforms or
// environments where /dev/tty isn't available (Windows, CI, docker build,
// detached processes — auto-login is correctly skipped in all of those).
//
// No timeout: a real-terminal install will sit on the device-flow prompt
// until the user pastes the code, which can take longer than any sane
// fixed timeout.
let stdio = "inherit";
let ttyFd;
try {
  ttyFd = fs.openSync("/dev/tty", "r+");
  stdio = [ttyFd, ttyFd, ttyFd];
} catch {
  // /dev/tty unavailable — keep stdio:"inherit"
}

try {
  execFileSync(process.execPath, [distEntry], { stdio });
} catch {
  // Best-effort: never fail install over a postinstall hook.
} finally {
  if (ttyFd !== undefined) {
    try {
      fs.closeSync(ttyFd);
    } catch {}
  }
}
