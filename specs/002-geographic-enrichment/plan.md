# Implementation Plan: Geographic Enrichment and Event Filtering

**Branch**: `002-geographic-enrichment` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

## Summary

Implement geographic enrichment as independently testable TypeScript domain modules in `packages/core`, then connect them to the worker's staged Redis publication flow. The local commune CSV is parsed as a quoted, streaming CSV and indexed by exact postal-code plus city; the supplied constituency GeoJSON is validated and normalized into Polygon/MultiPolygon geometry. Constituency resolution remains separate from commune resolution and returns every matching polygon, including boundary matches. Geographic reference versions are staged immutably and activated through one Redis Lua pointer switch so failed refreshes cannot replace the active version.

## Technical Context

**Language/Version**: TypeScript on Node.js >=20, strict compiler settings

**Primary Dependencies**: Existing Zod, ioredis, BullMQ, Fastify, and Vitest; Node.js `fs`/`readline` for local data ingestion; no new geometry or CSV dependency in the first release

**Storage**: Redis for immutable geographic reference versions, active-version pointer, event snapshots, and link records; local `data/communes-france-2026.csv` and `data/circonscriptions-legislatives-p20.geojson` as refresh inputs

**Testing**: Vitest unit and contract tests, existing Redis integration tests, strict TypeScript typecheck, ESLint, and the documented quickstart validation flow

**Target Platform**: Linux containers and local Node.js worker/API processes

**Project Type**: TypeScript monorepo with core library, API service, and BullMQ worker

**Performance Goals**: At least 95% of usual geographic searches complete within one second at the reference volume; linear point-in-polygon scanning is acceptable for 559 constituency features when guarded by bounding boxes

**Constraints**: Exact postal-code plus city matching only; no fuzzy or postal-only commune assignment; postal data wins over conflicting GPS; boundary points may create multiple constituency links; refresh is operator-triggered; activation and enriched publication are atomic; business modules target <=100 lines where practical; raw source location and stable event identifiers must survive re-enrichment

**Scale/Scope**: The supplied reference contains 34,868 CSV rows and 559 Polygon/MultiPolygon constituency features. The first release covers events, not group geographic enrichment, and uses the supplied reference datasets as the reproducible test fixture.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Independent Features**: PASS. Geography parsing, resolution, validation, filtering, and persistence are separate contracts with pure-core tests and worker integration tests.
- **TypeScript and Verified Types**: PASS. New public domain records and adapter boundaries are explicitly typed; untrusted CSV/GeoJSON values are validated before use.
- **Test-First Quality**: PASS. Each parser, geometry rule, reference activation path, enrichment rule, and filter contract has a named test surface before implementation tasks are generated.
- **Small and Maintainable Business Logic**: PASS. Postal and constituency rules are separate modules with a <=100-line target; geometry normalization and persistence are not mixed with business resolution.
- **Deployable by Default**: PASS. The design uses existing Redis/Docker configuration and environment-based runtime settings; no host-specific path is required at runtime beyond configured data inputs.

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
packages/core/src/
├── geography/
│   ├── reference-types.ts
│   ├── commune-csv-parser.ts
│   ├── geojson-validator.ts
│   ├── point-in-polygon.ts
│   ├── postal-commune-resolver.ts
│   ├── constituency-resolver.ts
│   └── geographic-enricher.ts
├── persistence/
│   └── geographic-reference-repository.ts
└── infrastructure/
    └── redis.ts

apps/worker/src/
├── geography/
│   ├── reference-refresh.ts
│   └── re-enrichment.ts
└── persistence/
    └── enriched-event-repository.ts

packages/core/tests/ and apps/worker/tests/
└── unit, contract, and publication tests for the modules above
```

**Structure Decision**: Keep pure parsing, validation, normalization, resolution, and domain types in `packages/core`; keep Redis orchestration, operator refresh, queueing, and re-enrichment in `apps/worker`. The API consumes published snapshots and must not own geographic business rules.

## Complexity Tracking

No constitution violations require a waiver. The repository pattern for versioned reference data is required to preserve atomic activation and reader consistency; direct Redis access from enrichment code would couple business rules to persistence and violate the independent-boundary requirement.

## Phase 0: Research Output

See [research.md](research.md). All technical-context unknowns are resolved there, including CSV parsing, GeoJSON boundary semantics, reference versioning, atomic activation, and re-enrichment sequencing.

## Phase 1: Design Output

- [data-model.md](data-model.md) defines reference entities, enriched event links, diagnostics, identity rules, and lifecycle states.
- [contracts/geographic-filter.md](contracts/geographic-filter.md) defines intersection filtering and duplicate suppression.
- [contracts/geographic-refresh.md](contracts/geographic-refresh.md) defines operator refresh input, validation diagnostics, staging, and atomic activation.
- [quickstart.md](quickstart.md) defines runnable unit, integration, and dataset validation scenarios.

## Post-Design Constitution Check

- **Independent Features**: PASS. Core modules have no Redis or Fastify dependency; adapters are at the worker boundary.
- **TypeScript and Verified Types**: PASS. CSV rows, GeoJSON properties, Redis manifests, diagnostics, and contracts all have explicit types.
- **Test-First Quality**: PASS. The quickstart maps every high-risk rule to a test command or fixture scenario.
- **Small and Maintainable Business Logic**: PASS. No module combines CSV parsing, polygon math, postal resolution, constituency resolution, and persistence.
- **Deployable by Default**: PASS. Activation uses the existing Redis service and a configured data directory; failure leaves the prior active pointer intact.
