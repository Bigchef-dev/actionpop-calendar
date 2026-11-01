# Tasks: Public Calendar Discovery Experience

**Input**: Design documents from `/specs/007-public-calendar-experience/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and mandatory. Constitution Principle III requires automated tests for every
business rule before a feature is complete, and the spec's success criteria (SC-002, SC-003,
SC-006, SC-011) are only verifiable through them. Test tasks precede their implementation tasks
inside each phase; they must fail first.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested and
delivered independently, in priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: Owning user story (US1–US6); setup, foundational and polish tasks carry none
- Every task names the exact file it creates or edits

## Path Conventions

Monorepo layout taken from [plan.md](./plan.md): `apps/web/` (static site), `apps/api/`
(NestJS service), `packages/core/` (business rules), `tests/integration/` (integration),
`data/` (reference data), `docs/` (documentation and archive).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Make the web package testable and environment-aware, and settle the assets this
feature depends on.

- [x] T001 Add Vitest to the web package in `apps/web/package.json` (devDependency `vitest`, script `"test": "vitest run"`, script `"typecheck": "vue-tsc --noEmit"`) and create `apps/web/vitest.config.ts` with `include: ['tests/**/*.test.ts']` and `environment: 'node'`
- [x] T002 [P] Replace the `import.meta` cast in `apps/web/src/config.ts` with typed environment access exposing only `API_BASE_URL` (from `VITE_API_BASE_URL`, default `http://127.0.0.1:3000`) and drop `NEXTCLOUD_BASE`, `CITY_LAT`, `CITY_LON` and `AGENDAS`
- [x] T003 [P] Create campaign design tokens in `apps/web/src/shared/styles/tokens.css` from `docs/design.md` (primary `#4C0297`, secondary `#D1271C`, paper `#FFFCF4`, ink `#212320`, `Union Gothic` and `Stack Sans Text` families) plus dark variants of paper and ink under `prefers-color-scheme: dark`, contrast-checked against FR-030, and wire them into the Tailwind theme in `apps/web/src/assets/calendar.css`
- [x] T004 [P] Move `docs/evenements-type.json` to `data/event-types.json` as the canonical action-type catalogue and update every reference to the old path (`README.md`, `docs/`)
- [x] T005 [P] Archive the legacy autocompletion script: move `apps/web/public/Auto-fill Action Populaire depuis Adresse-1.0.user.js` to `docs/archive/` and document the archival location in `apps/web/README.md`
- [x] T006 Put the survey feature on standby: remove the `?chatId=` branch and the `PollCreator` import from `apps/web/src/App.vue` while leaving `apps/web/src/features/poll/**` untouched
- [x] T007 [P] Add `API_CORS_ORIGINS` (comma-separated origins, default empty) to `apps/api/src/config.ts`, `config/actionpop.example.yaml` and the configuration section of `README.md`
- [x] T008 Create the web feature folders `apps/web/src/features/discovery/{components,composables,utils}`, `apps/web/src/features/calendar/{components,composables,utils,data}`, `apps/web/src/features/subscription/{components,utils}` and move the existing calendar components into them without behaviour change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The search read, the group criterion, the cross-origin access and the web plumbing
every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Search read (`@actionpop/core`)

- [x] T009 [P] Create `packages/core/src/search/subject-search-types.ts` with `SubjectKind` (`'commune' | 'department' | 'group'`), `SubjectCalendar` (`path` starting with `/calendar.ics`, `params: Record<string, string>`), `SearchSubject` (`kind`, non-empty `id`, non-empty `label`, optional `qualifier`, optional `parent`, required `calendar`), `SearchAnswer` (`query`, `subjects`, `total`, `kindCounts`) and the `SubjectSearchReader` interface returning candidates per kind
- [x] T010 [P] Create `packages/core/src/search/subject-ranking.ts`: normalize with the existing `normalizeGeographicName`, rank in three tiers (exact, starts-with, contains), treat a department as matching **both** its code (`69`) and its name (`Rhône`) so either query resolves to the same subject, order communes by department code then INSEE code, departments by code, groups by name length then name, cap at 6 per kind and 18 total, keep one entry per department for homonymous communes
- [x] T011 [P] Create `packages/core/src/search/postgres-subject-search.ts` implementing `SubjectSearchReader`: communes and departments from the active `geographicReferenceVersion`, groups from `ingestionScope` where `scopeKind = 'group'` and `retrievalStatus = 'active'`, matched case-insensitively on `displayName` with a hard `LIMIT`, plus a bounded counting query per kind feeding `total` and `kindCounts` (counts capped at 100)
- [x] T012 Create `packages/core/src/search/subject-search.ts`: validate `q` (2–64 characters after trimming), optional `kind` list and `limit` (1–30, default 18), ask the reader per requested kind, drop entries missing `kind`/`id`/`label`, collapse duplicate `(kind, id)`, delegate ordering to `subject-ranking.ts`, return `SearchAnswer`
- [x] T013 [P] Export the new module from `packages/core/src/index.ts`

