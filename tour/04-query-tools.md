---
title: Query your team's tools
order: 4
requires: integration
tryClaude: Pick one integration the state check found connected and run a small real query against it (for example recent Sentry issues, or recent messages from a Slack channel). Show a compact result and note that this works mid-task in any conversation.
tryCli: fml tools list
---
Once your org connects integrations in the dashboard, Claude can query them directly in conversation:

- `fml_query_sentry` — recent errors, issue details
- `fml_query_slack` — channel history, specific messages
- `fml_query_github`, `fml_query_linear`, `fml_query_notion`, `fml_query_stripe`, `fml_query_freshdesk`

This is what "agents with context" means in practice: while fixing a bug, Claude can pull the Sentry stack trace, find the Slack thread where it was reported, and check the Linear issue — without you tab-switching to copy-paste any of it.
