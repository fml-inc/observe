---
title: Three ways to use FML
order: 3
---
FML shows up in three places. Knowing which to reach for is most of the learning curve:

1. **The `fml` CLI** — setup and inspection. `fml login`, `fml status`, `fml doctor` when something looks off, and quick checks like `fml activity --since 7d`.
2. **Inside the agent harness** — where the value compounds. Install once and FML rides along in Claude Code, Gemini CLI, and Codex CLI: hooks capture sessions and inject relevant history automatically — recent work at session start, prompt-matched context mid-task. In Claude Code, the plugin also gives the agent FML tools, so "check Sentry for errors from this deploy" just works, in conversation.
3. **The dashboard** (`fml open`) — org-level views: team activity, spend, automations. Connecting a new tool (Slack, Linear, Sentry…) happens here.

Rule of thumb: set up and debug in the CLI, just work in your agent — FML rides along — and administrate in the dashboard.
