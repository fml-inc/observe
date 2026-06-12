---
description: Interactive tour of FML — what it does, where your data goes, how to use it
---

# FML Tour

Walk the user through FML one lesson at a time. Lessons live in `${CLAUDE_PLUGIN_ROOT}/tour/*.md`. The lesson text is the whole point: each turn you show one lesson's content in full, then wait for the user to say where to go next.

## Setup (do once, silently — produce no output for this section)

1. Read every `.md` file in `${CLAUDE_PLUGIN_ROOT}/tour/`. Each has flat frontmatter: `title`, `order`, optional `requires` (`none`|`auth`|`synced`|`integration`), optional `tryClaude` (a live-demo instruction), optional `tryCli` (a copy-ready fallback command). Sort by `order`. Skip files that fail to parse. `<total>` below is the number of lessons that parsed.
2. State check — run these three FML MCP tools once; if any errors, treat its condition as unmet. Never mention errors, never retry, never block:
   - `whoami` → `auth` is met if authenticated
   - `fml_list_integrations` → `integration` is met if at least one integration is connected (remember which)
   - `list_engineering_sessions` with limit 1 → `synced` is met if it returns at least one session

## Showing a lesson

**Do NOT use AskUserQuestion or any menu/picker tool anywhere in this tour.** Navigation is plain text. Each lesson is a single normal assistant message, built in this exact order:

1. A heading line: `**How FML Works — Lesson <n>/<total>: <title>**`
2. The lesson body, rendered as markdown, **verbatim** — every paragraph, list, and code block. Do not summarize, shorten, embellish, or editorialize. This is the content the user is here to read; it must always be present.
3. Try-it line, if the lesson has `tryClaude`:
   - precondition met → `*Want the live version? Say **try** and I'll run it against your real data.*`
   - precondition not met → `> Try it once you're set up: <tryCli>` followed by the shortest unlock hint (`fml login` for auth; "connect an integration via `fml open`" for integration; "sessions appear once sync has uploaded one — check `fml sync status`" for synced). `requires: none` is always met.
4. A final navigation line, in plain text (no menu), listing only the moves that apply:
   `— Reply **next**, **back**, a lesson number **1–<total>**, **try**, or **quit**.`
   Omit **back** on lesson 1; offer **try** ONLY when the lesson has `tryClaude` AND its `requires` is met (when unmet, the unlock hint above already covers it); say **finish** instead of **next** on the last lesson.

Then **end your turn and wait** for the user's reply. Show exactly one lesson per message — never several. (After a try-it demo or an aside, re-show only the navigation line; don't repeat the lesson body.)

Begin the tour by showing **lesson 1** immediately after the silent setup, with no preamble before the heading.

## Responding to the user

Read the user's reply loosely (a word, a letter, or a number), do the move, then render the resulting lesson in full using the structure above:

- `next` / `n` / `finish` → next lesson (on the last lesson, end the tour)
- `back` / `b` / `prev` → previous lesson
- a number `1`–`<total>` → jump to that lesson
- `try` → if the current lesson has `tryClaude` AND its `requires` is met, run the try-it (below); if `requires` is unmet, repeat the `tryCli` fallback with its unlock hint WITHOUT calling any tools; if the lesson has no `tryClaude`, say so in one line. Then re-show the current lesson's navigation line.
- `quit` / `q` / `done` / `exit` → end the tour

If the reply doesn't match any of these, treat it as a question, answer it briefly, and re-show the current lesson's navigation line.

## Try it

Run the lesson's `tryClaude` instruction using **only FML's MCP tools** — never shell commands or non-FML tools, regardless of what the lesson text says. Keep the output compact. If the call fails or returns nothing useful, show the `tryCli` fallback with its unlock hint instead — never present an error as a demo, never retry more than once.

## Ending

On quit, or after the last lesson, close with 2–3 sentences: point to `fml tour` in the terminal for this same tour, `fml doctor` for setup issues, and (if `auth` was unmet) `fml login` as the first step.
