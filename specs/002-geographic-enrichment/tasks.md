---
description: 'Task list for Geographic Enrichment and Event Filtering'
---

# Tasks: Geographic Enrichment and Event Filtering

**Input**: Design documents from `/specs/002-geographic-enrichment/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Included because the project constitution (Principle III, Test-First Quality) requires
automated tests for every business rule, and the plan makes each stage boundary independently
testable. Write each test task before its implementation task and confirm it fails.

**Organization**: Tasks are grouped by user story so each story is independently implementable
and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story label (US1, US2, US3, US4) — omitted in Setup, Foundational and Polish
- Every task names the exact file path it touches

## Path Conventions

- Core domain and repositories: `packages/core/src/`
- Core tests: `packages/core/tests/`
- Worker orchestration: `apps/worker/src/`
- Worker tests: `apps/worker/tests/`
- Database schema and migrations: `prisma/`
- PostgreSQL integration tests: `tests/integration/`

## Data Format Rules (apply to every task)

- Codes are strings at every stage: department `"69"`, `"2A"`, INSEE `"01001"`, postal `"01400"`; never coerce to `number`.
- Normalization (Unicode NFC, case folding, accent removal, punctuation/whitespace folding) produces comparison keys only; raw values are stored verbatim.
- Absent, `null` and empty string all mean "not stated" and never trigger a default value.
- The existing `LocationRecord.geoPoint` / `geo_point` storage is retained unchanged and never read for enrichment.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the module layout and export surface the later phases fill.

- [x] T001 [P] Create `packages/core/src/geography/index.ts` re-exporting the geography modules, and export it from `packages/core/src/index.ts`
- [x] T002 [P] Create `packages/core/tests/geography/` and confirm `vitest.config.ts` already matches `packages/*/tests/**/*.test.ts` (no config change expected)
- [x] T003 [P] Create `apps/worker/src/geography/` and `tests/integration/` harness placeholder files listed in `plan.md` without business logic

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, stage types, normalization and the reference read API that every user story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Schema

- [x] T004 Add Prisma models `GeographicReferenceVersion` (`version` String `@id`, `status` String with `staged` | `active` | `superseded` | `rejected`, `source`, `publicationDate`, `ingestedAt` DateTime, `license`, `communeCount` Int, `departmentCount` Int, `checksum`, `validationErrors` Json?) mapped to `geographic_reference_version` in `prisma/schema.prisma`
- [x] T005 Add Prisma models `DepartmentReference` (composite `@@id([versionId, code])`, `name`, `communeCount`) mapped to `department_reference` and `CommuneReference` (composite `@@id([versionId, inseeCode])`, `name`, `normalizedName`, `pronounFreeNormalizedName`, `postalCodes` String[], `departmentCode`) mapped to `commune_reference`, with indexes `(versionId, normalizedName)`, `(versionId, pronounFreeNormalizedName)`, `(versionId, departmentCode)`, `(versionId)` and `@@index([postalCodes], type: Gin)`, in `prisma/schema.prisma`
- [x] T006 Add the geographic columns to `EventRecord` in `prisma/schema.prisma`: `referenceVersion`/`reference_version`, `geographicStatus`/`geographic_status` (`resolved`, `national`, `international`, `incomplete`, `invalid`, `unavailable`), `countryCode`/`country_code`, `departmentCode`/`department_code`, `departmentSource`/`department_source` (`stated` | `reference`), `rawDepartmentCode`/`raw_department_code`, `rawCommuneName`/`raw_commune_name`, `communeId`/`commune_id`, `geographicDiagnostics` Json/`geographic_diagnostics`, plus indexes on `country_code`, `department_code`, `commune_id`, `reference_version`
- [x] T007 Create migration `prisma/migrations/0002_geographic_reference/migration.sql` with the three tables, the event columns, and the raw SQL `CREATE UNIQUE INDEX geographic_reference_version_one_active ON geographic_reference_version (status) WHERE status = 'active';` (not expressible in Prisma's schema language); do not drop or alter `location_record` or `geo_point`

### Stage types and normalization

- [x] T008 Define `Diagnostic` (`{ code: string; field: string; message: string; severity: 'warning' | 'error' }`), `GeographicStatus`, `DepartmentSource`, `RawLocationFields` (`country`, `departement`, `communeName`, `city`, `zip`, all `string | undefined`) and `GeographicAttachment` (`countryCode?`, `communeId?`, `departmentCode?`, `departmentSource?`, `rawDepartmentCode?`, `rawCommuneName?`, `geographicStatus`, `diagnostics`, `referenceVersion`) in `packages/core/src/geography/reference-types.ts`
- [x] T009 [P] Add `normalizeGeographicName` (NFC, lowercase, accents removed, punctuation and whitespace folded to one separator), `normalizeCountryCode` (trim + uppercase, rejects values outside `^[A-Z]{2}$`) and `normalizeDepartmentCode` (trim + uppercase, preserves `2A`/`2B`, rejects empty) to `packages/core/src/domain/geographic-identity.ts` and cover them in `packages/core/tests/geography/geographic-identity.test.ts`
- [x] T010 Extend `locationSchema` in `packages/core/src/adapters/action-populaire-schemas.ts` to retain `departement`, `commune: { name }`, `shortAddress` and `shortLocation`, then update `packages/core/src/adapters/action-populaire-schemas.test.ts`
- [x] T011 [P] Implement `GeographicReferenceRepository` read API (`findActiveVersion`, `findDepartment(versionId, code)`, `findCommunesByNormalizedName(versionId, key)`, `findCommunesByPostalCode(versionId, postalCode)`) over Prisma in `packages/core/src/persistence/geographic-reference-repository.ts`, keeping Prisma access out of domain modules

### Test harness

- [x] T012 Create the PostgreSQL integration harness `tests/integration/postgres-setup.ts` reading `TEST_DATABASE_URL`, applying `prisma migrate deploy` once and truncating `geographic_reference_version`, `department_reference`, `commune_reference` and `event_record` between tests (the existing harness covers Redis only)

**Checkpoint**: Schema, types, normalization and reference reads are ready in parallel with no story-specific logic.

---

## Phase 3: User Story 1 - Publish geographically enriched events (Priority: P1) 🎯 MVP

**Goal**: Link each event to its stated country, department and commune from the raw source fields, or mark it `national` / `international`, and publish that atomically.

**Independent Test**: Seed a reference version with a few communes and departments, ingest an event stating `country = "FR"`, `departement = "69"`, `commune.name = "Lyon"`, and verify the published row carries `country_code = "FR"`, `department_code = "69"`, `commune_id = "69123"`, `geographic_status = "resolved"` and no diagnostics.

### Tests for User Story 1 ⚠️ (write first, confirm they fail)

- [x] T013 [P] [US1] Commune resolution tests in `packages/core/tests/geography/commune-resolver.test.ts`: exact match after normalization (case, accents, articles, hyphens), `nom_sans_pronom` alias match, homonyms disambiguated by a valid department code, remaining ambiguity yields `commune_match_ambiguous` with no commune, name absent plus unique `zip` + `city` resolves, non-unique postal pair yields `postal_match_ambiguous`, unknown name yields `commune_unknown`
- [x] T014 [P] [US1] Department validation tests in `packages/core/tests/geography/department-validator.test.ts`: stated code found in the reference wins, unknown code with a resolved commune falls back to the commune's reference department plus `department_code_unknown` and `departmentSource = "reference"`, unknown code without a commune yields no department plus an incomplete status, stated code disagreeing with the commune yields `department_commune_mismatch` while keeping both raw values
- [x] T015 [P] [US1] Country classification tests in `packages/core/tests/geography/country-classifier.test.ts`: `"FR"` yields a French classification, another ISO code yields `international`, absent or blank yields no country with no default, unsupported value yields `country_unsupported` and no country
- [x] T016 [US1] Enricher tests in `packages/core/tests/geography/geographic-enricher.test.ts`: the US1 acceptance scenario end to end, an event with no country/department/commune becomes `national`, an international event receives no French department, and raw values are copied unchanged beside derived ones

### Implementation for User Story 1

- [x] T017 [P] [US1] Implement `classifyCountry` in `packages/core/src/geography/country-classifier.ts` (uppercase the stated code, treat `FR` as France, other valid codes as international, absent/blank/unsupported as no country with a diagnostic)
- [x] T018 [P] [US1] Implement `resolveCommune` in `packages/core/src/geography/commune-resolver.ts` using only `GeographicReferenceRepository` reads (name first, postal plus city fallback, department-code disambiguation, no fuzzy matching)
- [x] T019 [P] [US1] Implement `validateDepartment` in `packages/core/src/geography/department-validator.ts`
- [x] T020 [US1] Implement `enrichEventGeography` in `packages/core/src/geography/geographic-enricher.ts` composing country, commune and department rules, setting `geographicStatus` and collecting `Diagnostic[]` without throwing on incomplete data (depends on T017–T019)
- [x] T021 [US1] Extend `PublishedEvent` in `packages/core/src/models/event.interface.ts` and the read/write mapping in `packages/core/src/persistence/postgres-calendar-repository.ts` so the geographic columns are written and read back
- [x] T022 [US1] Resolve the active reference version once per job and apply `enrichEventGeography` before `revisions.publish` in `apps/worker/src/main.ts`, leaving the source-event fetch and retry behaviour unchanged
- [x] T023 [US1] Integration test `tests/integration/geographic-enrichment.test.ts`: an enriched event is readable with its geographic columns after publication, and a failure during publication leaves no partially enriched event

**Checkpoint**: User Story 1 is functional and testable without US2, US3 or US4.

---

## Phase 4: User Story 2 - Filter events using intersecting geographic criteria (Priority: P1)

**Goal**: Return only events matching every supplied `country`, `department`, `commune` and `event_type` criterion.

**Independent Test**: Seed events across several communes and departments, query with `department=69&commune=69123&event_type=tractage`, and verify only the matching intersection is returned, once each.

### Tests for User Story 2 ⚠️

- [x] T024 [P] [US2] Filter contract tests in `packages/core/tests/geography/geographic-filter.test.ts`: each criterion filters independently, two criteria intersect, a non-matching second criterion returns an empty result, malformed identifiers produce a validation error, and no duplicate identifier is emitted
- [x] T025 [P] [US2] Integration test `tests/integration/geographic-filter.test.ts`: intersection semantics over seeded rows, empty result for a neighboring department, and `national events` matching no geographic criterion

### Implementation for User Story 2

- [x] T026 [US2] Implement `parseGeographicFilter` and validation in `packages/core/src/geography/geographic-filter.ts` (string identifiers only; reject `region`, `epci`, `constituency` and coordinate parameters as unsupported for this version)
- [x] T027 [US2] Implement the query in `packages/core/src/persistence/postgres-event-query.ts` as `AND` equality predicates on `country_code`, `department_code`, `commune_id` and `event_type`, requiring no reference join and no duplicate suppression
- [x] T028 [US2] Verify the documented response shape from `contracts/geographic-filter.md` is produced, including `geographicStatus` and `referenceVersion`

**Checkpoint**: User Stories 1 and 2 work independently (the HTTP surface of US2 is delivered by Phase 8).

---

## Phase 5: User Story 3 - Update and validate the geographic reference dataset (Priority: P1)

**Goal**: Parse the local commune CSV, validate it, stage a version, activate it atomically, and re-enrich affected events.

**Independent Test**: Stage a valid version and an invalid one; verify the invalid one is rejected with diagnostics and the active version is unchanged, then activate the valid one and confirm the previous version remains readable.

### Tests for User Story 3 ⚠️

- [x] T029 [P] [US3] CSV parser tests in `packages/core/tests/geography/commune-csv-parser.test.ts`: header validation, quoted comma lists in `codes_postaux`, escaped quotes, multiline quoted fields, leading-zero codes preserved as strings, `2A`/`2B` departments, malformed row diagnostics
- [x] T030 [P] [US3] Name index tests in `packages/core/tests/geography/commune-name-index.test.ts`: normalized and pronoun-free keys built once, homonyms retained as multiple entries, and no fuzzy or accent-insensitive collision that would silently merge communes
- [x] T031 [P] [US3] Reference validation tests in `packages/core/tests/geography/reference-validation.test.ts`: duplicate INSEE code, missing commune name or department, department reference missing, and insufficient coverage all refuse activation
- [x] T032 [P] [US3] Integration test `tests/integration/geographic-reference.test.ts`: staged rows invisible to active-version readers, activation in one transaction, a concurrent activation producing a unique violation reported as retryable, previous version retained for replay, and a failed refresh leaving the previous active version intact

### Implementation for User Story 3

- [x] T033 [US3] Implement the streaming RFC 4180 parser in `packages/core/src/geography/commune-csv-parser.ts` (`node:fs` + `node:readline` with `crlfDelay: Infinity`, reading only `code_insee`, `nom_standard`, `nom_sans_pronom`, `code_postal`, `codes_postaux`, `dep_code`, `dep_nom`)
- [x] T034 [US3] Implement the derived index builder in `packages/core/src/geography/commune-name-index.ts` computing `normalizedName` and `pronounFreeNormalizedName` before persistence
- [x] T035 [US3] Implement reference validation in `packages/core/src/geography/reference-validation.ts` producing `Diagnostic[]` and refusing activation when any `error` exists
- [x] T036 [US3] Implement staging writes in `packages/core/src/persistence/geographic-reference-repository.ts`: one `geographic_reference_version` row with `status = 'staged'`, then department and commune rows in batched `createMany` calls (about 1 000 rows per batch) inside a single Prisma transaction
- [x] T037 [US3] Implement activation in `packages/core/src/persistence/geographic-reference-repository.ts`: one transaction setting the previous `active` row to `superseded` and the validated row to `active`, mapping a unique violation on `geographic_reference_version_one_active` to a retryable diagnostic
- [x] T038 [US3] Implement `refreshGeographicReference` orchestration in `apps/worker/src/geography/reference-refresh.ts` returning `RefreshGeographicReferenceResult` from `contracts/geographic-refresh.md` and leaving the previous version untouched on any failure
- [x] T039 [US3] Add the operator entry point: expose `refreshGeographicReference` from the worker runtime in `apps/worker/src/main.ts` and a `pnpm geo:refresh` script in `package.json` with `scripts/geographic-refresh.mjs` reading the commune path, source, publication date and license from the environment
- [x] T040 [US3] Implement post-activation re-enrichment in `apps/worker/src/geography/re-enrichment.ts`: select events by `reference_version`, recompute from retained raw fields, and update geographic columns without changing `source_event_id`, dates, event type or raw location
- [x] T041 [US3] Record refresh status, version, counts, validation error count, duration and worker ownership through the existing ledger and logging paths

**Checkpoint**: User Stories 1, 2 and 3 work independently.

---

## Phase 6: User Story 4 - Validate and diagnose incoming event geography and types (Priority: P2)

**Goal**: Reject unknown event types with an actionable diagnostic while keeping incomplete but usable events visible.

**Independent Test**: Ingest an event with an allowed `subtype.label` and an event with an unlisted one; verify the first is accepted and the second is rejected naming the field and cause, while an event with an unknown department code stays published with a diagnostic.

### Tests for User Story 4 ⚠️

- [x] T042 [P] [US4] Event type validation tests in `packages/core/tests/geography/event-type-validation.test.ts`: values from the extensible list are accepted, an unlisted value yields `event_type_unknown` naming `subtype.label`, and adding a value to the list requires no code change elsewhere
- [x] T043 [P] [US4] Diagnostic tests in `packages/core/tests/geography/geographic-diagnostics.test.ts`: severity mapping per diagnostic code, `warning` for incomplete enrichment, `error` only for rejection causes, and no raw payload secrets in messages

### Implementation for User Story 4

- [x] T044 [US4] Retain `subtype.label` in `packages/core/src/adapters/action-populaire-schemas.ts` and add the extensible allowed-values module `packages/core/src/geography/event-types.ts`
- [x] T045 [US4] Wire event-type validation into the ingestion path in `apps/worker/src/main.ts` so an unlisted type fails the job with a non-retryable diagnostic naming the field and cause
- [x] T046 [US4] Surface geographic diagnostics in `PublishedEvent` output and in worker logs (`packages/core/src/models/event.interface.ts`, `apps/worker/src/main.ts`), keeping them out of the public calendar feed

**Checkpoint**: All four stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T047 [P] Document the refresh command and the `TEST_DATABASE_URL` harness in `specs/002-geographic-enrichment/quickstart.md`
- [x] T048 [P] Update the storage description in `README.md` and `docs/geography.mmd` if the implementation deviates from the plan
- [x] T049 Verify module sizes stay within the constitution's 100–150-line target and split any module that exceeds it (`packages/core/src/geography/`, `apps/worker/src/geography/`)
- [x] T050 Run `pnpm quality` and the quickstart end-to-end scenarios, then fix any regression

---

## Phase 8: API reference (Scalar) and OpenAPI documentation

**Goal**: Publish the geographic filtering contract as an explorable, always-current API
reference so an integrator can try the combined criteria (`country`, `department`, `commune`,
`event_type`) without reading the source.

**Delivered 2026-10-28**: `GET /events` is documented and validated, the Scalar page and the
OpenAPI document are mounted by `buildApp` (`apps/api/src/server.ts`) behind the
`apiReference` option (`API_REFERENCE=false` disables the page), and
`apps/api/tests/api-reference.test.ts` fails when a parameter, its string type or its example
disappears.

**Independent Test**: Open `/reference`, run a combined query built from the documented
parameters, and verify that the identifiers are typed as strings (`"01001"`, `"2A"`) and that
the description states `AND` semantics.

- [x] T051 [US2] Fix the stale import in `apps/api/tests/feed-read-boundary.test.ts` and `apps/api/tests/observability.test.ts` (`buildServer` no longer exists; `apps/api/src/server.ts` exports `buildApp`), which blocks any API-level test
- [x] T052 [US2] Expose the read-only query route described by `contracts/geographic-filter.md` (`GET /events?country=&department=&commune=&event_type=`) in `apps/api/src/controllers/events.controller.ts`, backed by `PostgresEventQuery`
- [x] T053 [US2] Validate the incoming query with `parseGeographicFilter` in `apps/api/src/controllers/events.controller.ts` and return `400` with the diagnostics for an unsupported, unknown or malformed parameter
- [x] T054 [P] [US2] Annotate the route with `@nestjs/swagger` decorators so the document types `country`, `department`, `commune` and `event_type` as `string` with examples `FR`, `"01"`, `"2A"`, `"01001"` and `tractage`, and states the `AND` semantics in the operation description
- [x] T055 [P] [US2] Document the geographic response schema (see `contracts/geographic-filter.md`: `sourceEventId`, `eventType`, `countryCode`, `departmentCode`, `communeId`, `geographicStatus`, `referenceVersion`) in `apps/api/src/controllers/events.controller.ts`
- [x] T056 [US2] Register the Scalar reference in `apps/api/src/server.ts` next to the existing `/openapi.json` route, so a server built by `buildApp` exposes both (today `/reference` is only mounted by `apps/api/src/main.ts`), and gate the page behind configuration when a deployment must not expose it
- [x] T057 [P] [US2] Add contract tests in `apps/api/tests/api-reference.test.ts`: `GET /openapi.json` returns `200` with the geographic parameters typed as strings, and `GET /reference` returns `200`
- [x] T058 [P] [US2] Complete the reference documentation in `README.md` and `specs/002-geographic-enrichment/quickstart.md` with the delivered parameter list, and confirm the `@scalar/nestjs-api-reference` version stays pinned in `apps/api/package.json`

**Checkpoint**: The geographic contract is explorable in `/reference` and cannot drift from
the code without failing T057.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup and blocks every user story
- **User Stories (Phases 3–6)**: all depend on Phase 2
- **Polish (Phase 7)**: depends on the stories that are in scope

### User Story Dependencies

- **US1 (P1)**: depends on Phase 2 only — MVP
- **US2 (P1)**: depends on Phase 2; independently testable with seeded rows, and only benefits from US1 in production
- **US3 (P1)**: depends on Phase 2; independent of US1 and US2 (reference writes do not need enrichment)
- **US4 (P2)**: depends on Phase 2 and refines the ingestion path introduced by T022 in US1
- **Phase 8 (API reference)**: depends on US2 (T026–T028); T051 blocks T052–T057 because the
  API test suite currently cannot run

### Within Each Story

- Tests are written and failing before implementation
- Types and pure rules before orchestration; orchestration before wiring into the worker
- Story complete and independently verified before moving to the next priority

### Parallel Opportunities

- T001–T003 in parallel
- T004–T007 touch the same schema file, so they run sequentially; T008, T009, T011 and T012 are parallel with them once their file is free
- US1: T013–T015 in parallel, then T017–T019 in parallel, then T020 → T021 → T022 → T023
- US2: T024 and T025 in parallel, then T026 → T027 → T028
- US3: T029–T032 in parallel, then T033, T034, T035, T036, T037, T038 in order, with T039–T041 after activation exists
- US4: T042 and T043 in parallel, then T044 → T045 → T046
- Phase 8: T051 → T052 → T053, then T054, T055, T057 and T058 in parallel, with T056 after T054

---

## Parallel Example: User Story 1

```text
# Tests first
T013 commune-resolver.test.ts
T014 department-validator.test.ts
T015 country-classifier.test.ts