### Search endpoint and cross-origin access

- [x] T014 [P] Create `apps/api/src/controllers/search.controller.ts` implementing `GET /search/subjects` against the contract in `contracts/search-api.md`: `400` with `query_too_short`, `query_too_long`, `kind_unknown`, `limit_invalid`; `200` with `Cache-Control: public, max-age=300`; `503` when the reader fails; Swagger decorators matching the DTO field names
- [x] T015 Wire CORS in `apps/api/src/server.ts`: `app.enableCors({ origin: <API_CORS_ORIGINS split>, methods: ['GET', 'HEAD', 'OPTIONS'], credentials: false })`, leaving the header absent when the list is empty
- [x] T016 Register the search controller and its reader in `apps/api/src/app.module.ts` and `apps/api/src/main.ts` (`PostgresSubjectSearch` over the existing Prisma client)
- [x] T017 [P] Write `packages/core/tests/search/subject-ranking.test.ts`: accent/case/punctuation insensitivity, exact > prefix > contains, `q=69` and `q=rhone` resolving to the same `department:69` subject, per-kind caps, `Saint-Denis` returned once per department, group ordering
- [x] T018 [P] Write `packages/core/tests/search/subject-search.test.ts` with a fake reader: `query_too_short`, `query_too_long`, `kind_unknown`, `limit_invalid`, dropped invalid entries, duplicate collapse, per-kind counts
- [x] T019 [P] Write `apps/api/tests/search.controller.test.ts` against `buildApp` with a stub reader: `200` shape, `400` diagnostics codes, `503` on reader failure, absence of `Access-Control-Allow-Origin` for a non-allowed origin and presence for an allowed one

### `group` criterion on `/calendar.ics`

- [x] T020 [P] Add `groupIds?: readonly string[]` to `CalendarEventCriteria` in `packages/core/src/calendar-filters/calendar-event.ts`
- [x] T021 [P] Parse the repeatable `group` parameter in `packages/core/src/calendar-filters/calendar-filter.ts`: comma-separated values, empty value → `filter_value_invalid`, unknown value left to produce an empty calendar
- [x] T022 Thread `groupIds` through `packages/core/src/calendar-filters/calendar-criteria.ts` into the criteria object without touching commune or type resolution
- [x] T023 Add the `groupLinks: { some: { scopeId: { in: [...] } } }` predicate to `buildWhere` in `packages/core/src/persistence/postgres-calendar-event-query.ts`
- [x] T024 [P] Write `packages/core/tests/calendar-filters/group-filter.test.ts`: single value, several values (OR), combination with `department` (AND), empty value rejected, `group` absent → criteria unchanged from today
- [x] T025 Write `tests/integration/search-and-group-filter.test.ts`: a group subject returned by `/search/subjects` feeds `/calendar.ics?group=<id>` and yields only that group's events; a request without `group` returns the same bytes as before the change

### Web plumbing

- [x] T026 Create the query-string state module in `apps/web/src/shared/composables/useUrlState.ts`: total parse of `sujet`, `types`, `vue`, `evenement` with per-parameter fallbacks, `history.replaceState` writes, no history entry added
- [x] T027 [P] Write `apps/web/tests/shared/url-state.test.ts`: round-trip of every parameter, default resolution for each invalid value, `sujet` format `kind:id`, empty address → discovery
- [x] T028 [P] Create the API client in `apps/web/src/shared/api/client.ts`: `searchSubjects(query, options)` and `fetchCalendar(params)` with `AbortSignal` support, JSON and text error classification, and the configured base URL
- [x] T029 Create `apps/web/src/shared/components/StateMessage.vue` (title, explanation, one primary action and one secondary action) and `apps/web/src/shared/components/AppShell.vue` (header, main, footer)
- [x] T030 Rewrite `apps/web/src/App.vue` as a route switch only: discovery when `sujet` is absent, calendar otherwise, using `useUrlState` and `AppShell`

