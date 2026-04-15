# Installing FML from an agent sandbox

Run-this-then-run-that instructions for coding agents (Claude Code, Codex, Gemini CLI, etc.) operating inside a sandbox or container. Every command is non-interactive and idempotent; you can re-run the whole sequence if something fails partway.

If you are a human, read the top-level `README.md` instead.

---

## TL;DR — copy-paste to install and sign in

```bash
# 1. Install the CLI globally.
npm install -g @fml-inc/fml

# 2. Register plugin, hooks, MCP tools, and panopticon daemon.
#    `gh` / GitHub token is NOT required.
fml install

# 3. Sign in. Use --device; sandboxes can't open a browser.
#    This prints a URL — paste it to the human user who invoked you,
#    ask them to sign in, then paste the confirmation code back into
#    your stdin. Do not try to open the URL yourself.
fml login --device

# 4. Verify everything is wired up.
fml doctor
```

If every line of `fml doctor` is `ok` or `warn`, you are done.

---

## What each step is for

### `npm install -g @fml-inc/fml`

Installs the CLI binary. After this command, the `fml` binary is on `$PATH`. If the install fails with a 401 on `@fml-inc/*`, the sandbox's npm registry isn't authenticated — stop and surface that to the user.

### `fml install`

Registers the plugin, skills, and hooks into whichever coding-agent CLIs are present (Claude Code, Codex, Gemini, Claude Desktop) and starts the local panopticon daemon on `127.0.0.1:4318`.

Expected behavior in a sandbox:

- Step 5 ("Configuring sync target") prints `Auth: not configured — run fml login to enable sync.` **This is normal and expected when `gh` is not installed.** Do not try to install `gh` or run `fml sync setup`; the next step will configure sync for you.
- The banner prints `Done! Start a new coding session to activate.`

Do not restart your own session — you cannot. Subsequent steps work regardless.

### `fml login --device`

Device authorization flow. The CLI prints a verification URL and then blocks on stdin waiting for a confirmation code. The dance:

1. The CLI prints a line like `Paste this URL in your browser to sign in: https://...`.
2. Relay that exact URL to the user. Do **not** rewrite it, summarize it, or open it yourself — you don't have a browser.
3. Wait for the user to paste back a confirmation code (looks like `XXXX-XXXX`).
4. Pipe the code into the CLI's stdin. The CLI polls the server and, on success, prints `Logged in as <name> (<email>)` followed by org selection and (in a sandbox) `Sync target "fml" now using fml sync-token. Restart panopticon to apply: fml stop && fml start`.

Run the restart command if it appears:

```bash
fml stop && fml start
```

### `fml doctor`

Checks database, panopticon daemon, shell env, tool detection, auth, API reachability, sync, Sentry. You want all entries marked ok (or warn with the message "No events recorded yet", which is benign on a brand-new install).

`fml doctor --json` is available if you want to parse the output programmatically.

---

## Common failure modes and what to do

**`fml login` prints `Failed to parse URL from /api/auth/device/code`.**
You're on an old CLI. Upgrade: `npm install -g @fml-inc/fml@latest` and retry. If you cannot upgrade, export the URL explicitly as a one-off:
```bash
export FML_CONVEX_URL=https://trustworthy-chihuahua-382.convex.cloud
fml login --device
```

**`fml install` prints `warn: claude CLI not found`.**
Harmless in a sandbox — you are the coding agent, there's no separate `claude` CLI to register plugins into. Continue.

**`fml login --device` times out waiting for a code.**
The CLI blocks up to ~15 minutes. If the user didn't paste a code in time, re-run `fml login --device` to start a fresh flow. Don't retry in a tight loop.

**`fml doctor` shows `Auth — No token stored`.**
`fml login --device` wasn't completed. Re-run it.

**`fml doctor` shows `API — Unreachable`.**
Network issue, not an auth issue. Report the exact detail line to the user and stop — don't try to retry indefinitely.

**`npm install -g` fails with `EACCES`.**
The sandbox doesn't allow global installs as your user. Try `npm install -g @fml-inc/fml --prefix ~/.local` and add `~/.local/bin` to `$PATH` for the current shell. If that also fails, surface the error to the user.

---

## Rules for agents

- **Do not modify `.bashrc`, `.zshrc`, or shell profiles yourself.** `fml install` does this once, cleanly; a second pass is not needed.
- **Do not export `PANOPTICON_GITHUB_TOKEN` or try `gh auth login`.** Sandboxes don't have a human-attached GitHub session. `fml login --device` uses a first-class FML session token instead, which carries the same user attribution.
- **Do not run `fml install` a second time** unless the first call failed. It's idempotent but noisy.
- **Do not open the device-authorization URL yourself.** Relay it; only the human can complete the browser half of the flow.
- **Do not paste or log the contents of `~/.local/share/fml/auth.fml.json`.** That file holds the signed-in user's credentials.
- If `fml login --device` hangs, check that the user actually saw the URL. Agents sometimes suppress long output — if yours does, print the URL on its own line before the CLI does, so the user can't miss it.

---

## What's available after a successful install

Once `fml doctor` is green, your coding-agent session has a set of MCP tools in the `fml` namespace: `get_engineering_activity`, `list_engineering_sessions`, `search_engineering_sessions`, `get_session_timeline`, `get_ai_spending`, `whoami`, `fml_list_integrations`, and others. Call them the same way you'd call any other MCP tool. See `README.md` for the full list.

CLI commands you'll use most from an agent session:

| Command | Use |
|---|---|
| `fml status` | Quick auth + daemon status. Cheaper than `doctor`. |
| `fml org [slug]` | Show selected org, or switch to another. |
| `fml sync status` | See what's queued for upload and whether it's flowing. |
| `fml activity --since 24h` | Recent activity summary in human-readable form. |
| `fml logout` | Clear credentials. Use when switching users inside a sandbox. |
