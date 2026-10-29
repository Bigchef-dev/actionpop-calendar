# Quickstart: Validate Event–Group Attribution

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

`pnpm prisma:migrate` applies `0004_event_group_attribution`; verify the schema with `pnpm dev:studio` (loopback only) — `group_scope` must expose `map_status` and `retrieval_status` and no longer expose `active`.

## Fast feedback

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/worker test
pnpm test:integration
pnpm quality          # typecheck, lint, unit, integration, build
```

## Scenario 1 — Attribution follows the payload (SC-002)

Seed a listing whose event states groups B and C while being retrieved through listing A.

Expected after publication: `event_group_link` holds `(E, B, A)` and `(E, C, A)`; the calendar entry exposes `X-ACTIONPOP-GROUP:B` and `X-ACTIONPOP-GROUP:C`, never `A`. Covered by `tests/integration/event-group-attribution.test.ts` and the worker contract test for `toIncomingEvent`.

## Scenario 2 — An unlisted group becomes covered (SC-001, SC-004)

Seed a payload naming group `G` that is absent from the directory, then run two dispatcher cycles with a stub queue.

Expected: after cycle 1, `group_scope` contains `G` with `map_status='unlisted'`, `retrieval_status='pending'`, and no job was created for it; after cycle 2, `G` is `active` and exactly one job exists for it. `groups.discovered_unlisted` and `groups.scheduled` report the two steps separately.

## Scenario 3 — An event without a stated group (SC-003)

Seed a payload with `groups: []`.

Expected: the event is published once, has no `event_group_link`, `event_record.group_attribution = 'none_stated'`, no `X-ACTIONPOP-GROUP` line, and `events.without_group` is incremented.

## Scenario 4 — Reconciliation is evidence-based and idempotent (SC-005, SC-006)

1. Publish a listing stating `[B, C]`, then publish it again unchanged → `attributions.added = 0`, `attributions.removed = 0`.
2. Publish the same listing stating `[B]` → `(E, C, A)` disappears, `(E, B, A)` remains.
3. Make the listing fail with a timeout → no attribution change and the ledger reports `retrying` or `failed`.

## Scenario 5 — Unknown group stops, evidence restarts (SC-010, SC-012)

Stub the group listing endpoint to answer 404.

Expected: `retrieval_status='stopped_unknown'`, ledger status `stopped`, `groups.stopped_unknown = 1`, no retry. Then publish any listing that names the group as organizer: the group returns to `active` in that same cycle (`groups.re_enabled = 1`). Running a directory sync with the group present and `is_active = true` also restores it.

## Scenario 6 — Inactive and absent groups (SC-009)

1. Directory marks `G` inactive while payloads still name it → `retrieval_status='stopped_inactive'`, no retrieval, attribution and published events preserved.
2. Directory omits `G` entirely → `map_status='removed'`, retrieval unchanged, events still published.

## Scenario 7 — Discovery ceiling (SC-013)

Set `INGESTION_MAX_NEW_GROUPS_PER_CYCLE=2`, seed a payload naming five unknown groups, then run cycles without new discoveries.

Expected: cycle 1 schedules nothing new; cycles 2–4 promote exactly two groups each in first-observation order; `actionpop_groups_pending` reaches zero; no group is promoted twice.

## Scenario 8 — Public calendar unchanged (SC-008, FR-014)

```bash
pnpm --filter @actionpop/api test
```

Expected: `GET /calendar.ics` returns the same property set for the default `standard` level; an event observed through two listings that state the same group exposes that group once; unchanged payloads keep their `SEQUENCE`.

## Scenario 9 — Operator view (SC-007)

With the worker running:

```bash
curl -s localhost:8081/metrics | grep actionpop_groups
curl -s localhost:8081/metrics | grep actionpop_attributions
```

Expected within one minute of a cycle: the four gauges, the cumulative counters, and a `dispatcher-cycle` log line whose `previousPeriod` object contains the seven per-cycle counters. Cross-check a single event in Prisma Studio: `group_attribution`, its `event_group_link` rows and its `event_observation` row must agree.
