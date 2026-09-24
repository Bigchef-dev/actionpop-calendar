# Worker Contract: Dispatcher and Ingestion Queue

## Dispatcher cycle

The dispatcher runs in `apps/worker` at a configurable interval, defaulting to 15
minutes in `Europe/Paris`.

1. Acquire a Redis lock with an expiring token.
2. Compute the current processing period.
3. Synchronize the group catalogue from `GET /carte/liste_groupes/`.
4. Load groups whose `is_active` value is `true`.
5. Build one deterministic job ID per scope-period.
6. Enqueue missing jobs in `calendar-ingestion`.
7. Update the ingestion ledger to `scheduled`.
8. Release the lock with token validation.

A cycle that cannot acquire the lock exits visibly and does not enqueue jobs. A cycle
must not overlap another cycle, even when multiple worker containers are running.

## Action Populaire source calls

The worker uses the upstream contract documented in [action-populaire.md](action-populaire.md):

- `GET /api/evenements/{eventId}/` retrieves one event detail.
- `GET /api/groupes/{groupId}/evenements/a-venir/?page=1&page_size=1000` retrieves
  one page of upcoming events for a group and may associate each event with multiple
  groups.

The adapter accepts the detail response as one object and the group response as an
array of objects. It validates identifiers, timestamps, timezone, nested location,
group references, subtype, and nullable values before transformation. It must retain
the source event ID as the stable identity and must not use the display name.

The group catalogue response is an array of group objects. It validates `id`, `name`,
`is_active`, optional GeoJSON coordinates, type/subtype values, country, link, and
filter. A catalogue failure must not replace the last complete catalogue or dispatch
jobs from an incomplete list.

## Job identity

```text
ingest-v1_scope-<canonical-scope-token>_period-<utc-slot>
```

The custom ID is deterministic, non-numeric, and contains no colon. Completed queue
records are retained long enough to protect the identity window; the ingestion ledger
is retained independently for operational history.

## Job payload

```json
{
  "scopeId": "group-123",
  "periodStartUtc": "2026-09-24T15:00:00Z",
  "periodEndUtc": "2026-09-24T15:15:00Z",
  "periodStartEuropeParis": "2026-09-24T17:00:00+02:00",
  "jobVersion": 1
}
```

## Processing order

A worker claims one job, retrieves the upstream data, validates and transforms it,
writes an idempotent staged dataset and event revisions to Redis, atomically publishes
the current snapshot pointer, then returns success so BullMQ can acknowledge the job.
A failed write must not be acknowledged.

For group ingestion, the worker fetches all required upstream pages or batches exposed
by the source adapter, starting at page 1 and incrementing until a short or empty page,
before publishing a complete snapshot. It must distinguish an empty successful result
from a failed or partial retrieval; only the former can cause previously seen events
to become `CANCELLED`.

## Retry classification

Retry network failures, timeouts, HTTP 429/5xx, and temporary Redis failures with
bounded exponential backoff and jitter. Do not automatically retry malformed payloads,
invalid scope configuration, or permanent authentication failures. Preserve exhausted
jobs and ledger failure details.

## Delivery semantics

Processing is at-least-once. A worker crash or expired lock can redeliver a job, so
all Redis effects must be idempotent. Only one worker owns a job at a time under normal
queue locking; this is not an exactly-once guarantee.

## Worker readiness

Private readiness verifies Redis and BullMQ connectivity, dispatcher lock access when
running the scheduler role, and a usable upstream configuration. Liveness does not
require the upstream API to be available.
