# Implementation Plan: Filtered iCalendar Feed

**Branch**: `003-icalendar-filtered-feed` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-icalendar-filtered-feed/spec.md`

## Summary

Add a public, read-only `GET /calendar.ics` route that returns the published events matching any combination of `country`, `department`, `commune_name`, `insee_commune` and `event_type` as an RFC 5545 calendar, bounded by a configurable window of one month back and three months ahead, each entry carrying `X-ACTIONPOP-*` experimental metadata plus the standard `LOCATION`, `URL`, `CATEGORIES` and `GEO` properties.

The technical approach extracts the RFC 5545 primitives from the existing group feed into a shared writer, adds a dedicated read model and a two-step commune-name resolver in `packages/core`, and introduces one YAML configuration file for the whole application whose values environment variables override.

## Technical Context

**Language/Version**: TypeScript 5.7 on Node.js 20+ LTS, strict mode with composite project references (`tsconfig.base.json`, `tsc -b`)

**Primary Dependencies**: NestJS 12 with Fastify 5, `@nestjs/swagger` for the generated OpenAPI document, `@scalar/nestjs-api-reference` for `/reference`, Prisma 6.19 on PostgreSQL 16, Zod 4 for runtime validation, Vitest 2 for tests. One new direct dependency: `yaml` (eemeli) in `@actionpop/core` for the configuration file.

**Storage**: PostgreSQL through Prisma is the source of truth (`event_record`, `location_record`, `geo_point`, `event_group_link`, `commune_reference`, `department_reference`, `geographic_reference_version`). Redis carries only the BullMQ transport and is not used for the calendar read path.

**Testing**: Vitest. Unit tests beside the modules in `packages/core/src/**/*.test.ts`; HTTP contract tests under `apps/api/tests` through `app.inject`; PostgreSQL integration tests under `tests/integration` guarded by `TEST_DATABASE_URL`.

**Target Platform**: Linux containers (Node 20), API and worker images built from `infra/docker/Dockerfile.api` and `Dockerfile.worker`, orchestrated by `infra/compose/docker-compose.yml`.

**Project Type**: pnpm workspace monorepo with a shared library (`packages/core`) and two deployable applications (`apps/api`, `apps/worker`); this feature is a web-service surface.

**Performance Goals**: 95% of filtered calendar requests returning up to 500 events complete in under 2 seconds (SC-006); a request never materializes more than the configured entry ceiling (1000 by default).

**Constraints**: Business modules stay within 100–150 lines (constitution IV); event times use `Europe/Paris` for window arithmetic and serialize as UTC; geographic and event-type identifiers remain strings; the calendar route must stay independent from `/feed/{scopeId}` and `/events`; secrets never enter the YAML file.

**Scale/Scope**: One public route, five optional filter criteria, four metadata levels, one new configuration file, roughly ten new or refactored modules across `packages/core` and `apps/api`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Independent Features | Filter parsing, commune resolution, window computation, entry projection, metadata emission and RFC 5545 serialization must each be verifiable without the HTTP stack. | PASS — every rule lands in a pure `packages/core` module behind a narrow reader interface; the controller only translates. |
| II. TypeScript and Verified Types | Strict compilation, explicit public types, no `any`, no unverified assertion at a boundary. | PASS — the YAML document is parsed through a Zod schema and the Prisma rows are mapped explicitly. |
| III. Test-First Quality | Automated tests for normal, validation and error paths before completion. | PASS — unit tests per module plus HTTP contract tests and an OpenAPI drift test. |
| IV. Small and Maintainable Business Logic | Modules within 100–150 lines, meaningful splits rather than artificial fragmentation. | PASS with care — the writer, metadata emitter, filter parser, window helper, projection and query are separate cohesive modules. The risk is the filtered-calendar orchestration service, which stays a thin composition. |
| V. Deployable by Default | Docker build and startup path preserved; runtime configuration externalized. | PASS — the YAML file is mounted read-only in Compose, `APP_CONFIG_FILE` names it, environment variables still override every value, and no secret enters the file. |

**Post-design re-evaluation (Phase 1)**: all five gates still pass. No violation requires a Complexity Tracking entry; the only structural addition is one parsing dependency, justified in `research.md`.

## Project Structure

### Documentation (this feature)

```text
specs/003-icalendar-filtered-feed/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── calendar-ics.md         # HTTP contract of GET /calendar.ics
│   ├── calendar-metadata.md    # X-ACTIONPOP-* and standard properties
│   └── configuration-file.md   # YAML schema and override precedence
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── calendar/
│   ├── ical-writer.ts           # RFC 5545 primitives: text escaping, line folding, CRLF join
│   ├── ical-feed.ts             # existing group feed, refactored onto ical-writer
│   ├── filtered-ical.ts         # filtered calendar document assembly
│   └── ical-metadata.ts         # X-ACTIONPOP-* emission per metadata level
├── calendar-filters/
│   ├── calendar-filter.ts       # criteria parsing, list semantics, diagnostics
│   ├── calendar-window.ts       # lookback/lookahead bounds in Europe/Paris
│   └── calendar-event.ts        # CalendarEvent projection type and validation
├── geography/
│   └── commune-name-resolver.ts # normalized names -> INSEE codes, ambiguity diagnostics
├── config/
│   ├── config-file.ts           # YAML read, env overlay, Zod validation, fail-fast messages
│   ├── config.interface.ts      # extended with CalendarConfig
│   └── runtime-config.ts        # existing parsers, now fed by the merged configuration
└── persistence/
    └── postgres-calendar-event-query.ts  # dedicated read model for the calendar