**Checkpoint**: `pnpm --filter @actionpop/core test`, `pnpm --filter @actionpop/api test` and
`pnpm --filter @actionpop/web test` pass; `/search/subjects?q=lyon` answers; the feed accepts
`group`.

---

## Phase 3: User Story 1 — Find my city, department or action group (Priority: P1) 🎯 MVP

**Goal**: A single central search resolves a query to a subject of any kind, with an animated
example placeholder, keyboard and screen-reader support, and explicit no-result and
disambiguation states.

**Independent Test**: Type `ly`, `69` and the beginning of a group name; choose a suggestion;
verify the address becomes `/?sujet=<kind>:<id>` and the same events appear as a direct feed
request for that subject (`quickstart.md` scenario 1).

### Tests for User Story 1

- [x] T031 [P] [US1] Write `apps/web/tests/discovery/suggestion-shape.test.ts`: grouping by kind, kind labels in French, `qualifier` shown for homonyms, unknown kind rendered from `label`, 6-per-kind cap respected
- [x] T032 [P] [US1] Write `apps/web/tests/discovery/typed-placeholder.test.ts`: scripted typing/erasing sequence, at least two examples before repeating, stops on focus, stops after input, static under reduced motion
- [x] T033 [P] [US1] Write `apps/web/tests/discovery/query-encoding.test.ts`: `sujet` value encoding and decoding for `kind:id`, ids containing `:` rejected

### Implementation for User Story 1

- [x] T034 [P] [US1] Create `apps/web/src/features/discovery/utils/suggestion-shape.ts`: turn a `SearchAnswer` into ordered display groups with French kind labels (`Ville`, `Département`, `Groupe d'action`) and a fallback label for unknown kinds
- [x] T035 [P] [US1] Create `apps/web/src/features/discovery/utils/query-encoding.ts`: `encodeSubject(subject)` → `kind:id`, `decodeSubject(value)` → `{ kind, id } | null`
- [x] T036 [US1] Create `apps/web/src/features/discovery/composables/useTypedPlaceholder.ts`: type/erase an ordered example list, pause between examples, expose `isStatic`, honour `prefers-reduced-motion`, stop on focus and on first input
- [x] T037 [US1] Create `apps/web/src/features/discovery/composables/useSearchSuggestions.ts`: 2-character minimum, 150 ms debounce, abort the previous request, expose `subjects`, `total`, `kindCounts`, `status` (`idle | loading | ready | empty | error`) and `retry()`
- [x] T038 [US1] Create `apps/web/src/features/discovery/components/TypedPlaceholder.vue` rendering the scripted examples inside the field, `aria-hidden` so it never duplicates the label
- [x] T039 [US1] Create `apps/web/src/features/discovery/components/SuggestionList.vue`: grouped by kind, each row showing label, kind and qualifier, active row marked with `aria-selected`
- [x] T040 [US1] Create `apps/web/src/features/discovery/components/SearchField.vue`: WAI-ARIA combobox (`aria-expanded`, `aria-controls`, `aria-activedescendant`), `↓`/`↑`/`Enter`/`Escape`/`Tab` handling, `aria-live` announcement of the result count
- [x] T041 [US1] Create `apps/web/src/features/discovery/components/SearchHero.vue` composing the promise sentence, `SearchField`, `SuggestionList` and the static example list (available without animation)
- [x] T042 [US1] Implement the no-result state in `SearchHero.vue`: statement, at least two neighbouring alternatives derived from `kindCounts`, and an invitation to change the kind of search — never an empty panel
- [x] T043 [US1] Implement the disambiguation state in `SuggestionList.vue`: when the same commune label appears in several departments, each row shows its department and selecting one scopes the calendar to that department only
- [x] T044 [US1] Create `apps/web/src/features/discovery/composables/useRecentSubject.ts` storing the last `kind:id` locally and exposing it to the hero without overriding an address-provided subject
- [x] T045 [US1] Implement the three discovery proposals of `contracts/web-experience.md`, each in its own component file under `apps/web/src/features/discovery/components/proposals/` (`DiscoveryVariantA.vue`, `DiscoveryVariantB.vue`, `DiscoveryVariantC.vue`) composed by `SearchHero.vue`, selected by a `proposition` flag that is excluded from the production build unless `VITE_REVIEW_PROPOSALS=true`, each honouring A1–A7 and J1–J5, one marked as recommended
- [x] T046 [US1] Validate scenario 1 of `quickstart.md` and record the observed result in `specs/007-public-calendar-experience/quickstart.md`

