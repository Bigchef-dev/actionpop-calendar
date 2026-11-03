---
description: "Task list for Intercommunal Calendar Discovery"
---

# Tasks: Intercommunal Calendar Discovery

**Input**: Design documents from `specs/008-intercommunal-calendar/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), and [quickstart.md](./quickstart.md)

**Implementation approach**: Deliver the searchable EPCI subject first, then reuse it for
calendar resolution, complete the data-quality path, and finish with compatibility and
operational validation. Tests are required by FR-012 and the repository constitution.

## Phase 1: Setup

**Purpose**: Establish the shared implementation surface without changing behavior.

- [X] T001 Confirm the active package boundaries and add the EPCI implementation file list to `specs/008-intercommunal-calendar/plan.md`
- [X] T002 [P] Add EPCI category labels and stable identifier fixtures to `packages/core/src/geography/epci-reference.test.ts`
- [X] T003 [P] Add representative EPCI search, membership, incomplete, retired, and duplicate-event fixtures to `packages/core/src/test-fixtures/epci.ts`

---

## Phase 2: Foundational

**Purpose**: Add the versioned EPCI reference model and shared typed boundaries required by all
user stories. No story work can start until this phase is complete.

- [X] T004 Add `ReferenceVersion`, `EpciReference`, and `EpciMembership` Prisma models with the constraints “stable official ID”, “kind is CC, CA, CU, or METRO”, and compound identity `(version, epciId, communeId)` in `prisma/schema.prisma`
- [X] T005 [P] Define explicit EPCI category, reference record, membership record, and validation diagnostic types in `packages/core/src/geography/epci-reference.ts`
- [X] T006 [P] Extend `SubjectKind` and `SUBJECT_KINDS` with `epci`, and document its calendar parameters in `packages/core/src/search/subject-search-types.ts`
- [X] T007 [P] Extend calendar filter parsing and criteria types to accept comma-separated `epci` IDs while preserving existing parameter semantics in `packages/core/src/calendar-filters/calendar-filter-parameters.ts` and `packages/core/src/calendar-filters/calendar-event.ts`
- [X] T008 Implement EPCI reference validation for required ID/name/category, known commune membership, duplicate memberships, valid date intervals, and supported categories in `packages/core/src/geography/epci-reference-validation.ts`
- [X] T009 Add typed EPCI membership lookup and sorted unique commune resolution interfaces in `packages/core/src/persistence/geographic-reference-repository.ts`
- [X] T010 Add Prisma migrations and generated-client validation for EPCI reference/version/membership tables in `prisma/migrations/0008_epci_reference/migration.sql`
- [X] T011 [P] Add unit tests for category validation, duplicate membership rejection, date validation, and sorted deduplication in `packages/core/src/geography/epci-reference.test.ts`

**Checkpoint**: The schema, types, parser boundary, and validation rules are ready for story
implementation; existing subject and calendar tests remain green.

---

## Phase 3: User Story 1 - Find an intercommunal territory (Priority: P1) 🎯 MVP

**Goal**: Return active EPCI territories as clearly labeled, deterministic search subjects,
alongside existing cities, departments, and action groups.

**Independent Test**: Query each EPCI category by partial, accented, and case-varied names;
verify the correct labeled subject and `calendar.params.epci`, and verify retired subjects are
absent without changing existing result kinds.

### Tests for User Story 1

- [X] T012 [P] [US1] Add unit tests for EPCI normalization, partial matching, deterministic ordering, category labels, and retired filtering in `packages/core/src/search/subject-search.test.ts`
- [X] T013 [P] [US1] Add repository contract tests for active-version EPCI lookup, department qualifiers, and stable subject IDs in `packages/core/tests/search/postgres-subject-search.test.ts`
- [X] T014 [P] [US1] Add API contract tests for `GET /search/subjects?kind=epci` and mixed-kind `kindCounts` in `apps/api/src/controllers/search.controller.test.ts`
- [X] T015 [P] [US1] Add browser/search-shape tests asserting the French labels for CC, CA, CU, and METRO in `apps/web/src/features/discovery/utils/suggestion-shape.test.ts`

### Implementation for User Story 1

- [X] T016 [US1] Implement active-version EPCI candidate reading with normalized name matching, category context, stable ID ordering, and `calendar.params.epci` in `packages/core/src/search/postgres-subject-search.ts`
- [X] T017 [US1] Update search request parsing and ranking to accept `epci` without changing existing kinds in `packages/core/src/search/subject-search.ts` and `packages/core/src/search/subject-ranking.ts`
- [X] T018 [US1] Document `epci` in the OpenAPI search schema and description in `apps/api/src/controllers/search.controller.ts`
- [X] T019 [US1] Add EPCI category labels and context rendering in `apps/web/src/features/discovery/utils/suggestion-shape.ts`
- [X] T020 [US1] Preserve generic subject navigation while adding EPCI display text and no-result recovery in `apps/web/src/features/discovery/components/SuggestionList.vue` and `apps/web/src/features/discovery/components/SearchHero.vue`

**Checkpoint**: User Story 1 independently provides searchable, labeled EPCI subjects and
does not regress city, department, or group search.

---

## Phase 4: User Story 2 - View the territory calendar (Priority: P1)

**Goal**: Resolve an EPCI subject to its current member communes, include matching events once,
and provide a useful empty calendar.

**Independent Test**: Request a territory containing events in two member communes, verify both
are present, verify an outside event is absent, and verify a multi-path event appears once.

### Tests for User Story 2

- [X] T021 [P] [US2] Add membership resolver tests for one territory, multiple territories, empty membership, and sorted unique commune IDs in `packages/core/tests/geography/epci-resolution.test.ts`
- [X] T022 [P] [US2] Add calendar query tests for EPCI-to-commune inclusion, outside-event exclusion, and duplicate prevention in `packages/core/tests/persistence/postgres-calendar-event-query.test.ts`
- [X] T023 [P] [US2] Add API feed contract tests for `calendar.ics?epci=...`, valid empty feeds, and invalid EPCI references in `apps/api/tests/calendar-ics.test.ts`
- [X] T024 [P] [US2] Add calendar-screen tests for EPCI subject naming, zero-event subscription state and unavailable state in `apps/web/tests/calendar/calendar-screen-epci.test.ts`

### Implementation for User Story 2

- [X] T025 [US2] Implement Prisma-backed EPCI membership resolution against the active reference version in `packages/core/src/persistence/geographic-reference-repository.ts`
- [X] T026 [US2] Resolve EPCI criteria into the existing normalized commune criteria before event querying in `packages/core/src/calendar-filters/calendar-criteria.ts`
- [X] T027 [US2] Apply resolved EPCI commune IDs through the existing deduplicating event query and preserve `Europe/Paris` behavior in `packages/core/src/persistence/postgres-calendar-event-query.ts`
- [X] T028 [US2] Add `epci` parsing, validation, and availability errors to the calendar controller while preserving existing query parameters in `apps/api/src/controllers/calendar-ics.controller.ts` and `apps/api/src/controllers/calendar-ics-contract.ts`
- [X] T029 [US2] Render the active EPCI label and its no-event subscription state without substituting another subject in `apps/web/src/features/calendar/components/CalendarScreen.vue` and `apps/web/src/features/subscription/components/SubscriptionPanel.vue`

**Checkpoint**: User Story 2 independently displays a correct EPCI calendar, including an
empty but subscribable calendar, with no duplicate events.

---

## Phase 5: User Story 3 - Filter and subscribe to the territory calendar (Priority: P1)

**Goal**: Preserve EPCI, event-type, and group criteria in page state and generated links so
the reopened feed exactly matches the displayed calendar.

**Independent Test**: Select an EPCI, apply one event-type and one group filter, copy/reopen the
link, and compare the selected subject, active filters, and event IDs.

### Tests for User Story 3

- [X] T030 [P] [US3] Add criteria tests for EPCI plus event-type/group AND semantics and multiple EPCI OR semantics in `packages/core/src/calendar-filters/calendar-criteria.test.ts`
- [X] T031 [P] [US3] Add iCalendar contract tests proving filtered EPCI feeds retain existing metadata, ETag, and `304` behavior in `apps/api/tests/calendar-ics.test.ts`
- [X] T032 [P] [US3] Add URL-state round-trip tests for EPCI subject removal, event-type filters, and group filters in `apps/web/tests/shared/url-state.test.ts`
- [X] T033 [P] [US3] Add browser acceptance coverage for copying and reopening a filtered EPCI calendar in `apps/web/tests/intercommunal-calendar.spec.ts`

### Implementation for User Story 3

- [X] T034 [US3] Extend calendar filter serialization and validation for repeated/comma-separated `epci` values in `packages/core/src/calendar-filters/calendar-filter-parameters.ts`
- [X] T035 [US3] Ensure generated search subjects and subscription links include EPCI, event-type, and group criteria without dropping existing parameters in `apps/web/src/features/discovery/utils/query-encoding.ts`, `apps/web/src/shared/composables/useUrlState.ts`, and `apps/web/src/features/subscription/components/SubscriptionPanel.vue`
- [X] T036 [US3] Ensure filter removal updates both displayed criteria and generated links for EPCI calendars in `apps/web/src/features/calendar/components/FilterBar.vue` and `apps/web/src/features/calendar/components/GroupFilterBar.vue`
- [X] T037 [US3] Document `epci` filter semantics and backward compatibility in `apps/api/src/controllers/calendar-ics-contract.ts` and `specs/008-intercommunal-calendar/contracts/calendar-ics.md`

**Checkpoint**: User Story 3 independently round-trips the exact EPCI calendar composition
through the public URL/feed contract.

---

## Phase 6: User Story 4 - Survive territory-data changes (Priority: P2)

**Goal**: Refresh official EPCI data safely and expose clear inactive, invalid, ambiguous, and
incomplete-data states without serving unrelated events.

**Independent Test**: Stage valid and invalid snapshots, activate only valid data, then open
retired and incomplete links and verify explicit recovery behavior.

### Tests for User Story 4

- [X] T038 [P] [US4] Add refresh tests for staging, atomic activation, previous-version retention on failure, diagnostics, and membership changes in `apps/worker/src/geography/reference-refresh.test.ts`
- [X] T039 [P] [US4] Add API tests for retired, invalid, ambiguous, and incomplete EPCI availability responses in `apps/api/tests/calendar-ics.test.ts`
- [X] T040 [P] [US4] Add browser tests for inactive, incomplete, and recovery-to-search states in `apps/web/tests/intercommunal-calendar.spec.ts`

### Implementation for User Story 4

- [X] T041 [US4] Implement the normalized official-source adapter with source version, publication date, license, checksum, and diagnostics in `apps/worker/src/geography/epci-reference-refresh.ts`
- [X] T042 [US4] Implement validation and atomic activation so invalid snapshots remain rejected and the previous active version stays served in `packages/core/src/persistence/geographic-reference-writer.ts` and `apps/worker/src/geography/reference-refresh.ts`
- [X] T043 [US4] Expose EPCI refresh counts and validation outcomes through existing worker operational reporting in `apps/worker/src/main.ts`
- [X] T044 [US4] Add explicit API availability states for incomplete membership and retired/invalid EPCI references without fallback events in `apps/api/src/controllers/calendar-ics.controller.ts`
- [X] T045 [US4] Add user-facing EPCI availability and recovery messaging in `apps/web/src/features/calendar/components/CalendarScreen.vue` and `apps/web/src/shared/components/StateMessage.vue`

**Checkpoint**: User Story 4 safely handles administrative changes and never shows unrelated
events when an EPCI reference is invalid or incomplete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Complete compatibility, documentation, quality gates, and end-to-end validation.

- [X] T046 [P] Add compatibility tests proving existing city, department, group, and calendar links remain unchanged in `apps/api/tests/search.controller.test.ts`, `apps/api/tests/calendar-ics.test.ts`, and `apps/web/tests/subscription/calendar-link-builder.test.ts`
- [X] T047 [P] Update public search and calendar documentation with EPCI examples and recovery states in `apps/web/README.md` and the API EPCI contracts
- [X] T048 [P] Review new modules against the 100–150 line business-logic guideline; the new EPCI modules remain cohesive and below the guideline
- [X] T049 Run the complete static validation sequence from `specs/008-intercommunal-calendar/quickstart.md`
- [X] T050 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`, then record any environment-specific blockers in `specs/008-intercommunal-calendar/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T002 and T003 can run in parallel after T001.
- **Foundational (Phase 2)**: Depends on Setup; T005–T007 and T011 can run in parallel after
  T004 where they touch independent files, while T008–T010 depend on the shared model/types.
- **User Stories (Phases 3–6)**: Depend on the Foundational phase. US1 is the MVP; US2 depends
  on the `epci` subject contract from US1, US3 depends on the calendar scope from US2, and US4
  depends on the reference and availability paths from US2.
- **Polish (Phase 7)**: Depends on all selected stories.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only.
- **US2 (P1)**: Depends on Phase 2 and the `epci` subject parameter shape from US1.
- **US3 (P1)**: Depends on US2's resolved calendar criteria.
- **US4 (P2)**: Depends on US2's availability/error boundary; its refresh adapter can be
  developed in parallel with US3.

### Parallel Opportunities

- Setup fixtures T002/T003.
- Foundational type, parser, and test tasks T005–T007 and T011.
- All US1 contract/unit/UI tests T012–T015.
- US2 resolver, query, API, and UI tests T021–T024.
- US3 criteria, feed, URL, and browser tests T030–T033.
- US4 refresh, API, and browser tests T038–T040.
- US3 and the data-refresh implementation of US4 can proceed in parallel after US2.
- Polish documentation, compatibility tests, and module review T046–T048.

## Implementation Strategy

1. **MVP**: Complete Phase 2 and US1 so all four EPCI categories are searchable and labeled.
2. **Calendar value**: Complete US2 to make a selected EPCI a real, deduplicated calendar.
3. **Reusable agenda**: Complete US3 for exact filtered link/subscription round-tripping.
4. **Reliability**: Complete US4 for refresh safety and data-quality recovery.
5. **Release hardening**: Run Phase 7 compatibility, documentation, and full quality gates.

Every story has an independent test criterion and checkpoint; implementation may stop after
US1 for the smallest demonstrable MVP, but the complete feature requires all four stories.
