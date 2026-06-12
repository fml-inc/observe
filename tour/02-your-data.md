---
title: Your data — what's local, what's uploaded
order: 2
requires: synced
tryClaude: Call list_engineering_sessions with limit 3, then get_session_timeline for the most recent one. Frame the result as "this is exactly what synced to your org's workspace — you can audit any session like this, anytime."
tryCli: fml sessions
---
FML is local-first. Collection runs on your machine and writes to a local SQLite database: telemetry signals, hook events, session transcripts, and API traffic from Claude Code, Gemini CLI, and Codex CLI.

**Sync is on by default.** `fml install` configures uploads to your org's FML workspace, and once credentials are available (GitHub auth or `fml login`) your sessions sync automatically. `fml sync status` shows exactly where data goes.

**Session content is what syncs** — because context is the point. FML reconstructs intent — what was asked, what the agent did, and why — into a context graph your team's agents draw from. That takes the substance of a session: the prompts, messages, and tool calls that `fml timeline` shows. Synced sessions are visible to teammates with org access; raw API traffic stays local and never uploads.

**And it's auditable.** `fml sessions` and `fml timeline <id>` query your org's workspace — they show you precisely what has been uploaded, nothing hidden. The local database stays on your disk whether or not you sync.

You stay in control:

- `fml status` — your environment, account, and org at a glance
- `fml stop` — pause local collection and sync entirely
- `fml sync stop` — keep collecting locally, stop uploading
- `fml uninstall --purge` — remove everything, including local data
