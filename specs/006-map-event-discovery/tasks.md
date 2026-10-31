# Tasks: Map Event Discovery and Detail Resolution

**Input**: Design documents from `/specs/006-map-event-discovery/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The project constitution (Principle III) requires automated tests for every business rule, and [plan.md](plan.md) fixes the test strategy; test tasks precede their implementation within each story.

**Organization**: Tasks are grouped by user story so each story remains independently implementable and testable. The map summary is never canonical content; only the detail document publishes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`…`[US4]`, matching [spec.md](spec.md)
- Every task names the exact file path it touches

## Path Conventions

- `packages/core/src/` — shared contracts, pure rules, persistence
- `apps/worker/src/` — client adapter, ingestion, dispatcher
- `apps/api/src/` — read-only transport (unchanged by this feature)
- `apps/worker/tests/`, `packages/core/**/*.test.ts`, `tests/integration/` — tests
- `prisma/` — schema and migrations

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration, scope vocabulary and persistence skeleton shared by every story

- [x] T001 Add `mapDiscoveryEnabled` (boolean, default `true`), `mapFreshnessHorizonMs` (positive integer, default `3600000`) and `mapReconciliationIntervalMs` (positive integer, default `604800000`) to `packages/core/src/config/defaults.config.ts`, `packages/core/src/config/config.interface.ts`, `packages/core/src/config/config-schema.ts` and `packages/core/src/config/runtime-config.ts`; accept `INGESTION_MAP_DISCOVERY_ENABLED`, `INGESTION_MAP_FRESHNESS_HORIZON_MS` and `INGESTION_MAP_RECONCILIATION_INTERVAL_MS`; document the keys in `config/actionpop.example.yaml` and `.env.example`; cover defaults, overrides and invalid values in `packages/core/src/config/runtime-config.test.ts` and `packages/core/src/config/config-file.test.ts`
- [x] T002 [P] Add the literal `'map'` to `ScopeKind` and `isScopeKind` in `packages/core/src/scopes/scope-kind.ts`; update the `activeScopes()` mapper in `packages/core/src/persistence/postgres-scope-queries.ts` so `scope_kind = 'map'` becomes `scopeKind: 'map'` instead of defaulting to `'group'`; add `isScopeKind('map')` coverage in `packages/core/src/scopes/scope-kind.test.ts`; the `activeScopes()` mapping is covered by the integration test in T009
- [x] T003 [P] Add `MapEventSummary` and `mapEventSummarySchema` to `packages/core/src/adapters/action-populaire-schemas.ts`: `id` is a trimmed non-empty string and is mandatory; `name` is a trimmed non-empty string when present; `coordinates` accepts `{ type: 'Point', coordinates: [lon, lat] }` with finite longitude `-180..180` and latitude `-90..90` and treats `null` as absent; `date` and `link` are strings (link absolute URL when present); `start_time` and `end_time` are ISO 8601 with an explicit offset; `subtype` is an integer; unknown fields are stripped; export the type from `packages/core/src/index.ts`; add tests in `packages/core/src/adapters/action-populaire-schemas.test.ts`
- [x] T004 Add `MapEventObservation` to `prisma/schema.prisma` with exactly the columns, nullability, defaults and index from [data-model.md](data-model.md): `event_id` primary key, `summary_fingerprint`, nullable `display_name`, `start_time`, `end_time`, `subtype_id`, `first_seen_at`, `last_seen_at`, nullable `last_requested_at`, `last_outcome`, `next_reconcile_at`, plus `@@index([nextReconcileAt])`; create the additive migration `prisma/migrations/0006_map_event_discovery/migration.sql`; run `pnpm prisma:generate`

