# Contract: Configuration File

## Purpose

One human-editable YAML document holds the whole application configuration. Environment variables override it. Credentials never live in it.

## Resolution order

1. Built-in defaults from `packages/core/src/config/defaults.config.ts`.
2. The YAML document named by `APP_CONFIG_FILE`, defaulting to `config/actionpop.yaml`.
3. Environment variables, which win over both.
4. Validation of the merged result.

An explicitly named `APP_CONFIG_FILE` that does not exist is a startup error. When neither the variable nor the default file exists, the service continues with defaults plus environment variables and logs one warning.

## Schema

```yaml
# config/actionpop.example.yaml
app:
  environment: production          # development | production | test
  logLevel: info                   # debug | info | warn | error
  timezone: Europe/Paris
  port: 3000

calendar:
  enabled: true                    # exposes GET /calendar.ics
  lookbackDays: 30                 # window start, days before the request instant
  lookaheadDays: 90                # window end, days after the request instant
  maxEntries: 1000                 # hard ceiling of VEVENT entries
  maxGroupsPerEvent: 5             # ceiling of X-ACTIONPOP-GROUP per entry
  revalidationSeconds: 900         # Cache-Control max-age
  metadataLevel: standard          # off | identity | standard | full
  disabledFamilies: []             # identity | classification | provenance | geography | diagnostics | raw_source

queue:
  attempts: 3
  backoffMs: 1000
  dispatcherIntervalMs: 900000
```

## Environment overrides

| Variable | Overrides |
|----------|-----------|
| `APP_CONFIG_FILE` | Path of the YAML document |
| `NODE_ENV` | `app.environment` |
| `LOG_LEVEL` | `app.logLevel` |
| `TIMEZONE` | `app.timezone` |
| `PORT` | `app.port` |
| `CALENDAR_ENABLED` | `calendar.enabled` |
| `CALENDAR_LOOKBACK_DAYS` | `calendar.lookbackDays` |
| `CALENDAR_LOOKAHEAD_DAYS` | `calendar.lookaheadDays` |
| `CALENDAR_MAX_ENTRIES` | `calendar.maxEntries` |
| `CALENDAR_MAX_GROUPS_PER_EVENT` | `calendar.maxGroupsPerEvent` |
| `CALENDAR_REVALIDATION_SECONDS` | `calendar.revalidationSeconds` |
| `CALENDAR_METADATA_LEVEL` | `calendar.metadataLevel` |
| `QUEUE_ATTEMPTS` | `queue.attempts` |
| `QUEUE_BACKOFF_MS` | `queue.backoffMs` |
| `DISPATCHER_INTERVAL_MS` | `queue.dispatcherIntervalMs` |

`DATABASE_URL`, `REDIS_URL` and `UPSTREAM_TOKEN` are environment-only and are not part of the document.

## Validation

| Situation | Behaviour |
|-----------|-----------|
| Unknown top-level key | Startup error naming the key |
| Non-numeric or negative integer where a count is expected | Startup error naming the key, the value and its origin |
| `lookaheadDays` lower than `1` | Startup error |
| `metadataLevel` outside the enum | Startup error listing the accepted values |
| Unknown family in `disabledFamilies` | Startup error naming the family |
| Malformed YAML | Startup error quoting the parser message with the file path |
| File not readable | Startup error naming the path and the cause |

Every message names the offending setting and whether it came from the file or the environment (FR-025).

## Guarantees

- The API and the worker read the same file and the same override rules (FR-042).
- A file value is never rewritten; an override applies in memory only (FR-041).
- The document is mounted read-only in Compose and contains no secret, so it can be versioned and reviewed.
