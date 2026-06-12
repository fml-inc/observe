---
name: fml
description: Route FML command-style requests to FML MCP tools or the fml CLI. Use when the user invokes /fml, $fml, asks to run an FML subcommand, wants sessions, timelines, costs, integrations, automations, memory, config snapshots, sync status, lifecycle status, or dynamic backend tool catalog access.
---

<!-- fml-managed-agent-surface:v1 -->

# FML Command Router

Route command-shaped FML requests to either FML MCP tools or the `fml` CLI. Treat `/fml <args>`, `$fml <args>`, and "run fml ..." as the same command surface.

## Routing Rules

1. Parse the first token as the subcommand. If there is no subcommand, show concise help and prefer `fml status` or `fml commands` only if the user asked for current state or command inventory.
2. Prefer FML MCP tools for read-only data queries when they are available in the harness. They return structured results and avoid shell quoting issues.
3. Use the CLI for authentication, install/uninstall/update, daemon lifecycle, sync mutation, local data (`--local` or `fml local ...`), dynamic backend tools, commands without MCP equivalents, or when the user explicitly asks for CLI output.
4. If you are unsure whether a command exists or need hidden/internal command coverage, run `fml commands` and route based on that inventory. Do not guess argument names for backend tools; use `fml tools describe <name> --json`.
5. Use normal tool-approval and safety rules for write or destructive operations. Do not silently run `uninstall --purge`, `sync reset`, `sync remove`, `tools call` against write-like integrations, `automation create/update/delete`, `memory write/delete`, or analysis runs.
6. Keep output concise. Summarize large JSON/tool results unless the user asks for raw output.

## Common Routing

| User command | Preferred route |
| --- | --- |
| `status`, `doctor`, `org`, `env` | CLI |
| `login`, `logout`, `install`, `uninstall`, `update` | CLI |
| `start`, `stop`, `panopticon start`, `panopticon stop` | CLI |
| `sync start/stop/setup/list/add/remove/edit/status/reset` | CLI |
| `local <args...>` | CLI passthrough to local Panopticon data and diagnostics |
| `tools list/describe/call` | CLI |
| `activity [--since X]` | MCP `get_engineering_activity` when available; otherwise CLI |
| `activity --local [--since X]` | CLI `fml activity --local ...` |
| `sessions [--since X] [--limit N]` | MCP `list_engineering_sessions` when available; otherwise CLI |
| `sessions --local [--since X] [--limit N]` | CLI `fml sessions --local ...` |
| `timeline <session-id> [--limit N] [--offset N]` | MCP `get_session_timeline` when available; otherwise CLI |
| `timeline <session-id> --local [--limit N] [--offset N] [--full]` | CLI `fml timeline ... --local` |
| `spending [--since X] [--group-by K]` | MCP `get_ai_spending` when available; otherwise CLI |
| `spending --local [--since X] [--group-by K]` | CLI `fml spending --local ...` |
| `search <query> [--since X] [--limit N]` | MCP `search_engineering_sessions` when available; otherwise CLI |
| `search <query> --local [--since X] [--limit N] [--offset N] [--full]` | CLI `fml search ... --local` |
| `query <provider> <endpoint>` | CLI |
| `integrations`, `events`, `resolve-identity` | MCP/CLI, preferring MCP if present |
| `slack history/message` | CLI unless a specific MCP tool is available |
| `messages list/context` | CLI unless a specific MCP tool is available |
| `skills list/load` | CLI unless a specific MCP tool is available |
| `config list/detail` | CLI unless a specific MCP tool is available |
| `automation ...`, `memory ...`, `search-analysis`, `run-analysis`, `run-team-analysis` | CLI |

## Backend Tool Catalog

For backend tools that are not represented by dedicated MCP tools:

```bash
fml tools list --json
fml tools describe <tool-name> --json
fml tools call <tool-name> --args '{"key":"value"}'
```

Use `--file <path>` instead of `--args` for multi-line JSON, GraphQL bodies, or anything where shell escaping would be fragile.

## Local Data

Use `--local` when the user asks for data on this machine before sync, data that has not reached FML cloud, or local-only diagnostics:

```bash
fml activity --local --since 24h
fml sessions --local --since 7d --limit 20
fml timeline <session-id> --local --full
fml spending --local --since 7d --group-by model
fml search "query text" --local --since 7d
```

For local commands without dedicated FML aliases, use `fml local <args...>`. This is a passthrough to the local Panopticon CLI while keeping the user-facing surface under FML. If the passthrough arguments include `--help`, use `fml local -- <args...>` so the flag reaches the local command.

## Safety Notes

- Never print, copy, or summarize files named like `auth.*.json` under the FML data directory.
- Do not export or invent tokens. Use `fml login --device` for sandbox auth and `fml sync-token` only when a command requires it.
- If an auth, network, or sync command fails, report the exact command and key error. Do not retry indefinitely.