**Checkpoint**: Configuration, scope kind and the observation table exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure discovery rules and persistence primitives every story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Write failing tests in `packages/core/src/discovery/map-listing.test.ts`, then implement `validateMapEventListing(values: unknown): MapEventListingValidation` in `packages/core/src/discovery/map-listing.ts`: reject non-arrays with `PayloadValidationError`; reject entries whose `id` is missing, not a string, or blank after trim and increment `rejected`; drop each invalid optional hint independently and count it by field in `droppedHints`; collapse repeated identities to the first occurrence and increment `duplicates`; never parse `date`; export the function and result type from `packages/core/src/index.ts`
- [x] T006 [P] Write failing tests in `packages/core/src/discovery/map-selection.test.ts`, then implement `packages/core/src/discovery/map-selection.ts`: `summaryFingerprint(summary)` hashes canonical JSON of `name`, `start_time`, `end_time`, `coordinates` and `subtype` only (never `date` or `link`); `hasEnded(endTime, now)` is true only for a valid end at or before `now`; `shouldRequestDetail(observation, now)` is true when `last_requested_at IS NULL`, `next_reconcile_at IS NULL`, `next_reconcile_at <= now`, or `last_outcome === 'failed'`; export all from `packages/core/src/index.ts`
- [x] T007 Implement the map observation ledger in `packages/core/src/persistence/postgres-map-observations.ts` and the gap query in `packages/core/src/persistence/postgres-map-selection.ts`, with these bounded operations: `recordListing(summaries, observedAt)` upserting in batches of at most `500` identities, setting `first_seen_at` on insert, always advancing `last_seen_at`, refreshing `display_name`/`start_time`/`end_time`/`subtype_id`, and clearing `next_reconcile_at` only when `summary_fingerprint` changes; `selectGapCandidates(eventIds, options)` returning identities that have no `pending` or `active` event scope and whose valid end time is absent or after `now`; `recordOutcome(eventId, outcome, at, nextReconcileAt)` updating only an existing row with `last_outcome` in `resolved | unknown | mismatched | failed`; `markRequested(eventIds, requestedAt, nextReconcileAt)` marking selected identities; split the file into `postgres-map-observations.ts` and `postgres-map-selection.ts` under `packages/core/src/persistence/`, re-export both from `postgres-map-discovery.ts` and `packages/core/src/index.ts`; cover insert, unchanged re-read, fingerprint change, end guard and missing-row outcome in `tests/integration/map-discovery.test.ts`
- [x] T008 Extend `packages/core/src/persistence/postgres-event-scopes.ts`: allow `endTime: string | null` in `EventScopeRequest` and write `NULL::timestamptz` when absent; add `discoverySource` (default `'event_payload'`) and write it on insert; on every update preserve an existing end with `COALESCE(incoming.ends_at, g.event_ends_at)` and leave `discovery_source` unchanged; keep the existing `pending`/`retired` reopen behaviour; add integration coverage in `tests/integration/map-discovery.test.ts` and keep `tests/integration/group-directory-sync.test.ts` green
- [x] T009 Implement `ensureMapScope(enabled)` and `setMapScopeEnabled(enabled)` in `packages/core/src/persistence/postgres-group-registry.ts`: enabled upserts `scope_id = 'map-discovery'`, `scope_key = 'map-discovery'`, `scope_kind = 'map'`, `discovery_source = 'map_listing'`, `map_status = 'not_applicable'`, `retrieval_status = 'active'`; disabled moves it to `retrieval_status = 'stopped_disabled'`; make `bootstrapScope(scopeId, 'map')` create an active map row with `map_status = 'not_applicable'` so it is never promoted as a discovered group; cover enable, idempotent re-enable, disable and `activeScopes()` exclusion in `tests/integration/map-discovery.test.ts`

**Checkpoint**: Foundation ready — discovery rules and persistence can be used by the user stories

---

## Phase 3: User Story 1 — Discover events from the public map (Priority: P1) 🎯 MVP

**Goal**: The client reads the complete public map listing and returns validated, deduplicated identities with hints, without producing any canonical event.

**Independent Test**: Serve a listing fixture, call `fetchMapEventListing()`, and verify every stable identity is returned once, invalid hints are dropped and counted, and no canonical event payload is produced.

### Tests for User Story 1

