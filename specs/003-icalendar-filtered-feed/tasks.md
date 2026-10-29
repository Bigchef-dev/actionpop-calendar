---

description: "Task list for the filtered iCalendar feed"
---

# Tasks: Filtered iCalendar Feed

**Input**: Design documents from `/specs/003-icalendar-filtered-feed/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Required. Constitution principle III makes automated tests a completion gate, and FR-018 and FR-040 require drift tests that fail when the documented contract and the emitted payload diverge.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story this task belongs to (US1–US6)
- Every task names its exact file path

## Path Conventions

pnpm workspace monorepo: shared library in `packages/core/src/`, API in `apps/api/src/`, tests beside modules in `packages/core/src/**/*.test.ts` and under `apps/api/tests/`, deployment files under `config/` and `infra/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one new dependency and prepare version-control boundaries for the configuration document.

- [X] T001 Add `yaml` (eemeli, `^2.8.0`) to the `dependencies` of `packages/core/package.json`, run `pnpm install`, and confirm the lockfile records it as a direct dependency
- [X] T002 [P] Ignore the runtime configuration copy `config/actionpop.yaml` in `.gitignore` while keeping `config/actionpop.example.yaml` tracked, and keep `config/actionpop.example.yaml` out of `.dockerignore` so the images can carry it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Configuration mechanism, RFC 5545 primitives, calendar projection and read model. No user story can be delivered before this phase.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [X] T003 [P] Add `CalendarConfig` to `packages/core/src/config/config.interface.ts` with `enabled: boolean`, `lookbackDays: number`, `lookaheadDays: number`, `maxEntries: number`, `maxGroupsPerEvent: number`, `revalidationSeconds: number`, `metadataLevel: MetadataLevel`, `disabledFamilies: MetadataFamily[]`, and extend `RootConfig` with `calendar: CalendarConfig`
- [X] T004 [P] Add the calendar defaults to `packages/core/src/config/defaults.config.ts`: `lookbackDays: 30`, `lookaheadDays: 90`, `maxEntries: 1000`, `maxGroupsPerEvent: 5`, `revalidationSeconds: 900`, `metadataLevel: 'standard'`, `disabledFamilies: []`, `enabled: true`
- [X] T005 Implement `packages/core/src/config/config-file.ts`: resolve the document from `APP_CONFIG_FILE` or `config/actionpop.yaml`, parse YAML, overlay environment variables using the mapping in `contracts/configuration-file.md`, validate the merged result with Zod, and return `RootConfig` with the origin (`file` or `environment`) of each error field
- [X] T006 [P] Create `config/actionpop.example.yaml` as the complete commented reference, listing every key of `contracts/configuration-file.md` with its default and its accepted values
- [X] T007 [P] Write `packages/core/src/config/config-file.test.ts` covering a valid document, a missing default file falling back to defaults plus environment, an explicitly named missing file failing, malformed YAML, an unknown top-level key, `lookbackDays` below `0`, `lookaheadDays` below `1`, `maxEntries` below `1`, an unknown `metadataLevel`, and an unknown family in `disabledFamilies`
- [X] T008 Wire `packages/core/src/config/runtime-config.ts` to consume the merged configuration while preserving every existing environment variable (`REDIS_URL`, `DATABASE_URL`, `UPSTREAM_BASE_URL`, `UPSTREAM_TOKEN`, `QUEUE_ATTEMPTS`, `QUEUE_BACKOFF_MS`, `DISPATCHER_INTERVAL_MS`, `TIMEZONE`, `LOG_LEVEL`, `NODE_ENV`), and keep `packages/core/src/config/runtime-config.test.ts` green
- [X] T009 Implement `packages/core/src/calendar/ical-writer.ts` with `escapeText` (backslash, comma, semicolon, CRLF to `\n`), `foldLine` at 75 octets with a leading space on continuation lines, `formatUtcInstant` in basic UTC format, and `joinLines` producing CRLF with a trailing CRLF
- [X] T010 [P] Write `packages/core/src/calendar/ical-writer.test.ts` covering escaping of `,`, `;`, `\` and line breaks, folding of a 200-character value with continuation lines starting with a space, a multi-byte accented value folded on an octet boundary without splitting a character, and CRLF termination
- [X] T011 Refactor `packages/core/src/calendar/ical-feed.ts` onto `ical-writer.ts` without changing its output contract, keeping `packages/core/src/calendar/ical-feed.test.ts` passing
- [X] T012 [P] Define the `CalendarEvent` projection type in `packages/core/src/calendar-filters/calendar-event.ts`, with every field of `data-model.md`, string types for all identifiers including `departmentCode` and `communeId`, and optional geography, location and coordinates
- [X] T013 [P] Implement `packages/core/src/calendar-filters/calendar-window.ts` computing `startUtc = requestInstant - lookbackDays` and `endUtc = requestInstant + lookaheadDays` in `Europe/Paris`, plus the overlap predicate `endTime >= startUtc && startTime <= endUtc`
- [X] T014 [P] Write `packages/core/src/calendar-filters/calendar-window.test.ts` covering default 30/90 offsets against a fixed instant, an event ending exactly on the boundary being included, an event starting exactly on the boundary being included, an event entirely before the lookback being excluded, and an event entirely after the lookahead being excluded
- [X] T015 Implement `packages/core/src/persistence/postgres-calendar-event-query.ts` exposing `listCalendarEvents(criteria, window, limit)` that selects `source_event_id`, `summary`, `description`, `start_time`, `end_time`, `sequence`, `updated_at`, `last_seen_period`, `event_type`, `source_url`, the geography columns, the location columns and the geo point, joins group links without duplicating events, orders deterministically by `start_time` then `source_event_id`, and applies the `limit`
- [X] T016 [P] Write `tests/integration/calendar-event-query.test.ts` using the `tests/integration/postgres-setup.ts` helper, covering an event linked to three groups returning one row with three group identifiers, the window predicate, and the result limit
- [X] T017 Export the new modules from `packages/core/src/index.ts`: `ical-writer`, `calendar-filters/*`, `ical-metadata`, `filtered-ical`, `commune-name-resolver` and `postgres-calendar-event-query`

**Checkpoint**: Configuration, RFC 5545 primitives, projection and read model are ready. User stories can now proceed independently.

---

## Phase 3: User Story 1 — Subscribe to a filtered calendar (Priority: P1) 🎯 MVP

**Goal**: `GET /calendar.ics` returns the events matching `department` and/or `event_type` inside the window, each exactly once, as a valid RFC 5545 document.

**Independent Test**: Seed events across several departments and event types, request `?department=69&event_type=tractage`, and verify every returned entry matches both criteria once and that the payload parses as a calendar.

### Tests for User Story 1

- [X] T018 [P] [US1] Write `packages/core/src/calendar-filters/calendar-filter.test.ts` covering a single `department`, a single `event_type`, comma-separated `event_type` values combining with OR, `department` and `event_type` combining with AND, leading zeroes preserved (`01`), alphanumeric codes preserved (`2A`), and a request with no criterion imposing no constraint
- [X] T019 [P] [US1] Write `packages/core/src/calendar/filtered-ical.test.ts` covering `BEGIN:VCALENDAR`/`END:VCALENDAR` framing, one `VEVENT` per event, `UID:<sourceEventId>@actionpop-calendar`, `SEQUENCE`, UTC `DTSTART`/`DTEND`, and CRLF termination
- [X] T020 [P] [US1] Write `apps/api/tests/calendar-ics.test.ts` driving `buildApp` with a stub calendar query, asserting `?department=69&event_type=tractage` forwards both criteria, returns `text/calendar; charset=utf-8`, and emits each event exactly once

### Implementation for User Story 1

- [X] T021 [US1] Implement `packages/core/src/calendar-filters/calendar-filter.ts` parsing `country`, `department` and `event_type`, splitting comma-separated values, trimming items, rejecting empty items with `filter_value_invalid`, collapsing duplicates, and returning a discriminated `{ ok: true, criteria } | { ok: false, diagnostics }` result
- [X] T022 [US1] Implement `packages/core/src/calendar/filtered-ical.ts` assembling the calendar from `CalendarEvent[]` using `ical-writer.ts`, emitting `VERSION:2.0`, `PRODID:-//ActionPop Calendar//EN` and `CALSCALE:GREGORIAN`, with `SUMMARY` and optional `DESCRIPTION` per entry
- [X] T023 [US1] Implement `packages/core/src/calendar/filtered-calendar-service.ts` composing filter parsing, window computation, query execution and document assembly behind injected settings, keeping the module thin
- [X] T024 [US1] Implement `apps/api/src/controllers/calendar-ics.controller.ts` with `@Get('calendar.ics')` at the application root, injecting the calendar service, returning the document with `text/calendar; charset=utf-8` and `Content-Disposition: inline; filename="actionpop-calendar.ics"`
- [X] T025 [US1] Emit `ETag` as a truncated SHA-256 of the produced body and answer `304` when `If-None-Match` matches, plus `Cache-Control: public, max-age=<revalidationSeconds>` in `apps/api/src/controllers/calendar-ics.controller.ts`
- [X] T026 [US1] Register the controller and the calendar query provider in `apps/api/src/app.module.ts`, add the `CALENDAR_QUERY` token to `apps/api/src/constants.ts`, and extend `ServerOptions` in `apps/api/src/server.ts` with the calendar query and calendar settings
- [X] T027 [US1] Instantiate `PostgresCalendarEventQuery` and pass the loaded `CalendarConfig` in `apps/api/src/main.ts`, and load the merged configuration in `apps/api/src/config.ts`

**Checkpoint**: The MVP is deployable — a subscriber can filter by department and event type.

---

## Phase 4: User Story 2 — Select communes by name or INSEE list (Priority: P1)

**Goal**: `commune_name` and `insee_commune` select communes, form one dimension combined with OR, and disambiguate with `department`.

**Independent Test**: Seed events in `69123`, `69124` and a third commune of department 69, request `insee_commune=69123,69124`, and verify only those two communes are returned once each.

### Tests for User Story 2

- [X] T028 [P] [US2] Write `packages/core/src/geography/commune-name-resolver.test.ts` with a stub `GeographicReferenceReader` covering one exact match, an accent-and-case variant resolving to the same commune, a pronoun-free alias match, an ambiguous name resolved by `department`, an ambiguous name without `department` returning `commune_name_ambiguous` with the candidate INSEE codes, an unknown name returning `commune_name_unknown`, and the union of resolved names with supplied codes
- [X] T029 [P] [US2] Extend `packages/core/src/calendar-filters/calendar-filter.test.ts` with `commune_name` and `insee_commune` lists, their OR union, rejected empty items, and collapsed duplicates
- [X] T030 [P] [US2] Extend `apps/api/tests/calendar-ics.test.ts` with `?insee_commune=69123,69124`, `?commune_name=Lyon,Villeurbanne`, and an ambiguous `?commune_name=Sainte-Colombe` returning `400` with `commune_name_ambiguous`

### Implementation for User Story 2

- [X] T031 [US2] Implement `packages/core/src/geography/commune-name-resolver.ts` resolving names through `GeographicReferenceReader.findCommunesByNormalizedName` against `findActiveVersion()`, reusing `normalizeGeographicName` from `geographic-identity.ts`, and returning `{ inseeCodes, diagnostics }` with a resolve order that matches `data-model.md`
- [X] T032 [US2] Extend `packages/core/src/calendar-filters/calendar-filter.ts` with `communeNames: string[]` and `inseeCommunes: string[]`, preserving them as one dimension
- [X] T033 [US2] Extend `packages/core/src/persistence/postgres-calendar-event-query.ts` with a `communeId IN (...)` predicate applied only when the union is non-empty, and no predicate when both commune criteria are absent
- [X] T034 [US2] Resolve `communeNames` before querying in `packages/core/src/calendar/calendar-service.ts`, merge resolved codes with `inseeCommunes`, and surface resolver diagnostics as a `400` outcome

**Checkpoint**: Commune selection works by name and by code, with AND against department and event type.

---

## Phase 5: User Story 3 — Understand and try the endpoint from the reference (Priority: P2)

**Goal**: The route, its parameters, their string nature, the combination rules and the calendar response are documented in the generated OpenAPI document and visible in the Scalar page, with a test that fails on drift.

**Independent Test**: Open `/reference`, confirm the `/calendar.ics` operation documents all five parameters with examples and the `text/calendar` response, and observe that removing a parameter decorator fails the contract test.

### Tests for User Story 3

- [X] T035 [P] [US3] Extend `apps/api/tests/api-reference.test.ts` asserting that `paths['/calendar.ics'].get` declares exactly `country`, `department`, `commune_name`, `insee_commune`, `event_type`, that every schema is `type: 'string'` with an example, and that the description states the AND semantics and the commune-dimension union

### Implementation for User Story 3

- [X] T036 [US3] Add `@ApiTags`, `@ApiOperation`, `@ApiQuery` per parameter, and `@ApiResponse` for `200` (`text/calendar`), `304`, `400`, `405` and `503` in `apps/api/src/controllers/calendar-ics.controller.ts`, including the example `department=69&insee_commune=69123,69124&event_type=tractage`
- [X] T037 [US3] Confirm the route and its schema appear in `/openapi.json` and render in `/reference` served by `apps/api/src/server.ts`, adjusting the `DocumentBuilder` description if the geographic wording no longer covers the calendar

**Checkpoint**: The endpoint is discoverable and its contract cannot drift silently.

---

## Phase 6: User Story 4 — Receive a valid calendar even when nothing matches (Priority: P2)

**Goal**: Well-formed filters that match nothing return a valid empty calendar; malformed filters are rejected with actionable diagnostics; the route is read-only and reports storage failure distinctly.

**Independent Test**: Request a non-matching department and get an importable empty calendar, then request `?region=84` and get a `400` naming the field and cause.

### Tests for User Story 4

- [X] T038 [P] [US4] Extend `apps/api/tests/calendar-ics.test.ts` with an empty result returning `200` and no `VEVENT`, an unknown but well-formed department returning an empty calendar, `region` returning `400 filter_parameter_unsupported`, an unknown parameter returning `400 filter_parameter_unknown`, `country=France` returning `400 filter_value_invalid`, `POST /calendar.ics` returning `405`, and a throwing query returning `503`

### Implementation for User Story 4

- [X] T039 [US4] Reject unsupported and unknown parameters in `packages/core/src/calendar-filters/calendar-filter.ts` using the `SUPPORTED_PARAMETERS` and `UNSUPPORTED_PARAMETERS` sets of the existing geographic filter, with codes `filter_parameter_unsupported` and `filter_parameter_unknown`
- [X] T040 [US4] Map the service outcome to HTTP in `apps/api/src/controllers/calendar-ics.controller.ts`: `BadRequestException` with `{ error, diagnostics }` for rejected input, `ServiceUnavailableException` for storage failure, and an empty valid calendar for a successful empty result
- [X] T041 [US4] Add `@Post`, `@Put`, `@Patch` and `@Delete` handlers on the route in `apps/api/src/controllers/calendar-ics.controller.ts` returning `MethodNotAllowedException({ error: 'read-only calendar' })`, mirroring the existing feed guard
- [X] T042 [US4] Return `404 { error: 'calendar disabled' }` when `calendar.enabled` is `false` in `apps/api/src/controllers/calendar-ics.controller.ts`, leaving `/feed/{scopeId}` and `/events` untouched

**Checkpoint**: Every response shape of the contract is covered, including the failure paths.

---

## Phase 7: User Story 5 — Tune the calendar from the shared configuration file (Priority: P2)

**Goal**: An operator changes the window, ceilings, revalidation, exposure or metadata level through the YAML file or an environment override, restarts, and observes the change; invalid values fail fast with their origin.

**Independent Test**: Change `calendar.lookbackDays` in `config/actionpop.yaml`, restart, and observe the new window; override it with `CALENDAR_LOOKBACK_DAYS`, restart, and observe the environment value winning; set `CALENDAR_LOOKAHEAD_DAYS=0` and observe a startup error naming the key, the value and its origin.

### Tests for User Story 5

- [X] T043 [P] [US5] Extend `packages/core/src/config/config-file.test.ts` covering the file-only value, the environment override winning over a file value, the file remaining unmodified after an override, and every error message naming both the setting and its origin
- [X] T044 [P] [US5] Write `apps/api/tests/calendar-settings.test.ts` asserting that a lookback of `0` hides past events, that `maxEntries` caps the emitted `VEVENT` count, that `maxGroupsPerEvent` caps `X-ACTIONPOP-GROUP`, and that `revalidationSeconds` drives `Cache-Control`

### Implementation for User Story 5

- [X] T045 [US5] Apply `lookbackDays`, `lookaheadDays`, `maxEntries` and `revalidationSeconds` from the injected `CalendarConfig` in `packages/core/src/calendar/filtered-calendar-service.ts` and `apps/api/src/controllers/calendar-ics.controller.ts`
- [X] T046 [US5] Enforce `maxEntries` in `packages/core/src/persistence/postgres-calendar-event-query.ts` and make truncation observable by logging a warning with the requested criteria and the applied ceiling
- [X] T047 [US5] Mount `config/actionpop.yaml` read-only and set `APP_CONFIG_FILE` in `infra/compose/docker-compose.yml`, and copy the example document into the images built by `infra/docker/Dockerfile.api` and `infra/docker/Dockerfile.worker`
- [X] T048 [US5] Make `apps/worker/src/config.ts` read the same YAML document with the same override rules, and extend `packages/core/src/config/config-file.test.ts` with a worker-scope case proving both runtimes observe the same file

**Checkpoint**: Every calendar setting is tunable from one file, with environment overrides preserved.

---

## Phase 8: User Story 6 — Reconcile and triage events through metadata (Priority: P3)

**Goal**: Each entry carries `X-ACTIONPOP-*` properties according to the configured level, plus the standard `LOCATION`, `URL`, `CATEGORIES` and `GEO` properties.

**Independent Test**: Fetch the calendar twice across two ingestion periods, verify the identity property is unchanged while the observation properties follow the latest period, switch to `full` and verify the geographic properties appear.

### Tests for User Story 6

- [X] T049 [P] [US6] Write `packages/core/src/calendar/ical-metadata.test.ts` asserting the exact property set per level (`off`, `identity`, `standard`, `full`), the `disabledFamilies` exclusion, absence of a property whose value is unknown, deterministic order of repeated properties, the diagnostic parameter encoding `CODE`/`FIELD`/`SEVERITY` with the message as value, and that a produced entry contains no token, connection string or internal storage identifier (FR-038)
- [X] T050 [P] [US6] Write `packages/core/src/calendar/standard-properties.test.ts` asserting `LOCATION` preference (full address, then short address, then city with postal code), `URL`, `CATEGORIES`, `GEO` with six decimals, and the omission of each when its data is absent
- [X] T051 [P] [US6] Extend `apps/api/tests/calendar-ics.test.ts` with each metadata level observed through the HTTP payload, and an assertion that `off` emits no `X-ACTIONPOP-` line

### Implementation for User Story 6

- [X] T052 [US6] Define the `MetadataLevel` and `MetadataFamily` types and the declarative property table (name, family, level, value domain) in `packages/core/src/calendar/ical-metadata.ts`, mirroring `contracts/calendar-metadata.md`
- [X] T053 [US6] Implement the `buildMetadataProperties(event, level, disabledFamilies)` emitter in `packages/core/src/calendar/ical-metadata.ts` computing `X-ACTIONPOP-EVENT-ID`, `X-ACTIONPOP-UPDATED-AT`, `X-ACTIONPOP-PERIOD`, `X-ACTIONPOP-EVENT-TYPE`, `X-ACTIONPOP-SOURCE-URL`, `X-ACTIONPOP-GROUP` and, at `full`, the geography, diagnostic and raw source properties
- [X] T054 [US6] Implement the standard property builder in `packages/core/src/calendar/standard-properties.ts` producing `LOCATION`, `URL`, `CATEGORIES` and `GEO` independently of the metadata level
- [X] T055 [US6] Integrate metadata and standard properties into `packages/core/src/calendar/filtered-ical.ts`, escaping every value through `ical-writer.ts` and folding every line
- [X] T056 [US6] Enforce `maxGroupsPerEvent` with deterministic ordering by group identifier and log a warning when an entry is truncated, in `packages/core/src/calendar/ical-metadata.ts`
- [X] T057 [US6] Document the metadata properties, levels, value domains, stability guarantees and standard properties in the OpenAPI description produced from `apps/api/src/controllers/calendar-ics.controller.ts`, and extend `apps/api/tests/api-reference.test.ts` so a property added, removed or re-levelled without documentation fails

**Checkpoint**: All user stories are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, observability and full validation.

- [X] T058 [P] Update `README.md` to document `GET /calendar.ics`, its criteria and semantics, the metadata levels and the `config/actionpop.yaml` workflow, next to the existing public-surface paragraph
- [X] T059 [P] Add a metrics increment for truncated calendars (entry ceiling and group ceiling) in `packages/core/src/calendar/filtered-calendar-service.ts`, reusing `MetricsRegistry`
- [X] T060 [P] Verify that module sizes respect the 100–150 line target and split any module that exceeds it, recording the review in `specs/003-icalendar-filtered-feed/plan.md`
- [X] T061 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration` and `pnpm build`, then execute every scenario of `specs/003-icalendar-filtered-feed/quickstart.md`
- [X] T062 Confirm `/events` and `/feed/{scopeId}` behaviour is unchanged by running `apps/api/tests/api-reference.test.ts` and `apps/api/tests/feed-read-boundary.test.ts`, and clean any temporary verification file

---

## Phase 10: Follow-up — Event address in the calendar

**Purpose**: The address was never persisted, so `LOCATION` and `GEO` were always empty in practice. This phase fixes the root cause and the rendering.

- [X] T063 Persist the event location and its coordinates under the stable key `event:<sourceEventId>` in `packages/core/src/persistence/postgres-calendar-repository.ts`, updating the same row on re-ingestion, including the geo point in the read-back, and removing both when the source stops stating an address
- [X] T064 Widen `LocationEvent` in `packages/core/src/models/event.interface.ts` and pass `name`, `address`, `address1`, `address2`, `zip`, `city`, `shortAddress` and `shortLocation` through `apps/worker/src/main.ts`
- [X] T065 Render one-line `LOCATION` in `packages/core/src/calendar/calendar-location.ts` from the street lines with the postal code and city, then the short address, then the flattened full address, then the place name, and use it in `packages/core/src/calendar/standard-properties.ts`
- [X] T066 Include the calendar-visible address in `packages/core/src/domain/event-revision.ts` so an address change increments `SEQUENCE`, and pass it from `apps/worker/src/persistence/snapshot-publisher.ts`
- [X] T067 Cover the fix with `packages/core/src/calendar/calendar-location.test.ts`, `apps/worker/tests/event-location.contract.test.ts` and `tests/integration/calendar-location.test.ts`
- [X] T068 Format `LOCATION` as the place name followed by the postal address in `packages/core/src/calendar/calendar-location.ts`, appending the postal code and city only when the street line does not already state them, dropping a place name that repeats the city, and ignoring a map link stored instead of a street line


---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — blocks every user story
- **US1 (Phase 3)**: depends on Foundational only
- **US2 (Phase 4)**: depends on Foundational; builds on the filter and query modules created in US1
- **US3 (Phase 5)**: depends on US1 (the route must exist to be documented)
- **US4 (Phase 6)**: depends on US1 (response mapping lives in the same controller)
- **US5 (Phase 7)**: depends on Foundational and US1 (settings feed the existing service)
- **US6 (Phase 8)**: depends on US1 (document assembly) and US5 (level comes from configuration)
- **Polish (Phase 9)**: depends on all desired stories

### User Story Dependencies

| Story | Depends on | Rationale |
|-------|-----------|-----------|
| US1 (P1) | Foundational | First route and document assembly |
| US2 (P1) | US1 | Extends the same filter and query modules |
| US3 (P2) | US1 | Documents the existing route |
| US4 (P2) | US1 | Same controller, different responses |
| US5 (P2) | US1 | Settings are consumed by the existing service |
| US6 (P3) | US1, US5 | Emission depends on the document assembly and on the configured level |

### Within Each User Story

Tests are written first and MUST fail before implementation. Then types, then pure modules, then query, then controller, then integration.

### Parallel Opportunities

- Phase 1: T002 runs alongside T001
- Phase 2: T003, T004, T006, T007, T009, T010, T012, T013, T014, T016 are mutually independent files
- Each story's test tasks marked [P] run together
- US3, US4 and US5 can proceed in parallel once US1 is complete; US6 starts after US5

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Write packages/core/src/calendar-filters/calendar-filter.test.ts"
Task: "Write packages/core/src/calendar/filtered-ical.test.ts"
Task: "Write apps/api/tests/calendar-ics.test.ts"

# Then the pure modules in parallel:
Task: "Implement packages/core/src/calendar-filters/calendar-filter.ts"
Task: "Implement packages/core/src/calendar/filtered-ical.ts"
```

## Parallel Example: Foundational

```bash
Task: "Add CalendarConfig in packages/core/src/config/config.interface.ts"
Task: "Add calendar defaults in packages/core/src/config/defaults.config.ts"
Task: "Create config/actionpop.example.yaml"
Task: "Implement packages/core/src/calendar/ical-writer.ts"
Task: "Define the CalendarEvent projection in packages/core/src/calendar-filters/calendar-event.ts"
Task: "Implement packages/core/src/calendar-filters/calendar-window.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup)
2. Phase 2 (Foundational) — blocks everything
3. Phase 3 (US1) — a subscriber can filter by department and event type
4. **STOP and validate** with `quickstart.md` scenarios 1 and 2

### Incremental Delivery

1. US1 → filtered calendar by department and type (MVP)
2. US2 → commune selection by name and by INSEE list
3. US3 → documented, drift-checked contract
4. US4 → complete response coverage, read-only guard
5. US5 → operator tuning from one YAML file
6. US6 → reconciliation metadata

### Parallel Team Strategy

After Foundational, one developer takes US1 while another prepares US5's configuration tests. Once US1 lands, US3, US4 and US5 proceed in parallel; US2 and US6 follow in sequence because they extend shared modules.

---

## Requirements Traceability

| Requirement | Tasks |
|-------------|-------|
| FR-001 | T024, T041 |
| FR-002 | T021, T032 |
| FR-003 | T018, T033 |
| FR-004 | T018, T021 |
| FR-005 | T031 |
| FR-006 | T031, T034 |
| FR-007 | T012, T018 |
| FR-008 | T013, T015, T016, T022 |
| FR-009 | T009, T022 |
| FR-010 | T022 |
| FR-011 | T009, T013 |
| FR-012 | T009, T055 |
| FR-013 | T038, T040 |
| FR-014 | T039 |
| FR-015 | T024 |
| FR-016 | T041 |
| FR-017 | T025 |
| FR-018 | T035, T036 |
| FR-019 | T015, T042 |
| FR-020 | T024 |
| FR-021 | T024 |
| FR-022 | T032, T034 |
| FR-023 | T013, T045 |
| FR-024 | T003, T004, T005 |
| FR-025 | T005, T007, T043 |
| FR-026 | T006, T045 |
| FR-027 | T046 |
| FR-028 | T042 |
| FR-029 | T003, T008 |
| FR-030 | T052, T053 |
| FR-031 | T052 |
| FR-032 | T052, T053 |
| FR-033 | T003, T053 |
| FR-034 | T053, T055 |
| FR-035 | T049 |
| FR-036 | T049, T053 |
| FR-037 | T050, T054 |
| FR-038 | T049 |
| FR-039 | T046, T056 |
| FR-040 | T057 |
| FR-041 | T043 |
| FR-042 | T048 |

---

## Notes

- [P] marks different files with no dependency on an incomplete task
- Every identifier stays a string: `01`, `2A`, `01001` (FR-007)
- Every value passes through `ical-writer.ts` before emission (FR-012, FR-034)
- A missing value omits its property, never emits an empty one (FR-035)
- Verify each test fails before implementing it
- Commit after each task or logical group
