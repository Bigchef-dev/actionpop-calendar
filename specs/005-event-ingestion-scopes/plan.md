# Implementation Plan: Dedicated Ingestion for Events Without a Stated Group

**Branch**: `005-event-ingestion-scopes` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-event-ingestion-scopes/spec.md`

## Summary

Add a second kind of ingestion. A group ingestion keeps discovering events exactly as today; when a complete observation observes an event that states no group and has not ended, the publication transaction inserts an **event scope** for that event. The dispatcher schedules both kinds from one registry through one shared per-cycle ceiling, and the worker sends an event scope to a dedicated processor that reads `GET /api/evenements/{id}/details/` once per cycle, validates it with the existing listing schema, and publishes it as a complete observation — same writer, same content hash, same non-destructive attribution. An event scope retires, at most once per qualifying state and without deleting anything, when the event ends, when the event gains a group, or when the source answers 404; it is re-opened on the same row if the event later stops stating a group while still upcoming.

The registry becomes `ingestion_scope` with `scope_kind` and `event_ends_at`; identity becomes `(scope_kind, scope_key)`. The public calendar contract is untouched: the new kind is provenance only, never an organizer.

## Technical Context

**Language/Version**: TypeScript on Node.js >= 20, strict compiler settings, ESM

**Primary Dependencies**: Existing Zod 4, Prisma 6 / `@prisma/client`, BullMQ 5 on Redis, Fastify + NestJS for the API, Vitest; no new runtime dependency

**Storage**: PostgreSQL through Prisma remains the single source of truth. `group_scope` is renamed `ingestion_scope` and gains `scope_kind` and `event_ends_at`; identity moves to `(scope_kind, scope_key)`; `retrieval_status` gains `retired`. No new table. Redis stays BullMQ-only

**Testing**: Vitest unit tests in `packages/core`, contract tests in `apps/worker/tests`, PostgreSQL integration tests through `tests/integration/postgres-setup.ts` (per-file schema, `prisma migrate deploy`), strict typecheck, ESLint and the documented quickstart flow

**Target Platform**: Linux containers; one or more worker processes plus the API process

**Project Type**: pnpm TypeScript monorepo — `packages/core` (rules), `apps/worker` (ingestion), `apps/api` (read only)

**Performance Goals**: One group listing per active group per cycle and one detail reading per active event scope per cycle; the retirement pass is one bounded `SELECT` (capped batch) plus one bounded `UPDATE` and the promotion a single bounded `UPDATE`; group queries gain a `(scope_kind, retrieval_status)` index so kind filtering costs no scan

**Constraints**: Complete observations only; one shared ceiling and budget per cycle (default 200); discovery never adds work to its own cycle; 404-only retirement for an unknown event; `Europe/Paris` remains canonical; no new public endpoint or calendar property; the profile of the live source is 2,923 groups (893 active) and group-less upcoming events are expected to be a small fraction of published events

**Scale/Scope**: Every group-less upcoming event adds exactly one request per cycle. `event_scopes.created` and the shared ceiling bound the growth to the configured number of new scopes per cycle, so cost rises with coverage rather than with traffic

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Independent Features** — PASS. Qualification and retirement rules live in `packages/core/src/scopes/` as pure functions (kind and state unions, qualification predicate, retirement decision) and are tested without PostgreSQL. Persistence stays in `packages/core/src/persistence`, transport and job mechanics in `apps/worker`. The read path is untouched and independently testable.
- **II. TypeScript and Verified Types** — PASS. `ScopeKind`, `MapStatus` and `RetrievalStatus` are string-literal unions extended in one place; job data gains an explicit `scopeKind`; `CalendarDataset` gains an optional `scopeKind` defaulting to `group`. No new assertion or `any`.
- **III. Test-First Quality** — PASS. Unit, contract and integration tests are enumerated per story in the test strategy below; each source of change (qualification, promotion sharing, retirement, failure mapping) has its own file.
- **IV. Small and Maintainable Business Logic** — PASS with planned splits: `postgres-group-registry.ts` (142 lines today) gives its shared reads to a new `postgres-scope-queries.ts` and its event kind to a new `postgres-event-scopes.ts`; `calendar-ingestion-processor.ts` (168 lines today) loses its publication block to a shared `ingestion/publication.ts`; the worker job branch moves out of `main.ts` into `ingestion/job-dispatch.ts`, so `main.ts` stays wiring only. Every new module lands well under the limit.
- **V. Deployable by Default** — PASS. No new configuration key: the ceiling is the existing `ingestion.maxNewGroupsPerCycle`, whose meaning widens. The migration is a rename plus two nullable/defaulted columns, additive in effect; Docker build and health endpoints are untouched.

Post-design re-check: no violation. The table rename is a pure rename with no data movement and is recorded in [research.md](research.md) with the callsites listed in [data-model.md](data-model.md).

## Project Structure

### Documentation (this feature)

```text
specs/005-event-ingestion-scopes/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities, columns, state machines, migration
├── quickstart.md        # Phase 1 runnable validation
├── contracts/
│   ├── event-ingestion.md       # detail resource, processing order, publication, failures
│   ├── scope-lifecycle.md       # kinds, creation, promotion, retirement, isolation
│   └── operator-reporting.md    # metric keys, gauges, log fields
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── adapters/
│   └── action-populaire-schemas.ts        # unchanged: the detail document already validates
├── scopes/                                # NEW pure rules
│   ├── scope-kind.ts                      # ScopeKind + kind-aware state helpers
│   ├── event-scope.ts                     # qualification predicate, end-time check, retirement decision
│   └── event-scope.test.ts
├── groups/…                               # unchanged rules from the previous feature
├── operations/
│   ├── errors.ts                          # + UnknownEventError, EventIdentityMismatchError
│   └── retry-policy.ts                    # + 'other' reason; mismatch classified retryable
├── domain/
│   └── types.ts                           # RetrievalStatus gains 'retired'
├── models/
│   └── event.interface.ts                 # PublishedGroupSnapshot carries the scope kind
├── persistence/
│   └── calendar-dataset-repository.ts     # CalendarDataset carries the scope kind (default: group)
└── persistence/
    ├── postgres-scope-queries.ts          # NEW: active scopes with their kind, event-scope counts
    ├── postgres-event-scopes.ts           # NEW: request, observation refresh and retire event scopes
    ├── postgres-group-registry.ts         # kind-aware bootstrap and promotion
    ├── postgres-group-discovery.ts        # NEW: group registration extracted from the registry
    ├── postgres-group-directory.ts        # every statement filtered to scope_kind='group'
    ├── postgres-group-queries.ts          # group-only reads and counts
    ├── postgres-calendar-repository.ts    # requests event scopes, retires on stated groups
    └── attribution-writer.ts              # reports the stated groups that drive retirement

