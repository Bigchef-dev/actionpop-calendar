# Implementation Plan: Map Event Discovery and Detail Resolution

**Branch**: `006-map-event-discovery` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-map-event-discovery/spec.md`

## Summary

Add a gap-filling discovery source to the ingestion pipeline. A singleton `map` scope reads the public map listing once per cycle, validates identities first, records a summary fingerprint per identity, and selects only the events that no active group or event ingestion already keeps fresh. Selected identities are requested as **pending event scopes**, so the existing dispatcher ceiling, event detail processor, publication, attribution and content-hash path stay the only way an event reaches the calendar. The map job never reads a detail document itself and never publishes.

The Action Populaire client gains one new read (`GET /carte/liste_evenements/`); the existing `fetchEventDetails` is reused unchanged. A dedicated summary schema keeps the compact snake_case listing out of the canonical event contract: the listing contributes identity and change hints only, while the detail document remains the sole source of published content.

## Technical Context

**Language/Version**: TypeScript on Node.js >= 20, strict compiler settings, ESM

**Primary Dependencies**: Existing Zod 4, Prisma 6 / `@prisma/client`, BullMQ 5 on Redis, Fastify + NestJS for the API, Vitest; no new runtime dependency

**Storage**: PostgreSQL through Prisma remains the single source of truth. A new `map_event_observation` table stores one fingerprint row per listed identity. `ingestion_scope` gains a singleton row of kind `map` (`map-discovery`). No canonical event shape changes; Redis stays BullMQ-only

**Testing**: Vitest unit tests in `packages/core` (summary schema, identity-first validation, dedup, fingerprint, selection rules), contract tests in `apps/worker/tests` (listing URL, failure mapping, processor behaviour), PostgreSQL integration tests through `tests/integration/postgres-setup.ts` (upsert, change detection, gap query, scope requests, outcomes), strict typecheck, ESLint and the documented quickstart

**Target Platform**: Linux containers; one or more worker processes plus the API process

**Project Type**: pnpm TypeScript monorepo — `packages/core` (rules and persistence), `apps/worker` (ingestion orchestration), `apps/api` (read only)

**Performance Goals**: One map listing read per cycle (about 2,700 entries, roughly 1 MB, five-minute upstream cache); zero detail reads inside the map job; batched SQL of at most 500 identities per statement; memory bounded to the listing plus one batch of rows; detail reads remain bounded by the existing `maxNewGroupsPerCycle` ceiling because selected identities only become pending event scopes

**Constraints**: `Europe/Paris` remains canonical; no new public endpoint or calendar property; the canonical event contract is unchanged; absence from the listing never cancels or removes; the detail document is authoritative; an invalid optional hint never hides a valid identity; the map listing exposes no pagination and its query parameters are ignored

**Scale/Scope**: Every cycle records roughly one row per publicly mapped event in `map_event_observation`; newly selected identities join the existing pending event-scope queue and consume the shared ceiling, so detail volume grows with coverage rather than with listing size

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Independent Features** — PASS. Summary validation, identity-first filtering, deduplication, fingerprinting and selection are pure functions in `packages/core/src/discovery/`, tested without PostgreSQL. The map read lives in the existing adapter; persistence lives in focused `postgres-map-observations.ts` and `postgres-map-selection.ts` modules; scheduling stays a dispatcher/scope concern. The feature boundary is the new `map` scope plus the new table.
- **II. TypeScript and Verified Types** — PASS. `ScopeKind` gains the literal `'map'` in one union; the summary contract and its validation result are explicit types; no new assertion or `any`. The canonical `ActionPopulaireEventPayload` is untouched.
- **III. Test-First Quality** — PASS. Every rule named in the spec has a planned unit, contract or integration test below: identity-first acceptance and rejection, hint dropping and counting, duplicate collapse, fingerprint change, gap coverage, reconciliation triggers, scope request, outcome recording, failure classification and non-regression of group ingestion.
- **IV. Small and Maintainable Business Logic** — PASS with planned splits: a pure `discovery/map-listing.ts` (schema-facing validation result), `discovery/map-selection.ts` (fingerprint and selection rules), `persistence/postgres-map-observations.ts` (upsert, request marks, outcome) and `persistence/postgres-map-selection.ts` (gap selection), `ingestion/map-discovery-processor.ts` (orchestration only) with reporting and types split out and a single new client method. `postgres-event-scopes.ts` receives a narrow nullable end-time and discovery-source change instead of a fork. Every new module is planned under the 150-line guideline.
- **V. Deployable by Default** — PASS. One additive Prisma migration creates a new table; no existing column or contract changes. Three ingestion configuration keys receive defaults, so an existing deployment starts the feature without configuration edits. Docker build, health and readiness paths are untouched.

Post-design re-check: no violation. The `map` scope row is created idempotently at worker startup from configuration, the migration is additive, and the API surface is unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/006-map-event-discovery/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities, columns, states, selection rules
├── quickstart.md        # Phase 1 runnable validation
├── contracts/
│   ├── map-listing.md          # upstream listing response and validation contract
│   └── map-discovery.md        # job flow, gap selection, scope requests, outcomes
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── adapters/
│   ├── action-populaire-schemas.ts      # + MapEventSummary + per-entry identity-first schema
│   └── action-populaire-schemas.test.ts # + listing validation tests
├── discovery/                           # NEW pure rules
│   ├── map-listing.ts                   # dedup, rejection and dropped-hint counts
│   ├── map-listing.test.ts
│   ├── map-selection.ts                 # fingerprint, end-time guard, gap/trigger rules
│   └── map-selection.test.ts
├── scopes/
│   └── scope-kind.ts                    # ScopeKind gains 'map'
├── config/
│   ├── config.interface.ts              # + map discovery settings
│   ├── config-schema.ts                 # + ingestion map discovery keys
│   ├── defaults.config.ts               # + defaults
│   └── runtime-config.ts                # + INGESTION_MAP_* environment mappings
└── persistence/
    ├── postgres-map-discovery.ts        # re-export aggregator
    ├── postgres-map-observations.ts     # NEW: upsert observations, request marks, outcomes, count
    ├── postgres-map-selection.ts        # NEW: gap and reconciliation selection
    ├── postgres-event-scopes.ts         # + nullable end time, discovery source, COALESCE
    ├── postgres-group-registry.ts       # + ensureMapScope / setMapScopeEnabled, map bootstrap
    └── postgres-scope-queries.ts        # + map-aware ActiveScope parsing

apps/worker/src/
├── adapters/
│   ├── action-populaire-client.ts       # + fetchMapEventListing()
│   └── action-populaire-client.test.ts  # + listing URL, throttle and failure tests
├── ingestion/
│   ├── map-discovery-processor.ts       # NEW: one listing, validate, record, request scopes
│   ├── map-discovery-reporting.ts       # NEW: counters, metrics and completion log
│   ├── map-discovery-types.ts           # NEW: job and dependency contracts
│   ├── map-discovery-processor.test.ts
│   ├── job-dispatch.ts                  # + map branch
│   └── event-ingestion-processor.ts     # + optional map outcome recording
├── dispatcher/
│   └── cycle-report.ts                  # + map metrics and gauges
├── operations/
│   └── observability.ts                 # unchanged registry, new metric names used
├── main.ts                              # + map scope bootstrap, dependencies and routing
└── config.ts                            # unchanged: WorkerConfig extends RootConfig

prisma/
├── schema.prisma                        # + MapEventObservation
└── migrations/0006_map_event_discovery/
    └── migration.sql

apps/worker/tests/
├── map-listing.contract.test.ts         # NEW adapter contract
├── map-discovery.contract.test.ts       # NEW processor orchestration
├── map-detail-resolution.contract.test.ts # NEW pending-scope -> detail publication
└── event-ingestion.contract.test.ts     # existing detail contract, untouched

tests/integration/
├── map-discovery.test.ts                # NEW PostgreSQL discovery and selection
├── map-compatibility.test.ts            # NEW non-regression against group ingestion
└── map-scope-lifecycle.test.ts          # NEW enable/disable and in-flight guard
```