- [x] T010 [P] [US1] Add contract tests in `apps/worker/tests/map-listing.contract.test.ts`: the request targets `https://upstream.test/carte/liste_evenements/` with no `page`, `page_size` or `limit` parameters; a `429` retries in place after `Retry-After`; an exhausted throttle surfaces `HttpError` with `status = 429`; `403`/`404` do not retry; a timeout, network failure and `5xx` remain retryable; an empty array resolves to an empty list
- [x] T011 [P] [US1] Add unit tests in `packages/core/src/discovery/map-listing.test.ts` for an entry with a valid `id` and every invalid optional hint (one test per field), a missing/blank/non-string `id`, a duplicate identity, a non-array body and an empty array; assert the exact `rejected`, `duplicates` and `droppedHints` counts

### Implementation for User Story 1

- [x] T012 [US1] Implement `fetchMapEventListing(): Promise<MapEventListingValidation>` in `apps/worker/src/adapters/action-populaire-client.ts` using the existing private `request()` helper and `validateMapEventListing`; do not add pagination parameters and do not reuse `validateActionPopulaireEvent`; keep `fetchEventDetails` unchanged
- [x] T013 [US1] Add a compatibility test in `packages/core/src/adapters/action-populaire-schemas.test.ts` proving the listing result exposes only summary fields and never returns `startTime`, `endTime`, `timezone`, `location` or `groups`; the `validateActionPopulaireEvent` rejection assertion is covered by T029

**Checkpoint**: User Story 1 is independently testable: the listing can be read and validated, and it cannot become canonical content

---

## Phase 4: User Story 2 — Resolve a discovered event to its authoritative detail (Priority: P1)

**Goal**: Gap-selected identities become pending event scopes; the existing event processor reads the detail document and publishes the canonical event.

**Independent Test**: Given a listing identity with no coverage, run the map job and verify exactly one pending event scope is requested; run the event job and verify the canonical event comes from the detail document, with 404 mapped to unknown and an identity mismatch mapped to the existing retryable failure.

### Tests for User Story 2

- [x] T014 [P] [US2] Add contract tests in `apps/worker/tests/map-discovery.contract.test.ts`: the map job calls `fetchMapEventListing()` exactly once and never `fetchEventDetails()`; it requests event scopes only for selected identities; it records `map_listing` as the discovery source; an empty listing requests nothing; a non-array listing fails without requesting a scope
- [x] T015 [P] [US2] Add integration coverage in `tests/integration/map-discovery.test.ts`: a selected identity creates exactly one `pending` event scope with `discovery_source = 'map_listing'`; a missing end hint writes `event_ends_at = NULL`; rerunning the same listing creates no duplicate scope
- [x] T016 [P] [US2] Add a detail-resolution contract test in `apps/worker/tests/map-detail-resolution.contract.test.ts`: a listed identity becomes a pending scope, then `processEventIngestion` with a matching detail document publishes the canonical event; assert the canonical object contains only the existing canonical keys and ignores `illustration`, `routes`, `rsvp`, `groupsAttendees` and `calendars`, keeping `apps/worker/tests/action-populaire-event-details.contract.test.ts` green; a 404 retires the event scope through the existing `UnknownEventError` path; a document with another identity follows the existing `EventIdentityMismatchError` retryable classification and records `mismatched`

### Implementation for User Story 2

