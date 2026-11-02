---

description: "Implementation tasks for the public calendar discovery and composition experience"
---

# Tasks: Public Calendar Discovery and Composition Experience

**Input**: Design documents from `/specs/007-public-calendar-experience/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included because the constitution requires automated tests for business rules and external contracts.

## Phase 1: Setup

**Purpose**: Establish the package structure and validation commands needed by every story.

- [ ] T001 Add the web Vitest test script and test include configuration in `apps/web/package.json` and `vitest.config.ts`, preserving strict TypeScript and existing workspace commands
- [ ] T002 [P] Create the feature test directories `apps/web/tests/discovery/`, `apps/web/tests/calendar/`, `apps/web/tests/subscription/`, `apps/web/tests/shared/`, and `tests/integration/`
- [ ] T003 [P] Add typed web runtime configuration for API base URL, feed URL, CORS development origin, canonical `Europe/Paris` timezone, and optional proposal flag in `apps/web/src/config.ts`
- [ ] T004 [P] Create shared domain types for search items, selected scopes, calendar events, action types, metadata and calendar links in `apps/web/src/types.ts`

## Phase 2: Foundational

**Purpose**: Implement shared contracts and state primitives that block all user stories.

- [ ] T005 Add typed API error handling, CORS configuration from `API_CORS_ORIGINS`, and public GET/HEAD/OPTIONS behavior in `apps/api/src/config.ts` and `apps/api/src/server.ts`
- [ ] T006 [P] Implement the extensible `SearchSubject`, `SubjectCalendar`, and `SearchAnswer` types with required non-empty `kind`, `id`, and `label` validation in `packages/core/src/search/subject-search-types.ts`
- [ ] T007 [P] Implement accent-, case-, punctuation-, and department-form normalization plus exact/prefix/contains ranking and per-kind limits in `packages/core/src/search/subject-ranking.ts`
- [ ] T008 Implement browser address parsing and serialization for `sujets`, `groups`, `types`, `vue`, `evenement`, including invalid-value reporting, duplicate removal, and no period parameter, in `apps/web/src/shared/composables/useUrlState.ts`
- [ ] T009 [P] Add shared loading, no-result, no-event, unavailable, outdated-address, and empty-selection messaging primitives in `apps/web/src/shared/components/StateMessage.vue`
- [ ] T010 [P] Add campaign design tokens, light/dark contrast values, reduced-motion defaults, and focus styles in `apps/web/src/shared/styles/`
- [ ] T011 Add foundational unit tests for URL round trips, invalid state recovery, duplicate selected items, and exact absence of period parameters in `apps/web/tests/shared/url-state.test.ts`

**Checkpoint**: Shared types, URL state, error states, configuration, and test infrastructure are ready.

## Phase 3: User Story 1 - Find a city, department or action group item (Priority: P1) 🎯 MVP

**Goal**: Let a visitor search the catalogue and select a labelled city, department, or action-group item.

**Independent Test**: Type a city, department number, and group query; verify ranked labelled results, keyboard selection, disambiguation, no-result alternatives, and navigation to the selected calendar.

### Tests for User Story 1

- [ ] T012 [P] [US1] Add ranking, normalization, homonym disambiguation, and no-result unit tests in `packages/core/tests/search/subject-ranking.test.ts`
- [ ] T013 [P] [US1] Add `GET /search/subjects` contract and validation tests for 2–64 character queries, accepted kinds, limits 1–30, response fields, and 400/503 errors in `tests/integration/search-subjects.test.ts`
- [ ] T014 [P] [US1] Add search-field keyboard, announcement, rotating-placeholder, reduced-motion, and selected-address tests in `apps/web/tests/discovery/search-field.test.ts`

### Implementation for User Story 1

- [ ] T015 [US1] Implement the subject-search use case and extensible catalogue adapter over commune, department, and active group readers in `packages/core/src/search/subject-search.ts` and `packages/core/src/search/postgres-subject-search.ts`
- [ ] T016 [US1] Implement `GET /search/subjects` DTO, controller, Swagger response/error documentation, and CORS-safe public handling in `apps/api/src/controllers/search.controller.ts`
- [ ] T017 [P] [US1] Implement debounced grouped suggestion loading and no-result alternatives in `apps/web/src/features/discovery/composables/useSearchSuggestions.ts`
- [ ] T018 [P] [US1] Implement the typed placeholder cycle that stops on focus, typing, and reduced motion in `apps/web/src/features/discovery/composables/useTypedPlaceholder.ts`
- [ ] T019 [US1] Implement the accessible combobox and suggestion rendering with kind, label, parent/qualifier, result count, and keyboard navigation in `apps/web/src/features/discovery/components/SearchField.vue` and `apps/web/src/features/discovery/components/SuggestionList.vue`
- [ ] T020 [US1] Implement the central discovery screen, home explanation, proposal variants, and selection navigation in `apps/web/src/features/discovery/components/SearchHero.vue` and `apps/web/src/App.vue`

**Checkpoint**: US1 is independently usable from the home page and produces a resolvable selected search item.

## Phase 4: User Story 2 - See and filter events (Priority: P1)

**Goal**: Display combined feed events for selected scopes and support action-type, group, layout, and empty-result behavior.

**Independent Test**: Select one item, add another city or department with `+`, select multiple groups and one action type, switch layouts, remove one item, and verify the displayed union and empty-state return.

### Tests for User Story 2

- [ ] T021 [P] [US2] Add group-parameter parsing, OR-within-group and AND-with-other-filter contract tests in `packages/core/tests/calendar-filters/calendar-filter.test.ts`
- [ ] T022 [P] [US2] Add feed mapping, event deduplication across selected scopes, action-type filtering, group union, status, metadata, and dynamic useful-hour tests in `apps/web/tests/calendar/calendar-rules.test.ts`
- [ ] T023 [P] [US2] Add calendar URL-state restoration, plus-button add, duplicate prevention, per-item removal, layout reset, and empty-selection return tests in `apps/web/tests/calendar/calendar-composition.test.ts`

### Implementation for User Story 2

- [ ] T024 [US2] Thread repeatable comma-separated `group` values through validation, criteria, event query predicates, and ICS generation without changing requests that omit it in `packages/core/src/calendar-filters/calendar-filter.ts`, `packages/core/src/calendar-filters/calendar-criteria.ts`, `packages/core/src/calendar-filters/calendar-event.ts`, and `packages/core/src/persistence/postgres-calendar-event-query.ts`
- [ ] T025 [US2] Implement feed loading for each selected search item's exact `calendar.params`, event parsing, deduplication, and combined loading/error states in `apps/web/src/features/calendar/composables/useCalendarFeed.ts`
- [ ] T026 [P] [US2] Implement action-type and multi-group filtering, stable group colors, non-color markers, counts, and "Par GA" horizontal keyboard/touch controls in `apps/web/src/features/calendar/components/FilterBar.vue` and `apps/web/src/features/calendar/utils/type-filter.ts`
- [ ] T027 [P] [US2] Implement ICS event mapping for UID, dates, status, location, coordinates, action type, group metadata, and all `X-ACTIONPOP-*` fields in `apps/web/src/features/calendar/utils/ical-mapping.ts`
- [ ] T028 [P] [US2] Implement month/day/week/list layouts, initial viewport reset, full start/end duration, wrapping cards, bold readable text, and useful timed-event bounds in `apps/web/src/features/calendar/components/CalendarView.vue` and `apps/web/src/features/calendar/utils/weather-window.ts`
- [ ] T029 [US2] Implement selected-item chips, plus-triggered search overlay, explicit "Enlever le calendrier" actions, duplicate prevention, combined event count, no-event state, and return-to-home behavior in `apps/web/src/features/calendar/components/CalendarScreen.vue`
- [ ] T030 [US2] Remove the fixed single-place assumptions and wire the route switch to discovery or composed calendar state in `apps/web/src/App.vue` and `apps/web/src/features/calendar/composables/useCalendarSelection.ts`

**Checkpoint**: US2 independently displays and filters a composed calendar, including all specified empty and narrow-screen states.

## Phase 5: User Story 3 - Leave with the exact calendar link (Priority: P1)

**Goal**: Produce subscription, download, service, and copy actions that exactly reflect the displayed composition, plus an explicitly city-only copy action.

**Independent Test**: Select two search items, two groups, and one action type; compare the final imported link with the displayed union, then use the city-only action and verify it contains only its designated city.

### Tests for User Story 3

- [ ] T031 [P] [US3] Add calendar-link unit tests for multiple scope parameters, group/type criteria, exact display scope, city-only scope, complete URLs, and no period parameter in `apps/web/tests/subscription/calendar-link-builder.test.ts`
- [ ] T032 [P] [US3] Add subscription-panel behavior tests for exact coverage text, copy confirmation, city-only label, service opening, download, and unavailable-feed handling in `apps/web/tests/subscription/subscription-panel.test.ts`

### Implementation for User Story 3

- [ ] T033 [US3] Implement deterministic exact-display and city-only link construction for selected search items, groups, action types, direct subscription, webcal, download, and calendar-service URLs in `apps/web/src/features/subscription/utils/calendar-link-builder.ts`
- [ ] T034 [US3] Implement coverage summary, complete visible URL, exact-display actions, explicitly labelled city-only copy action, clipboard confirmation, and unavailable-link state in `apps/web/src/features/subscription/components/SubscriptionPanel.vue`
- [ ] T035 [US3] Integrate subscription entry on every composed calendar screen and pass selected items and active criteria without introducing a period parameter in `apps/web/src/features/calendar/components/CalendarScreen.vue`

**Checkpoint**: US3 delivers a usable link whose imported contents match the displayed selection exactly.

## Phase 6: User Story 4 - Understand one event at a glance (Priority: P2)

**Goal**: Show practical event details, action type identity, published metadata, weather, map, status, and the Action Populaire contact route.

**Independent Test**: Open events with known, unknown, missing, cancelled, and future-weather cases and verify each available detail and fallback.

### Tests for User Story 4

- [ ] T036 [P] [US4] Add event-detail mapping and metadata-label tests for known/unknown action types, absent fields, statuses, locations, coordinates, and source links in `apps/web/tests/calendar/event-detail.test.ts`
- [ ] T037 [P] [US4] Add weather horizon and per-coordinate lookup tests in `apps/web/tests/calendar/weather.test.ts`

### Implementation for User Story 4

- [ ] T038 [P] [US4] Implement action-type catalogue loading, emoji fallback, metadata labels, and event-source/map/calendar link helpers in `apps/web/src/features/calendar/utils/metadata-labels.ts` and `apps/web/src/features/calendar/utils/event-links.ts`
- [ ] T039 [P] [US4] Implement per-event coordinate weather loading with meaningful forecast horizon and unavailable fallback in `apps/web/src/features/calendar/composables/useWeather.ts`
- [ ] T040 [US4] Implement event detail sections for dates, place/map, weather, status, emoji/name, every published extra field, and yellow new-tab "Action Populaire" action in `apps/web/src/features/calendar/components/EventDetail.vue` and `apps/web/src/features/calendar/components/EventDetailGroup.vue`
- [ ] T041 [US4] Wire direct event addresses, reload behavior, and narrow-screen detail rendering in `apps/web/src/features/calendar/components/CalendarScreen.vue` and `apps/web/src/shared/composables/useUrlState.ts`

**Checkpoint**: US4 provides a complete, accessible event detail without inventing unpublished contact data.

## Phase 7: User Story 5 - Feel at home and be guided (Priority: P2)

**Goal**: Apply campaign identity, accessibility, guidance, returning-item suggestion, and interface proposals.

**Independent Test**: A first-time mobile visitor identifies the tool and first action without scrolling; a returning visitor sees a suggested item; keyboard and screen-reader navigation completes the journey.

### Tests for User Story 5

- [ ] T042 [P] [US5] Add accessibility tests for combobox semantics, focus order, labels, reduced motion, contrast token usage, and non-color state markers in `apps/web/tests/shared/accessibility.test.ts`
- [ ] T043 [P] [US5] Add recent-search persistence and non-blocking resume tests in `apps/web/tests/discovery/recent-subject.test.ts`

### Implementation for User Story 5

- [ ] T044 [P] [US5] Implement recent search-item persistence and resume suggestion without overriding an address state in `apps/web/src/features/discovery/composables/useRecentSubject.ts`
- [ ] T045 [P] [US5] Implement campaign shell, header, home explanation, dark preference, focus states, and mobile thumb-reachable controls in `apps/web/src/shared/components/AppShell.vue`, `apps/web/src/shared/components/AppHeader.vue`, and `apps/web/src/shared/styles/`
- [ ] T046 [US5] Implement three discovery and two detail interface proposals with review-only selection and documented recommended defaults in `apps/web/src/features/discovery/components/` and `apps/web/src/features/calendar/components/`
- [ ] T047 [US5] Keep the survey feature source and tests intact but remove its route and links from the public experience in `apps/web/src/features/poll/` and `apps/web/src/App.vue`

**Checkpoint**: US5 provides the campaign-branded, accessible, guided experience independently of backend ingestion.

## Phase 8: User Story 6 - Share a discovery (Priority: P3)

**Goal**: Ensure copied/shared addresses reproduce the same selected items and filters in a fresh session.

**Independent Test**: Copy a composed filtered address, open it in a fresh session, and compare selected items, groups, action types, layout, and displayed events.

### Tests for User Story 6

- [ ] T048 [P] [US6] Add fresh-session URL round-trip tests for multiple search items, group/type filters, layout, event detail, invalid items, and absent period state in `apps/web/tests/shared/url-state.test.ts`
- [ ] T049 [P] [US6] Add integration coverage for worker-stopped published snapshots and exact composed feed responses in `tests/integration/composed-calendar.test.ts`

### Implementation for User Story 6

- [ ] T050 [US6] Complete shareable composed-address serialization and recoverable unknown-item/filter diagnostics in `apps/web/src/shared/composables/useUrlState.ts`
- [ ] T051 [US6] Ensure composed feed reads use the latest complete published state independently of worker execution and preserve explicit cancellation semantics in `packages/core/src/persistence/postgres-calendar-event-query.ts` and `apps/api/src/`

**Checkpoint**: US6 reproduces the same composed display from the address alone.

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Complete archival, documentation, quality gates, and end-to-end validation.

- [ ] T052 [P] Move `apps/web/public/Auto-fill Action Populaire depuis Adresse-1.0.user.js` to `docs/archive/Auto-fill Action Populaire depuis Adresse-1.0.user.js`, remove it from served files, and document the archive in `apps/web/README.md`
- [ ] T053 [P] Update public contract and usage documentation for search items, multiple selections, exact-display links, city-only copy, and no-period state in `specs/007-public-calendar-experience/contracts/` and `apps/web/README.md`
- [ ] T054 Run the scenarios in `specs/007-public-calendar-experience/quickstart.md`, including multi-item composition and city-only copy, and record results in that file
- [ ] T055 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:dead`, `pnpm check:cycles`, `pnpm check:spell`, and `pnpm format:check`; fix only issues caused by this feature in the touched files

