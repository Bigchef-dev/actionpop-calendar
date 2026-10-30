# Tasks: Dedicated Ingestion for Events Without a Stated Group

**Input**: Design documents from `/specs/005-event-ingestion-scopes/`

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

**Purpose**: Configuration surface whose meaning widens with the second ingestion kind

- [x] T001 Document in `config/actionpop.example.yaml` that `INGESTION_MAX_NEW_GROUPS_PER_CYCLE` now bounds **every** scope promoted per cycle — discovered groups and event ingestions — while keeping the key and its default of `200`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Registry identity, lifecycle vocabulary, failure classification and the shared publication path that every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Extend `prisma/schema.prisma`: rename model `GroupScope` to `IngestionScope` with `@@map("ingestion_scope")`; add `scopeKind` (`String`, default `"group"`, `@map("scope_kind")`) and `eventEndsAt` (`DateTime?`, `@map("event_ends_at")`); replace `@unique` on `scopeKey` with `@@unique([scopeKind, scopeKey])`; add `@@index([scopeKind, retrievalStatus])` and `@@index([scopeKind, eventEndsAt])`; keep every existing relation (`EventGroupLink` ×2, `EventObservation`, `CalendarSnapshot`, `Subscription`, `IngestionLedger`) pointing at the renamed model
- [x] T003 Write `prisma/migrations/0005_event_ingestion_scopes/migration.sql` in this order: `ALTER TABLE "group_scope" RENAME TO "ingestion_scope"`; rename the indexes to the `ingestion_scope_*` prefix (`group_scope_scope_key_key`, `group_scope_retrieval_status_idx`, `group_scope_map_status_idx`, `group_scope_first_observed_at_idx`); add `"scope_kind" TEXT NOT NULL DEFAULT 'group'` and `"event_ends_at" TIMESTAMP(3)`; drop the single-column unique index on `"scope_key"` and create a unique index on `("scope_kind", "scope_key")`; create `("scope_kind", "retrieval_status")` and `("scope_kind", "event_ends_at")` indexes. Existing rows need no backfill beyond the column default: every row stays `scope_kind = 'group'` with its `map_status` and `retrieval_status` untouched
- [x] T004 Regenerate the Prisma client (`pnpm prisma:generate`) and make the workspace compile after the rename: replace every `prisma.groupScope` access with `prisma.ingestionScope` (18 occurrences across `packages/core/src/persistence/postgres-group-registry.ts` and 8 files under `tests/integration/`) and every raw `"group_scope"` table reference with `"ingestion_scope"` (13 occurrences in `packages/core/src/persistence/postgres-group-registry.ts`, `postgres-group-directory.ts`, `postgres-group-queries.ts`)
- [x] T005 [P] Extend the lifecycle vocabulary: add `'retired'` to `RetrievalStatus` in `packages/core/src/domain/types.ts`, add `'not_applicable'` to `MapStatus` in `packages/core/src/groups/group-status.ts`, and make `nextGroupStatus` treat `not_applicable` as untouched by every directory transition so only event scopes ever hold it; cover each new row of the state machines in `packages/core/src/groups/group-status.test.ts`
- [x] T006 [P] Add `UnknownEventError` (carrying the event identifier) and `EventIdentityMismatchError` (requested vs received identifier) to `packages/core/src/operations/errors.ts`; add `'other'` to `RetryReason` and classify `EventIdentityMismatchError` as `{ retryable: true, reason: 'other' }` in `packages/core/src/operations/retry-policy.ts`; extend `packages/core/src/operations/retry-policy.test.ts` with the mismatch case and prove `UnknownEventError` is not handled by the retry policy (the processor decides, as for `UnknownGroupError`)
- [x] T007 [P] Implement the pure event-scope rules in `packages/core/src/scopes/event-scope.ts`: `requiresEventIngestion(observation, observedAt)` returning true only when the normalized stated-group list is empty **and** `endTime` is strictly after `observedAt`; and `nextEventScopeStatus(input)` returning `'retired'` (`event_ended`, `event_group_stated`, `event_unknown`) or `'pending'` when a retired scope's qualifying condition holds again, without ever producing a duplicate retirement. Export from `packages/core/src/scopes/event-scope.ts` via `packages/core/src/index.ts` and cover the end-time boundary (equal, past, future), each retirement trigger, the re-qualification and the terminal cases in `packages/core/src/scopes/event-scope.test.ts`
- [x] T008 Make scope identity kind-aware across **every** scope-table statement: `bootstrapScope(scopeId, kind = 'group')` inserts `scope_kind` and uses `ON CONFLICT ("scope_kind", "scope_key") DO NOTHING` (an event scope boots as `map_status='not_applicable'`, `retrieval_status='pending'`, `discovery_source='event_payload'`); `resolveScopeIds(keys, kind = 'group')` filters on `scope_kind`; **convert the two remaining `ON CONFLICT ("scope_key")` clauses to `("scope_kind","scope_key")` and pin `scope_kind='group'` in their statements** — `registerObservedGroups` (insert, re-enable and refresh, `packages/core/src/persistence/postgres-group-registry.ts`) and `synchronizeGroupDirectory` (upsert plus the absence pass, `packages/core/src/persistence/postgres-group-directory.ts`) — because T003 drops the single-column unique index; and add `activeScopes()` returning `{ scopeId, scopeKind }[]` in a new `packages/core/src/persistence/postgres-scope-queries.ts`, leaving group-only counts in `packages/core/src/persistence/postgres-group-queries.ts`
- [x] T009 Create `packages/core/src/persistence/postgres-event-scopes.ts` with three bounded operations: `requestEventScopes(transaction, events, observedAt)` inserting `scope_kind='event'`, `map_status='not_applicable'`, `retrieval_status='pending'`, `discovery_source='event_payload'`, `event_ends_at = endTime`, `first_observed_at = last_observed_at = observedAt` with `ON CONFLICT ("scope_kind", "scope_key") DO UPDATE` refreshing `event_ends_at`, `last_observed_at` and `display_name`, and **returning a scope to `pending` (clearing `stopped_at` and `stopped_reason`) when it is `retired` and the event qualifies again** without ever touching a `group` row; `retireEventScopesForAttributedEvents(transaction, eventIds, at)` setting `retrieval_status='retired'`, `stopped_reason='event_group_stated'`, `stopped_at=at` for those events' event scopes only and returning the number of rows retired; and `retireEndedEventScopes(client, now)` setting `stopped_reason='event_ended'` for `scope_kind='event' AND retrieval_status IN ('pending','active') AND event_ends_at <= now`, also returning the count. Every statement is one `UPDATE … RETURNING` or one `INSERT … ON CONFLICT`
- [x] T010 [P] Thread the scope kind through publication: add `scopeKind?: ScopeKind` to `CalendarDataset` in `packages/core/src/persistence/calendar-dataset-repository.ts` and to `PublishedGroupSnapshot` in `packages/core/src/models/event.interface.ts` (absent means `'group'`), carry it in `apps/worker/src/persistence/snapshot-publisher.ts`, and make `saveCurrent` bootstrap the observing scope with that kind
- [x] T011 Extract the publication block of `apps/worker/src/ingestion/calendar-ingestion-processor.ts` into a new `apps/worker/src/ingestion/publication.ts` exposing `publishObservation(scopeId, scopeKind, incoming, periodToken, deps)` (revision publish → snapshot publish → `PublicationSummary`), keeping the group processor's behaviour and log line identical
- [x] T012 Export the new modules (`packages/core/src/scopes/event-scope.ts`, `postgres-scope-queries.ts`, `postgres-event-scopes.ts`, `apps/worker/src/ingestion/publication.ts`) from `packages/core/src/index.ts` and `apps/worker/src/index.ts`, then run `pnpm typecheck`, `pnpm test` **and `pnpm test:integration`** to prove the rename, the composite conflict targets and the extraction changed no behaviour