# Then the three independent rules
T017 country-classifier.ts
T018 commune-resolver.ts
T019 department-validator.ts

# Then composition and wiring
T020 geographic-enricher.ts → T021 postgres-calendar-repository.ts → T022 apps/worker/src/main.ts → T023 integration test
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 and Phase 2 to completion
2. Phase 3 (US1) to completion
3. Validate the US1 independent test, then stop and review before adding filters

### Incremental Delivery

1. US1 → enriched events visible and explainable
2. US2 → territorial filtering on the published columns
3. US3 → operator refresh of the reference, with atomic activation
4. US4 → event-type validation and diagnostics polish

### Notes

- The migration must not drop or modify `location_record` or `geo_point`
- Phase 8 is intentionally pending: the Scalar/OpenAPI wiring already runs in `apps/api`, but
  the geographic contract and its tests are not part of the delivered surface yet
- Every stage boundary from `plan.md` must have at least one test that asserts the format it emits
- Total tasks: 58 (all delivered)

---

## Implementation Notes (2026-10-28)

Decisions taken during implementation, with the artifacts updated accordingly:

- **Commune rule revised**: the reference CSV stores a single generic postal code for
  multi-postal communes (`69000`, `75000`, `13000`) and has no arrondissement rows, so an
  equality match on `zip` would never attach Paris, Lyon or Marseille. Resolution now uses
  `location.commune.name`, then `location.city`, and the postal code only supplies a
  department prefix for disambiguating homonyms (`packages/core/src/geography/postal-department.ts`).
  `postal_city_missing` and `postal_match_ambiguous` were removed from the diagnostic registry.