## Dependencies & Execution Order

### Phase Dependencies

- Setup (Phase 1) has no dependencies.
- Foundational (Phase 2) depends on Setup and blocks all user stories.
- US1, US2, and US3 are P1; US2 and US3 depend on the search-item types and URL primitives from Phase 2, and US3 consumes the composed state from US2.
- US4 and US5 are P2; US4 depends on the event model from US2, while US5 can proceed in parallel after Phase 2.
- US6 is P3 and depends on the completed URL and composition behavior from US2 and US3.
- Polish depends on the stories selected for delivery.

### User Story Dependencies

- US1: after Phase 2; no user-story dependency.
- US2: after Phase 2; uses US1 search selection integration for the end-to-end flow.
- US3: after US2's selected-scope and filter state; link-builder unit work can start in parallel with late US2 UI work.
- US4: after US2 event mapping; detail utilities and weather tests can proceed in parallel.
- US5: after Phase 2; can proceed in parallel with US2–US4.
- US6: after US2 and US3; address round-trip tests can proceed in parallel with final UI integration.

### Parallel Opportunities

- T002–T004 can run in parallel.
- T006–T010 can run in parallel except T008 depends on T004's shared types.
- T012–T014 can run in parallel before US1 implementation.
- T021–T023 can run in parallel before US2 implementation.
- T026–T028 can run in parallel after T024–T025 interfaces are stable.
- T031–T032 can run in parallel; T033 can proceed while T034 is implemented.
- T036–T039 can run in parallel.
- T042–T044 can run in parallel; T045–T046 can then proceed independently of backend work.
- T048–T049 can run in parallel.
- T052–T053 can run in parallel with final implementation, before T055.

