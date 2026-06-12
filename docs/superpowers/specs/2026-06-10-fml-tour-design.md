# FML `/tour` — Design

**Date:** 2026-06-10
**Status:** Approved (pending implementation plan)
**Implementation repo:** `github.com/fml-inc/observe` (NOT this monorepo — see Repo section)

## Goal

A guided, navigable walkthrough of FML for new and curious users, inspired by cowboy CLI's `/walkthrough` (lesson-by-lesson tour with enter/p/1-9/q navigation). Two surfaces, one content source:

1. **`fml tour`** — a TUI walkthrough in the fml CLI
2. **`/tour`** — a Claude Code plugin slash command

The tour is a **capability tour** (what FML does and how to drive it), not a stateful onboarding flow — usable at any time, by any user, logged in or not. It is built around the three real new-user anxieties: *can I trust this* (what data is uploaded vs. local), *how do I hold it* (CLI vs. plugin vs. dashboard confusion), and *how do I get started*.

## Repo

The fml CLI and Claude Code plugin both live in `fml-inc/observe` (published as npm package `@fml-inc/fml`, exposing `bin/fml` and `bin/mcp-server`; the Claude plugin manifest is generated at build time by `scripts/generate-plugin-manifest.js`). All implementation work happens there. There is currently no local clone — implementation starts by cloning it.

Note: `packages/cli` in the fml monorepo is dead (removed from main in #916); do not resurrect it.

## Shared lesson content

`tour/*.md` at the observe repo root, shipped in the npm package (added to `files` in package.json). Numbered markdown files with frontmatter:

```yaml
---
title: Skills
order: 6
tryIt:
  requires: auth          # none | auth | synced | integration
  claude: "Call fml_list_skills and summarize what's available to this org."
  cli: "fml skills list"  # copy-ready example; also the fallback shown when gated
---
Lesson body in plain markdown. Limited subset: paragraphs, bold, lists, code blocks.
```

`tryIt` is optional (lessons 1, 3, 8 have none). `requires` declares the precondition for a *live* demo; when unmet, both surfaces show the `cli` example plus a one-line unlock hint instead.

### Lesson arc (8 lessons)

| # | Lesson | tryIt requires | Notes |
|---|--------|----------------|-------|
| 1 | What is FML? | — | Value prop: stop paying agents to rediscover your codebase. Intelligence layer framing. |
| 2 | Your data: what's local, what's uploaded | `synced` | Local-first observation, redaction, what syncs, who in the org sees it, how to pause (`fml stop` / `fml sync stop`). Demo = audit exactly what synced to the org workspace (session list + timeline) — the session-data tools query the backend, so the demo is an upload audit, NOT local inspection. Transparency framing, never surveillance framing. |
| 3 | Three ways to use FML | — | CLI (setup/status/data) vs. Claude Code plugin (`/fml`, tools mid-task) vs. dashboard (org views, connecting integrations). One sentence each on when to reach for which. |
| 4 | Query your team's tools | `integration:*` | Slack, Linear, Sentry, GitHub, Stripe, Notion, Freshdesk. |
| 5 | Engineering history & AI spend | `synced` | Session search, timelines, spend tracking. |
| 6 | Skills | `auth` | Org knowledge that loads on demand. |
| 7 | Automations & analysis workflows | — | No live demo: analysis/automation results are empty for most orgs, which is the bad-demo experience the gating exists to avoid. |
| 8 | Getting started | — | Ordered checklist: `fml login` → `fml doctor` → connect integrations in dashboard → first query to try. The action item they leave on. |

Lessons 1–3 establish trust and mental model; 4–7 are capabilities; 8 converts.

### Copy constraints

- **Lesson 2 must be written from the actual sync/redaction code**, not assumptions. If prompts or file contents are uploaded, the lesson says so plainly. Verify claims against `src/sync/` and any redaction logic before writing copy. A trust lesson discovered to be glossy is worse than none.
- Tone throughout: calm, factual, Linear-style documentation voice. Especially lesson 2 — documentation, not reassurance marketing.
- Final lesson copy is an implementation-phase task; the arc above is fixed.

## Surface 1: `fml tour` (TUI)

New commander command in `src/commands/tour.ts`.

- **No Ink/React.** Hand-rolled pager (~150 lines): alternate screen buffer, raw-mode keypress handling, existing CLI color utils for rendering.
- Layout mirrors cowboy: header `How FML Works — Lesson n/8: <title>`, rendered lesson body, footer `enter next · p prev · 1-8 jump · q quit`.
- Navigation is a pure state machine (lesson index × keypress → new index | exit) so it is unit-testable without a TTY.
- Read-only: where a lesson has `tryIt`, render a `Try it:` line with the `cli` example. No network calls, no auth required, works immediately after install.

## Surface 2: `/tour` (Claude Code plugin command)

`commands/tour.md` added to the plugin (wired into the generated manifest / package `files`). The command instructs Claude to:

1. Read all lesson files from the plugin root; sort by `order`.
2. Run a **one-time state check**: `whoami` + `fml_list_integrations`. Tool failure ⇒ treat as logged out. Never fatal, never repeated per-lesson.
3. Present lessons one at a time. After each, offer navigation: **Next** / **Try it now** (only when the lesson's `requires` is satisfied by the state check) / **Back** / **Jump to lesson…** / **Quit**. *(Implementation note: originally specified as an AskUserQuestion arrow-key menu; replaced during implementation with plain typed replies — the menu suppressed the lesson body and double-numbered jump targets. See plan deviation 7.)*
4. **Try it now** executes the lesson's `claude` instruction against real tools and shows the result. Any failure degrades to the `cli` example + unlock hint and the tour continues.

Live demos exist **only** on this surface (Claude Code is where the tools run). The data-availability ladder this gating handles:

1. Installed, not logged in → fully read-only tour
2. Logged in, nothing connected → `auth` demos work (skills, whoami)
3. Synced (logged in + sync has uploaded at least one session) → lesson 2 and 5 demos work; they audit the uploaded data itself, since all session-data tools query the backend
4. Integrations connected → lesson 4 demos work

Note: the surfaced slash-command name may be `/tour` or `/fml:tour` depending on Claude Code's plugin-command namespacing — verify after a local install and use the observed name in all user-facing copy.

## Error handling

- A lesson file that fails to parse is skipped: TUI prints a warning to stderr on exit; Claude skips silently.
- The tour never blocks on network or auth. Worst case on every path is the read-only tour with copy-ready examples.

## Testing

Vitest (already configured in observe):

- Lesson loader: frontmatter parsing, ordering, `requires` enum validation, optional `tryIt`.
- Shipped-content test: every file in `tour/` parses and has a unique `order`.
- TUI navigation reducer: next/prev bounds, jump in/out of range, quit.
- `/tour` command verified manually after a local plugin install (no automated harness for Claude-side behavior).

## Decisions log

- Both surfaces in one build, shared lesson source (rejected: plugin-first or TUI-first sequencing).
- Lessons bundled in the npm package (rejected: backend-served lessons — adds auth/network to first-run, remote updatability not needed; tour content versions with the plugin it describes).
- Capability tour, not onboarding flow (rejected: setup-gated tour).
- Live "try it" in Claude Code only, precondition-gated per lesson (rejected: read-only everywhere — never proves FML on the user's own data; rejected: ungated live demos — empty-result demos on fresh orgs are a bad first impression).
- Observation lesson framed as transparency/inspection, not "FML is already watching."
- No Ink dependency for the TUI (rejected: Ink — pulls React into a CLI with no React for what is a simple pager).
