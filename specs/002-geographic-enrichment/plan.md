# Implementation Plan: Geographic Enrichment and Event Filtering

**Branch**: `002-geographic-enrichment` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-geographic-enrichment/spec.md`

## Summary

Implement geographic enrichment as independently testable TypeScript domain modules in `packages/core`, then persist the result through the project's existing Prisma/PostgreSQL stack. The geography comes exclusively from the Action Populaire event contract: `location.country`, `location.departement`, `location.commune.name`, `location.city` and `location.zip`. The local commune CSV is parsed as a quoted, streaming CSV into versioned PostgreSQL reference tables; lookups are indexed SQL queries, so no cache layer is introduced. Enrichment writes denormalized columns on `event_record`, committed in the same transaction as the published snapshot, so readers cannot observe a partially enriched event. Reference versions are staged, validated, then activated by switching a status inside one transaction guarded by a partial unique index. Redis keeps serving BullMQ only.

Each stage keeps an explicit representation (raw source payload, validated record, reference row, comparison key, enrichment result, published document, query criteria, diagnostic), so codes never lose leading zeroes, raw values are never overwritten, and every boundary is directly testable.

## Technical Context

**Language/Version**: TypeScript on Node.js >=20, strict compiler settings

**Primary Dependencies**: Existing Zod, Prisma, `@prisma/client`, BullMQ (Redis for the job queue only), Fastify, and Vitest; Node.js `fs`/`readline` for local CSV ingestion; no new CSV, geometry, geocoding or caching dependency

**Storage**: PostgreSQL as the single source of truth, accessed through Prisma. New tables hold versioned commune and department references plus a reference-version table and the observed event-type registry; `event_record` gains denormalized geographic columns and an `event_type` column. Redis remains the BullMQ transport and stores no event or geographic data

**Testing**: Vitest unit tests for pure parsing, normalization, resolution and classification; contract tests for the Prisma repository and the query contract; PostgreSQL integration tests through a new harness reading `TEST_DATABASE_URL` (the existing `tests/integration` harness covers Redis only) that applies `prisma migrate deploy` to a disposable database; strict TypeScript typecheck; ESLint; the documented quickstart validation flow

**Target Platform**: Linux containers and local Node.js worker/API processes

**Project Type**: TypeScript monorepo with core library, API service, and BullMQ worker

**Performance Goals**: At least 95% of usual geographic searches complete within one second at the reference volume; commune name lookups rely on B-tree indexes rather than table scans; filtering is a single indexed SQL predicate set on `event_record`

**Constraints**: The existing `LocationRecord.geoPoint` / `geo_point` coordinate storage stays unchanged and is never read for enrichment; exact normalized matching on `location.commune.name` first, then on `location.city`; the postal code never selects a commune and only supplies a department prefix for disambiguation; no fuzzy, phonetic, or coordinate-based matching; stated department code validated against the reference with discrepancy diagnostics; no region, EPCI, constituency, or arrondissement assignment; refresh is operator-triggered; activation and enriched publication are atomic PostgreSQL transactions; business modules target 100–150 lines as the constitution requires; raw source location and stable event identifiers must survive re-enrichment; department, INSEE and postal codes remain strings at every stage

**Scale/Scope**: The supplied reference contains one header plus 34,868 commune rows (UTF-8, quoted `codes_postaux`). The first release covers events, not group geographic enrichment, and covers only commune, department, and country levels.

### Data Formats by Stage

The spec's _Data Formats by Stage_ section is the contract between stages; the table below maps each stage to the code boundary that owns it.

| Stage (spec)         | Owning boundary                                                               | Representation produced                                                                                            |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Source retrieval     | `apps/worker/src/adapters/action-populaire-client.ts`                         | Event JSON: one object from the event endpoint, a paginated array from the group events endpoints                  |
| Payload validation   | `packages/core/src/adapters/action-populaire-schemas.ts`                      | Validated event object with raw `country`, `departement`, `commune.name`, `city`, `zip` retained as strings        |
| Geographic reference | `packages/core/src/geography/commune-csv-parser.ts` + Prisma models           | Typed CSV rows; persisted as `geographic_reference_version`, `department_reference`, `commune_reference` rows      |
| Normalization        | `packages/core/src/domain/geographic-identity.ts` and `commune-name-index.ts` | Comparison keys (NFC, case-folded, accent- and punctuation-folded), computed once when the version is staged       |
| Enrichment           | `country-classifier.ts`, `commune-resolver.ts`, `department-validator.ts`     | Typed attachment: `countryCode`, `communeId`, `departmentCode`, `departmentSource`, raw copies, diagnostics        |
| Publication          | `PostgresCalendarDatasetRepository` / `PostgresSnapshotPublisher` transaction | `event_record` row with location link, geographic columns and `reference_version`, committed atomically            |
| Filtering            | `packages/core` query contract, executed by the API through Prisma            | `eventRecord.findMany` with `AND` predicates on geographic columns; no join fan-out, therefore no duplicate events |
| Diagnostics          | shared `Diagnostic` type, stored as JSON on the event row                     | `{ code, field, message, severity }` with `warning` or `error`                                                     |

Stage rules that must not drift:

- Codes (`"69"`, `"2A"`, `"01001"`, `"01400"`) are strings from CSV parsing to SQL to query output and are never coerced to numbers.
- Raw source values are preserved next to derived values; normalization only produces index keys.
- Absent, `null` and empty string all mean "not stated" and never trigger a default.
- Coordinates remain stored raw and untouched: this release adds no coordinate column, alters none, and never reads them.
- Geography lives in PostgreSQL only; Redis carries no geographic state and no resolved-lookup cache.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Independent Features**: PASS. Geography parsing, commune resolution, department validation, country classification, filtering, and persistence are separate contracts with pure-core tests and Prisma-integration tests.
- **TypeScript and Verified Types**: PASS. Every stage boundary has an explicit type (raw payload, validated record, reference row, comparison key, attachment, published document, diagnostic); untrusted CSV and event values are validated before use, and Prisma-generated row types are mapped explicitly to domain records.
- **Test-First Quality**: PASS. Each parser, normalization rule, resolution rule, reference activation path, transaction publication path, and filter contract has a named test surface before implementation tasks are generated.
- **Small and Maintainable Business Logic**: PASS. Commune name resolution, postal-to-department derivation, department validation, country classification and event-type validation are separate modules within the constitution's 100–150-line limit; Prisma access is confined to repositories, never mixed with business rules.
- **Deployable by Default**: PASS. The feature reuses the existing PostgreSQL service, `DATABASE_URL` configuration and Prisma migration workflow; no new container or host-specific path is required.

## Project Structure

### Documentation (this feature)

```text
specs/002-geographic-enrichment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── geographic-filter.md
│   └── geographic-refresh.md
└── tasks.md                 # generated later by /speckit-tasks
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                      # + GeographicReferenceVersion, CommuneReference, DepartmentReference,
│                                      #   geographic columns on EventRecord
└── migrations/
    ├── 0002_geographic_reference/     # tables, indexes, partial unique index on the active version
    └── 0003_event_type/               # event_type column, index and observed type registry