## Parallel Example: User Story 1

```text
Task: "T012 [US1] Add subject ranking tests in packages/core/tests/search/subject-ranking.test.ts"
Task: "T013 [US1] Add search endpoint contract tests in tests/integration/search-subjects.test.ts"
Task: "T014 [US1] Add accessible search-field tests in apps/web/tests/discovery/search-field.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "T021 [US2] Add group-filter contract tests in packages/core/tests/calendar-filters/calendar-filter.test.ts"
Task: "T022 [US2] Add combined feed and layout rule tests in apps/web/tests/calendar/calendar-rules.test.ts"
Task: "T023 [US2] Add composition-state tests in apps/web/tests/calendar/calendar-composition.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T031 [US3] Add exact-display and city-only link tests in apps/web/tests/subscription/calendar-link-builder.test.ts"
Task: "T032 [US3] Add subscription-panel behavior tests in apps/web/tests/subscription/subscription-panel.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational phases.
2. Complete US1 search endpoint, accessible search UI, and selected-item navigation.
3. Validate US1 independently with its contract and unit tests.
4. Continue with US2 and US3 for the first useful calendar product increment.

### Incremental Delivery

1. Deliver US1 as searchable discovery.
2. Deliver US2 as composed, filterable event display.
3. Deliver US3 as the exact subscription artifact.
4. Add US4 event detail and US5 campaign/accessibility polish.
5. Add US6 share/reload hardening and run the complete quickstart and quality gates.

## Completion Criteria

- Every task uses the required `- [ ] T###` checklist format.
- Story tasks carry exactly one `[US#]` label; setup, foundational, and polish tasks do not.
- Every task names at least one concrete repository file path.
- Each user story has an independent test criterion and test tasks.