**Checkpoint**: User Story 1 delivers a working MVP search over communes, departments and groups.

---

## Phase 4: User Story 2 — See and filter the events of my choice (Priority: P1)

**Goal**: The chosen subject's events are read from the project feed, displayed in a calendar or
list layout, and filtered by action type entirely in the browser.

**Independent Test**: Choose a subject, select one type, verify the displayed set equals the
subset of that type for that subject, then clear the filter and recover the full set
(`quickstart.md` scenario 2).

### Tests for User Story 2

- [x] T047 [P] [US2] Write `apps/web/tests/calendar/ical-mapping.test.ts` against fixture `.ics` text: `UID` required, `CATEGORIES` → `eventType`, `GEO` → coordinates or `null`, every `X-ACTIONPOP-*` captured with parameters, `STATUS` fallback to `CONFIRMED`, cancelled `RECURRENCE-ID` exception removed, malformed `DTSTART` dropped and counted
- [x] T048 [P] [US2] Write `apps/web/tests/calendar/type-filter.test.ts`: single type, several types (OR), empty selection means all, unknown slug ignored, event with no type kept only when no filter is active

### Implementation for User Story 2

- [x] T049 [P] [US2] Create `apps/web/src/features/calendar/utils/ical-mapping.ts` producing `CalendarEvent[]` per `data-model.md`, using `ical.js`, never throwing on a malformed component and reporting a dropped count
- [x] T050 [P] [US2] Create `apps/web/src/features/calendar/utils/type-filter.ts`: filter by a set of slugs plus a derived list of available types with counts
- [x] T051 [US2] Create `apps/web/src/features/calendar/composables/useCalendarFeed.ts`: build the feed request from `subject.calendar.path` and `params` verbatim, fetch once per subject, expose `events`, `droppedCount`, `period`, `status` and `retry()`
- [x] T052 [US2] Split `apps/web/src/features/calendar/components/CalendarView.vue` into `CalendarView.vue` (widget wiring, ≤ 150 lines) and `EventList.vue` (chronological list) without behaviour change
- [x] T053 [US2] Rewrite `apps/web/src/features/calendar/components/FilterBar.vue` to filter by action type with the emoji and readable name of each type, `aria-pressed` on each toggle, and an "N sur M" indicator
- [x] T054 [US2] Implement the layout switch in `apps/web/src/features/calendar/components/CalendarView.vue` driven by `vue` (`mois`, `jour`, `semaine`, `liste`), defaulting to `jour` under 768 px and resetting each calendar view to its initial viewport
- [x] T055 [US2] Display the covered period and the subject name on the calendar screen in `apps/web/src/features/calendar/components/CalendarView.vue`, using the period asserted by the feed response and never a guessed value
- [x] T056 [US2] Implement the no-event state and the loading skeleton in `apps/web/src/features/calendar/components/CalendarView.vue` via `StateMessage`, naming the subject and the period and offering subscription
- [x] T057 [US2] Validate scenario 2 of `quickstart.md` and record the observed result

**Checkpoint**: Stories 1 and 2 both work; the visitor can find a subject and read its events.

---

## Phase 5: User Story 3 — Leave with my own calendar link (Priority: P1)

**Goal**: From a calendar screen, the visitor obtains a personal link in the forms their calendar
application consumes, with or without the displayed type filter, and with a statement of what it
covers.

**Independent Test**: Take the link for a filtered subject, import it, and verify the imported
calendar contains exactly the displayed events; repeat with the filter excluded and with a group
subject (`quickstart.md` scenario 3).

### Tests for User Story 3

- [x] T058 [P] [US3] Write `apps/web/tests/subscription/calendar-link-builder.test.ts`: subscription, `webcal`, download and calendar-service forms for commune, department and group subjects; `keepsFilters` adds `event_type` values, otherwise omits them; the description names subject, filters and period; a subject with no `params` yields no link