**Checkpoint**: Foundation ready — the registry holds two kinds, the vocabulary exists and the publication path is shared; each story can now proceed independently.

---

## Phase 3: User Story 1 - A group-less event stays accurate until it ends (Priority: P1) 🎯 MVP

**Goal**: An event that states no group and has not ended gets exactly one dedicated ingestion, which refreshes its content every cycle and retires when the event ends or the source says it is unknown.

**Independent Test**: Publish a listing whose event states no group and ends in the future, promote its scope, change the event at the source, run the ingestion, and verify the calendar reflects the change while an ended event and a group-stating event get no ingestion at all.

### Tests for User Story 1

- [x] T013 [P] [US1] Integration test in `tests/integration/event-scope-lifecycle.test.ts`: discovering a group-less upcoming event creates exactly one `scope_kind='event'` row (`pending`, `not_applicable`, `event_ends_at` equal to the event's end), a group-stating event creates none, an already-ended group-less event creates none while still being published with `group_attribution='none_stated'`, replaying the same listing creates nothing more, and an event whose end time has passed retires its scope with `stopped_reason='event_ended'` on the next dispatch
- [x] T014 [P] [US1] Integration test in `tests/integration/event-ingestion-publication.test.ts`: a detail observation refreshes the event's content and bumps `sequence` exactly once, records `event_observation (event, event scope)` with `stated_group_count = 0`, keeps `group_attribution='none_stated'` while no link exists, and replaying the same document reports zero attribution changes
- [x] T015 [P] [US1] Contract test in `apps/worker/tests/event-ingestion.contract.test.ts`: the processing order of [contracts/event-ingestion.md](contracts/event-ingestion.md) (ledger running → read → validate → identity check → type validation → enrichment → publication → ledger succeeded); a 404 retires the scope with `event_unknown`, writes ledger `stopped` and does not throw; timeout, 429, 500, an unreadable document and an identifier mismatch each leave the scope `active`, publish nothing and throw
- [x] T016 [P] [US1] Contract test in `apps/worker/tests/action-populaire-event-details.contract.test.ts`: the detail document parses with the listing schema, presentation fields (`illustration`, `routes`, `rsvp`, `calendars`) are ignored, a 404 on `/api/evenements/{id}/details/` becomes `UnknownEventError`, and a document whose `id` differs from the requested one becomes `EventIdentityMismatchError`

### Implementation for User Story 1

- [x] T017 [US1] Add `fetchEventDetails(eventId)` to `apps/worker/src/adapters/action-populaire-client.ts` reading `/api/evenements/{encodeURIComponent(eventId)}/details/`, mapping 404 to `UnknownEventError`, validating with `validateActionPopulaireEvent`, and rejecting an identifier mismatch with `EventIdentityMismatchError`
- [x] T018 Implement `apps/worker/src/ingestion/event-ingestion-processor.ts`: one detail reading per job, the order of T015, publication through `publishObservation(scopeId, 'event', [event], periodToken, deps)` and ledger transitions `running → publishing → succeeded`; the `UnknownEventError` branch **delegates to a new `stopEventIngestion(job, deps)` in `apps/worker/src/ingestion/ingestion-outcome.ts`**, which retires the scope with `stopped_reason='event_unknown'`, writes ledger `stopped`, reports the retirement and returns without throwing — mirroring `stopIngestionForUnknownGroup`
- [x] T019 Add `apps/worker/src/ingestion/job-dispatch.ts` choosing the processor from the job's `scopeKind` (`group` → `processCalendarIngestion`, `event` → `processEventIngestion`); extend `IngestionJobData` in `apps/worker/src/main.ts` with `scopeKind` and reduce the BullMQ worker callback to a call to that dispatcher; **carry the kind into the ledger** by adding `scopeKind?: ScopeKind` to `LedgerPatch` in `apps/worker/src/operations/ingestion-ledger.ts` and calling `bootstrapScope(scopeId, patch.scopeKind ?? 'group')`, so an event job never bootstraps an event identifier as a group row (today the ledger bootstraps implicitly), and pass the same kind from the `onScheduled` wiring in `apps/worker/src/main.ts`
- [x] T020 Request event ingestions from the publication transaction in `packages/core/src/persistence/postgres-calendar-repository.ts`: after registering the observed groups, call `requestEventScopes(transaction, dataset.events, new Date(dataset.generatedAt))` for the events that satisfy `requiresEventIngestion`, extend `PublicationSummary` with `eventScopesCreated` and `eventScopesRetired`, and return both counts without touching attribution or snapshot behaviour
- [x] T021 Carry the scope kind from selection to the job in `apps/worker/src/dispatcher/dispatcher.ts`: read `activeScopes()` from `packages/core/src/persistence/postgres-scope-queries.ts` (returning `{ scopeId, scopeKind }[]`), keep the unchanged `buildIngestionJobId(scopeId, periodStartUtc)` identity, add `scopeKind` to the enqueued job data **and to the `onScheduled` callback** so the ledger receives it; keep `PostgresGroupCatalogueRepository.activeScopes()` returning group identifiers so the existing directory tests and the calendar path stay unchanged, or replace it and update every caller it has today

**Checkpoint**: User Story 1 is functional — a group-less event is discovered, refreshed and retired on its own.

---

## Phase 4: User Story 2 - Coverage grows bounded and without duplication (Priority: P1)

**Goal**: Exactly one ingestion per event whatever the number of listings that return it, no work in the discovering cycle, and one shared per-cycle ceiling for groups and events.

**Independent Test**: Publish two listings returning the same group-less event, discover more scopes than the ceiling allows, and run cycles without new discoveries; verify one ingestion per event, nothing scheduled in the discovering cycle, exactly the ceiling promoted per cycle in discovery order, and nothing dropped.

### Tests for User Story 2

- [x] T022 [P] [US2] Contract test in `apps/worker/tests/shared-ceiling.contract.test.ts`: groups and event scopes compete in one FIFO order against `INGESTION_MAX_NEW_GROUPS_PER_CYCLE`, the second dispatcher run of the same period promotes only the remaining budget, the next period promotes again, and a job lost by the queue is enqueued again in the same period instead of blocking the scope
- [x] T023 [US2] Extend `tests/integration/event-scope-lifecycle.test.ts` with the deduplication cases: the same group-less event returned by two listings in one cycle yields one `scope_kind='event'` row, a second cycle over unchanged data creates nothing, a rescheduled event refreshes `event_ends_at` without changing its state or creating a duplicate, and an event that stops stating a group after its ingestion was retired returns to `pending` instead of gaining a second scope

### Implementation for User Story 2

- [x] T024 [US2] Verify the shared budget in `apps/worker/src/dispatcher/dispatcher.ts` against T022 and adjust only if the proof fails: `promotePendingScopes(budget)` selects both kinds ordered by `first_observed_at ASC NULLS FIRST, scope_id ASC`, the budget is read from the current period's `groups.scheduled`, and neither kind gets a second promotion path; `packages/core/src/persistence/postgres-group-registry.ts` changes only where the composite key requires it

**Checkpoint**: User Stories 1 and 2 both hold independently — coverage is bounded and idempotent.

---

## Phase 5: User Story 3 - The two ingestion kinds never interfere (Priority: P2)

**Goal**: Event ingestions are never organizers, never touched by the map directory, never counted as groups, and their stated groups join the attribution union without removing anything.

**Independent Test**: With event scopes active, run a complete directory synchronization and read the calendar; verify no event scope changed state, no event-scope identifier appears as a group, retired scopes are not counted as stopped groups, and a detail observation stating a group adds a link without removing any other.

### Tests for User Story 3

- [x] T025 [P] [US3] Extend `tests/integration/group-directory-sync.test.ts` with the isolation cases: a complete directory synchronization leaves every `scope_kind='event'` row untouched (state, `map_status`, `event_ends_at`), an event scope is never inserted into `event_group_link.scope_id`, a directory response that omits the event scope's event does not affect it, and group counts ignore event scopes
- [x] T026 [P] [US3] Integration test in `tests/integration/calendar-event-query.test.ts`: an event observed only through its event scope exposes no event-scope identifier among `groupIds`, and an event whose attribution came from a listing keeps exactly those identifiers
- [x] T027 [P] [US3] Integration test in `tests/integration/event-ingestion-publication.test.ts`: a detail observation stating group `C` for an event already attributed to `B` yields `B ∪ C` with `attributions.removed = 0`, the scope is retired with `stopped_reason='event_group_stated'` in the same transaction, and **no `scope_kind='group'` row changes `map_status` or `retrieval_status` during that publication** (FR-014, the direction a directory synchronization does not cover)
- [x] T028 [US3] Retire the event scope whose event gained a group inside `packages/core/src/persistence/postgres-calendar-repository.ts`: after the attribution loop, collect the event identifiers with at least one link and call `retireEventScopesForAttributedEvents(transaction, eventIds, now)`, feeding `eventScopesRetired` in the `PublicationSummary` (T020) and leaving every group row untouched

**Checkpoint**: All three behavioural stories work independently.

---

## Phase 6: User Story 4 - Event ingestion activity is observable (Priority: P3)

**Goal**: Every cycle reports event ingestions created, waiting, active, retired and failed, next to the existing group and attribution counters.

**Independent Test**: Run a cycle that discovers one group-less event, retires one ended event scope and fails one detail reading; verify the per-cycle counters, the three event gauges and the `dispatcher-cycle` log line match, and that a retired scope is never counted as a stopped group.

### Tests for User Story 4

- [x] T029 [P] [US4] Unit test in `packages/core/src/groups/cycle-metrics.test.ts`: the three new keys (`event_scopes.created`, `event_scopes.retired`, `event_scopes.reading_failed`) match [contracts/operator-reporting.md](contracts/operator-reporting.md) and zero values are still dropped
- [x] T030 [P] [US4] Contract test in `apps/worker/tests/cycle-report.contract.test.ts`: the three event gauges are set from kind-filtered counts, retired event scopes raise `actionpop_event_scopes_retired` and never `actionpop_groups_stopped` (FR-004 and FR-014 in the reporting direction), and the cycle log carries the `eventScopes` block next to the eleven previous-period counters

### Implementation for User Story 4

- [x] T031 [P] [US4] Add the three keys to `CYCLE_METRICS` in `packages/core/src/groups/cycle-metrics.ts` and increment them where the state changes, consuming the `eventScopesCreated` and `eventScopesRetired` fields of `PublicationSummary` in `packages/core/src/persistence/postgres-calendar-repository.ts` and the retirement count of the dispatcher pass, plus `event_scopes.reading_failed` from `apps/worker/src/ingestion/ingestion-outcome.ts`
- [x] T032 [US4] Add the event-scope counts to `packages/core/src/persistence/postgres-scope-queries.ts` (`pending`, `active`, `retired` for `scope_kind='event'`), extend `CycleReportDependencies` in `apps/worker/src/dispatcher/cycle-report.ts` with that reader, emit the three gauges and the `eventScopes` log block, and wire the new dependency in the `onCycle` callback of `apps/worker/src/main.ts`
- [x] T033 [US4] Emit the cumulative counters `actionpop_event_ingestions_created_total`, `actionpop_event_ingestions_retired_total` and `actionpop_event_readings_failed_total`, and the `event-ingestion` completion/retirement log lines, from `apps/worker/src/ingestion/event-ingestion-processor.ts` and `apps/worker/src/ingestion/ingestion-outcome.ts`

**Checkpoint**: All four stories are functional and measurable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T034 [P] Update `docs/data-domains.mmd` and `docs/object-design.mmd` to show the two scope kinds, `event_ends_at` and the retirement states
- [x] T035 Run `pnpm quality` (typecheck, lint, unit, integration, build) and fix every failure
- [x] T036 Review the module-size rule (constitution Principle IV) across the touched modules and record the resulting sizes; `postgres-group-registry.ts` must stay near 150 lines after its extractions and `main.ts` must remain wiring only
- [x] T037 Execute validation scenarios 1–9 in `specs/005-event-ingestion-scopes/quickstart.md` through `pnpm test`, `pnpm test:integration` and a schema inspection, recording the outcome of each against its success criterion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; **blocks all stories**
- **User Stories (Phases 3–6)**: all depend on Foundational
- **Polish (Phase 7)**: depends on the stories that are delivered

### User Story Dependencies

- **US1 (P1)**: after Foundational; no dependency on another story
- **US2 (P1)**: after Foundational; consumes the creation primitive from T009 and the selection from T021, but adds only the budget guarantees
- **US3 (P2)**: after Foundational; consumes the registry from T008 and the attribution path from the previous feature
- **US4 (P3)**: needs US1's processor and US3's retirement to have something to report; deliver after them

### Within Each Story

- Tests are written first and must fail before implementation
- Pure rules (`packages/core/src/scopes/`) before persistence, persistence before the worker wiring
- The checkpoint at the end of each phase is the independent validation point

### Key Task Dependencies

| Task | Requires |
|------|----------|
| T003 | T002 |
| T004 | T003 |
| T008 | T004, T005 |
| T009 | T004, T005 |
| T010, T011 | T004 |
| T018 | T011, T017 |
| T019 | T018, T021 |
| T020 | T009, T010 |
| T021 | T008 |
| T023 | T013 |
| T024 | T021 |
| T027 | T014 |
| T028 | T009, T010 |
| T031 | T020, T028 |
| T032 | T008 |
| T033 | T018 |
| T035–T037 | all delivered stories |

---

## Parallel Opportunities

- **Foundational**: T005, T006, T007 and T010 touch different files and can run together once T004 is done; T008 and T009 follow T005.
- **US1**: T013–T016 are four independent test files; T017 (client) is independent of T020 (publication) and T021 (dispatcher).
- **US2**: T022 is a new file; T023 extends the US1 lifecycle file and follows T013.
- **US3**: T025, T026 and T027 are three different test files.
- **US4**: T029 and T030 are separate test files; T031 is independent of T032.

### Parallel Example: User Story 3

```bash
Task: "Integration test for kind isolation in tests/integration/scope-kind-isolation.test.ts"
Task: "Integration test for the calendar read model in tests/integration/calendar-event-query.test.ts"
Task: "Integration test for the attribution union in tests/integration/event-ingestion-publication.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — Setup
2. Phase 2 — Foundational (blocks everything)
3. Phase 3 — US1
4. **STOP and validate** with T013–T019, then run `pnpm --filter @actionpop/worker test && pnpm test:integration`

US1 alone delivers the report's purpose: a group-less event is refreshed and retired correctly. US2 adds the cost proof and is required before enabling discovery in production.

### Incremental Delivery

1. Setup + Foundational → registry holds two kinds, nothing visible changes
2. US1 → group-less events are refreshed (deployable, the reported gap closed)
3. US2 → bounded and idempotent coverage (deployable, cost proven)
4. US3 → kinds provably isolated (deployable, reporting trustworthy)
5. US4 → measured activity (deployable, operator-facing only)
6. Polish → quality gate and quickstart evidence

### Notes

- `[P]` marks tasks in different files with no incomplete dependency
- The migration is a rename plus two columns with a default; no data movement and no destructive change
- The public calendar contract must stay untouched; any test change in `apps/api/tests/` is a regression signal, not a task
- Commit after each task or logical group; stop at each checkpoint to validate the story independently

---

## Phase 8: Convergence

- [x] T038 Base event-scope retirement on the groups the publishing observation states instead of the accumulated `event_group_link` count, per FR-007 (contradicts): return the stated-group outcome from `writeEventAttribution` in `packages/core/src/persistence/attribution-writer.ts`, feed only those events to `retireEventScopesForAttributedEvents` in `packages/core/src/persistence/postgres-calendar-repository.ts`, and stop `requestEventScopes` from re-opening a scope in the same transaction that retires it; extend `tests/integration/event-scope-lifecycle.test.ts` with a listing that states no group while another listing already contributes a link (scope stays `pending`, `eventScopesCreated = 1`, `eventScopesRetired = 0`, and a replay retires nothing) and `tests/integration/event-ingestion-publication.test.ts` with a detail reading that states no group for an event attributed by a listing (scope stays `active`, replay reports zero retirements)
- [x] T039 Refresh `event_ends_at` and `last_observed_at` from every complete detail observation, not only from events that still qualify, so an event whose end time moves earlier stops being retrieved, per FR-002 and SC-006 (partial): extend `packages/core/src/persistence/postgres-event-scopes.ts` with a refresh applied to every observed event scope and retire the scope when the detail document reports an end time that has already passed, then prove in `tests/integration/event-scope-lifecycle.test.ts` that a shortened end time updates `event_ends_at` and that the next dispatch retirement pass reports `event_ended` instead of leaving the scope `active`
- [x] T040 Restore `maxNewGroupsPerCycle: 200` in `config/actionpop.example.yaml` and reword the adjacent `INGESTION_WORKER_CONCURRENCY` comment to scope retrievals rather than group retrievals, per T001, spec Assumptions and plan Constraints (contradicts)
- [x] T041 Wire `nextEventScopeStatus` from `packages/core/src/scopes/event-scope.ts` into the retirement decision points so the pure rule is the single source and the SQL only writes what it decides, per Constitution I and T007 (partial): use it in `apps/worker/src/ingestion/ingestion-outcome.ts` for the unknown-event branch and in the `event_group_stated` / `event_ended` decisions of `packages/core/src/persistence/postgres-calendar-repository.ts` and `apps/worker/src/dispatcher/dispatcher.ts`, or delete the unused rule and record the SQL as the decision source in `specs/005-event-ingestion-scopes/data-model.md`
- [x] T042 Update the repository diagrams to the two ingestion kinds, per T034 and FR-004 (partial): rename the `GROUP_SCOPE` entity to `INGESTION_SCOPE` with `scope_kind`, `event_ends_at` and `retrieval_status` in `docs/data-oriented.mmd` and `docs/job-oriented.mmd` (dropping the removed `active` column), and add the shared promotion ceiling, the pre-promotion retirement pass, the detail job body and the `/api/evenements/{id}/details/` read to `docs/dispatcher.mmd` and `docs/worker.mmd` without rewriting their unrelated narrative
- [x] T043 Correct the feature documentation so it matches the code, per plan Project Structure and data-model Affected callsites (partial): fix the `postgres-scope-queries.ts` / `postgres-group-queries.ts` split and add `postgres-group-discovery.ts`, `postgres-event-scopes.ts`, `scopes/scope-kind.ts`, `apps/worker/src/ingestion/{publication,event-preparation,event-ingestion-processor,job-dispatch}.ts` and the migration to `specs/005-event-ingestion-scopes/data-model.md`; state that `scope_id` remains the primary key while `(scope_kind, scope_key)` is the unique identity; list `event-preparation.ts` and `postgres-group-discovery.ts` in the plan's source tree; and replace "no revival" with the FR-007 re-opening in the plan's test-strategy table
