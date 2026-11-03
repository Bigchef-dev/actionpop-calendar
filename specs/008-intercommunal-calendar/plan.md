# Implementation Plan: Intercommunal Calendar Discovery

**Branch**: `008-intercommunal-calendar` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

## Summary

Add all public French EPCI categories as a first-class search subject and calendar scope.
The design extends the existing typed subject catalogue, stores versioned EPCI-to-commune
membership alongside the existing geographic reference data, resolves a territory to the
existing commune-based event query, and keeps the existing filter and iCalendar contracts
backward compatible. The web client already renders unknown subject kinds generically; it
needs a French label and territory-specific empty/data-quality states.

## Technical Context

**Language/Version**: TypeScript, Node.js >= 26, Vue 3

**Primary Dependencies**: NestJS, Prisma 7/PostgreSQL, Zod, Vitest, Vue 3, FullCalendar

**Storage**: PostgreSQL for versioned geographic references and event data; Redis remains
the existing calendar cache where configured

**Testing**: Vitest unit and contract tests, package typechecks, API route tests, web typecheck

**Target Platform**: Docker-deployed Node.js API/worker and browser web application

**Project Type**: Monorepo web application with API, worker, and shared domain package

**Performance Goals**: Search results remain within the existing public search response
budget; territory resolution adds one bounded membership lookup and calendar requests remain
within the existing calendar query budget

**Constraints**: Preserve existing city, department, group, and calendar-link contracts;
canonical timezone is `Europe/Paris`; never silently return unrelated events; membership data
must be versioned and diagnosable

**Scale/Scope**: All active French EPCI records and their commune memberships; public search
candidate limits remain bounded by the current API limit

## Constitution Check

*GATE: Must pass before Phase 0 research and after Phase 1 design.*

- **I. Independent Features**: PASS — EPCI identity/membership, search, calendar resolution,
  and UI states have focused contracts and independently testable boundaries.
- **II. TypeScript and Verified Types**: PASS — new public kinds, persistence rows, and
  external reference payloads will use explicit TypeScript types; no `any` is planned.
- **III. Test-First Quality**: PASS — unit, contract, integration, compatibility, and
  round-trip link scenarios are included in the design and quickstart.
- **IV. Small and Maintainable Business Logic**: PASS — membership resolution, subject search,
  and data refresh validation remain separate modules with named intermediate results.
- **V. Deployable by Default**: PASS — the design uses existing Docker/PostgreSQL/worker
  workflows and adds no host-specific runtime configuration.

No gate violations require a complexity exception.

## Project Structure

```text
packages/core/src/
├── geography/
│   ├── epci-reference.ts                 # EPCI domain/reference types and validation
│   ├── epci-membership-resolver.ts      # EPCI -> commune resolution
│   └── ...
├── search/
│   ├── subject-search-types.ts           # Add epci subject kind
│   ├── postgres-subject-search.ts        # Read active EPCI reference rows
│   └── ...
├── calendar-filters/
│   ├── calendar-criteria.ts              # Add epci scope input/resolution
│   └── ...
└── persistence/
    ├── postgres-calendar-event-query.ts  # Resolve EPCI members, preserve dedupe
    └── ...

apps/api/src/
├── controllers/
│   ├── search.controller.ts              # Document epci search responses
│   ├── calendar-ics-contract.ts          # Document epci filter
│   └── ...
├── prisma/contract.prisma                # Versioned EPCI reference/membership models
└── ...

apps/worker/src/
├── geography/                            # Refresh and validate EPCI reference data
└── ...

apps/web/src/
├── features/discovery/utils/suggestion-shape.ts  # French EPCI label
├── features/calendar/                         # Territory quality/empty states
└── ...
```

Implementation files added or extended for this feature:

- `packages/core/src/geography/epci-reference.ts`
- `packages/core/src/geography/epci-reference-validation.ts`
- `packages/core/src/geography/epci-reference.test.ts`
- `packages/core/src/calendar-filters/calendar-criteria.ts`
- `packages/core/src/persistence/geographic-reference-repository.ts`
- `packages/core/src/search/postgres-subject-search.ts`
- `prisma/migrations/0008_epci_reference/migration.sql`
- `apps/worker/src/geography/epci-reference-refresh.ts`

**Structure Decision**: Extend existing core geography/search/calendar boundaries rather than
creating a second calendar implementation. The API remains the public contract owner, the
worker owns reference refresh, and the web app consumes the existing subject response shape.

## Phase 0: Research Decisions

Research and resolved decisions are recorded in [research.md](./research.md). The design
must use a government-published, versioned EPCI reference and must fail closed when a
membership snapshot is invalid or incomplete.

## Phase 1: Design Outputs

- [data-model.md](./data-model.md): EPCI identity, membership, reference versions, and
  resolved calendar scope.
- [contracts/search-subjects.md](./contracts/search-subjects.md): public search subject
  extension and compatibility rules.
- [contracts/calendar-ics.md](./contracts/calendar-ics.md): territory filter and feed
  semantics.
- [contracts/reference-refresh.md](./contracts/reference-refresh.md): worker refresh,
  validation, diagnostics, and activation rules.
- [quickstart.md](./quickstart.md): runnable validation scenarios and expected outcomes.

## Post-Design Constitution Check

- **I**: PASS — contracts separate reference ingestion, domain resolution, transport, and UI.
- **II**: PASS — all boundaries have explicit types and validation rules.
- **III**: PASS — each requirement maps to a test scenario in the quickstart and artifacts.
- **IV**: PASS — no single new responsibility requires a monolithic module; existing query
  deduplication remains the single event boundary.
- **V**: PASS — refresh and serving behavior remain compatible with the documented Docker path.