### Implementation for User Story 3

- [x] T059 [P] [US3] Create `apps/web/src/features/subscription/utils/calendar-link-builder.ts` producing a `CalendarLink` per `data-model.md` from a `SearchSubject`, the active filter and the covered period
- [x] T060 [US3] Create `apps/web/src/features/subscription/components/SubscriptionPanel.vue`: subject, covered period, filter statement, and the three forms in the order subscription → download → calendar service
- [x] T061 [US3] Create `apps/web/src/features/subscription/components/LinkFormatChoice.vue` with the `keepsFilters` toggle and a sentence stating which of the two links is currently proposed
- [x] T062 [US3] Implement copy with visible confirmation and a fallback when the clipboard is unavailable, in `apps/web/src/features/subscription/components/SubscriptionPanel.vue`
- [x] T063 [US3] Implement the unavailable-calendar state in `SubscriptionPanel.vue` via `StateMessage`, offering retry and a direct link to the full feed instead of a broken link
- [x] T064 [US3] Make the subscription entry point reachable in one action from every calendar screen, without requiring scrolling on a 375 × 667 viewport (invariant J3), in `apps/web/src/features/calendar/components/CalendarView.vue`
- [x] T065 [US3] Validate scenario 3 of `quickstart.md`, including the group subject case, and record the observed result

**Checkpoint**: The product's deliverable exists — a visitor can leave with a working calendar.

---

## Phase 6: User Story 4 — Understand one event at a glance (Priority: P2)

**Goal**: The event detail shows the action type with its emoji, the practical information
already available (time, place, map, weather), the published `X-ACTIONPOP-*` fields, the status,
and a route to the responsible person on Action Populaire.

**Independent Test**: Open an event of a known type and verify type, weather, map, published
metadata and the Action Populaire action each appear when available and are absent — without an
empty section — when not (`quickstart.md` scenario 4).

### Tests for User Story 4

- [x] T066 [P] [US4] Write `apps/web/tests/calendar/metadata-labels.test.ts`: French label per known property name, raw name kept for unknown properties, repeatable `GROUP` values grouped, property parameters shown as qualifiers, absent properties omitted
- [x] T067 [P] [US4] Write `apps/web/tests/calendar/weather-window.test.ts`: inside the 16-day horizon and with coordinates → request expected; outside the horizon, without coordinates, or for an all-day event without a time → no request
- [x] T068 [P] [US4] Write `apps/web/tests/calendar/action-type-catalogue.test.ts`: known slug → catalogue emoji, name and colour; unknown slug → neutral emoji and de-slugified label; missing emoji → neutral emoji

### Implementation for User Story 4

- [x] T069 [P] [US4] Create `apps/web/src/features/calendar/data/event-types.ts` loading `data/event-types.json` into a typed lookup keyed by `label` (the slug), with neutral fallbacks, and configure that cross-package import (`resolve.alias` in `apps/web/vite.config.ts` and the matching `include` in `apps/web/tsconfig.json`) or copy the file into `apps/web/src/features/calendar/data/` if the alias proves impractical
- [x] T070 [P] [US4] Create `apps/web/src/features/calendar/utils/metadata-labels.ts`: label dictionary, grouping of repeatable properties, parameters as qualifiers, omission of absent properties, unknown names rendered raw
- [x] T071 [P] [US4] Create `apps/web/src/features/calendar/utils/weather-window.ts`: decide whether an event can receive a forecast (coordinates present, start inside the provider horizon, distinct rounded coordinate key)
- [x] T072 [US4] Rewrite `apps/web/src/features/calendar/composables/useWeather.ts` to query Open-Meteo per rounded coordinate pair, cache per coordinate and day, and return `null` outside the horizon
- [x] T073 [US4] Split `apps/web/src/features/calendar/components/EventModal.vue` (288 lines) into `EventDetail.vue` (composition and actions, ≤ 150 lines) and section components `EventDetailHeader.vue`, `EventDetailPlace.vue`, `EventDetailActions.vue`
- [x] T074 [US4] Create `apps/web/src/features/calendar/components/MetadataSection.vue` rendering the collapsible "Informations publiées" section from `metadata-labels.ts`, with no empty state
- [x] T075 [US4] Create `apps/web/src/features/calendar/components/TypeChip.vue` showing emoji plus readable name, used by the filter bar, the list and the detail
- [x] T076 [US4] Update `apps/web/src/features/calendar/components/WeatherBadge.vue` to consume the per-event forecast and render nothing when no forecast applies
- [x] T077 [US4] Implement the map action (`https://www.google.com/maps/search/?api=1&query=<location>`) and the single outbound Action Populaire action (`X-ACTIONPOP-SOURCE-URL`, else `URL`) in `EventDetailActions.vue`
- [x] T078 [US4] Render the event status with a text label plus the existing visual treatment in `EventDetailHeader.vue`, so colour is never the only carrier (A3)
- [x] T079 [US4] Keep the detail reachable from a direct address: `evenement=<uid>` opens it on load and an unknown uid shows the calendar without the detail, in `apps/web/src/App.vue`
- [x] T080 [US4] Implement the two detail-screen proposals of `contracts/web-experience.md`, each in its own component file under `apps/web/src/features/calendar/components/proposals/` (`DetailVariantA.vue`, `DetailVariantB.vue`) composed by `EventDetail.vue`, selected by the same `proposition` flag excluded from the production build, one marked as recommended
- [x] T081 [US4] Validate scenario 4 of `quickstart.md` and record the observed result

