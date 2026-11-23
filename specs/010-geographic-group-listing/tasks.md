---
description: 'Task list for the Geographic Action Group Listing feature'
---

# Tasks: Geographic Action Group Listing

**Input**: Design documents from `/specs/010-geographic-group-listing/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Required. Constitution principle III ("every feature MUST include automated tests for
its business rules") makes tests mandatory, so each story carries its own test tasks. Write them
first and confirm they fail before implementing.

**Organization**: tasks are grouped by user story so each story is independently implementable
and testable. Story priority comes from [spec.md](spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2 or US3; setup, foundational and polish tasks carry no story label
- Every task names the exact file it touches

## Path Conventions

pnpm TypeScript monorepo, per [plan.md](plan.md) "Project Structure":
`packages/core/src/` (domain rules and Prisma readers), `apps/api/src/` + `apps/api/tests/`
(NestJS transport), `apps/worker/src/` (catalogue and refresh orchestration),
`tests/integration/` (PostgreSQL proofs), `prisma/` (schema and migrations).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the attachment columns and the group detail contract

- [x] T001 Extend `prisma/schema.prisma` `IngestionScope` with the nine nullable attachment columns: `country_code`, `department_code`, `commune_id`, `commune_name`, `department_name`, `reference_version`, `geographic_status`, `geographic_diagnostics` (Json), `enriched_at` (DateTime), each with its snake_case `@map`
- [x] T002 Add the three listing indexes on `IngestionScope` — `@@index([scopeKind, mapStatus, retrievalStatus, communeId])`, `...[departmentCode])`, `...[countryCode])` — keeping every existing index
- [x] T003 Create migration `prisma/migrations/0009_geographic_group_listing/migration.sql` with nullable columns, indexes and **no new table**, verified with `pnpm prisma:validate`, `pnpm prisma:generate` and `pnpm prisma:migrate`; no data backfill
- [x] T004 [P] Add `validateGroupDetail` and the `GroupDetail` type to `packages/core/src/adapters/action-populaire-schemas.ts`, building on the **existing** `locationSchema` so the location contract is declared once

**Checkpoint**: `psql "$DATABASE_URL" -c "\d ingestion_scope"` shows the attachment columns and the three indexes, and no new table exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the address read, its mapping, and the enrichment step every story reads from

**⚠️ CRITICAL**: no story can return a non-empty territory listing until T005–T014 are complete

- [x] T005 [P] Add `fetchGroupDetail(groupId)` to `apps/worker/src/adapters/action-populaire-client.ts`, reusing `request`, the retry policy, the timeout and the existing error types
- [x] T006 [P] Implement `packages/core/src/groups/group-attachment.ts` as a mapper from the existing `GeographicAttachment` to the attachment columns: `resolved`→`resolved`, `international`→`international`, `invalid`→`invalid`, `incomplete`/`national`→`incomplete`, `unavailable`→nothing written; it adds no resolution rule of its own
- [x] T007 [P] Add the request/response types and the `GroupListingReader` port in `packages/core/src/models/group-listing.ts`, including `validateArea` and the `50`/`1..200` paging bounds
- [x] T008 [P] Add `packages/core/src/groups/group-attachment.test.ts` covering every enricher status, asserting `unavailable` writes nothing and no status invents a commune
- [x] T009 Implement `packages/core/src/persistence/postgres-group-attachment.ts`: incremental candidate selection (no attachment, another `reference_version`, `enriched_at` older than the staleness window) and the attachment write
- [x] T010 Implement `packages/core/src/persistence/group-locations.ts` writing the stated `zip`/`city` and point to `location_record`/`geo_point` under `group:<scopeId>` with `owner_type = 'GROUP'`, and clearing them when the source stops stating them
- [x] T011 Pass the stated `location_country` through `apps/worker/src/catalogue/group-catalogue.ts` to `synchronizeGroupDirectory`, so the country survives an enrichment failure
- [x] T012 Implement `apps/worker/src/geography/group-attachment-refresher.ts`: read each candidate's detail, call `enrichEventGeography` — the enricher events already use — resolve commune and department names from the same reference, write address and attachment in one transaction, and count `resolved`/`incomplete`/`international`/`invalid`/`skipped`/`failed` without throwing
- [x] T013 Add commune lookup by code to `packages/core/src/persistence/geographic-reference-repository.ts` (`findCommunesByCodes`), reusing the existing row mapping
- [x] T014 Wire the enrichment step into `apps/worker/src/main.ts` after the directory sync, emitting `actionpop_group_attachment_total` per outcome and never failing the cycle
- [x] T015 Export the new modules from `packages/core/src/geography/index.ts` and `packages/core/src/index.ts`, with `pnpm --filter @actionpop/core typecheck`, `lint` and `check:dead` green
- [x] T016 Add `tests/integration/group-attachment.test.ts` with a stub detail source: a resolved French address, an address stored with its point, a partial address, a foreign address, an unreachable detail counted as `failed`, and a fresh attachment not re-read

**Checkpoint**: `pnpm --filter @actionpop/core test` is green and a catalogue sync followed by an enrichment run stores an attachment and an address for a group whose detail states one.

---

## Phase 3: User Story 1 — List the action groups of a territory (Priority: P1) 🎯 MVP

**Goal**: `GET /groups` returns each action group of a requested department, commune code or
country once, with its identity, published name, location context and calendar reference.

**Independent Test**: seed listed active groups inside and outside one department, request
`GET /groups?department=42`, and verify that exactly the inside groups are returned once with a
non-empty `id` and `name`, the matching location context, and a usable `calendar` object;
a group whose published name changed returns the new name with an unchanged identity.

### Tests for User Story 1

- [x] T017 [P] [US1] Add `packages/core/src/geography/group-area-filter.test.ts` covering `country`, `department` and `insee_commune` parsing, the `commune` alias merging into `insee_commune`, OR inside one parameter, AND across parameters, empty-value rejection, and rejection of `event_type`, `group`, `region`, `lat`, `lon` and `coordinates`
- [x] T018 [P] [US1] Add `apps/api/tests/groups.controller.test.ts` covering `200` with items for a matching department, `200` with `items: []` for an area holding no group, the exact payload keys (no internal field), non-empty `id`/`name`, and `calendar.path`/`calendar.params.group` pointing at the returned identity

### Implementation for User Story 1

- [x] T019 [US1] Implement `packages/core/src/geography/group-area-filter.ts` parsing `country`, `department`, `insee_commune` and `commune` into `GroupAreaCriteria` by composing the existing `readSingle`/`readList` from `calendar-filters/calendar-filter-parameters.ts` and `normalizeCountryCode`/`normalizeDepartmentCode` from `domain/geographic-identity.ts`; reject unsupported parameters with `filter_parameter_unknown`/`filter_parameter_unsupported` and malformed values with `filter_value_invalid`
- [x] T020 [US1] Implement `packages/core/src/persistence/postgres-group-listing.ts` reading with one predicate set — `scope_kind = 'group'`, `map_status = 'listed'`, `retrieval_status = 'active'`, `display_name IS NOT NULL`, `reference_version = <active version>`, then `country_code`, `department_code`, `commune_id IN (...)` when supplied — returning `GroupListingItem[]` and a `count` over the same `where`
- [x] T021 [US1] Order the read by `display_name` ascending under the database collation then `scope_id` ascending, join the group's `geo_point` for `latitude`/`longitude`, and map rows explicitly to `GroupListingItem` in `packages/core/src/persistence/postgres-group-listing.ts` without exposing retrieval status, geometry, diagnostics or source tokens
- [x] T022 [US1] Implement `apps/api/src/controllers/groups.controller.ts` as a NestJS controller on `@Controller('groups')` with `@ApiTags('groups')`, `@ApiOperation`, `@ApiQuery` per supported parameter, `@ApiResponse` for `200`/`400`/`503`, and `@Header('Cache-Control', 'public, max-age=300')`, delegating to a `GROUP_LISTING` provider
- [x] T023 [US1] Register the read in `apps/api/src/constants.ts` (`GROUP_LISTING`), `apps/api/src/app.module.ts` (controller and provider added only when the option is present, like `SearchController`), `apps/api/src/server.ts` (`ServerOptions.groupListing`) and `apps/api/src/main.ts` (`new PostgresGroupListing(postgres)` with the active-version resolver)
- [x] T024 [US1] Add `tests/integration/group-listing.test.ts` against `startIntegrationPostgres` covering: only listed/active/current-version groups returned; an unlisted, an inactive and a stale-version group excluded; a group with a stale `reference_version` excluded; the same group returned once when it matches two values of one parameter

**Checkpoint**: `GET /groups?department=42` answers correctly from prepared rows and User Story 1 is demonstrable without the rest of the feature.

---

## Phase 4: User Story 2 — Trust the area boundary (Priority: P2)

**Goal**: a group appears only when its own resolved attachment satisfies every criterion; unknown
identifiers are rejected; an unresolvable attachment is excluded and counted; the answer states the
territory data version it used and answers `503` rather than a stale list.

**Independent Test**: seed a group with unusable coordinates, one attached just outside the area,
one in a neighbouring area, one with `geographic_status = 'ambiguous'`, and request the area with
an unknown INSEE code and with an inactive EPCI; verify each case as specified and that
`referenceVersion` is the active version.

### Tests for User Story 2

- [x] T025 [P] [US2] Extend `packages/core/src/geography/group-area-filter.test.ts` with `commune_name` resolution (exact normalized match, pronoun-free alias, no match → empty dimension), `commune_name` ambiguous without `department` → `commune_name_ambiguous`, `epci` resolution adding member communes, an EPCI without membership → `epci_membership_incomplete`, and an unavailable EPCI reference → `epci_unavailable`
- [x] T026 [P] [US2] Extend `apps/api/tests/groups.controller.test.ts` with `400` for an unknown `insee_commune` (`commune_invalid`), an unknown `department` (`department_invalid`), an inactive `epci` (`epci_invalid`), an ambiguous `commune_name`, and `503` for a missing active reference version and for unavailable EPCI membership; also assert `referenceVersion` is present and equals the active version on `200`

### Implementation for User Story 2

- [x] T027 [US2] Extend `packages/core/src/geography/group-area-filter.ts` with `commune_name` and `epci` by delegating to the existing `CommuneNameResolver` and `resolveEpcis` port, merging every resolved INSEE code with the explicit ones into one commune dimension, and mapping resolution diagnostics to `400`/`503` exactly as `calendar-ics.controller.ts` does
- [x] T028 [US2] Validate identifiers against the active reference in `group-area-filter.ts`: an unknown `insee_commune`/`commune` is `400 commune_invalid`, an unknown `department` is `400 department_invalid`, and a request with no supported criterion is rejected rather than listing every group
- [x] T029 [US2] Restrict the read in `packages/core/src/persistence/postgres-group-listing.ts` to rows whose `reference_version` equals the active version, so an unattached, `incomplete`, `ambiguous` or `invalid` group matches only `country` and never a commune or department criterion, and echo that version as `referenceVersion`
- [x] T030 [US2] Map failures in `apps/api/src/controllers/groups.controller.ts`: validation → `400` with `{ error: 'invalid group area filter', diagnostics }`; `reference_unavailable`, `epci_unavailable`, `epci_membership_incomplete` or storage failure → `503`; keep the empty valid area on `200`
- [x] T031 [US2] Extend `tests/integration/group-listing.test.ts` with a group missing coordinates, a group outside the requested commune, a group in a neighbouring commune, an `ambiguous` group, a group matching both a commune and its department (returned once), and a request against a deactivated reference version (`503`)

**Checkpoint**: User Stories 1 and 2 both work independently; the listing never asserts a territory the data does not support.

---

## Phase 5: User Story 3 — Consume large areas predictably (Priority: P3)

**Goal**: `limit`/`offset` paging never duplicates or omits a group, `total` is computed before
paging, the order is stable across identical reads, and an unsupported paging value is rejected.

**Independent Test**: seed more groups than one page in one department, read every page, and verify
the union equals the expected set exactly once, `total` matches the pre-paging count, and two
identical reads return the same order.

### Tests for User Story 3

- [x] T032 [P] [US3] Extend `apps/api/tests/groups.controller.test.ts` with `limit` defaulting to 50, `limit` boundaries (`1` and `200` accepted; `0`, `201` and `abc` → `400 limit_invalid`), `offset` defaulting to 0 and `offset=-1` → `400 offset_invalid`, and the echoed `limit`/`offset`
- [x] T033 [P] [US3] Add a paging test in `tests/integration/group-listing.test.ts` seeding at least 120 groups in one department: reading pages of 50 yields each group exactly once, the union equals the expected set, `total` equals the seeded count, and two identical page reads return identical identifiers

### Implementation for User Story 3

- [x] T034 [US3] Add `limit` and `offset` parsing to `packages/core/src/geography/group-area-filter.ts` with the contract bounds — `limit ∈ [1,200]` default `50`, `offset ≥ 0` default `0`, integers only — producing `limit_invalid` / `offset_invalid` diagnostics
- [x] T035 [US3] Apply paging in `packages/core/src/persistence/postgres-group-listing.ts` with `skip`/`take` over the same `where` as the count, so `total` is the pre-paging number, and return the effective `limit`/`offset`
- [x] T036 [US3] Publish the contract in `specs/contracts/http/groups.md` and `specs/010-geographic-group-listing/contracts/group-listing.md` with the final paging, ordering and payload wording once the implementation is green

**Checkpoint**: all three stories are independently functional; paging is stable on a territory larger than one page.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: observability, documentation and full validation

- [x] T037 [P] Extend `countGroupScopes` in `packages/core/src/persistence/postgres-group-queries.ts` with an `unattached` count (`scope_kind = 'group'`, `map_status = 'listed'`, and `geographic_status IS NULL OR geographic_status <> 'resolved'`) and surface it in the existing operator report
- [x] T038 [P] Document the new read in `README.md` (public routes list) and record the `GET /groups` surface and ingestion-amendment links in `specs/root.md` §6 contract ownership
- [x] T039 [P] Add any new domain words to `.cspell.json` and confirm `pnpm check:spell` reports no issue on `specs/010-geographic-group-listing/**` and `specs/contracts/http/groups.md`
- [x] T040 Run the `specs/010-geographic-group-listing/quickstart.md` validation end-to-end: migration, `pnpm geo:refresh`, worker catalogue sync and address enrichment, the `curl` scenarios including every failure path, and the empty-valid-area and `503` cases
- [x] T041 Confirm the full quality gates pass for every touched workspace package (`packages/core`, `apps/api`, `apps/worker`, `tests/integration`) by running `pnpm typecheck`, `pnpm lint`, `pnpm check:dead`, `pnpm check:cycles`, `pnpm --filter @actionpop/core test`, `pnpm --filter @actionpop/worker test`, `pnpm --filter @actionpop/api test` and `pnpm test:integration` from `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency; T001 → T002 → T003 touch the same schema file and its migration, so they run in order; T004 is independent
- **Foundational (Phase 2)**: depends on Phase 1; blocks every user story
- **User Stories (Phases 3–5)**: all depend on Phase 2. US2 and US3 extend files opened by US1 (`group-area-filter.ts`, `postgres-group-listing.ts`, `groups.controller.ts`, the two test files), so they follow US1 in practice even though their behaviour is separately testable
- **Polish (Phase 6)**: depends on the stories it reports on; T037–T039 are independent of each other, T040–T041 come last

### Within Phase 2

- T005, T006, T007 are independent and can proceed in parallel; T008 tests T006
- T009 needs T007's types; T010 needs the address shape; T011 is independent
- T012 needs T005, T006, T009, T010 and T013; T016 proves T009–T012
- T014 needs T012; T015 needs everything it exports

### User Story Dependencies

- **US1 (P1)**: needs Phase 2 (attachments) to return anything; no dependency on US2 or US3
- **US2 (P2)**: needs US1's parser, reader and controller to extend; adds resolution, rejection and availability
- **US3 (P3)**: needs US1's reader and controller; independent of US2

### Parallel Opportunities

- T001 with T004; T005/T006/T007 together; T010/T011 together
- Within each story, the test tasks marked [P] run together
- US2 and US3 test tasks (T025, T026, T032) can be written while US1 implementation finishes, since they add cases rather than touch implementation files

### Parallel Example: Phase 2 pure rules

```bash
Task: "Add fetchGroupDetail to apps/worker/src/adapters/action-populaire-client.ts"
Task: "Map the enricher result in packages/core/src/groups/group-attachment.ts"
Task: "Add the listing types and reader port in packages/core/src/models/group-listing.ts"
```

### Parallel Example: User Story 1 tests

```bash
Task: "Add group-area-filter tests in packages/core/src/geography/group-area-filter.test.ts"
Task: "Add groups controller contract tests in apps/api/tests/groups.controller.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — schema and migration
2. Phase 2 — detail read, address enrichment, attachment pipeline (the work every answer depends on)
3. Phase 3 — area filter, indexed read, controller, integration proof
4. **STOP and VALIDATE**: `GET /groups?department=42` returns exactly the expected groups
5. Deploy or demo

### Incremental Delivery

1. Setup + Foundational → attachments exist and are counted
2. US1 → territory listing by country/department/commune (MVP)
3. US2 → boundary honesty, name and EPCI criteria, explicit unavailability
4. US3 → paging and stable ordering on dense territories
5. Polish → operator reporting, docs, quickstart and full gates

Steps 1 and 2 already deliver value without a resolvable address: groups stay unattached and are
counted, never guessed.

### Parallel Team Strategy

After Phase 2: one developer on US1, one on US2's resolution and availability work, one on US3's
paging — with the understanding that US2 and US3 merge into US1's files in that order, so they
coordinate through `group-area-filter.ts`, `postgres-group-listing.ts` and
`groups.controller.ts`.

---

## Notes

- [P] means a different file and no incomplete dependency
- Every acceptance scenario in [spec.md](spec.md) maps to at least one task: US1 → T017–T024,
  US2 → T025–T031, US3 → T032–T036
- Field constraints are quoted from [data-model.md](data-model.md) in the tasks that create them,
  including nullability, index composition, coordinate ranges and paging bounds
- Commit after each task or logical group; stop at each checkpoint to validate the story on its own
- Avoid: creating a second geographic criterion vocabulary, computing attachment at read time, and
  adding a runtime geocoder or PostGIS

---

## Phase 7: Convergence

- [X] T042 CRITICAL — Centralize every `*_MS`/`*_DAYS`/`*_SECONDS` duration constant in `packages/core/src/config/defaults.config.ts` and import it at its former site: `PERIOD_INTERVAL_MS` in `packages/core/src/persistence/postgres-cycle-metrics.ts` and the `C` default of `calculateProcessingPeriod` in `packages/core/src/domain/processing-period.ts` (both reusing `DEFAULT_DISPATCHER_INTERVAL_MS`), `STAGE_TRANSACTION_TIMEOUT_MS`, `PUBLICATION_TIMEOUT_MS`, `DEFAULT_TIMEOUT_MS`, `DAY_MS`, `LEDGER_GRACE_MS`, `LEDGER_TRANSACTION_TIMEOUT_MS`, `LEDGER_TRANSACTION_MAX_WAIT_MS`, `CATALOGUE_SYNC_TIMEOUT_MS`, `CATALOGUE_SYNC_MAX_WAIT_MS`, `DEFAULT_RATE_LIMIT_DELAY_MS`, `MAX_RATE_LIMIT_DELAY_MS`, `RATE_LIMIT_JITTER_MS` from `apps/worker/src`, and `DEFAULT_STALE_AFTER_MS` from `apps/worker/src/geography/group-attachment-refresher.ts`; keep the exported names, keep `docs`/comment units, leave `defaults.config.ts` dependency-free so it stays importable from domain, persistence and worker code without a cycle, and confirm `pnpm typecheck`, `pnpm check:cycles` and the worker/core test suites stay green per user request + Constitution IV (contradicts)
- [X] T043 — Move the `apps/web` timing constants out of feature files into one web-local config module (`apps/web/src/shared/config/durations.ts`): `FLUSH_INTERVAL_MS`, `VISIT_IDLE_TIMEOUT_MS`, `LONG_PRESS_MS`, `DEBOUNCE_MS`, `HOUR_MS` and `FORECAST_HORIZON_DAYS`, because `@actionpop/web` does not depend on `@actionpop/core` and must not acquire that dependency; record the deliberate deviation from the single core config file next to the new module, and keep `pnpm --filter @actionpop/web typecheck` and its tests green per user request (contradicts)
- [X] T044 — State the effective area criteria in the `200` answer alongside `referenceVersion`, so a consumer can tell which territory an answer describes: add the resolved `country`/`department`/`communeIds`/`epci` echo to `GroupListingResult` and `apps/api/src/controllers/groups.controller.ts`, declare it in `apps/api/src/controllers/groups-answer-schema.ts`, document it in `specs/contracts/http/groups.md` (response fields and amendment history), and update the exact-payload assertion in `apps/api/tests/groups.controller.test.ts` per FR-013 + US2/AC6 (partial)
