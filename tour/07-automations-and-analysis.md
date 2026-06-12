---
title: Automations & analysis
order: 7
---
Two ways FML works while you're not looking:

**Automations** — scheduled or event-triggered agents, managed in the dashboard: a daily digest of yesterday's engineering activity, or a watcher that fires when a deploy event arrives.

**Analysis workflows** — deep codebase analyses across security, architecture, performance, and code quality. Claude runs them with `fml_run_analysis_workflow`, and results stay searchable via `fml_search_analysis` — so "what did the last security analysis flag?" is answerable in conversation later.

To see your org's automations from the terminal:

```
fml automation list
```