packages/core/src/
├── domain/
│   └── geographic-identity.ts         # existing normalizeCommuneKey helper
├── geography/
│   ├── reference-types.ts
│   ├── commune-csv-parser.ts
│   ├── commune-name-index.ts
│   ├── commune-resolver.ts
│   ├── postal-department.ts           # postal prefix to department (arrondissement-safe)
│   ├── department-validator.ts
│   ├── country-classifier.ts
│   ├── event-types.ts                 # observed type registry validation
│   ├── diagnostics.ts                 # diagnostic codes and severities
│   ├── geographic-filter.ts           # query criteria validation
│   ├── reference-validation.ts        # dataset activation gate
│   └── geographic-enricher.ts
├── adapters/
│   └── action-populaire-schemas.ts    # must retain departement, commune and presentation fields
├── persistence/
│   ├── postgres-calendar-repository.ts
│   ├── postgres-event-query.ts
│   ├── postgres-event-type-repository.ts
│   ├── geographic-reference-repository.ts
│   └── geographic-reference-writer.ts
└── infrastructure/
    └── postgres.ts

apps/worker/src/
├── adapters/
│   └── action-populaire-client.ts
├── geography/
│   ├── reference-refresh.ts
│   └── re-enrichment.ts
└── persistence/
    └── snapshot-publisher.ts

packages/core/tests/ and apps/worker/tests/
└── unit and contract tests for the modules above

tests/integration/
├── postgres-setup.ts                  # new: TEST_DATABASE_URL, migrate deploy, truncate between tests
└── geographic-reference.test.ts       # staging, activation, retention, re-enrichment
```

**Structure Decision**: Keep pure parsing, normalization, name resolution and domain types in `packages/core`; keep Prisma queries in `packages/core/src/persistence` repositories; keep operator refresh, queueing and re-enrichment orchestration in `apps/worker`. The API consumes published rows and must not own geographic business rules. Redis is imported only by queue code.

## Complexity Tracking

No constitution violations require a waiver.

| Decision                                          | Why needed                                                                                                                                             | Simpler alternative rejected because                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Partial unique index in raw SQL migration         | Prisma's schema language cannot express `UNIQUE (status) WHERE status = 'active'`; the invariant "one active version" must be enforced by the database | A plain boolean or an application-only check allows two active versions after a failed concurrent refresh     |
| Denormalized geographic columns on `event_record` | Filtering and reads need no join, so no duplicate suppression is required and snapshot publication stays transactional                                 | Link tables introduce many-to-many fan-out and duplicate rows in filtered results                             |
| Repository confined to Prisma                     | Business rules stay free of database concerns and remain testable without PostgreSQL                                                                   | Direct Prisma calls inside resolvers make unit tests require a database and mix persistence with domain logic |

## Phase 0: Research Output

See [research.md](research.md). All technical-context unknowns are resolved there, including CSV parsing, name normalization, ambiguity handling, stage representations, adapter field retention, PostgreSQL reference storage, indexed lookup, transactional activation, and re-enrichment sequencing.

## Phase 1: Design Output

- [data-model.md](data-model.md) defines the Prisma tables, event geographic columns, diagnostics, identity rules, and lifecycle states.
- [contracts/geographic-filter.md](contracts/geographic-filter.md) defines intersection filtering and duplicate suppression.
- [contracts/geographic-refresh.md](contracts/geographic-refresh.md) defines operator refresh input, validation diagnostics, staging, and transactional activation.
- [quickstart.md](quickstart.md) defines runnable unit, integration, and dataset validation scenarios.

## Post-Design Constitution Check

- **Independent Features**: PASS. Core modules have no Prisma, Redis or Fastify dependency; Prisma access sits behind the repository, and queue code is the only Redis consumer.
- **TypeScript and Verified Types**: PASS. CSV rows, Prisma rows, diagnostics, stage outputs, and contracts all have explicit types.
- **Test-First Quality**: PASS. The quickstart maps every high-risk rule to a test command or fixture scenario, including a disposable database for repository tests.
- **Small and Maintainable Business Logic**: PASS. No module combines CSV parsing, name resolution, department validation, and persistence.
- **Deployable by Default**: PASS. Activation and publication run in the existing PostgreSQL service inside documented Prisma migrations; failure leaves the previous active version intact.
