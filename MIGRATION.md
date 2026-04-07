# packages/cli → fml Migration Tracker

## Completed

| Old CLI               | fml                                 | Notes                                    |
| --------------------- | ----------------------------------- | ---------------------------------------- |
| `scanner.ts`          | panopticon `src/scanner.ts`         | Redesigned with layers, new config types |
| `redact.ts`           | `src/snapshot.ts`                   | Merges user + project layers             |
| `api.ts`              | `src/convex-client.ts`              | Factory pattern (`createApiClient`)      |
| `types.ts`            | `src/types.ts`                      | Clean interfaces, no Zod                 |
| `scoring.ts`          | `skills/score/SKILL.md`             | AI-powered via skill, not deterministic  |
| `score-display.ts`    | `skills/score/SKILL.md`             | Agent formats output                     |
| `adoptions.ts`        | `skills/compare/SKILL.md`           | Interactive adoption via skill           |
| `commands/score.ts`   | `skills/score/SKILL.md`             | Skill replaces CLI command               |
| `commands/compare.ts` | `skills/compare/SKILL.md`           | Skill replaces CLI command               |
| `commands/adopt.ts`   | `skills/compare/SKILL.md`           | Merged into compare skill                |
| `commands/login.ts`   | `src/commands/login.ts`             | + config snapshot sync on login          |
| `commands/logout.ts`  | `src/commands/logout.ts`            | Already existed                          |
| `commands/doctor.ts`  | `src/commands/doctor.ts`            | Already existed                          |
| `commands/open.ts`    | `src/commands/open.ts`              | Already existed                          |
| `commands/status.ts`  | `src/commands/status.ts`            | Already existed                          |
| `commands/cost.ts`    | `src/commands/data.ts` → `spending` | Uses shared data-source layer            |
| `commands/log.ts`     | `src/commands/data.ts` → `sessions` | Uses shared data-source layer            |
| —                     | `src/commands/data.ts` → `activity` | New (replaces `insights` summary view)   |
| —                     | `src/commands/data.ts` → `timeline` | New (session event detail)               |
| —                     | `src/commands/data.ts` → `search`   | New (cross-session search)               |

## Not migrated — deferred or dropped

### `commands/init.ts`

**Old behavior**: Onboarding wizard — detect repo, resolve org, install panopticon, configure sync, scan config, compute score, upload snapshot, show setup score with recommendations.

**Why deferred**: The `/score` skill + login sync covers most of this. The init flow was:

1. Auth → already `fml login`
2. Install panopticon → already `fml install`
3. Scan + score → `/score` skill
4. Upload snapshot → happens on login

**To migrate**: Could be a `/setup` skill that walks through the full onboarding. Or just document the steps: `fml install && fml login && /score`.

### `commands/orgs.ts`

**Old behavior**: List org memberships, mark default with `*`.

**Why deferred**: `fml status` already shows auth state. Could add org listing there, or add a simple `fml orgs` command that calls `queryOrgs()`.

**To migrate**:

```typescript
// In commands/data.ts or a new commands/orgs.ts
const api = await getAuthenticatedClient();
const orgs = await api.queryOrgs();
console.log(JSON.stringify(orgs, null, 2));
```

### `commands/use.ts`

**Old behavior**: Set default org by writing to `~/.fml/cli.json`.

**Why deferred**: With the plugin model, org context is usually inferred from the repo's GitHub remote. Explicit org switching is less needed.

**To migrate**: Write org slug to a config file, read it in `createApiClient`. ~20 lines.

### `commands/team.ts`

**Old behavior**: Org-wide team summary — active members, session count, spend, top spenders, workflow efficiency distribution.

**Why deferred**: Complex formatting with progress bars and workflow data. The `activity` command covers the session/spending data. Team-specific view with workflow insights needs the scoring infrastructure.

**To migrate**: Add a `team` CLI command that calls `callBackend("get-engineering-activity", { scope: "org" })` and formats the output. The workflow insights part depends on scoring migration.

### `commands/insights.ts`

**Old behavior**: Show per-user workflow insights — read/write ratio, cost efficiency, prompt quality, compared against team medians.

**Why deferred**: Depends on workflow scoring infrastructure (deferred to next stage).

**To migrate**: Add an `insights` CLI command that calls `getWorkflowInsights()` (client method already exists but not exposed as CLI command).

### `commands/completions.ts`

**Old behavior**: Generate bash/zsh/fish shell completion scripts with hardcoded command lists.

**Why deferred**: Low priority. Should be regenerated once command surface is stable. Commander has built-in completion generation that could replace the hand-written scripts.

**To migrate**: Port the completion generators, update command lists to match fml commands.

### `efficiency.ts`

**Old behavior**: Composite efficiency score = 40% config + 60% workflow.

**Why deferred**: Part of scoring infrastructure, deferred with workflow scoring.

### `workflow-scoring.ts`

**Old behavior**: Score workflow metrics (cost, read-before-write, repo focus, prompt quality, recovery speed) against team medians.

**Why deferred**: Part of scoring infrastructure, deferred with workflow scoring.

### `workflow-cache.ts`

**Old behavior**: Cache workflow analysis results locally to avoid re-fetching.

**Why deferred**: Will be needed when workflow insights are migrated.

### `scope.ts`

**Old behavior**: Resolve org slug from flags/config/single-org inference. Resolve repo from git remote.

**Why deferred**: The plugin's `createApiClient` + `resolveRepoFromCwd` covers most of this. A full `resolveCommandScope` helper would be useful when adding org-aware CLI commands.

### `prompts.ts`

**Old behavior**: Interactive yes/no and choice prompts for TTY.

**Why deferred**: Skills handle interactivity. CLI commands output JSON. If needed, can use readline directly.

### `format.ts`

**Old behavior**: Terminal formatting utilities — currency, percentage, status/activity/team output, ASCII logo.

**Why deferred**: Skills format their own output. CLI data commands output JSON. If pretty-printed CLI output is needed later, port the formatters.

### `config.ts` (old CLI config)

**Old behavior**: Read/write `~/.fml/cli.json` for defaultOrg, shareConfig, etc.

**Why deferred**: The plugin uses `~/.fml/auth.json` for tokens. Other config (defaultOrg) isn't needed yet. When org switching is added, create a simple config store.
