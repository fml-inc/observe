# FML

Agent tools for AI coding assistants. FML provides a CLI for humans and agents, a [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins) for MCP tools, and command/skill routers for supported coding-agent harnesses. Local collection is powered by [Panopticon](https://github.com/fml-inc/panopticon).

## Install

```bash
npm install -g @fml-inc/fml
```

This installs the CLI package, registers Claude Code MCP tools, installs the FML command/skill surface for supported harnesses, and bootstraps Panopticon for local data collection. Start a new session to activate.

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

**Local observability** — Panopticon captures OpenTelemetry signals, hook events, session files, and API traffic from supported local agent harnesses into a SQLite database.

**MCP tools in Claude Code** — Claude Code gets FML tools to query sessions, costs, activity, connected integrations, messages, config snapshots, and team workflows directly in conversation.

**Command and skill surface** — Installed Claude Code, Codex, and Pi harnesses get an `fml` skill, and Claude Code/Pi also get an `fml` command or prompt. Use `/fml <command>` in Claude Code or `$fml <command>` where skill invocation is supported to route FML commands from inside an agent session.

**Local passthrough** — Add `--local` to common read commands, or use `fml local <command>`, to query the local Panopticon database without switching to a separate Panopticon command surface.

**Cloud sync** — Optionally sync local data to the FML dashboard for team-wide visibility, config snapshots, and automations.

## MCP tools

These tools are available to Claude Code through the plugin. Other harnesses can use the `fml` skill/router and the CLI catalog below.

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

For agents or scripts that need backend tools not exposed as dedicated MCP tools, use the dynamic CLI catalog:

```bash
fml tools list --json
fml tools describe <tool-name> --json
fml tools call <tool-name> --args '{"key":"value"}'
```

## CLI

```
fml install              Register plugin, commands, skills, hooks, and daemons
fml uninstall            Remove plugin, commands, skills, and hooks
  --target <t>           Target: claude, gemini, codex, claude-desktop, pi, all
  --purge                Also remove all data, logs, and auth tokens
fml update               Update to the latest version

fml login                Sign in to your FML account
fml logout               Sign out and clear credentials
fml org [slug]           Show or select organization
fml status               Show auth and daemon status
fml doctor               Check configuration and connectivity

fml open                 Open FML dashboard in browser
fml start                Start local collection and sync
fml stop                 Stop local collection and sync
fml local <cmd>          Run a local Panopticon command through FML
fml local -- <cmd> ...    Pass flags like --help through to the local command

fml tools                List backend tools from the dynamic catalog
fml tools list           List backend tools from the dynamic catalog
fml tools describe <n>   Show a backend tool schema
fml tools call <n>       Invoke a backend tool with JSON args

fml activity             Activity summary
  --since <duration>     Time window (e.g. "24h", "7d")
fml sessions             List recent sessions
fml timeline <id>        Events for a session
fml spending             Token usage and cost breakdown
fml search <query>       Search across sessions
  --local                Use local Panopticon data instead of FML cloud

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