**Checkpoint**: An event is understandable without leaving the experience.

---

## Phase 7: User Story 5 — Feel at home and be guided (Priority: P2)

**Goal**: The campaign identity is recognizable on every screen, the promise and the first action
are obvious, and every state has a way forward.

**Independent Test**: Show the home screen to someone unfamiliar with the project on a phone and
verify they can state what the tool does and what their first action should be, without help
(`quickstart.md` scenario 6).

- [x] T082 [US5] Write the home promise and the "what this is not" sentence in `apps/web/src/features/discovery/components/SearchHero.vue`
- [x] T083 [US5] Apply the campaign tokens to every screen in `apps/web/src/shared/components/AppShell.vue` and `apps/web/src/assets/calendar.css`, removing any hard-coded colour left in `apps/web/src/features/**`
- [x] T084 [P] [US5] Add alternative text to meaningful illustrations and `aria-hidden` to decorative ones in `apps/web/src/shared/components/AppShell.vue` and `apps/web/src/features/discovery/components/SearchHero.vue`
- [x] T085 [P] [US5] Guard every animation behind `prefers-reduced-motion` in `apps/web/src/features/discovery/composables/useTypedPlaceholder.ts` and `apps/web/src/assets/calendar.css`
- [x] T086 [US5] Ensure the primary actions are thumb-reachable and no affordance is hover-only across `apps/web/src/features/**/components/*.vue` (invariant J5)
- [x] T087 [US5] Audit contrast of every text and interactive element against the four campaign colours, in both the light and the dark preference, and fix the failures found, recording the result in `specs/007-public-calendar-experience/quickstart.md`
- [x] T088 [US5] Cover the five required states (loading, no result, no event, unavailable, outdated address) and verify each offers a forward path across `apps/web/src/features/**/components/*.vue`
- [x] T089 [US5] Verify the journey completes in at most four deliberate actions from arrival to a usable link (invariant J2) by walking `apps/web/src/features/discovery/components/SearchHero.vue` → `apps/web/src/features/calendar/components/CalendarView.vue` → `apps/web/src/features/subscription/components/SubscriptionPanel.vue`, and adjust copy or defaults if it does not
- [x] T090 [US5] Validate scenario 6 of `quickstart.md` and record the observed result

**Checkpoint**: The experience is presentable to the campaign team.

---

## Phase 8: User Story 6 — Share a discovery (Priority: P3)

**Goal**: A copied address reproduces the same subject, filters and period for the recipient, and
a broken address never produces a broken screen.

**Independent Test**: Copy the address of a filtered view, open it in a private window and compare
the displayed events; then corrupt each parameter and verify recovery (`quickstart.md`
scenario 5).

