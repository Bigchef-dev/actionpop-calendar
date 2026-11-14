# Contract: Map Discovery

**Owner:** [006 — Map Event Discovery and Detail Resolution](../../006-map-event-discovery/spec.md)
**Amendments:** none
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`apps/worker/src/ingestion/map-discovery-processor.ts`](../../../apps/worker/src/ingestion/map-discovery-processor.ts), [`packages/core/src/discovery`](../../../packages/core/src/discovery)
**Upstream read:** [`GET /carte/liste_evenements/`](../../006-map-event-discovery/contracts/map-listing.md)

## Role

The map job is a gap-filling discovery source. It is **not** a detail reader and **not** a
publisher: it performs one listing read, validation, observation writes and pending event-scope
requests. Only an event detail document may produce calendar content.

## Scheduling

| Property     | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| `scope_id`   | `map-discovery`                                                  |
| `scope_key`  | `map-discovery`                                                  |
| `scope_kind` | `map`                                                            |
| Job identity | `buildIngestionJobId('map-discovery', periodStartUtc)`           |
| Frequency    | Once per processing period                                       |
| Concurrency  | One map job per period, deduplicated by ledger and queue job id  |

## Upstream request and validation

```http
GET /carte/liste_evenements/ HTTP/1.1
Accept: application/json
```

- No pagination parameters are sent; `page`, `page_size` and `limit` are ignored by the source and
  MUST NOT be used to infer paging.
- The configured upstream token is sent when present, but the resource is public and works
  without it.
- A bare JSON array is expected. At specification time it held about 2,700 entries (~1 MB) with
  `cache-control: public, max-age=300`.

| Field          | Accepted                                                                                                             | Invalid hint behaviour             | Rejects the entry |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------- |
| `id`           | Non-empty string after trim                                                                                          | —                                  | Yes               |
| `name`         | Non-empty string after trim                                                                                          | Dropped, counted as `name`         | No                |
| `coordinates`  | `{ type: "Point", coordinates: [lon, lat] }`, finite lon `-180..180`, lat `-90..90`; `null` treated as absent        | Dropped, counted as `coordinates`  | No                |
| `date`         | String                                                                                                               | Dropped, counted as `date`         | No                |
| `link`         | Absolute URL string                                                                                                  | Dropped, counted as `link`         | No                |
| `start_time`   | ISO 8601 with explicit offset                                                                                        | Dropped, counted as `start_time`   | No                |
| `end_time`     | ISO 8601 with explicit offset, not before `start_time` when both are valid                                           | Dropped, counted as `end_time`     | No                |
| `subtype`      | Integer                                                                                                              | Dropped, counted as `subtype`      | No                |
| Unknown fields | Any                                                                                                                  | Ignored                            | No                |

Validation result:

```ts
interface MapEventListingValidation {
  summaries: MapEventSummary[];
  rejected: number;
  duplicates: number;
  droppedHints: Record<MapEventHintField, number>;
}
```

- `summaries` is deduplicated by `id`; the first occurrence wins and later duplicates increment
  `duplicates`.
- `rejected` counts entries whose `id` is missing, blank after trim, or not a string.
- `droppedHints` counts each invalid optional field independently.
- A non-array body, invalid JSON or an HTTP failure is a `PayloadValidationError` or the existing
  `HttpError`/`NetworkError`/`TimeoutError`; it never yields an empty summary list.

Failure classification: `2xx` + JSON array → success; `2xx` + non-array/invalid JSON →
`PayloadValidationError` (non-retryable); `429` → retry in place after `Retry-After` or backoff,
bounded by `maxRateLimitRetries`; timeout/connection → retryable; `5xx` → retryable; other `4xx` →
non-retryable.

## Processing order

```mermaid
sequenceDiagram
  autonumber
  participant Q as Queue
  participant M as Map job
  participant A as Action Populaire
  participant DB as PostgreSQL

  Q->>M: map scope / period
  M->>A: GET /carte/liste_evenements/
  A-->>M: complete array
  M->>M: validate identities, drop invalid hints, deduplicate
  M->>DB: upsert map_event_observation (fingerprint, last_seen_at)
  M->>DB: select gap candidates and triggers
  M->>DB: request pending event scopes (map_listing)
  M->>DB: mark requested + next_reconcile_at
  M-->>Q: succeeded
```

