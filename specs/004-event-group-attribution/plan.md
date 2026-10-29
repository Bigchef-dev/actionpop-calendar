# Implementation Plan: Reliable Event–Group Attribution During Ingestion

**Branch**: `004-event-group-attribution` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-event-group-attribution/spec.md`

## Summary

Stop deriving an event's organizers from the group listing that returned it, and start deriving them from the `groups[]` the source states. The payload's groups are already validated by `action-populaire-schemas.ts` and then discarded in `toIncomingEvent`; the fix maps them, persists them as attribution links with the retrieving listing kept as provenance, and reconciles attribution per observation inside the existing publication transaction.

Three consequences follow, all decided in the spec:

1. A group named by a payload but absent from `/carte/liste_groupes/` is registered as an unlisted organizer and becomes an ingestion scope from the next cycle.
2. An event stating no group is published with no attribution and an explicit `none_stated` marker.
3. Group eligibility becomes an explicit state (`pending`, `active`, stopped for inactivity, stopped for an unknown group) instead of the implicit `active` boolean that publication currently sets to `true`.

The public calendar contract is untouched: `X-ACTIONPOP-GROUP` keeps listing group identifiers, which now reflect real organizers; operator signals are new metrics, a per-cycle metric row and structured log fields.

## Technical Context

**Language/Version**: TypeScript on Node.js >= 20, strict compiler settings, ESM

**Primary Dependencies**: Existing Zod 4, Prisma 6 / `@prisma/client`, BullMQ 5 on Redis, Fastify + NestJS for the API, Vitest; no new runtime dependency

**Storage**: PostgreSQL through Prisma is the single source of truth. New: `event_group_link` gains an `observed_via_scope_id` column, plus `event_observation` and `ingestion_cycle_metric` tables, and `group_scope` gains explicit lifecycle columns. Redis stays BullMQ-only

**Testing**: Vitest unit tests in `packages/core`, contract tests in `apps/worker/tests`, PostgreSQL integration tests through `tests/integration/postgres-setup.ts` (per-file schema, `prisma migrate deploy`), strict typecheck, ESLint, and the documented quickstart flow

**Target Platform**: Linux containers; one or more worker processes plus the API process

**Project Type**: pnpm TypeScript monorepo — `packages/core` (rules), `apps/worker` (ingestion), `apps/api` (read only)

**Performance Goals**: One retrieval per known group per cycle; publication of a 1,000-event listing stays within the current transaction cost (batched link/observation writes); discovery promotion is one bounded `UPDATE … RETURNING` per cycle

**Constraints**: Complete observations only; no attribution change on a failed or partial retrieval; 15-minute dispatcher cycle unchanged; per-cycle promotion ceiling default 200; the 404-only "unknown group" rule; `Europe/Paris` remains the canonical timezone; no new public endpoint or calendar property

**Scale/Scope**: Planning baseline of 2,000 active groups and 100,000 prepared events per full cycle; attribution links are at most a handful per event, so the link table stays in the low hundreds of thousands of rows; the ceiling bounds growth to 200 new scopes per 15 minutes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Independent Features** — PASS. Rules live in `packages/core/src/groups/` as pure functions (normalization, status transitions, attribution diff) and are tested without PostgreSQL. Persistence and transport stay in `apps/worker` and `packages/core/src/persistence`. The public read path is unchanged and independently testable.
- **II. TypeScript and Verified Types** — PASS. `IncomingEvent` gains an explicit `groups` field; statuses are string-literal unions, not free strings; Prisma rows are narrowed exactly as today. No new assertion or `any`.
- **III. Test-First Quality** — PASS. Unit, contract and integration tests are enumerated per story in Phase 1; each source of change (discovery, reconciliation, ceiling, unknown group) has a dedicated test file.
- **IV. Small and Maintainable Business Logic** — PASS with a planned split: `postgres-calendar-repository.ts` (294 lines today) would grow past the limit, so event row writing and attribution writing move into focused modules. The ingestion job body moves out of `main.ts` (441 lines today) into a dedicated processor. Both splits reduce oversized files rather than creating new ones.
- **V. Deployable by Default** — PASS. The only configuration addition is the ingestion ceiling in the existing YAML document with an environment override; the migration is additive except for the documented replacement of `group_scope.active`; Docker build and health endpoints are untouched.

Post-design re-check: no violation. The `group_scope.active` removal is a deliberate replacement by two explicit columns and is migrated with a backfill; it is recorded in [research.md](research.md).

## Project Structure

### Documentation (this feature)

```text
specs/004-event-group-attribution/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities, columns, state machines
├── quickstart.md        # Phase 1 runnable validation
├── contracts/
│   ├── ingestion-attribution.md   # worker/publisher boundary and reconciliation rules
│   ├── group-lifecycle.md         # statuses, catalogue sync, discovery, ceiling
│   └── operator-reporting.md      # metric keys, log fields, per-cycle summary
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── adapters/
│   └── action-populaire-schemas.ts      # groups schema relaxed: blank ids tolerated, reported later
├── groups/                              # NEW pure rules
│   ├── observed-groups.ts               # dedupe stated groups, blank-id diagnostics
│   ├── group-status.ts                  # map/retrieval statuses and transition rules
│   ├── attribution-reconciliation.ts    # previous vs stated -> added/removed links
│   └── cycle-metrics.ts                 # metric keys and per-cycle counter names
├── models/
│   └── event.interface.ts               # IncomingEvent gains groups + groupAttribution
├── domain/
│   ├── event-revision.ts                # stated group ids join the content hash
│   └── types.ts                         # IngestionLedgerStatus gains "stopped"
├── operations/
│   └── errors.ts                        # NEW UnknownGroupError raised from a 404 on a listing
├── config/
│   ├── config-schema.ts                 # new `ingestion` scope, strict validation
│   ├── config.interface.ts              # IngestionScopeConfig in RootConfig
│   └── defaults.config.ts               # DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE = 200
└── persistence/
    ├── postgres-calendar-repository.ts  # saveCurrent orchestration only
    ├── event-record-writer.ts           # NEW event row + location upserts
    ├── attribution-writer.ts            # NEW links, observations, group attribution, metrics
    ├── postgres-calendar-event-query.ts # dedupe groupIds after the link PK change
    └── postgres-group-registry.ts       # NEW discovery upserts, promotion, status updates

