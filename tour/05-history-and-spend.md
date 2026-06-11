---
title: Engineering history & AI spend
order: 5
requires: synced
tryClaude: Call get_engineering_activity for the last 7 days and summarize sessions, tool usage, and cost in two sentences.
tryCli: fml activity --since 7d
---
Because FML observes your sessions and syncs them to your workspace, your engineering history becomes queryable:

- `fml sessions` — recent sessions with stats
- `fml search <query>` — "when did we touch the auth flow?"
- `fml timeline <session-id>` — every message and tool call in a session
- `fml spending --since 7d` — token usage and cost by session, model, or day

The same data is available to Claude as tools, so "what did I work on yesterday?" or "how much did we spend on AI this week?" get answered from your own history.
