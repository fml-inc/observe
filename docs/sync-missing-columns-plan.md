# Plan: Add missing sync columns to panopticon pipeline

## Context

The panopticon sync pipeline drops several columns between SQLite and Convex. We're adding all fields that aren't already available inside payload blobs. Fields like `toolResult`, `plan`, `allowed_prompts` are skipped since they're embedded in `hook.payload`.

## Columns to add

| Field                   | Source table          | Where it's lost                                | Fix location                                        |
| ----------------------- | --------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `target`                | hook_events, sessions | Never read from SQLite                         | panopticon reader + serializer + Convex             |
| `repositoryFullName`    | otel_logs             | Extracted in HTTP handler, dropped in mutation | Convex only                                         |
| `repositoryFullName`    | otel_metrics          | Extracted in HTTP handler, dropped in mutation | Convex only                                         |
| `git_user_name`         | session_repositories  | Never synced                                   | panopticon reader + Convex                          |
| `git_user_email`        | session_repositories  | Never synced                                   | panopticon reader + Convex                          |
| `metricType`            | otel_metrics          | Lost at serialization (always emits gauge)     | panopticon serializer + Convex                      |
| `severity_number`       | otel_logs             | Never read from SQLite                         | panopticon reader + serializer + Convex             |
| `observed_timestamp_ns` | otel_logs             | Never read from SQLite                         | panopticon reader + serializer + Convex             |
| `session_cwds` (table)  | session_cwds          | Entire table not synced                        | panopticon reader + Convex schema + new sync stream |

## Changes by repo

### Panopticon repo (`panopticon/src/sync/`)

#### 1. `types.ts` — add fields to interfaces

- `HookEventRecord`: add `target: string | null`
- `OtelLogRecord`: add `observedTimestampNs: number | null`, `severityNumber: number | null`
- `OtlpLogRecord`: add `observedTimeUnixNano?: string`, `severityNumber?: number`

#### 2. `reader.ts` — read new columns from SQLite

- `HOOK_EVENTS_SQL`: add `target` to SELECT
- `readHookEvents`: map `r.target` → `target`
- `ALL_LOGS_SQL` + filtered query: add `observed_timestamp_ns, severity_number`
- `RawOtelLogRow`: add `observed_timestamp_ns`, `severity_number`
- `mapOtelRows`: map new fields

#### 3. `serialize.ts` — emit new OTLP attributes

**Hook events:**

- Add `target` as resource attribute `agent.target` (session-level, used for grouping)
- Update `resourceKey()` to include target: `${sessionId}:${repo}:${target}`
- Update `resourceAttributes()` to accept and emit `target`
- Update `serializeHookEvents()` to pass `event.target` through

**Otel logs:**

- Set `observedTimeUnixNano` and `severityNumber` on the OTLP log record

**Metrics:**

- Use `sum` instead of `gauge` when `metricType === "sum"`
- Convex handler already reads both `metric.gauge?.dataPoints` and `metric.sum?.dataPoints`

#### 4. Version bump `package.json`

### Convex backend (`fml-be/convex/`)

#### 1. `schema.ts` — add optional fields

- `panopticon_sessions`: add `target: v.optional(v.string())`
- `panopticon_otel_logs`: add `repositoryFullName: v.optional(v.string())`, `observedTimestampMs: v.optional(v.number())`, `severityNumber: v.optional(v.number())`
- `panopticon_otel_metrics`: add `repositoryFullName: v.optional(v.string())`, `metricType: v.optional(v.string())`
- `panopticon_session_repositories`: add `gitUserName: v.optional(v.string())`, `gitUserEmail: v.optional(v.string())`
- New table `panopticon_session_cwds`: `sessionId: v.string()`, `cwd: v.string()`, `firstSeenMs: v.number()`, `updateTime: v.number()` with indexes `by_session` and `by_cwd`

#### 2. `panopticon_http.ts` — extract new fields

**`ingestOtlpLogsHandler` (hook event path, ~line 572):**

- Extract `agent.target` from resource attributes → pass as `target` on hook events

**`ingestOtlpLogsHandler` (otel log path, ~line 596):**

- Extract `observedTimeUnixNano` → convert to ms
- Extract `severityNumber`
- `repositoryFullName` already extracted, just needs to pass through

**`ingestOtlpMetricsHandler` (~line 752):**

- Detect `metricType`: if `metric.sum` present → "sum", else "gauge"
- `repositoryFullName` already extracted, just needs to pass through

#### 3. `panopticon.ts` — store new fields

**Event validator + `ingestEventBatch`:**

- Add `target` to validator
- Extract `target` from event, pass to session upsert

**`upsertSessionsAndInsertEvents`:**

- Add `target` to events type
- Store `target` on session insert (line ~639)
- Set `target` on patch if not already set

**Log ingestion (`ingestLogEntries` / validators):**

- Add `repositoryFullName`, `observedTimestampMs`, `severityNumber` to insert + validator

**Metric ingestion (`ingestMetricEntries` / validators):**

- Add `repositoryFullName`, `metricType` to insert + validator

**`git_user_name`/`git_user_email`:**

- These require a new sync stream for `session_repositories` in panopticon (not currently synced independently — repos are upserted from hook event data). For now, add the schema fields so they're ready. Follow-up needed for the panopticon reader.

**`session_cwds` table:**

- New Convex table `panopticon_session_cwds` with: `sessionId`, `cwd`, `firstSeenMs`, `updateTime`
- Indexes: `by_session` (sessionId), `by_cwd` (cwd)
- Requires a new sync stream in panopticon (reader + serializer) — similar follow-up as `session_repositories`. For now, create the schema so it's ready.

## Ordering

1. Convex changes can deploy first (all fields `v.optional`)
2. Panopticon changes publish after
3. fml-plugin bumps panopticon dep (no code changes)

## Verification

1. `npx convex dev` — schema push succeeds
2. Wipe watermarks: `sqlite3 "$HOME/Library/Application Support/panopticon/sync-watermarks.db" "DELETE FROM watermarks;"`
3. Restart sync daemon: `npx fml daemon start`
4. Re-export and compare counts + spot-check that new fields are populated