apps/api/src/
├── controllers/
│   └── calendar-ics.controller.ts  # GET /calendar.ics, read-only guard, headers
├── config.ts                       # loads the merged configuration
└── app.module.ts                   # registers the new controller and query token

apps/api/tests/
├── calendar-ics.test.ts            # HTTP contract, filters, window, headers
└── api-reference.test.ts           # extended with the calendar route contract

config/
└── actionpop.example.yaml          # complete, commented, every setting with its default

packages/core/src/config/config-file.test.ts
packages/core/src/calendar/ical-writer.test.ts
packages/core/src/calendar/filtered-ical.test.ts
packages/core/src/calendar/ical-metadata.test.ts
packages/core/src/calendar-filters/calendar-filter.test.ts
packages/core/src/calendar-filters/calendar-window.test.ts
packages/core/src/geography/commune-name-resolver.test.ts
```

**Structure Decision**: The shared package owns every rule and the API application owns transport. The calendar read model is new rather than an extension of `PostgresEventQuery`, so the `/events` contract stays unchanged and independently testable.

## Phase 0 — Research

See [research.md](./research.md). Decisions cover the RFC 5545 writer extraction, the two-step commune resolution, the dedicated read model, fixed-day window arithmetic, the YAML configuration file with environment precedence, the body-hash ETag, the metadata level model and the diagnostic property encoding.

## Phase 1 — Design

- [data-model.md](./data-model.md): filter criteria, calendar window, calendar event projection, metadata property model and configuration schema.
- [contracts/calendar-ics.md](./contracts/calendar-ics.md): route, parameters, semantics, status codes, headers and payload shape.
- [contracts/calendar-metadata.md](./contracts/calendar-metadata.md): experimental and standard property names, levels and stability guarantees.
- [contracts/configuration-file.md](./contracts/configuration-file.md): YAML keys, defaults, validation and override precedence.
- [quickstart.md](./quickstart.md): runnable validation scenarios.

## Complexity Tracking

No constitution violation requires justification. The single structural addition is the `yaml` parsing dependency, recorded in `research.md` with the alternatives considered.

### Module size review (post-implementation)

Constitution principle IV asks for 100–150 lines per business module. Four modules exceeded it during implementation and were split along their responsibilities rather than truncated:

| Module | Before | After |
|--------|--------|-------|
| `packages/core/src/config/config-file.ts` | 271 | `config-file.ts` 99 + `config-schema.ts` 136 + `config-environment.ts` 84 |
| `packages/core/src/calendar-filters/calendar-filter.ts` | 167 | `calendar-filter.ts` 87 + `calendar-filter-parameters.ts` 94 |
| `packages/core/src/calendar/filtered-calendar-service.ts` | 155 | `filtered-calendar-service.ts` 112 + `calendar-criteria.ts` 64 |
| `apps/api/src/controllers/calendar-ics.controller.ts` | 189 | `calendar-ics.controller.ts` 133 + `calendar-ics-contract.ts` 71 |

Every other new module stays between 21 and 141 lines. Two renames happened during implementation to avoid collisions with existing exports: the core service is `FilteredCalendarService` in `filtered-calendar-service.ts`, and the resolver interface it accepts is `CalendarCommuneResolver`.