**Structure Decision**: Keep the existing monorepo layout. Pure discovery rules belong in `packages/core/src/discovery`, persistence in `packages/core/src/persistence`, transport in `apps/worker/src/adapters`, orchestration in `apps/worker/src/ingestion`. No new application or package is introduced.

## Implementation Approach

1. **Contract first** — add `MapEventSummary`, the identity-first listing validator and the pure selection functions, with tests. The existing canonical event schema is not modified.
2. **Client capability** — add `fetchMapEventListing()` to `ActionPopulaireClient`; reuse `fetchEventDetails()` unchanged. The listing read uses the existing timeout, throttle-retry and error classification.
3. **Persistence** — add `MapEventObservation`, the additive migration, `postgres-map-observations.ts`/`postgres-map-selection.ts`, the map scope bootstrap and the nullable end-time/discovery-source extension of `requestEventScopes`.
4. **Orchestration** — add the `map` scope kind, route it in `job-dispatch.ts`, implement `processMapDiscovery`, and wire it in `main.ts`. The job records observations and requests pending event scopes only.
5. **Outcomes** — let the event processor record `resolved`, `unknown`, `mismatched` and `failed` outcomes on the matching map observation when the row exists; absence of a row keeps existing behaviour for group-less events discovered through group listings.
6. **Observability** — add the map cycle counters, job logs and registry gauges; keep group and event gauges unchanged.
7. **Validation** — run unit, contract and integration suites, then the documented quickstart against a fixture and, optionally, the live listing.

