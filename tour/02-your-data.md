---
title: Your data — what's local, what's uploaded
order: 2
requires: synced
tryClaude: Call list_engineering_sessions with limit 3, then get_session_timeline for the most recent one. Frame the result as "this is exactly what synced to your org's workspace — you can audit any session like this, anytime."
tryCli: fml sessions
---
FML is local-first. Collection runs on your machine and writes to a local SQLite database: telemetry signals, hook events, session transcripts, and API traffic from Claude Code, Gemini CLI, and Codex CLI.

**Sync is on by default.** `fml install` configures uploads to your org's FML workspace, and once credentials are available (GitHub auth or `fml login`) your sessions sync automatically — powering shared dashboards, history, and automations. `fml sync status` shows exactly where data goes.

**What uploads is session content, not just counts.** The prompts, messages, and tool calls of your agent sessions — what `fml timeline` displays — are uploaded and readable by teammates with org access. Credentials and auth headers are stripped at capture; the conversation itself is not redacted.

**And it's auditable.** `fml sessions` and `fml timeline <id>` query your org's workspace — they show you precisely what has been uploaded, nothing hidden. The local database stays on your disk whether or not you sync.

You stay in control:

- `fml status` — your environment, account, and org at a glance
- `fml stop` — pause local collection and sync entirely
- `fml sync stop` — keep collecting locally, stop uploading
- `fml uninstall --purge` — remove everything, including local data