- [x] T091 [P] [US6] Write `apps/web/tests/shared/share-roundtrip.test.ts`: a filtered view serialized then parsed yields the same subject, types and layout; each invalid parameter is replaced by its default and reported; an unknown `sujet` yields the outdated-address state, not an exception
- [x] T092 [US6] Implement the outdated/unknown-subject recovery state in `apps/web/src/App.vue` via `StateMessage`, naming the searched value and offering a new search
- [x] T093 [US6] Report ignored `types` values and an unusable `vue` value on screen in `apps/web/src/features/calendar/components/FilterBar.vue`, without blocking the view
- [x] T094 [US6] Add a share affordance that copies the current page address in `apps/web/src/features/calendar/components/CalendarView.vue`, reusing the copy feedback of `SubscriptionPanel.vue`
- [x] T095 [US6] Validate scenario 5 of `quickstart.md` and record the observed result

**Checkpoint**: Discovery spreads without support.

---

## Phase 9: Coverage Remediation

**Purpose**: Close the requirements the story phases leave partially covered, before the final
polish. These tasks are behavioural, not cosmetic.

- [x] T096 [US4] Write `apps/web/tests/calendar/event-add-to-calendar.test.ts`: Google render URL and downloadable `.ics` URL for a timed event and an all-day event, with and without a place
- [x] T097 [US4] Implement the add-to-calendar action (calendar service link and downloadable copy) in `apps/web/src/features/calendar/components/EventDetailActions.vue` so that FR-025 is fully covered
- [x] T098 [US1] [US4] Create `specs/007-public-calendar-experience/polls.md` recording one `DecisionPoll` per open UX choice (question, options with consequences, recommended default, status) and the arbitration of the proposals produced by T045 and T080, satisfying SC-005
- [x] T099 [US5] Verify FR-038 across `apps/web/src/features/**`: no location API call, no request carrying typed content other than the search query, and document the local storage of T044 as an explicitly typed choice
- [ ] T100 Run a throttled-mobile performance check on the built `apps/web` (suggestion p95 under 1 s, first screen actionable under 3 s) and record the measured numbers in `quickstart.md`

**Checkpoint**: Every functional requirement and every buildable success criterion has a task.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [x] T101 [P] Update `apps/web/README.md`: the new architecture, the two endpoints consumed, the archived script location, the proposals flag and the test command
- [x] T102 [P] Update `README.md`: `GET /search/subjects`, the `group` feed parameter, `API_CORS_ORIGINS` and its required production value for the published origin (also set in `infra/compose/docker-compose.yml`), and the fact that the site no longer depends on Nextcloud or a third-party CORS proxy
- [x] T103 Remove the dead code left by the migration: `apps/web/src/features/poll` imports in `App.vue`, `SubscriptionGrid.vue` usage, and any remaining `NEXTCLOUD_BASE` reference
- [x] T104 Verify `.github/workflows/web.yml` and `.github/workflows/pages.yml` still typecheck, test and build the package, and align the Vite `base` with the published path
- [x] T105 Run `pnpm --filter @actionpop/web test`, `pnpm --filter @actionpop/web typecheck`, `pnpm --filter @actionpop/core test`, `pnpm --filter @actionpop/api test` and `pnpm test:integration`
- [x] T106 Run `pnpm lint`, `pnpm check:dead`, `pnpm check:cycles` and `pnpm check:spell` and fix every finding introduced by this feature
- [x] T107 Run `pnpm format:check` and format only the files this feature touched
- [x] T108 Execute every scenario of `quickstart.md` end to end on a 375 × 667 viewport and record the observed results in that file
- [x] T109 Confirm the built bundle contains no fixed agenda list, no fixed coordinates and no third-party proxy, then close Theme F in `specs/007-public-calendar-experience/quickstart.md`

## Phase 11: Convergence

- [x] T110 Populate and validate the active geographic reference data used by the public calendar, wire the documented development/deployment refresh path, and verify commune and department searches end to end per FR-001 / US1-AC1 / SC-002 (missing)

## Phase 12: Publication resilience and cancellation

