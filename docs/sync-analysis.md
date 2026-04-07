# Panopticon Sync Analysis: Local SQLite vs Convex

Steps to compare the local panopticon database with the synced Convex tables.

## Prerequisites

- Sync daemon is stopped (no active writes during comparison)
- Convex dev server is running (`pnpm --filter fml-be dev`)
- Working directory: `fml-be/`

## 1. Verify no sync daemon is running

```bash
# Check for PID file
cat /Users/gus/.fml/sync.pid 2>/dev/null

# If PID exists, verify process is dead
ps -p $(cat /Users/gus/.fml/sync.pid) 2>/dev/null

# Delete stale PID file if needed
rm /Users/gus/.fml/sync.pid
```

## 2. Get local row counts

```bash
sqlite3 "$HOME/Library/Application Support/panopticon/data.db" "
SELECT 'sessions' as tbl, count(*) FROM sessions
UNION ALL SELECT 'hook_events', count(*) FROM hook_events
UNION ALL SELECT 'session_repositories', count(*) FROM session_repositories
UNION ALL SELECT 'session_cwds', count(*) FROM session_cwds
UNION ALL SELECT 'otel_logs', count(*) FROM otel_logs
UNION ALL SELECT 'otel_metrics', count(*) FROM otel_metrics
UNION ALL SELECT 'model_pricing', count(*) FROM model_pricing;
"
```

## 3. Get local schemas

```bash
DB="$HOME/Library/Application Support/panopticon/data.db"
for table in sessions hook_events session_repositories session_cwds otel_logs otel_metrics model_pricing; do
  echo "=== $table ==="
  sqlite3 "$DB" ".schema $table"
  echo
done
```

## 4. Get Convex row counts

Run from `fml-be/`:

```bash
for table in panopticon_sessions panopticon_events panopticon_session_repositories panopticon_otel_logs panopticon_otel_metrics panopticon_identities; do
  count=$(npx convex data "$table" --limit 10000 2>&1 | grep -c "^\"")
  echo "$table: $count"
done
```

## 5. Table mapping

| Local SQLite           | Convex                            | Notes                                                                                                         |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sessions`             | `panopticon_sessions`             | Convex adds `githubUsername`, `githubId`, `eventTypeCounts`, `toolCounts`, `pluginVersion`                    |
| `hook_events`          | `panopticon_events`               | Convex collapses `tool_name`, `file_path`, `command`, etc. into `payload`                                     |
| `session_repositories` | `panopticon_session_repositories` | Convex adds `orgName`, `panopticonSessionId`                                                                  |
| `otel_logs`            | `panopticon_otel_logs`            | Timestamp: ns (local) vs ms (Convex). Drops `observed_timestamp_ns`, `severity_number`, `resource_attributes` |
| `otel_metrics`         | `panopticon_otel_metrics`         | Timestamp: ns (local) vs ms (Convex). Drops `metric_type`, `resource_attributes`                              |
| `session_cwds`         | _(none)_                          | Local-only                                                                                                    |
| `model_pricing`        | _(none)_                          | Local-only                                                                                                    |
| _(none)_               | `panopticon_identities`           | Convex-only (GitHub token auth cache)                                                                         |

## 6. Check sync watermarks

```bash
sqlite3 "$HOME/Library/Application Support/panopticon/sync-watermarks.db" "SELECT * FROM watermarks;"
```

## 7. Spot-check specific sessions

Compare a session ID across local and Convex:

```bash
# Local
SESSION_ID="<paste session id>"
sqlite3 "$DB" "SELECT * FROM sessions WHERE session_id = '$SESSION_ID';"
sqlite3 "$DB" "SELECT count(*) FROM hook_events WHERE session_id = '$SESSION_ID';"
sqlite3 "$DB" "SELECT count(*) FROM otel_logs WHERE session_id = '$SESSION_ID';"
sqlite3 "$DB" "SELECT count(*) FROM otel_metrics WHERE session_id = '$SESSION_ID';"

# Convex (from fml-be/)
npx convex data panopticon_sessions --limit 10000 2>&1 | grep "$SESSION_ID"
npx convex data panopticon_events --limit 10000 2>&1 | grep -c "$SESSION_ID"
npx convex data panopticon_otel_logs --limit 10000 2>&1 | grep -c "$SESSION_ID"
npx convex data panopticon_otel_metrics --limit 10000 2>&1 | grep -c "$SESSION_ID"
```

## Results (2026-03-26)

| Table                | Local | Convex | Synced?              |
| -------------------- | ----- | ------ | -------------------- |
| sessions             | 3     | 3      | Yes                  |
| hook_events / events | 542   | 185    | **No** (66% missing) |
| session_repositories | 3     | 3      | Yes                  |
| otel_logs            | 893   | 267    | **No** (70% missing) |
| otel_metrics         | 1210  | 1210   | Yes                  |
