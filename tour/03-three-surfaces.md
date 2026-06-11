---
title: Three ways to use FML
order: 3
---
FML shows up in three places. Knowing which to reach for is most of the learning curve:

1. **The `fml` CLI** — setup and inspection. `fml login`, `fml status`, `fml doctor` when something looks off, and quick checks like `fml activity --since 7d`.
2. **The Claude Code plugin** — where the value compounds. Claude gets FML tools and uses them mid-task: "check Sentry for errors from this deploy" just works, in conversation.
3. **The dashboard** (`fml open`) — org-level views: team activity, spend, automations. Connecting a new tool (Slack, Linear, Sentry…) happens here.

Rule of thumb: set up and debug in the CLI, work in Claude Code, administrate in the dashboard.