- **Municipal arrondissements** stay out of scope: `Paris 1er` yields `commune_unknown` while
  `city = "Paris"` resolves `75056`.
- **Event type** was missing from the schema. `event_record.event_type` was added in migration
  `0003_event_type`, fed by `subtype.label`, and validated against the observed-type registry
  (`event_type_reference`) instead of a hardcoded allowlist.
- **Integration isolation**: each PostgreSQL integration file runs in its own schema
  (`tests/integration/postgres-setup.ts`) so parallel files cannot activate or truncate each
  other's reference versions.
- **Pre-existing failure**: `apps/api/tests/*` import `buildServer` while
  `apps/api/src/server.ts` exports `buildApp`; this predates the feature and was left untouched.

### Bug found while validating (2026-10-28)

- **Worker startup crash**: `PostgresIngestionLedgerStore` built a `Date` from the compact
  period token the dispatcher emits (`20261028T201500Z`) with `new Date(token)`, producing
  `Invalid Date` and aborting the Prisma upsert. Added `parsePeriodToken` in
  `packages/core/src/domain/job-identity.ts` (accepts the compact token and the ISO form,
  rejects anything else with `ConfigurationError`) and the ledger now stores one canonical
  ISO token, so the two call sites cannot create duplicate period rows.
  Covered by `packages/core/tests/domain/period-token.test.ts` and
  `tests/integration/ingestion-ledger.test.ts`.
