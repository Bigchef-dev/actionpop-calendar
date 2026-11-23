# Contract: Public Update Status

> **Historical record.** During implementation this contract is consolidated into
> [`specs/contracts/http/updates.md`](../../contracts/http/updates.md), which becomes the living,
> normative owner of `GET /updates`. This file records the decision taken by feature 011.

**Owner:** [011 — Minimal Update Progress View](../spec.md)
**Status:** Historical · consolidated into the canonical contract on 2026-11-23
**Amendment:** the canonical contract added explicit `groups` and `events` `n/total` figures on 2026-11-23; it wins over the example below.
**Implementation:** `apps/api/src/controllers/update-status.controller.ts`,
`packages/core/src/persistence/postgres-update-status.ts`, `apps/web/src/features/updates`

## Surface

| Part   | Rule                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| Method | `GET` (and `HEAD` at the edge); any other method answers `405` with `Allow: GET, HEAD` |
| Path   | `/updates` (exact)                                                                     |
| Query  | None. Unknown query parameters are ignored                                             |
| Auth   | None; anonymous and public                                                             |
| Body   | None; the response is never empty                                                      |
| Origin | Same origin as the web application; no CORS rule is required                           |

## Headers

| Header                      | Value                                   |
| --------------------------- | --------------------------------------- |
| `Content-Type`              | `application/json; charset=utf-8`       |
| `Cache-Control` (readable)  | `public, max-age=15`                    |
| `Cache-Control` (`unknown`) | `no-store`                              |
| `X-Content-Type-Options`    | `nosniff` (already applied by the edge) |

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
    "takingLongerThanUsual": false
  },
  "lastCompleted": {
    "completedAt": "2026-11-23T20:39:12.000Z",
    "durationSeconds": 312,
    "processed": 948,
    "failed": 3,
    "outcome": "partial"
  },
  "history": [
    {
      "completedAt": "2026-11-23T20:39:12.000Z",
      "durationSeconds": 312,
      "processed": 948,
      "failed": 3,
      "outcome": "partial"
    },
    {
      "completedAt": "2026-11-23T20:24:02.000Z",
      "durationSeconds": 288,
      "processed": 951,
      "failed": 0,
      "outcome": "complete"
    }
  ],
  "available": { "current": true, "lastCompleted": true, "history": true }
}
```

### Fields

| Field                    | Type             | Meaning                                                                               |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| `checkedAt`              | ISO instant      | When the server assembled the answer                                                  |
| `refreshIntervalSeconds` | positive integer | Expected length of one refresh cycle, from configuration                              |
| `state`                  | enum below       | Visitor-facing freshness state                                                        |
| `current`                | object \| null   | The refresh in progress, when the current period has ledger rows and is not abandoned |
| `lastCompleted`          | object \| null   | The most recent settled run with at least one terminal row                            |
| `history`                | array (0–5)      | Recent settled runs, newest first; `history[0]` equals `lastCompleted` when present   |
| `available`              | object           | Which sections were read successfully                                                 |

### `state`

| Value        | Condition (first match wins)                                               |
| ------------ | -------------------------------------------------------------------------- |
| `updating`   | The current period has `remaining > 0` and is not abandoned (> 1 hour old) |
| `unknown`    | The last-completed read failed, or no refresh has ever completed           |
| `partial`    | The last completed run has `outcome !== "complete"`                        |
| `stale`      | `checkedAt - lastCompleted.completedAt > refreshIntervalSeconds`           |
| `up_to_date` | None of the above                                                          |

### `current`

| Field                   | Rule                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `startedAt`             | Start of the period containing `checkedAt`                            |
| `processed`             | `succeeded + stopped`                                                 |
| `failed`                | `failed`                                                              |
| `remaining`             | `scheduled + running + publishing + retrying` (+ unknown statuses)    |
| `total`                 | `processed + failed + remaining`                                      |
| `takingLongerThanUsual` | `checkedAt - startedAt >= refreshIntervalSeconds` and `remaining > 0` |

### `lastCompleted` and each `history` item

| Field             | Rule                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| `completedAt`     | Latest ledger update in the settled period                                          |
| `durationSeconds` | `completedAt - periodStart`, clamped at 0                                           |
| `processed`       | `succeeded + stopped`                                                               |
| `failed`          | `failed`                                                                            |
| `outcome`         | `failed = 0` → `complete`; all terminal rows failed → `failed`; otherwise `partial` |

`history` is bounded to five entries. It is empty when no run has settled.

## Degradation

| Situation                                        | Response                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current-period read fails, settled read succeeds | `200`; `current: null`, `available.current: false`; `state` derived from the settled read                                                         |
| Settled read fails, current read succeeds        | `200`; `lastCompleted: null`, `history: []`, `available.lastCompleted/history: false`; `state` is `updating` if work is live, otherwise `unknown` |
| Both reads fail                                  | `200`; `current: null`, `lastCompleted: null`, `history: []`, all `available` false; `state: "unknown"`; `Cache-Control: no-store`                |
| No run has ever completed                        | `200`; `lastCompleted: null`, `history: []`, `available.lastCompleted: true`; `state: "unknown"`                                                  |
| Empty current period                             | `current: null`, `available.current: true`; state depends on the settled read                                                                     |

The route never answers `5xx` for a storage failure: an unreadable source is information the page
must display, not an error that blanks the page.

## Privacy boundary

The payload MUST NOT contain, directly or indirectly: a scope or group identifier, a job
identifier, a period token, an error message or reason, an organizer or event name, a geographic
identifier, a queue name or depth, a worker identifier, a hostname, or any per-target row.
Counts are aggregate totals only. Tests assert the exact key set of every object.

## Compatibility

- Additive: no existing route, field or behavior changes.
- The edge allowlist gains one exact entry:
  `location = /updates { limit_except GET HEAD { deny all; } ... }`.
- `tests/integration/edge-surface.test.ts` asserts the new entry and that `/internal/*`,
  `/reference` and `/openapi.json` remain absent.
- The generated API reference documents the route, but `/reference` and `/openapi.json` stay
  outside the public allowlist.

## Verification

- `packages/core/src/updates/update-status.test.ts` — state order, arithmetic invariant, outcomes,
  history bound, abandoned periods, never-updated.
- `apps/api/tests/update-status.controller.test.ts` — exact key set, cache header, `unknown`
  degradation, no internal field.
- `tests/integration/update-status.test.ts` — seeded `processing_period` + `ingestion_ledger`
  rows produce the expected aggregates.
- `apps/web/tests/update-status.spec.ts` — the visible freshness line and collapsed history.
- `tests/integration/edge-surface.test.ts` — the route is public, method-restricted and nothing
  private was added.