- [ ] T111 [US2] Add tests proving commune, department and group calendars serve the latest complete published events while the worker is stopped or has no recent cycle, per FR-045 / FR-047 / SC-012
- [x] T112 [US4] Add an explicit cancelled status to the event domain, persistence mapping and iCalendar/web presentation while preserving historical records per FR-016 / FR-046 / FR-044
- [x] T113 [US4] Implement detail-ingestion cancellation handling so only an explicit event-detail `404` marks an event cancelled; preserve the last known state for transient, malformed, incomplete and ambiguous responses per FR-015 / FR-045 / SC-013
- [ ] T114 [US4] Add tests for multi-source attribution, complete versus truncated listing disappearance, and source-scope removal versus event cancellation per FR-017 / FR-018
- [ ] T115 [US2] Validate `department=35` and `insee_commune=35238` with the worker stopped, and record the observed results in `specs/007-public-calendar-experience/quickstart.md` per FR-043 / SC-012

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency, can start immediately
- **Foundational (Phase 2)**: depends on Setup; **BLOCKS every user story**
- **User Stories (Phases 3–8)**: depend on Foundational; P1 stories can then run in parallel if staffed
- **Coverage Remediation (Phase 9)**: depends on the delivered stories; its tasks close requirements the stories leave partially covered
- **Polish (Phase 10)**: depends on every phase above

### User Story Dependencies

| Story    | Depends on                                                  | Independent test criterion                                                                                     |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| US1 (P1) | Foundational (search read, `useUrlState`, `App.vue` switch) | A query of each kind resolves to `/?sujet=<kind>:<id>` showing the same events as the direct feed request      |
| US2 (P1) | Foundational; subject selection from US1 or a typed address | The displayed set equals the type subset of the subject, and clearing restores everything                      |
| US3 (P1) | Foundational; a subject from US1 or a typed address         | The imported calendar matches the displayed events, with and without the filter, including a group             |
| US4 (P2) | Foundational; a calendar screen from US2                    | Type, weather, map, metadata and the Action Populaire action appear when available and never as empty sections |
| US5 (P2) | US1, US2 (screens exist)                                    | An unfamiliar person states the purpose and their first action unaided                                         |
| US6 (P3) | US2 (a filtered view exists)                                | A copied address reproduces the view; a corrupted address recovers                                             |

### Within Each User Story

Tests are written and failing before the implementation tasks of the same story. Utilities before
composables, composables before components, components before validation.

### Parallel Opportunities

- Phase 1: T002, T003, T004, T005 and T007 are independent files
- Phase 2: T009–T011 (core search files), T017–T019 (test files), T020–T021 and T024 (filter and
  its test), T026 and T028 (web plumbing) are independent; T012 depends on T009–T011, T014 on
  T012, T023 on T020–T022
- Phase 3: T031–T033 (tests), T034–T035 (utils) can run together; T036 and T037 depend on T034
- Phase 6: T066–T068 (tests) and T069–T071 (utils) can run together
- Different stories can be worked on by different people once Phase 2 is complete

---

## Parallel Example: Phase 2 (backend half)

```bash
# Three independent core modules
Task: "Create packages/core/src/search/subject-search-types.ts"
Task: "Create packages/core/src/search/subject-ranking.ts"
Task: "Create packages/core/src/search/postgres-subject-search.ts"

# Then their tests, also independent
Task: "Write packages/core/tests/search/subject-ranking.test.ts"
Task: "Write packages/core/tests/search/subject-search.test.ts"
Task: "Write apps/api/tests/search.controller.test.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Write apps/web/tests/discovery/suggestion-shape.test.ts"
Task: "Write apps/web/tests/discovery/typed-placeholder.test.ts"
Task: "Write apps/web/tests/discovery/query-encoding.test.ts"

Task: "Create apps/web/src/features/discovery/utils/suggestion-shape.ts"
Task: "Create apps/web/src/features/discovery/utils/query-encoding.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — Setup
2. Phase 2 — Foundational (the search read and cross-origin access are unavoidable)
3. Phase 3 — US1
4. **STOP and VALIDATE**: `quickstart.md` scenario 1; the site answers real searches and scopes a
   subject in the address
5. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → search works → demo
3. US2 → events and type filtering work → demo
4. US3 → the visitor leaves with a calendar → **the product's promise is met**
5. US4 → each event is understood → demo
6. US5 → the experience is presentable → poll the interface proposals
7. US6 → discovery spreads
8. Phase 9 → the add-to-calendar action, the decision-poll record, the FR-038 check and the
   performance budget close the remaining coverage
9. Phase 10 → final polish and delivery

### Notes

- [P] marks tasks touching different files with no incomplete dependency
- Commit after each task or logical group; never mix a test task and its implementation in one
  commit without first running the failing test
- Stop at every checkpoint to validate the story independently
- Avoid: vague tasks, two tasks editing the same file in parallel, and cross-story dependencies
  that would make a story undeliverable on its own