## Phase 0: Research

See [research.md](research.md). Decisions cover the map-scope scheduling model, separate observation ledger, pending event scopes as the detail queue, fingerprint-based change detection, gap coverage query, identity-first validation and configuration defaults.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — entities, columns, indexes, migration and selection rules.
- [contracts/map-listing.md](contracts/map-listing.md) — upstream response, field rules, validation outcomes and failure mapping.
- [contracts/map-discovery.md](contracts/map-discovery.md) — job flow, gap selection, scope requests, outcome recording and counters.
- [quickstart.md](quickstart.md) — runnable validation scenarios.

## Complexity Tracking

No constitution violations. No entry required.

## Risks and Mitigations

| Risk                                                                   | Mitigation                                                                                                                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The listing grows and a single response becomes expensive              | One read per cycle, bounded SQL batches, a configurable enabled flag, and a five-minute upstream cache                                                                                   |
| A bad hint hides a valid event                                         | Identity-first validation: only a blank identity rejects an entry; invalid hints are dropped and counted                                                                                 |
| Discovery duplicates group work                                        | Gap query excludes events observed through active scopes within the freshness horizon and identities with a pending or active event scope                                                |
| Event scopes churn for events that state groups                        | Existing `event_group_stated` retirement is respected and the reconciliation interval prevents immediate re-request; unlisted groups become scopes through the existing attribution path |
| Reconciliation storms after an outage                                  | Selection is bounded by the existing per-cycle ceiling because requests are pending event scopes, not immediate detail reads                                                             |
| First run has no observation history and may request many event scopes | The ceiling spreads detail reads over later cycles and each identity converges once; the map job itself stays one listing read plus batched writes                                       |
| A detail failure is retried forever through discovery                  | The event scope carries the retry; the map observation is not re-requested while the scope is pending or active                                                                          |
| Missing end-time hint                                                  | The event scope accepts a null end time; the detail observation writes the authoritative end time, and ended-event retirement ignores null rows until resolved                           |