apps/worker/src/
├── adapters/
│   └── action-populaire-client.ts       # raises UnknownGroupError on a 404 group listing
├── catalogue/
│   └── group-catalogue.ts               # directory validation; status SQL delegated to the registry
├── dispatcher/
│   └── dispatcher.ts                    # promote pending scopes, then enqueue active ones
├── ingestion/
│   └── calendar-ingestion-processor.ts  # NEW: job body extracted from main.ts
├── operations/
│   └── ingestion-ledger.ts              # scope bootstrap without implicit activation
└── main.ts                              # wiring only

prisma/
├── schema.prisma
└── migrations/0004_event_group_attribution/migration.sql

config/
└── actionpop.example.yaml               # documented ingestion ceiling

tests/integration/
└── event-group-attribution.test.ts      # discovery, reconciliation, ceiling, unknown group
```

**Structure Decision**: The rules that decide "who organized this event" and "may this group be retrieved" are pure and live in `packages/core`; SQL and queue mechanics stay in `apps/worker`. The read model `PostgresCalendarEventQuery` is only touched to deduplicate group identifiers after the link primary key widens, so the `/calendar.ics` contract keeps working unchanged.

## Phase 0 — Research

See [research.md](research.md). Decisions cover: stated-groups as the attribution authority; the provenance-carrying link table; complete-observation reconciliation; explicit group lifecycle replacing `active`; 404-only unknown-group detection with directory re-activation as the recovery path; the per-cycle promotion ceiling; the periodic metric table; and the removal of implicit activation in both publication and ledger writes.

## Phase 1 — Design

- [data-model.md](data-model.md): columns, state machines, invariants, migration and backfill rules.
- [contracts/ingestion-attribution.md](contracts/ingestion-attribution.md): what the worker sends, what the publisher stores, and the exact reconciliation algorithm.
- [contracts/group-lifecycle.md](contracts/group-lifecycle.md): statuses, catalogue synchronisation, discovery order, ceiling and re-enablement.
- [contracts/operator-reporting.md](contracts/operator-reporting.md): metric keys, log fields and the per-cycle summary.
- [quickstart.md](quickstart.md): runnable validation scenarios mapped to the spec's success criteria.

### Test strategy

| Level | Location | Proves |
|-------|----------|--------|
| Unit | `packages/core/src/groups/observed-groups.test.ts` | Deduplication, blank identifier diagnostic, deterministic order |
| Unit | `packages/core/src/groups/group-status.test.ts` | Directory/retrieval transitions, inactivity precedence, absence is not deactivation |
| Unit | `packages/core/src/groups/attribution-reconciliation.test.ts` | Added/removed diff across two observing listings, idempotent replay |
| Unit | `packages/core/src/config/config-file.test.ts` | `ingestion.maxNewGroupsPerCycle` validation and environment override |
| Contract | `apps/worker/tests/group-discovery.contract.test.ts` | Unlisted registration, pending state, no work added to the discovering cycle |
| Contract | `apps/worker/tests/scheduling-ceiling.contract.test.ts` | FIFO promotion, exact ceiling, no duplicate job per cycle |
| Contract | `apps/worker/tests/unknown-group.contract.test.ts` | 404 stops the scope without retry; other errors leave it untouched |
| Contract | `apps/worker/tests/action-populaire-groups.contract.test.ts` | Directory sync writes statuses and marks absent groups `removed` |
| Contract | `apps/worker/tests/cycle-report.contract.test.ts` | Gauges and the dispatcher cycle log report the registry state and the previous cycle |
| Integration | `tests/integration/group-directory-sync.test.ts` | Directory statuses, absence → `removed`, single scope when a discovered group is listed, recovery from `stopped_unknown` |
| Integration | `tests/integration/ingestion-cycle-metrics.test.ts` | Per-cycle counters, replay stability, no counters on a failed publication |
| Integration | `tests/integration/event-group-attribution.test.ts` | Payload attribution, union across listings, removal on re-observation, `none_stated`, inactive group, re-enablement, `groupIds` deduplication |
| Regression | `apps/api/tests/*.test.ts`, `tests/integration/calendar-event-query.test.ts` | Public calendar contract and read model unchanged |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| A misconfigured upstream base URL answers 404 for every group, stopping every scope | Calendar stops refreshing until the next directory sync | Only 404 from the group listing counts; any directory entry with `is_active=true` forces `active`, so recovery costs one cycle; no data is deleted |
| Attribution churn when two listings disagree | Sequence bumps and noisy metadata | Attribution is a union per observation; replaying unchanged data reports zero changes (SC-006) |
| Link table growth through provenance rows | Storage and query cost | Provenance rows are bounded by events × lists that return them; index on `scope_id`; the calendar query deduplicates |
| Discovery cascade | Unbounded queue growth | One step per cycle plus the 200-per-cycle promotion ceiling with FIFO order |
| Widening the link primary key | Duplicate group identifiers in the calendar | `PostgresCalendarEventQuery` deduplicates and sorts identifiers; an integration test pins it |

## Complexity Tracking

No constitution violation requires justification. Two splits are undertaken to stay inside the module-size rule rather than to add structure: the calendar repository is divided into orchestration, event writing and attribution writing; the ingestion job body leaves `main.ts`. The only removal of an existing column is `group_scope.active`, replaced by `map_status` and `retrieval_status`, with a backfill in the same migration and the affected callsites listed in `data-model.md`.