- [x] T017 [US2] Implement `apps/worker/src/ingestion/map-discovery-processor.ts` with the exact processing order: verify the map scope is still active and the feature enabled before doing any work, otherwise mark the ledger `stopped` without reading the listing; ledger `running`; one `fetchMapEventListing()`; `validateMapEventListing`; `recordListing`; `selectGapCandidates`; `requestEventScopes` with `discovery_source = 'map_listing'`; mark `last_requested_at`, `last_outcome = 'requested'` and `next_reconcile_at = now + mapReconciliationIntervalMs`; ledger `succeeded`; no detail read and no publication
- [x] T018 [US2] Add the `map` branch to `apps/worker/src/ingestion/job-dispatch.ts` and define `MapDiscoveryDependencies` (client listing read, map persistence, event-scope requests, ledger, metrics, logger, cycle metrics); keep `processIngestionJob` as the single routing point
- [x] T019 [US2] Wire the map scope and dependencies in `apps/worker/src/main.ts`: call `ensureMapScope(config.ingestion.mapDiscoveryEnabled)` before the dispatcher starts, add the map dependencies to `ingestionDependencies`, pass `scopeKind: 'map'` through the existing queue callback, and keep group/event counters excluding the map scope
- [x] T020 [US2] Add an optional `mapDiscovery.recordOutcome(eventId, outcome, at)` dependency to `apps/worker/src/ingestion/event-ingestion-processor.ts`: call `'resolved'` after a successful publication, `'unknown'` in the `UnknownEventError` branch, `'mismatched'` in the `EventIdentityMismatchError` branch and skip the generic failure write for that error, and `'failed'` before `failIngestion` rethrows for every other failure; preserve current behaviour when the dependency or the observation row is absent
- [x] T021 [US2] Wire `recordOutcome` in `apps/worker/src/main.ts` to `packages/core/src/persistence/postgres-map-observations.ts`, using `nextReconcileAt = now + reconciliation` for `resolved`/`unknown`/`mismatched` and `now` for `failed`; add a contract test asserting a missing map observation row is a no-op

**Checkpoint**: User Stories 1 and 2 work together: a listing identity can become a canonical event through the existing detail path

---

## Phase 5: User Story 3 — Keep detail reads bounded and observable (Priority: P2)

**Goal**: Skip events already kept fresh, honour the freshness horizon and reconciliation interval, retry failed attempts, and expose every summary outcome.

**Independent Test**: Mix covered, covered-by-retired-scope, changed, unchanged-resolved, failed and ended identities in one listing; verify only the expected identities request a detail read and every counter is emitted.

### Tests for User Story 3

- [x] T022 [P] [US3] Extend `packages/core/src/discovery/map-selection.test.ts` with the coverage inputs and triggers: fresh active observation, observation through a retired/stopped scope, pending event scope, active event scope, ended event, changed fingerprint, reconciliation due, reconciliation not due, previous `failed` and previous `mismatched`
- [x] T023 [P] [US3] Extend `tests/integration/map-discovery.test.ts` with PostgreSQL cases: an event observed through an active group scope within `mapFreshnessHorizonMs` is skipped; the same event becomes a candidate once the observing scope is retired or the horizon passes; a pending or active event scope prevents a second request; `next_reconcile_at` in the future skips an unchanged resolved identity; `last_outcome = 'failed'` and `last_outcome = 'mismatched'` select it again

### Implementation for User Story 3

- [x] T024 [US3] Replace the basic gap query in `packages/core/src/persistence/postgres-map-selection.ts` with the full selection from [data-model.md](data-model.md): exclude identities with an `event_observation` within the freshness horizon whose `via_scope_id` is still `active`; exclude identities with a `pending` or `active` event scope; exclude identities whose valid `end_time <= now`; apply the trigger predicate (`last_requested_at IS NULL`, `next_reconcile_at IS NULL`, `next_reconcile_at <= now`, `last_outcome IN ('failed','mismatched')`); batch at most `500` identities per statement
- [x] T025 [US3] Add the map cycle metric keys `map.entries`, `map.rejected`, `map.duplicates`, `map.hints_dropped`, `map.gap_candidates`, `map.selected`, `map.skipped`, `map.outcomes_resolved`, `map.outcomes_unknown`, `map.outcomes_mismatched` and `map.outcomes_failed` to `packages/core/src/groups/cycle-metrics.ts`; emit them from `apps/worker/src/ingestion/map-discovery-processor.ts` and the event outcome branch; extend `packages/core/src/groups/cycle-metrics.test.ts`
- [x] T026 [US3] Add cumulative metrics and a structured `map-discovery` completion log in `apps/worker/src/ingestion/map-discovery-processor.ts` (`actionpop_map_listing_entries_total`, `actionpop_map_listing_rejected_total`, `actionpop_map_hints_dropped_total`, `actionpop_map_detail_requests_total`, `actionpop_map_outcomes_total{outcome=...}` with `outcome` in `resolved`, `unknown`, `mismatched`, `failed`); add an `actionpop_map_observations` gauge through `apps/worker/src/dispatcher/cycle-report.ts` and a `countObservations()` reader in `postgres-map-observations.ts`; update `apps/worker/src/operations/observability.test.ts`
- [x] T027 [US3] Add a contract test in `apps/worker/tests/map-discovery.contract.test.ts` proving the map job requests only `pending` scopes and that the number of detail reads in a cycle remains bounded by the existing `maxNewGroupsPerCycle` promotion budget; the “never reads a detail document” assertion stays in T014

