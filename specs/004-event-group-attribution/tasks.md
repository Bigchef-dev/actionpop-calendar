# Tasks: Reliable Event–Group Attribution During Ingestion

**Input**: Design documents from `/specs/004-event-group-attribution/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The project constitution (Principle III) requires automated tests for every business rule, and [plan.md](plan.md) fixes the test strategy; test tasks precede their implementation within each story.

**Organization**: Tasks are grouped by user story so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: `[US1]`…`[US4]`, matching [spec.md](spec.md)
- Every task names the exact file path it touches

## Path Conventions

- `packages/core/src/` — shared rules, adapters, persistence
- `apps/worker/src/` — ingestion, catalogue, dispatcher
- `apps/api/src/` — read-only transport (unchanged by this feature)
- `apps/worker/tests/`, `packages/core/**/*.test.ts`, `tests/integration/` — tests
- `prisma/` — schema and migrations

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration surface required by the dispatcher ceiling

- [x] T001 Add `IngestionScopeConfig` with `maxNewGroupsPerCycle` (integer `>= 1`, default `200`) to `packages/core/src/config/config.interface.ts` and `packages/core/src/config/defaults.config.ts`, add a strict `ingestion` scope to `packages/core/src/config/config-schema.ts`, parse `INGESTION_MAX_NEW_GROUPS_PER_CYCLE` in `packages/core/src/config/runtime-config.ts`, and document the key in `config/actionpop.example.yaml`
- [x] T002 [P] Test the new setting in `packages/core/src/config/config-file.test.ts` and `packages/core/src/config/runtime-config.test.ts`: default `200`, environment override wins over the file, `0` and non-integers are rejected with a message naming the origin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, payload mapping and the publication write path that every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Extend `prisma/schema.prisma`: on `GroupScope` add `scope_key` (`TEXT`, unique, `lower(trim(scope_id))`) and `discovery_source` (`TEXT`, default `"directory"`), `map_status` (`TEXT`, default `"unlisted"`), `retrieval_status` (`TEXT`, default `"pending"`), `first_observed_at`, `last_observed_at`, `stopped_at` (`DateTime?`), `stopped_reason` (`TEXT?`), drop `active`, add indexes on `retrieval_status`, `map_status`, `first_observed_at`; on `EventRecord` add `group_attribution` (`TEXT`, default `"unknown"`) with an index; widen `EventGroupLink` to `observed_via_scope_id` with primary key `(event_id, scope_id, observed_via_scope_id)` and two named relations to `GroupScope`; add `EventObservation` (`event_id`, `via_scope_id`, `stated_group_count`, `first_seen_period`, `last_seen_period`, primary key `(event_id, via_scope_id)`, index on `last_seen_period`) and `IngestionCycleMetric` (`period_token`, `metric`, `value` default `0`, primary key `(period_token, metric)`, foreign key to `processing_period`)
- [x] T004 Write `prisma/migrations/0004_event_group_attribution/migration.sql` following the backfill order in [data-model.md](data-model.md): add `scope_key` backfilled as `lower(trim(scope_id))` with its unique index, add lifecycle columns and backfill from `active` (`true` → `map_status='listed'`/`retrieval_status='active'`, `false` → `'inactive'`/`'stopped_inactive'`), drop `active`, add `event_record.group_attribution`, add `observed_via_scope_id` to `event_group_link` backfilled with `scope_id` before setting it `NOT NULL` and replacing the primary key, then create the two new tables and all indexes
- [x] T005 Regenerate the Prisma client (`pnpm prisma:generate`) and remove every use of `group_scope.active` so the workspace compiles: `apps/worker/src/catalogue/group-catalogue.ts`, `apps/worker/src/operations/ingestion-ledger.ts` and `packages/core/src/persistence/postgres-calendar-repository.ts` must never create or update a scope as `active` — a bootstrapped row is `discovery_source='event_payload'`, `map_status='unlisted'`, `retrieval_status='pending'`
- [x] T006 [P] Add `ObservedGroup` (`{ id: string; name?: string }`) and `groups?: readonly ObservedGroup[]` plus `blankGroupIdentifiers?: number` to `IncomingEvent` in `packages/core/src/models/event.interface.ts`, documented as sorted by identifier and deduplicated
- [x] T007 [P] Implement `toObservedGroups(value)` in `packages/core/src/groups/observed-groups.ts` (trim identifiers, drop and count identifiers that trim to empty, collapse duplicates keeping the first name, sort by identifier) and cover it, with `normalizeScopeIdentity`, in `packages/core/src/groups/observed-groups.test.ts`; export the module from `packages/core/src/index.ts`
- [x] T008 [P] Implement the status unions and transition helpers in `packages/core/src/groups/group-status.ts` (`MapStatus = 'listed' | 'inactive' | 'unlisted' | 'removed'`, `RetrievalStatus = 'pending' | 'active' | 'stopped_inactive' | 'stopped_unknown'`, `nextMapStatus`, `nextRetrievalStatus` for the directory, discovery and unknown-group events) and cover every row of both state machines from [data-model.md](data-model.md) in `packages/core/src/groups/group-status.test.ts`; export the module from `packages/core/src/index.ts`
- [x] T009 Implement `packages/core/src/persistence/postgres-group-registry.ts`: `registerObservedGroups(transaction, groups, periodToken)` (insert missing groups as `pending`/`unlisted` with `first_observed_at`, refresh `display_name` and `last_observed_at`, re-enable `stopped_unknown` to `active`, never resurrect `inactive`), `promotePendingScopes(limit)` (single `UPDATE … RETURNING` ordered by `first_observed_at ASC NULLS FIRST, scope_id ASC`), `markInactive`/`markActive` for directory sync, `markStoppedUnknown(scopeId, reason)` and registry counts by `retrieval_status` and `map_status`; export the module from `packages/core/src/index.ts`
- [x] T010 Split the calendar repository along the boundaries in [plan.md](plan.md): move event row and location upserts into `packages/core/src/persistence/event-record-writer.ts`, create `packages/core/src/persistence/attribution-writer.ts` (delete links contributed by the observing listing and no longer stated, upsert stated links with `observed_via_scope_id`, upsert `event_observation` with `stated_group_count`, recompute `event_record.group_attribution` as `stated` when at least one link exists and `none_stated` when none exists but an observation does), and keep `packages/core/src/persistence/postgres-calendar-repository.ts` as transaction orchestration only
- [x] T011 Make `PublishedEvent` carry `groups` by updating `apps/worker/src/persistence/snapshot-publisher.ts` so the value produced by `toIncomingEvent` reaches `saveCurrent` unchanged
- [x] T012 Extract the job body from `apps/worker/src/main.ts` into `apps/worker/src/ingestion/calendar-ingestion-processor.ts` (same order: ledger running → page collection → type validation → enrichment → mapping → publication → ledger succeeded) and map `event.groups` through `toObservedGroups` in `toIncomingEvent`, leaving all other behaviour identical; export the processor from `apps/worker/src/index.ts`

**Checkpoint**: Foundation ready — schema, mapping and write path exist; each story can now proceed independently.

---

## Phase 3: User Story 1 - Events stay visible whatever their group situation (Priority: P1) 🎯 MVP

**Goal**: An event returned by a listing is published even when its stated groups are unknown to the directory, when it states no group, or when another listing fails.

**Independent Test**: Seed a listing that returns an event stating a group absent from `group_scope` and another listing that fails, run one publication, and verify both events are reachable in the calendar and the calendar read model returns each once.

### Tests for User Story 1

- [x] T013 [P] [US1] Integration test in `tests/integration/event-group-attribution.test.ts`: an event stating a group absent from `group_scope` is stored and reachable, a payload with a blank and a duplicate identifier still publishes, a second listing returning the same event does not duplicate it, and a failed publication leaves the previous snapshot and attribution untouched
- [x] T014 [P] [US1] Integration test in `tests/integration/calendar-event-query.test.ts`: after the primary-key change, `groupIds` is deduplicated and sorted when one event is attributed to the same group through two observing listings

### Implementation for User Story 1

- [x] T015 [US1] Guarantee that malformed group data cannot fail a listing: only identifiers returned by `toObservedGroups` reach `packages/core/src/persistence/attribution-writer.ts`, so a blank or duplicate identifier never reaches registration, and `postgres-group-registry.ts` keeps its strict transaction semantics
- [x] T016 [US1] Deduplicate and sort `groupIds` in `packages/core/src/persistence/postgres-calendar-event-query.ts` so the widened link key cannot repeat a group identifier in the calendar
- [x] T017 [US1] Verify no regression in the public read path by running `apps/api/tests/calendar-ics.test.ts` and `apps/api/tests/calendar-metadata.test.ts` unchanged

**Checkpoint**: User Story 1 is functional — visibility never depends on group registration.

---

## Phase 4: User Story 2 - Attribution reproduces what the source states (Priority: P1)

**Goal**: An event's published attribution equals the union of the groups its complete observations state, never the listing that returned it, and is reconciled on every complete observation.

**Independent Test**: Replay a payload where an event retrieved through listing A states B and C; verify the event carries B and C, never A. Replay it unchanged and verify zero attribution changes, then replay without C and verify only C disappears.

### Tests for User Story 2

- [x] T018 [P] [US2] Unit test in `packages/core/src/groups/attribution-reconciliation.test.ts`: added/removed links per observing listing, union across two listings, blank identifier diagnostic, duplicate collapse, idempotent replay returns empty diffs
- [x] T019 [P] [US2] Integration test in `tests/integration/event-group-attribution.test.ts`: live attribution equals the stated set and excludes the retrieving listing, a complete re-observation removes only the no-longer-stated link, a failed retrieval changes nothing, and an empty group set yields `group_attribution='none_stated'`

### Implementation for User Story 2

- [x] T020 [P] [US2] Implement the pure diff in `packages/core/src/groups/attribution-reconciliation.ts`: given the links previously contributed by an observing listing and the normalized stated set, return `toAdd` and `toRemove`; export the module from `packages/core/src/index.ts`
- [x] T021 [US2] Apply the diff in `packages/core/src/persistence/attribution-writer.ts` inside the publication transaction, using `toAdd`/`toRemove` from T020 and recomputing `event_record.group_attribution`
- [x] T022 [US2] Include sorted stated group identifiers in `NormalizedCalendarContent` in `packages/core/src/domain/event-revision.ts` only when non-empty, so an organizer change bumps `SEQUENCE` while events without groups keep their previous hash; extend `packages/core/src/domain/event-revision.test.ts` accordingly
- [x] T023 [US2] Carry the identifiers dropped by `toObservedGroups` into `apps/worker/src/ingestion/event-mapper.ts` (`IncomingEvent.blankGroupIdentifiers`) so a listing with a blank or duplicate identifier still publishes every event and the writer can count it

**Checkpoint**: User Stories 1 and 2 both hold independently — attribution matches the source.

---

## Phase 5: User Story 3 - Unlisted groups are covered automatically (Priority: P2)

**Goal**: A group named by a payload but absent from the directory becomes an ingestion scope from the next cycle, bounded by a ceiling, and stops only on an explicit unknown-group answer.

**Independent Test**: Ingest an event naming unknown group `G`, run two dispatcher cycles with a stub queue, and verify `G` is `pending` with no job after cycle 1, `active` with exactly one job after cycle 2, is stopped by a 404, and is reactivated by a later observation.

### Tests for User Story 3

- [x] T024 [P] [US3] Discovery tests: `apps/worker/tests/group-discovery.contract.test.ts` proves the payload mapping (stated groups, blank identifiers, no-group event), while `tests/integration/event-group-attribution.test.ts` proves the registry side — new groups are `pending`/`unlisted`, an `inactive` group stays inactive, and a `stopped_unknown` group is re-enabled by evidence
- [x] T025 [P] [US3] Contract test in `apps/worker/tests/scheduling-ceiling.contract.test.ts`: promotion respects `INGESTION_MAX_NEW_GROUPS_PER_CYCLE`, promotes in `first_observed_at` then `scope_id` order, and never produces two jobs for one scope in a cycle
- [x] T026 [P] [US3] Contract test in `apps/worker/tests/unknown-group.contract.test.ts`: a 404 becomes `UnknownGroupError`, the scope moves to `stopped_unknown` with ledger status `stopped` and no rethrow, while a timeout, 429 or 500 leaves the status untouched
- [x] T027 [P] [US3] Directory sync tests in `tests/integration/group-directory-sync.test.ts`: `listed`/`inactive` plus `active`/`stopped_inactive`, groups absent from a complete response become `removed` without changing retrieval, `discovery_source` is kept, a discovered group later listed keeps one scope, and a `stopped_unknown` group is restored by the directory

### Implementation for User Story 3

- [x] T028 [P] [US3] Add `UnknownGroupError` to `packages/core/src/operations/errors.ts` and `'stopped'` to `IngestionLedgerStatus` in `packages/core/src/domain/types.ts`
- [x] T029 [US3] In `apps/worker/src/adapters/action-populaire-client.ts`, translate a `404` on `/api/groupes/{groupId}/evenements/a-venir/` into `UnknownGroupError`; every other status keeps the existing `HttpError` behaviour
- [x] T030 [US3] Rewrite the synchronization in `apps/worker/src/catalogue/group-catalogue.ts` to delegate to `postgres-group-registry.ts` (statuses from `group-status.ts`, absent groups `removed`), keeping the response fully validated before any write
- [x] T031 [US3] Extend `apps/worker/src/dispatcher/dispatcher.ts` to promote pending scopes through `promotePendingScopes(limit)` before selecting `retrieval_status='active'` scopes, keeping the existing lock and deterministic job identity
- [x] T032 [US3] Handle the unknown-group branch in `apps/worker/src/ingestion/calendar-ingestion-processor.ts`: mark the scope `stopped_unknown` with `stopped_reason='upstream_unknown_group'` and `stopped_at`, write ledger status `stopped`, and return without throwing
- [x] T033 [US3] Wire the ceiling and registry into `apps/worker/src/main.ts`: pass `config.ingestion.maxNewGroupsPerCycle` to the dispatcher and the registry/promotion dependencies used by T009 and T031, without changing the health server

**Checkpoint**: All three behavioural stories work independently.

---

## Phase 6: User Story 4 - Gaps and repairs are observable (Priority: P3)

**Goal**: Every cycle reports unlisted groups discovered, groups scheduled/stopped/re-enabled, events without a stated group, and attributions added/removed.

**Independent Test**: Run a cycle over a payload with one unknown group, one event without group and one changed attribution; verify the seven per-cycle counters, the four gauges and the `dispatcher-cycle` log line match, and that a failed listing reports zero removals.

### Tests for User Story 4

- [x] T034 [P] [US4] Unit test in `packages/core/src/groups/cycle-metrics.test.ts`: the metric key constants match [contracts/operator-reporting.md](contracts/operator-reporting.md) and the counter increment helper is monotonic
- [x] T035 [P] [US4] Integration test in `tests/integration/ingestion-cycle-metrics.test.ts`: publication increments the seven keys for the current period, the dispatcher reads the previous period's rows, and a failed listing produces no `attributions.removed`

### Implementation for User Story 4

- [x] T036 [P] [US4] Implement the metric keys and the atomic increment helper in `packages/core/src/groups/cycle-metrics.ts` (`groups.discovered_unlisted`, `groups.scheduled`, `groups.stopped_unknown`, `groups.re_enabled`, `groups.blank_identifier`, `events.without_group`, `attributions.added`, `attributions.removed`); export the module from `packages/core/src/index.ts`
- [x] T037 [US4] Increment the counters from the publication summary in `apps/worker/src/ingestion/calendar-ingestion-processor.ts` (discovered, re-enabled, blank identifier, without group, added, removed) and the scheduled counter from `apps/worker/src/dispatcher/cycle-report.ts`, including `groups.stopped_unknown` for the stop branch of `apps/worker/src/ingestion/ingestion-outcome.ts`
- [x] T038 [US4] Emit the per-cycle report from `apps/worker/src/dispatcher/cycle-report.ts`: read the previous period's metrics, set `actionpop_groups_active`, `actionpop_groups_pending`, `actionpop_groups_unlisted`, `actionpop_groups_stopped`, and log the `dispatcher-cycle` line described in [contracts/operator-reporting.md](contracts/operator-reporting.md)
- [x] T039 [US4] Extend the ingestion completion log in `apps/worker/src/ingestion/calendar-ingestion-processor.ts` with the `attribution` block (events, eventsWithoutGroup, attributionsAdded, attributionsRemoved, unlistedDiscovered) and add a `stopped` outcome log for the unknown-group branch

**Checkpoint**: All four stories are functional and measurable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T040 [P] Update `docs/data-domains.mmd` and `docs/object-design.mmd` to show the group lifecycle, attribution links and observations
- [x] T041 Run `pnpm quality` (typecheck, lint, unit, integration, build) and fix every failure
- [x] T042 Review the module-size rule (constitution Principle IV): `apps/worker/src/main.ts` (441 → 317) and `postgres-calendar-repository.ts` (294 → 249) shrank, and the two modules that exceeded 150 lines were split into `postgres-group-queries.ts` and `ingestion-outcome.ts`
- [x] T043 Execute validation scenarios 1–9 in `specs/004-event-group-attribution/quickstart.md` through `pnpm test`, `pnpm test:integration` and a schema inspection, recording the outcome of each against its success criterion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; **blocks all stories**
- **User Stories (Phases 3–6)**: all depend on Foundational
- **Polish (Phase 7)**: depends on the stories that are delivered

### User Story Dependencies

- **US1 (P1)**: after Foundational; no dependency on other stories
- **US2 (P1)**: after Foundational; consumes the writer created in T010 and the normalization from T007, but does not require US1's hardening
- **US3 (P2)**: after Foundational; consumes the registry from T009 and the pure statuses from T008
- **US4 (P3)**: needs US2's writer increments and US3's promotion; deliver after them

### Within Each Story

- Tests are written first and must fail before implementation
- Pure rules (`packages/core/src/groups/`) before persistence, persistence before the processor wiring
- The checkpoint at the end of each phase is the independent validation point

### Key Task Dependencies

| Task | Requires |
|------|----------|
| T004 | T003 |
| T005 | T004 |
| T009 | T003, T008 |
| T010 | T003, T009 |
| T011, T012 | T006, T007, T010 |
| T015, T016 | T009, T010 |
| T019, T021 | T010 |
| T022 | T011 |
| T030 | T008, T009, T028 |
| T031 | T009 |
| T032 | T028, T029 |
| T037 | T010, T031 |
| T038 | T031, T036 |
| T041–T043 | all delivered stories |

---

## Parallel Opportunities

- **Setup**: T001 and T002 can be prepared together, T002 validating T001.
- **Foundational**: after T003, T006, T007 and T008 are independent files and can run in parallel; T009 and T010 follow.
- **US1**: T013 and T014 are separate test files; T015 and T016 touch different files.
- **US2**: T018 (test) and T020 (pure rule) can start together; T019 follows T021.
- **US3**: T024–T027 are four independent contract test files; T028 (types) and T029 (client) are independent of T030–T033.
- **US4**: T034 and T036 are independent of T035 and T037.

### Parallel Example: User Story 3

```bash
# Launch the four contract tests together
Task: "Contract test for discovery in apps/worker/tests/group-discovery.contract.test.ts"
Task: "Contract test for the ceiling in apps/worker/tests/scheduling-ceiling.contract.test.ts"
Task: "Contract test for an unknown group in apps/worker/tests/unknown-group.contract.test.ts"
Task: "Contract test for directory statuses in apps/worker/tests/action-populaire-groups.contract.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — Setup
2. Phase 2 — Foundational (blocks everything)
3. Phase 3 — US1
4. **STOP and validate** visibility with T013/T014, then run `pnpm --filter @actionpop/worker test && pnpm test:integration`