apps/worker/src/
├── adapters/
│   └── action-populaire-client.ts         # + fetchEventDetails, 404 → UnknownEventError
├── dispatcher/
│   ├── dispatcher.ts                      # retire ended event scopes, carry the kind into job data
│   └── cycle-report.ts                    # event-scope gauges and counters
├── ingestion/
│   ├── job-dispatch.ts                    # NEW: chooses the processor from the job's scope kind
│   ├── publication.ts                     # NEW: shared mapping/revision/publication helper
│   ├── calendar-ingestion-processor.ts    # group job body (behaviour unchanged)
│   ├── event-preparation.ts               # NEW: shared enrichment for both kinds
│   ├── event-ingestion-processor.ts       # NEW: detail job body
│   └── ingestion-outcome.ts               # + retirement branch for an unknown event
└── main.ts                                # wiring only

prisma/
├── schema.prisma
└── migrations/0005_event_ingestion_scopes/migration.sql

tests/integration/
├── event-scope-lifecycle.test.ts          # qualification, promotion sharing, retirement
├── event-ingestion-publication.test.ts    # content, attribution union, no organizer leak
└── calendar-event-query.test.ts           # unchanged public read model
```

**Structure Decision**: Rules that decide "does this event need its own ingestion" and "is this scope done" are pure and live in `packages/core/src/scopes`; SQL and queue mechanics stay in `apps/worker`. The two processors share one publication helper so a detail observation and a listing observation cannot diverge, and the dispatcher keeps a single FIFO promotion path so the shared ceiling stays provable.

## Phase 0 — Research

See [research.md](research.md). Decisions cover: reusing the listing schema for the detail document; one registry discriminated by `(kind, key)`; `map_status = 'not_applicable'` for event scopes; three explicit retirement rules; scope creation inside the publication transaction; one job identity with two job bodies; a shared promotion ceiling whose counter keeps its name; failure classification with a retryable identifier mismatch; and separate event-scope reporting.

## Phase 1 — Design

- [data-model.md](data-model.md): columns, identity and retrieval state machines, qualification rules, migration and backfill.
- [contracts/event-ingestion.md](contracts/event-ingestion.md): the detail resource contract, processing order, publication semantics and the failure table.
- [contracts/scope-lifecycle.md](contracts/scope-lifecycle.md): creation, dispatcher order, retirement triggers, isolation rules.
- [contracts/operator-reporting.md](contracts/operator-reporting.md): counters, gauges, log fields and the operator workflow.
- [quickstart.md](quickstart.md): runnable validation scenarios mapped to the spec's success criteria.

### Test strategy

| Level       | Location                                                                                                                          | Proves                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `packages/core/src/scopes/event-scope.test.ts`                                                                                    | Qualification (no group, not ended), end-time boundary, retirement decision per trigger                                                                                     |
| Unit        | `packages/core/src/operations/retry-policy.test.ts`                                                                               | Identifier mismatch is retryable; 404 is not; nothing else changes                                                                                                          |
| Contract    | `apps/worker/tests/event-ingestion.contract.test.ts`                                                                              | Detail processing order, identity check, 404 retirement without throwing, no publication on failure                                                                         |
| Contract    | `apps/worker/tests/shared-ceiling.contract.test.ts`                                                                               | Groups and event scopes compete in discovery order against one ceiling; a lost job is re-enqueued                                                                           |
| Contract    | `apps/worker/tests/cycle-report.contract.test.ts`                                                                                 | Event-scope gauges and counters; retired scopes never counted as stopped groups                                                                                             |
| Contract    | `apps/worker/tests/action-populaire-event-details.contract.test.ts`                                                               | Detail document parsing, extra fields ignored, 404 mapped, identity mismatch rejected                                                                                       |
| Integration | `tests/integration/event-scope-lifecycle.test.ts`                                                                                 | Creation on discovery, no creation for a group-stating or ended event, one scope per event, retirement on end and on group stated, the FR-007 re-opening of a retired scope |
| Integration | `tests/integration/event-ingestion-publication.test.ts`                                                                           | Content refresh and revision bump, provenance recorded, attribution union preserved, event scope never attributed, `none_stated` handling                                   |
| Integration | `tests/integration/group-directory-sync.test.ts`                                                                                  | Directory synchronization leaves event scopes untouched and keeps group counts group-only                                                                                   |
| Regression  | `apps/api/tests/*.test.ts`, `tests/integration/calendar-event-query.test.ts`, `tests/integration/event-group-attribution.test.ts` | Public calendar contract and the previous feature's guarantees                                                                                                              |

## Risks and Mitigations

| Risk                                                                                | Impact                                                        | Mitigation                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An observation retires a scope it did not qualify                                   | A group-less event loses its refresh path                     | Retirement reads the stated groups of the observation being published, never the accumulated links                                                          |
| The table rename breaks a raw query silently                                        | Wrong or missing lifecycle data                               | The rename is mechanical and typed; every raw SQL string is listed in [data-model.md](data-model.md); full integration suite runs against a migrated schema |
| A missing kind filter leaks event scopes into group reporting or the directory sync | Corrupted gauges, event scopes deactivated as "absent groups" | One filtered query module per concern; dedicated contract and integration tests assert zero event scopes changed by a directory synchronization             |
| Group-less events multiply ingestion cost                                           | Queue growth                                                  | Shared ceiling, one-cycle lag, one reading per cycle per scope, `event_scopes.created` reported                                                             |
| An event scope stays active after its event ends                                    | Wasted retrievals forever                                     | The retirement pass runs before promotion on every cycle; pending scopes are retired too                                                                    |
| An upstream returning another event's document is published                         | Wrong content attached to an event                            | Identifier check before publication, retryable failure, no state change                                                                                     |
| The widened meaning of `groups.scheduled` confuses operators                        | Misread dashboards                                            | Documented in the operator contract and in the cycle log name; the key is kept, not silently repurposed                                                     |
| A rescheduled event inherits a stale end time                                       | Premature or late retirement                                  | Every complete detail reading records `event_ends_at` on its own scope, and the discovery upsert refreshes it too                                           |
| A terminal retirement strands an event whose organizer disappears                   | Stale event, the reported defect returns                      | Re-qualification re-opens the same row to `pending`, bounded by the shared ceiling and proven by T023                                                       |

## Complexity Tracking

| Violation                                       | Why Needed                                                                                    | Simpler Alternative Rejected Because                                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renaming `group_scope` to `ingestion_scope`     | The table now holds two kinds; the domain entity in the spec is "ingestion scope"             | Keeping the old name would leave every new query reading a `group_scope` row that is not a group, which is exactly the confusion the kind discriminator exists to prevent |
| Two processors plus a shared publication helper | A listing paginates and validates a list; a detail reads one document and checks its identity | A single processor with branches would push one module well past the constitution's size rule and mix two retrieval protocols                                             |