**Checkpoint**: The feature is bounded and observable; unchanged or already-covered events cost no detail read

---

## Phase 6: User Story 4 — Preserve existing calendar behaviour (Priority: P2)

**Goal**: Adding the source changes no existing calendar content, attribution, cancellation or identity until a detail document confirms it.

**Independent Test**: Run existing group ingestion and attribution scenarios alongside a map listing that repeats, changes and omits events; verify the published calendar is unchanged except for genuinely new or confirmed events, and that disabling the feature leaves everything running.

### Tests for User Story 4

- [x] T028 [P] [US4] Add a regression integration test in `tests/integration/map-compatibility.test.ts`: existing group ingestion, attribution union and calendar output are unchanged with map discovery enabled; a map summary whose name, times or coordinates differ from a canonical event changes nothing without a detail document; an event absent from the listing is neither cancelled nor removed; the same identity observed through group and map paths yields one event
- [x] T029 [P] [US4] Add a compatibility unit test in `packages/core/src/adapters/action-populaire-schemas.test.ts`: the canonical event schema keys are unchanged, a map summary is rejected by `validateActionPopulaireEvent`, and the listing validator never returns `startTime`, `endTime`, `timezone`, `location` or `groups`
- [x] T030 [US4] Add an integration test in `tests/integration/map-discovery.test.ts` proving `requestEventScopes` preserves an existing `event_ends_at` when the map hint is absent and does not overwrite an existing `discovery_source` on update; verify a retired scope reopens on the same row and never creates a duplicate
- [x] T031 [US4] Add tests in `apps/worker/tests/event-ingestion.contract.test.ts` proving the optional map outcome recorder is a no-op when no observation row exists and does not alter the existing success, unknown, mismatched or failure behaviour of an event discovered through a group listing
- [x] T032 [US4] Add integration coverage in `tests/integration/map-scope-lifecycle.test.ts` for `ensureMapScope(false)`: the map scope becomes `stopped_disabled`, `activeScopes()` no longer returns it, observations and event scopes are preserved, an in-flight map job stops before reading the listing when the feature is disabled, and `ensureMapScope(true)` makes it active again without duplicating the row

**Checkpoint**: The feature is additive and reversible; all existing calendar behaviour remains intact

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, performance validation, quality gates and cleanup