US1 alone does not improve attribution; it guarantees that the new persistence never loses an event. Because US2 is also P1 and is the reason for the feature, the recommended first release is **US1 + US2**.

### Incremental Delivery

1. Setup + Foundational → schema and write path in place
2. US1 → visibility guaranteed (deployable, no visible change)
3. US2 → attribution matches the source (deployable, the reported defect fixed)
4. US3 → automatic coverage of unlisted groups (deployable, ingestion cost grows as bounded)
5. US4 → measured gaps (deployable, operator-facing only)
6. Polish → quality gate and quickstart evidence

### Notes

- `[P]` marks tasks in different files with no incomplete dependency
- Migrations are additive except the documented replacement of `group_scope.active` in T004
- The public calendar contract must stay untouched; any test change in `apps/api/tests/` is a regression signal, not a task
- Commit after each task or logical group; stop at each checkpoint to validate the story independently

---

## Phase 8: Convergence

- [x] T044 CRITICAL Resolve every stated and observing group identifier to its canonical `group_scope.scope_id` through `scope_key` before diffing, inserting or deleting `event_group_link` rows in `packages/core/src/persistence/attribution-writer.ts` (including the `observed_via_scope_id` side), so a payload that spells a registered group with a different case cannot violate `event_group_link_scope_id_fkey` and abort the whole publication; add an integration case to `tests/integration/event-group-attribution.test.ts` that publishes the same event through two listings stating `Group-A` and `group-a` per FR-002 and the case-insensitive identity assumption (`contradicts`)
- [x] T045 Isolate map-directory synchronisation in `apps/worker/src/main.ts` so a failed or unavailable directory neither aborts worker startup nor skips the dispatcher run: catch the fetch/sync failure, log it, leave every known group untouched, and still promote and dispatch the listings that can be retrieved; cover the cycle with a contract test per FR-015 (`missing`)
- [x] T046 Relax `eventGroupSchema` in `packages/core/src/adapters/action-populaire-schemas.ts` so a blank group identifier and an absent or blank group name no longer fail the whole event (trimmed `id`, optional `name`), letting `toObservedGroups` drop and count blank identifiers and fall back to the identifier for display; add payload-validation cases in `packages/core/src/adapters/action-populaire-schemas.test.ts` and a mapping case in `apps/worker/tests/group-discovery.contract.test.ts` per FR-011 (`contradicts`)
- [x] T047 Emit the five cumulative counters that `contracts/operator-reporting.md` requires on `/metrics` but nothing increments — `actionpop_groups_discovered_total`, `actionpop_groups_re_enabled_total`, `actionpop_events_without_group_total`, `actionpop_attributions_added_total`, `actionpop_attributions_removed_total` — from the publication summary in `apps/worker/src/ingestion/calendar-ingestion-processor.ts`, and assert them in `apps/worker/tests/cycle-report.contract.test.ts` per FR-013 and `contracts/operator-reporting.md` (`partial`)
- [x] T048 Record `stopped_at` and `stopped_reason = 'map_inactive'` in `packages/core/src/persistence/postgres-group-directory.ts` when the directory sync moves a group to `retrieval_status = 'stopped_inactive'`, and assert the values in `tests/integration/group-directory-sync.test.ts` per the `group_scope` column contract in [data-model.md](data-model.md) (`partial`)
