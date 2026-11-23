# Contract: Public Update Status

**Owner:** [011 — Minimal Update Progress View](../../011-update-progress-view/spec.md)
**Amendments:** none
**Status:** Living contract · created 2026-11-23
**Implementation:** [`apps/api/src/controllers/update-status.controller.ts`](../../../apps/api/src/controllers/update-status.controller.ts),
[`packages/core/src/persistence/postgres-update-status.ts`](../../../packages/core/src/persistence/postgres-update-status.ts),
[`apps/web/src/features/updates`](../../../apps/web/src/features/updates)
**Related:** [published edge and allowlist](observability.md),
[metrics and operator reporting](../operations/metrics.md),
[ingestion scope lifecycle](../ingestion/scopes.md)

## Principle

This route publishes **aggregate freshness only**. A visitor learns whether the calendar is being
refreshed, how much work remains and when it last succeeded. No identifier, failure reason,
organizer or event name, queue state or infrastructure detail may cross this boundary.

## Surface

| Part   | Rule                                                                     |
| ------ | ------------------------------------------------------------------------ |
| Method | `GET` and `HEAD`; any other method answers `405` with `Allow: GET, HEAD` |
| Path   | `/updates` (exact)                                                       |
| Query  | None. Unknown query parameters are ignored                               |
| Auth   | None; anonymous and public                                               |
| Body   | None; the response is never empty                                        |
| Origin | Same origin as the web application                                       |

## Headers

| Header                      | Value                             |
| --------------------------- | --------------------------------- |
| `Content-Type`              | `application/json; charset=utf-8` |
| `Cache-Control` (readable)  | `public, max-age=15`              |
| `Cache-Control` (`unknown`) | `no-store`                        |

## Response

```json
{
  "checkedAt": "2026-11-23T20:45:00.000Z",
  "refreshIntervalSeconds": 900,
  "state": "updating",
  "current": {
    "startedAt": "2026-11-23T20:45:00.000Z",
    "processed": 412,
    "failed": 3,
    "remaining": 536,
    "total": 951,
    "groups": { "processed": 410, "failed": 3, "remaining": 530, "total": 940 },
    "events": { "processed": 120, "failed": 0, "remaining": 1520, "total": 1640 },
    "takingLongerThanUsual": false
  },
  "lastCompleted": {
    "completedAt": "2026-11-23T20:39:12.000Z",
    "durationSeconds": 312,
    "processed": 948,
    "failed": 3,
    "outcome": "partial",
    "groups": { "processed": 945, "failed": 3, "remaining": 0, "total": 948 },
    "events": { "processed": 1600, "failed": 0, "remaining": 40, "total": 1640 }
  },
  "history": [
    {
      "completedAt": "2026-11-23T20:39:12.000Z",
      "durationSeconds": 312,
      "processed": 948,
      "failed": 3,
      "outcome": "partial"
    }
  ],
  "available": { "current": true, "lastCompleted": true, "history": true }
}
```

### Fields

| Field                    | Type             | Meaning                                                                               |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| `checkedAt`              | ISO instant      | When the server assembled the answer                                                  |
| `refreshIntervalSeconds` | positive integer | Expected length of one refresh cycle                                                  |
| `state`                  | enum below       | Visitor-facing freshness state                                                        |
| `current`                | object \| null   | The refresh in progress, when the current period has ledger rows and is not abandoned |
| `lastCompleted`          | object \| null   | Most recent settled run with at least one terminal row                                |
| `history`                | array (0–5)      | Recent settled runs, newest first; `history[0]` equals `lastCompleted` when present   |
| `available`              | object           | Which sections were read successfully                                                 |

### `state`

| Value        | Condition (first match wins)                                          |
| ------------ | --------------------------------------------------------------------- |
| `updating`   | Current period has `remaining > 0` and started less than one hour ago |
| `unknown`    | The settled read failed, or no refresh has ever completed             |
| `partial`    | Last completed run has `outcome !== "complete"`                       |
| `stale`      | `checkedAt - lastCompleted.completedAt > refreshIntervalSeconds`      |
| `up_to_date` | None of the above                                                     |

### `current`