1. Mark the ledger `running`.
2. Read the listing through the client.
3. Validate and deduplicate summaries.
4. Upsert observations in batches of at most 500 identities; a fingerprint change clears
   `next_reconcile_at`.
5. Select gap candidates and triggers with one bounded query per batch.
6. Request pending event scopes through `requestEventScopes` with
   `discovery_source = 'map_listing'`.
7. Mark `last_requested_at`, `last_outcome = 'requested'` and `next_reconcile_at`.
8. Emit counters and logs, then mark the ledger `succeeded`.

The job never calls `fetchEventDetails` and never writes an event, snapshot, attribution or
calendar property.

## Gap selection

An identity is a gap candidate when all of the following hold:

1. It appeared in the current complete listing.
2. No `event_observation` for it was recorded within `mapFreshnessHorizonMs` through a scope whose
   `retrieval_status` is still `active`.
3. No event scope for it is `pending` or `active`.
4. Its valid `end_time` is absent or after the current instant.

A gap candidate triggers a detail request when any of the following holds:

- `last_requested_at IS NULL` (never requested).
- `next_reconcile_at IS NULL` (new or summary changed).
- `next_reconcile_at <= now` (reconciliation due).
- `last_outcome = 'failed'` or `last_outcome = 'mismatched'`.

`next_reconcile_at` is set to `now + mapReconciliationIntervalMs` when requested.

## Scope request

- The existing event scope processor performs the detail read.
- New scopes start `pending`, so the map cycle adds no detail work to itself.
- The existing `maxNewGroupsPerCycle` budget promotes them in later cycles.
- A retired event scope is reopened on the same row, never duplicated.
- An absent end-time hint produces `event_ends_at = NULL`; a later detail observation writes the
  authoritative end time. Updates preserve an existing value with `COALESCE`.

## Outcomes

| Event processor outcome             | Map observation write                                                     |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Publication succeeded               | `last_outcome = 'resolved'`, `next_reconcile_at = now + reconciliation`   |
| Detail answered 404                 | `last_outcome = 'unknown'`, `next_reconcile_at = now + reconciliation`    |
| Detail answered another identity    | `last_outcome = 'mismatched'`, `next_reconcile_at = now + reconciliation` |
| Job failed (retryable or exhausted) | `last_outcome = 'failed'`, `next_reconcile_at = now`                      |

Outcome writes are skipped when no `map_event_observation` row exists, preserving the existing
behaviour of group-less events discovered through group listings.

## Failure behaviour

| Failure                                   | Behaviour                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Listing `429`                             | Client retries in place; if the budget is spent, the job fails through the existing retry policy    |
| Listing timeout/network/`5xx`             | Job fails and is retried; observations and scopes are unchanged                                     |
| Listing non-array or invalid JSON         | `PayloadValidationError`, non-retryable; observations and scopes are unchanged                      |
| Database failure during upsert/select     | Job fails and is retried; no partial scope request is committed if the batch transaction rolls back |
| One invalid entry                         | Rejected or hint-dropped; the rest of the batch proceeds                                            |
| One invalid hint                          | Dropped and counted; the identity remains discoverable                                              |
| Feature disabled while a job is in flight | Processor stops before reading the listing; no observation or scope is written                      |

## Observability

Per-cycle counters: `map.entries`, `map.rejected`, `map.duplicates`, `map.hints_dropped`,
`map.gap_candidates`, `map.selected`, `map.skipped`, `map.outcomes_resolved`,
`map.outcomes_unknown`, `map.outcomes_mismatched`, `map.outcomes_failed`.

Cumulative metrics: `actionpop_map_listing_entries_total`,
`actionpop_map_listing_rejected_total`, `actionpop_map_hints_dropped_total`,
`actionpop_map_detail_requests_total`, `actionpop_map_outcomes_total{outcome=...}` with `outcome`
in `resolved`, `unknown`, `mismatched`, `failed`.

Logs: one structured `map-discovery` completion line with duration, the counters above and the
number of created/reopened event scopes.

## Compatibility guarantees

- Existing group catalogue, group event pagination, attribution, content hash, sequencing,
  retirement and calendar output are unchanged.
- The map summary never produces canonical content.
- Absence from the listing never cancels, removes or retires anything.
- The public HTTP API is unchanged.
