# Data Model: Minimal Update Progress View

**Feature**: [Minimal Update Progress View](spec.md) · **Plan**: [plan.md](plan.md)

This feature introduces **no new persistent entity**. It derives one read model from state the
worker already writes, and adds one index to make that derivation cheap.

## Source tables (unchanged)

### `processing_period`

| Column             | Type        | Use in this feature                                      |
| ------------------ | ----------- | -------------------------------------------------------- |
| `period_token`     | text (PK)   | Canonical ISO instant of the period start; ordering key  |
| `period_start_utc` | timestamptz | Duration base and settled-period test                    |
| `period_end_utc`   | timestamptz | Not read directly; the interval comes from configuration |

One row per cycle. The dispatcher and ledger create it idempotently, and cycle metrics attach to
it. Rows are ordered by `period_token` (ISO-8601 text sorts chronologically).

### `ingestion_ledger`

| Column         | Type        | Use in this feature                                    |
| -------------- | ----------- | ------------------------------------------------------ |
| `job_id`       | text (PK)   | **Never read into the answer**; exists on the row only |
| `scope_id`     | text        | **Never read into the answer**; used for cardinality   |
| `period_token` | text        | Grouping key for current and historical aggregates     |
| `status`       | text        | Mapped to processed / failed / remaining               |
| `updated_at`   | timestamptz | Completion time and duration of a settled period       |

One row per `(scope_id, period_token)`, enforced by the existing unique key. The unique key
starts with `scope_id`, so **this feature adds** `@@index([periodToken])` (migration
`0010_update_progress_index`) to aggregate one period without scanning the growing table.

### `event_observation` (read-only)

| Column             | Type | Use in this feature                                                    |
| ------------------ | ---- | ---------------------------------------------------------------------- |
| `event_id`         | text | Distinct event counted for coverage                                    |
| `via_scope_id`     | text | Not exposed; the observation's provenance                              |
| `last_seen_period` | text | Period in which the event was last observed; drives `events.processed` |

Coverage is `COUNT(DISTINCT event_id)` filtered on the period, out of every distinct event ever
observed. It answers "how many events were considered up to date in the cycle?" without exposing
which events they are.

### Status vocabulary → public aggregate

| Ledger status     | Public bucket | Notes                                       |
| ----------------- | ------------- | ------------------------------------------- |
| `succeeded`       | processed     | Work completed successfully                 |
| `stopped`         | processed     | Terminal, non-error: upstream group unknown |
| `failed`          | failed        | Work definitely failed                      |
| `scheduled`       | remaining     | Queued, not started                         |
| `running`         | remaining     | In flight                                   |
| `publishing`      | remaining     | Writing the observation                     |
| `retrying`        | remaining     | Will be attempted again                     |
| any unknown value | remaining     | Conservative: cannot claim it is done       |

Invariant: `processed + failed + remaining = total`, asserted for the aggregate and for
`groups`. `events` keeps the same shape with `failed = 0`, so `processed + remaining = total`.
The aggregate counts every ledger row (group, event-detail and map scopes), which is why it is
not necessarily the sum of `groups` and `events`.

## Derived read model (in-memory only)

### `UpdateStatusAnswer`

| Field                     | Type / values                                                   | Rules                                                                           |
| ------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `checkedAt`               | ISO instant                                                     | Server clock at read time                                                       |
| `refreshIntervalSeconds`  | positive integer                                                | `queue.dispatcherIntervalMs / 1000`                                             |
| `state`                   | `updating` \| `up_to_date` \| `stale` \| `partial` \| `unknown` | Ordered rules in R5                                                             |
| `current`                 | `CurrentRun \| null`                                            | Present only when the current period has ledger rows and is not abandoned       |
| `lastCompleted`           | `CompletedRun \| null`                                          | Most recent settled period with a terminal row                                  |
| `history`                 | `CompletedRun[]`                                                | At most 5, most recent first; its first item is the same run as `lastCompleted` |
| `available.current`       | boolean                                                         | False when the current-period read failed                                       |
| `available.lastCompleted` | boolean                                                         | False when the settled-period read failed                                       |
| `available.history`       | boolean                                                         | False when the settled-period read failed                                       |

`history` includes the run that is also `lastCompleted`, as its first element. This keeps the
disclosure a plain list and avoids a special case in the UI.

### `CurrentRun`

| Field                   | Type        | Rules                                                                   |
| ----------------------- | ----------- | ----------------------------------------------------------------------- |
| `startedAt`             | ISO         | Period start, same instant as `processing_period.period_start_utc`      |
| `processed`             | integer ≥ 0 | `succeeded + stopped`                                                   |
| `failed`                | integer ≥ 0 | `failed`                                                                |
| `remaining`             | integer ≥ 0 | live statuses                                                           |
| `total`                 | integer ≥ 0 | sum of the three                                                        |
| `takingLongerThanUsual` | boolean     | `now - startedAt ≥ refreshIntervalSeconds`, and work is still remaining |

### `CompletedRun`

| Field             | Type / values                       | Rules                                                                         |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `completedAt`     | ISO                                 | `max(updated_at)` in the period                                               |
| `durationSeconds` | integer ≥ 0                         | `completedAt - period_start_utc`, clamped at 0                                |
| `processed`       | integer ≥ 0                         | Same bucket rule                                                              |
| `failed`          | integer ≥ 0                         | Same bucket rule                                                              |
| `outcome`         | `complete` \| `partial` \| `failed` | `failed = 0` → complete; all terminal rows failed → failed; otherwise partial |

## Settled-period rules

1. **Current period**: `start = floor(now / interval) * interval`; query
   `period_token = start.toISOString()`.
2. **Settled period**: any period before the current one that either has no live ledger row or
   started more than `LEDGER_GRACE_MS` (1 hour) ago.
3. **Last completed**: the most recent settled period with at least one `succeeded`, `failed` or
   `stopped` row.
4. **History**: the five most recent settled periods, newest first.
5. **Never updated**: no settled period qualifies → `lastCompleted = null`, `history = []`,
   `state = unknown`, `available.lastCompleted = true`.

## State transition (evaluated per request, ordered)

```text
read current period ──► read settled periods
        │                        │
        │ both failed            └─► unknown
        │
        └─ current has remaining work and is not abandoned ──► updating
                    │
                    ├─ last completed unavailable ──► unknown
                    ├─ no completed run ────────────► unknown
                    ├─ last outcome ≠ complete ─────► partial
                    ├─ age > refresh interval ──────► stale
                    └─ otherwise ───────────────────► up_to_date
```

## Validation rules

- Counts are never negative; a negative aggregate is a data defect and becomes `0` for display.
- `completedAt` earlier than the period start is clamped to a zero duration rather than reported
  as negative.
- `history` never exceeds five entries and never contains a period at or after the current one.
- The answer contains no `scope_id`, `job_id`, `period_token`, `last_error`, display name, geo
  identifier, queue name or worker identifier.
- Unknown ledger statuses count as `remaining`; they are never silently dropped.
- A failed read yields `available.<section> = false` and the relevant object is `null`; it never
  yields zero counts.

## Migration

```text
prisma/migrations/0010_update_progress_index/migration.sql
  CREATE INDEX "ingestion_ledger_period_token_idx"
    ON "ingestion_ledger"("period_token");
```

Additive, no data rewrite, no lock beyond a normal index build. The matching Prisma schema line
is `@@index([periodToken])` on `IngestionLedger`.