- [x] T033 [P] Update `docs/dispatcher.mmd` with the map scope and its one-listing-per-cycle flow, and update `README.md` plus `config/actionpop.example.yaml` with the map discovery feature, the three configuration keys and the new metrics
- [x] T034 [P] Add a performance fixture test (in `apps/worker/tests/map-discovery.contract.test.ts` or `tests/integration/map-discovery.test.ts`) with at least 3,000 listing entries: assert one listing read, batched writes of at most 500 identities, no detail read in the map job, and no full event payload retained
- [x] T035 Run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm test:integration`; fix every failure without changing existing public contracts
- [x] T036 Run the scenarios in [quickstart.md](quickstart.md) against fixtures and, when available, the live listing and detail resources; update the quickstart commands or expected values if the observed shapes differ
- [x] T037 Review every new module for the 150-line guideline, remove dead code, confirm exports through `packages/core/src/index.ts`, and verify no `any` or unjustified type assertion was introduced

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately; T002, T003 and T004 can run in parallel with T001
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on T003 (summary schema) and T005 (listing validation)
- **User Story 2 (Phase 4)**: Depends on US1 (client read), T006 (selection), T007 (observation persistence), T008 (scope request) and T009 (map scope)
- **User Story 3 (Phase 5)**: Depends on US2 (map job) and T006/T007 (selection and persistence)
- **User Story 4 (Phase 6)**: Depends on US2 and US3 (running map discovery and selection)
- **Polish (Phase 7)**: Depends on all desired user stories

### User Story Dependencies

- **US1**: No dependency on another story; delivers the client listing and validation
- **US2**: Depends on US1 for the listing read; delivers the map job and the existing detail path
- **US3**: Depends on US2; refines selection, reconciliation and observability
- **US4**: Depends on US2 and US3; proves compatibility and reversibility

### Within Each User Story

- Write the test task first and make it fail
- Implement the pure rule or adapter before wiring it into the worker
- Implement persistence before the processor that calls it
- Wire the processor after its dependencies exist
- Complete the story checkpoint before moving to the next priority

### Parallel Opportunities

- `T001` / `T002` / `T003` / `T004` can run in parallel (different files)
- `T005` and `T006` can run in parallel; `T008` follows `T004` and shares the integration test file with T007
- `T010` / `T011` can run in parallel; `T012` follows `T010`
- `T014` / `T015` / `T016` can run in parallel; `T017` follows `T014`/`T015`
- `T022` / `T023` can run in parallel; `T024` follows both
- `T028` / `T029` / `T030` / `T031` / `T032` can run in parallel once their dependencies exist
- `T033` / `T034` can run in parallel; `T037` follows the implementation tasks

---

## Parallel Example: User Story 1

```text
T010  Contract tests for the listing read (apps/worker/tests/map-listing.contract.test.ts)
T011  Validation/dedup unit tests (packages/core/src/discovery/map-listing.test.ts)
T012  Implement fetchMapEventListing after T010 (apps/worker/src/adapters/action-populaire-client.ts)
T013  Canonical-rejection compatibility test (packages/core/src/adapters/action-populaire-schemas.test.ts)
```

## Parallel Example: User Story 2

```text
T014  Map processor contract tests (apps/worker/tests/map-discovery.contract.test.ts)
T015  Pending-scope integration tests (tests/integration/map-discovery.test.ts)
T016  Detail-resolution contract tests (apps/worker/tests/map-detail-resolution.contract.test.ts)
T017  Implement the map processor after T014/T015
T018  Route the map branch in job-dispatch.ts
T019  Wire the runtime in main.ts
T020  Record detail outcomes in event-ingestion-processor.ts
T021  Wire recordOutcome in main.ts
```

## Parallel Example: User Story 3

```text
T022  Selection unit tests (packages/core/src/discovery/map-selection.test.ts)
T023  Selection integration tests (tests/integration/map-discovery.test.ts)
T024  Full gap query after T022/T023
T025  Cycle metrics after T024
T026  Cumulative metrics/logs and observations gauge
T027  Bounded-detail contract test after T017
```

## Implementation Strategy

### MVP First

- **US1 alone** is the technical MVP: the client can read and validate the complete map listing, and no canonical content can be produced from it.
- **US1 + US2** is the smallest calendar-visible increment: a discovered identity can become a canonical event through the existing detail processor.
- **US3** makes the feature safe at listing scale; **US4** proves it is additive.

### Incremental Delivery

1. Complete Phase 1 and Phase 2; run the foundational integration tests.
2. Deliver US1 and validate the live listing shape.
3. Deliver US2 and validate one discovered event end to end.
4. Deliver US3 and validate coverage, reconciliation and counters on a 3,000-entry fixture.
5. Deliver US4 and run the full compatibility suite.
6. Finish with the polish tasks and quickstart.

### Notes

- The map summary never writes `startTime`, `endTime`, `timezone`, `location`, `groups`, `description` or a subtype label.
- Absence from the listing never cancels, deletes or retires an event.
- The existing `maxNewGroupsPerCycle` is the only detail-read ceiling; the map job requests pending scopes, it does not read details.
- `INGESTION_MAP_DISCOVERY_ENABLED=false` must remain a safe, reversible switch.
