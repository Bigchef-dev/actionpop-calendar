# Quickstart: Validate Event Ingestion Scopes

Validation guide only — implementation details live in [plan.md](plan.md), [data-model.md](data-model.md) and the contracts.

## Prerequisites

- Node.js >= 20 and Corepack (`corepack enable`)
- Docker for PostgreSQL and Redis
- `DATABASE_URL`, `REDIS_URL` and `TEST_DATABASE_URL` pointing at disposable databases
- `UPSTREAM_BASE_URL` for the worker (any base URL when running tests, which never contact it)

```bash
pnpm install --frozen-lockfile
pnpm dev:infra
pnpm prisma:generate
pnpm prisma:migrate
```

`pnpm prisma:migrate` applies `0005_event_ingestion_scopes`; verify with `pnpm dev:studio` (loopback only) that the scope table is named `ingestion_scope`, exposes `scope_kind`, `event_ends_at` and `retrieval_status`, and has no `group_scope` table left.

## Fast feedback

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/worker test
pnpm test:integration
pnpm quality          # typecheck, lint, unit, integration, build
```

## Scenario 1 — A group-less event gets one ingestion, none for a group-stating event (FR-001, SC-001)

Publish a listing with two upcoming events: one with `groups: []`, one stating a group.

Expected: exactly one scope with `scope_kind='event'` exists, its `scope_id` is the group-less event's identifier, its state is `pending`, `event_ends_at` equals the event's end time, and `event_scopes.created = 1`. The event stating a group has no event scope.

## Scenario 2 — No work is added to the discovering cycle (FR-001, FR-005)

Run one dispatcher cycle immediately after the discovery cycle with a stub queue.

Expected: the discovering cycle enqueued no job for the event scope; the following cycle promotes it (`groups.scheduled` includes it) and enqueues exactly one job.

## Scenario 3 — The detail reading refreshes the event (FR-002, FR-003, SC-002)

Promote the scope, change the event at the source (time, place or description), run the ingestion.

Expected: `event_record` carries the new content, `sequence` advanced once, a new snapshot exists for the event scope, and `event_observation` holds `(event, event scope)` with `stated_group_count = 0`.

## Scenario 4 — Attribution is never damaged (FR-006, SC-003)

Attribute the event to group `B` through a listing, then run a detail reading that states no group, then one that states `C`.

Expected: after the first reading the attribution is still `B`; after the second it is `B ∪ C`; `attributions.removed` is zero in both cycles, and the event's `group_attribution` is `none_stated` only while no link exists.

## Scenario 5 — The ingestion ends when its reason disappears (FR-007, SC-006, SC-007)

1. Publish an event ending in the future, promote its scope, then move the event's end time into the past and dispatch.
2. Repeat with an event that starts stating a group.
3. Repeat with a detail resource answering 404.

Expected: in each case the scope becomes `retired` with `stopped_reason` equal to `event_ended`, `event_group_stated` and `event_unknown` respectively; zero further retrievals happen in the following cycle; the event, its links, its observations and its snapshots remain.

## Scenario 6 — Failures never retire (FR-009, SC-007)

Make the detail resource time out, answer 429, answer 500, return an invalid document, and return a valid document for a different event.

Expected: the scope stays `active`, the ledger reports `retrying` or `failed`, nothing is published, and the next cycle still retrieves it exactly once. `event_scopes.reading_failed` counts every attempt.

## Scenario 7 — The shared ceiling bounds both kinds (FR-005, SC-005)

Set `INGESTION_MAX_NEW_GROUPS_PER_CYCLE=2`, then discover five new groups and five group-less events in the same cycle, and run cycles without new discoveries.

Expected: nothing new is scheduled in the discovering cycle; the following cycles promote exactly two scopes each (groups and events interleaved by first observation), `actionpop_groups_pending` and `actionpop_event_scopes_pending` both reach zero, and no scope is promoted twice.

## Scenario 8 — Kinds never interfere (FR-004, FR-014, SC-008, SC-009)

With event scopes active, run a complete directory synchronization, read the calendar, and inspect the registry counts.

Expected: no event scope changed state, `actionpop_groups_*` gauges count groups only, retired event scopes appear in no `stopped` count, the calendar exposes no event-scope identifier as a group property, and `GET /calendar.ics` returns the same property set as before.

## Scenario 9 — Operator view (FR-011, SC-010)

```bash
curl -s localhost:8081/metrics | grep actionpop_event
curl -s localhost:8081/metrics | grep actionpop_groups
```

Expected within one minute of a cycle: the three event-scope gauges, the cumulative event counters, and a `dispatcher-cycle` log line whose `eventScopes` block and `previousPeriod` object contain the eleven per-cycle counters.