- **Startup unique violation**: `processingPeriod.upsert` and `groupScope.upsert` raced when
  the dispatcher scheduled several scopes in the same period, and `upsert` failed on the
  primary key. The ledger now inserts parents with `createMany({ skipDuplicates: true })`
  and applies the patch with `updateMany`, so concurrent transitions are idempotent.
- **Operator ergonomics**: added `pnpm dev:worker` / `pnpm start:worker`, and
  `pnpm geo:refresh` now defaults the publication date to today instead of requiring
  `GEOGRAPHIC_PUBLICATION_DATE`.

### Verification

- `pnpm typecheck`: pass
- `npx eslint .`: pass
- `pnpm --filter @actionpop/core test`: 123 tests pass
- `pnpm --filter @actionpop/worker test`: 22 tests pass
- `pnpm test:integration`: 38 pass, 3 skipped
- `pnpm --filter @actionpop/api test`: 10 tests pass (including the 5 API-reference contract tests)
- `GEOGRAPHIC_PUBLICATION_DATE=2026-10-28 node scripts/geographic-refresh.mjs`: 34 868 communes,
  101 departments, version active
- `node apps/worker/dist/main.js`: starts and reports `worker started` (health server ready)
- `GET /openapi.json` and `GET /reference`: `200`; `GET /events?country=FR` returns resolved
  events; `GET /events?region=84` returns `400` with `filter_parameter_unsupported`
