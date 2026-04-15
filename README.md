# FML

Agent tools for AI coding assistants. Installs as a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) with MCP tools for session analytics, cost tracking, integrations, and team workflows — powered by [Panopticon](https://github.com/fml-inc/panopticon) for local data collection.

## Install

```bash
npm install -g @fml-inc/fml
```

This installs the plugin, registers hooks and MCP tools in Claude Code, and bootstraps Panopticon for local data collection. Start a new session to activate.

Then sign in:

```bash
fml login
```

## For LLM agents

Setting up FML from inside a coding-agent sandbox (Claude Code, Codex, Gemini CLI, etc.)? Paste this to your agent:

```
Follow the installation instructions here: https://github.com/fml-inc/observe/blob/main/docs/agent_installation_guide.md
```

The guide covers: `npm install -g @fml-inc/fml` → `fml install` → `fml login --device` (the agent relays the verification URL to you, you paste the code back) → `fml doctor`. No browser, no `gh` CLI, no manual shell-profile edits needed.

## What it does

**Local observability** — Panopticon captures OpenTelemetry signals, hook events, session files, and API traffic from Claude Code, Gemini CLI, and Codex CLI into a local SQLite database.

**MCP tools for your agent** — Once installed, Claude Code gets tools to query your sessions, costs, activity, and connected integrations directly in conversation.

**Cloud sync** — Optionally sync local data to the FML dashboard for team-wide visibility, config snapshots, and automations.

## MCP tools

These tools are available to Claude Code via the plugin:

| Tool | Description |
|------|-------------|
| `get_engineering_activity` | Activity summary — sessions, prompts, tools, costs |
| `list_engineering_sessions` | List recent sessions with stats |
| `search_engineering_sessions` | Search across all sessions |
| `get_session_timeline` | Messages and tool calls for a session |
| `get_session_turns` | Per-turn token usage for a session |
| `get_ai_spending` | Token usage and cost breakdowns |
| `whoami` | Current auth and org status |
| `fml_list_integrations` | Connected integrations (Slack, GitHub, Linear, Sentry, etc.) |
| `fml_query_*` | Query connected integrations directly |
| `fml_list_messages` | Conversation messages |
| `fml_search_analysis` | Search codebase analysis results |
| `fml_run_analysis_workflow` | Run deep analysis workflows |
| `fml_list_skills` | Browse and load skills |
| `list_repo_configs` | Team config snapshots |

## CLI

```
fml install              Register plugin, hooks, and daemons
fml uninstall            Remove plugin and hooks
  --target <t>           Target: claude, gemini, codex, claude-desktop, all
  --purge                Also remove all data, logs, and auth tokens
fml update               Update to the latest version

fml login                Sign in to your FML account
fml logout               Sign out and clear credentials
fml org [slug]           Show or select organization
fml status               Show auth and daemon status
fml doctor               Check configuration and connectivity

fml open                 Open FML dashboard in browser
fml start                Start panopticon server
fml stop                 Stop panopticon server

fml activity             Activity summary
  --since <duration>     Time window (e.g. "24h", "7d")
fml sessions             List recent sessions
fml timeline <id>        Events for a session
fml spending             Token usage and cost breakdown
fml search <query>       Search across sessions

fml sync setup           Configure sync targets
fml sync list            List sync targets
fml sync add <n> <url>   Add a sync target
fml sync remove <name>   Remove a sync target
fml sync status          Show sync status
fml sync reset [name]    Reset sync watermarks
```

## Development

```bash
pnpm install       # Install dependencies
pnpm dev           # Watch mode (tsup)
pnpm test          # Run tests (Vitest)
pnpm type-check    # Type check
```

To test the full install flow:

```bash
pnpm build && pnpm pack
npm install -g ./fml-inc-fml-*.tgz
fml install
```

## License

Proprietary — see [LICENSE](LICENSE).