| Field                   | Rule                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `startedAt`             | Start of the period containing `checkedAt`                                                                  |
| `processed`             | `succeeded + stopped`                                                                                       |
| `failed`                | `failed`                                                                                                    |
| `remaining`             | `scheduled + running + publishing + retrying` plus unknown statuses                                         |
| `total`                 | `processed + failed + remaining`                                                                            |
| `groups`                | Group-kind ledger counts for the period: `processed`, `failed`, `remaining`, `total`                        |
| `events`                | Event coverage: distinct events observed in the period out of every published event; `failed` is always `0` |
| `takingLongerThanUsual` | `checkedAt - startedAt >= refreshIntervalSeconds` and `remaining > 0`                                       |

### `lastCompleted` and each history item

| Field             | Rule                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| `completedAt`     | Latest ledger update in the settled period                                          |
| `durationSeconds` | `completedAt - periodStart`, clamped at 0                                           |
| `processed`       | `succeeded + stopped`                                                               |
| `failed`          | `failed`; unresolved work in an abandoned period counts as failed                   |
| `groups`          | Group-kind ledger counts for the period                                             |
| `events`          | Event coverage for the period, same rule as `current.events`                        |
| `outcome`         | `failed = 0` → `complete`; all terminal rows failed → `failed`; otherwise `partial` |

A period is **settled** when it is before the current one and either has no live ledger row or
started more than one hour ago (`LEDGER_GRACE_MS`). `history` is bounded to five entries.

### `groups` and `events`

`groups` answers "how many groups were refreshed in this cycle?" It counts ledger rows whose
scope kind is `group`, with the same processed/failed/remaining rules as the aggregate.

`events` answers "how many events were considered up to date in this cycle?" It is a coverage
figure over `event_observation`: `processed` is the number of distinct events whose latest
observation belongs to the period, and `total` is every distinct event ever observed. There is
no per-event failure figure, so `failed` is `0` and `remaining = total - processed`.

The aggregate `processed`/`failed`/`remaining`/`total` still counts **every** ledger row,
including event-detail and map-discovery scopes, so it is not always the arithmetic sum of
`groups` and `events`. Clients display the three views side by side; the aggregate drives the
state and the cycle history.

## Degradation

| Situation                                 | Response                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Current read fails, settled read succeeds | `200`; `current: null`, `available.current: false`; state from the settled read                                                              |
| Settled read fails, current read succeeds | `200`; `lastCompleted: null`, `history: []`, `available.lastCompleted/history: false`; state `updating` if work is live, otherwise `unknown` |
| Both fail                                 | `200`; all sections null/empty, all `available` false, `state: "unknown"`, `no-store`                                                        |
| Never updated                             | `200`; `lastCompleted: null`, `history: []`, `available.lastCompleted: true`, `state: "unknown"`                                             |

Storage failures never produce a `5xx`: an unreadable source is information the page displays.

## Privacy boundary

The payload MUST NOT contain a scope or group identifier, a job identifier, a period token, an
error message or reason, an organizer or event name, a geographic identifier, a queue name or
depth, a worker identifier, a hostname, or any per-target row. Counts are aggregate totals.

## Edge publication

`/updates` is an exact entry in [`infra/edge/snippets/routes.conf`](../../../infra/edge/snippets/routes.conf)
with `limit_except GET HEAD`; the allowlist in [observability.md](observability.md) carries the
same row. `/internal/*`, `/reference` and `/openapi.json` remain unrouted.

## Verification

- `packages/core/src/updates/update-status.test.ts` — buckets, outcome, state order, history bound
- `packages/core/src/persistence/postgres-update-status.test.ts` — aggregate projection, abandoned
  work counted as failed
- `apps/api/tests/update-status.controller.test.ts` — exact key set, cache header, unknown
  degradation, no internal field
- `tests/integration/update-status.test.ts` — seeded PostgreSQL aggregates
- `tests/integration/edge-surface.test.ts` — the route is public and method-restricted
- `apps/web/tests/update-status.spec.ts` — visible freshness line and collapsed history

## Amendment history

| Date       | Change                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 2026-11-23 | Created by feature 011                                                                                   |
| 2026-11-23 | Added explicit `groups` and `events` `n/total` figures to `current`, `lastCompleted` and history entries |
