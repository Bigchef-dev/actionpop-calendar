# Implementation Plan: Geographic Action Group Listing

**Branch**: `010-geographic-group-listing` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-geographic-group-listing/spec.md`

**Design artifacts**: [research.md](research.md) · [data-model.md](data-model.md) ·
[contracts/group-listing.md](contracts/group-listing.md) · [quickstart.md](quickstart.md)

**References**: canonical contract [`specs/contracts/http/groups.md`](../contracts/http/groups.md) ·
upstream group detail [`GET /api/groupes/{groupId}/`](../001-technical-foundation/contracts/action-populaire-groups.md#group-detail) ·
generated API reference `GET /reference` (Scalar) backed by `GET /openapi.json` — local `http://127.0.0.1:3000/reference`, always served by the API and deliberately absent from the published edge allowlist

## Summary

Add one public, read-only HTTP read — `GET /groups` — that returns the action groups of a
territory, each once, with its identity, published name, location context and calendar
reference. It reuses the project's existing geographic criteria (`country`, `department`,
`insee_commune`/`commune`, `commune_name`, `epci`) and their semantics, so a group and an event
can never disagree about what a territory means.

The hard part is not the read, it is the attachment. Groups are not geographically enriched
today, and the group catalogue listing states only `location_country` and coordinates. The group
detail resource, however, states the **same `location` object as an event** (`country`,
`departement`, `city`, `zip`, `commune.name`). The plan therefore reuses the existing enricher —
`enrichEventGeography` — and the existing reference data to attach a group exactly the way an
event is attached, then denormalizes the result onto `ingestion_scope`. The public read stays one
indexed SQL predicate set: no new geographic model, no geometry, no third-party call.

All changes are additive: no existing route, column or output changes, and a deployment that
never enriches a group still syncs its catalogue and reports unattached groups.

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js ≥ 26, strict compiler settings, in a pnpm 12
workspace

**Primary Dependencies**: existing NestJS 11 + Fastify API, Prisma 7 with the `@prisma/adapter-pg`
driver, Zod 4 payload validation, BullMQ 6 / Redis for the worker queue, Vitest 5, and the
project's own `enrichEventGeography`, `CommuneNameResolver`, upstream client and geographic
reference modules. **No new runtime dependency and no new geographic model**: the group address
goes through the enricher the events already use.

**Storage**: PostgreSQL 18 through Prisma. Nine nullable attachment columns and three indexes on
`ingestion_scope`; existing `location_record` and `geo_point` reused for the group address and
point; existing reference tables reused unchanged. No new table. Redis stays the BullMQ
transport only and stores no geographic state

**Testing**: Vitest unit tests in `packages/core` (area parsing, criteria resolution, attachment
mapping), `apps/worker` (catalogue write path, detail read, enrichment outcomes), and
`apps/api/tests` (HTTP contract); PostgreSQL integration tests in `tests/integration` through
`startIntegrationPostgres` (`TEST_DATABASE_URL`) for the SQL read, the address write and the
enrichment outcomes; `pnpm typecheck`, `pnpm lint`, `pnpm check:dead`, `pnpm check:cycles`,
`pnpm check:spell` as quality gates

**Target Platform**: Linux containers (API and worker images) and local Node.js processes;
PostgreSQL 18 without PostGIS

**Project Type**: pnpm TypeScript monorepo — core library, NestJS API, BullMQ worker, static
Vue web app

**Performance Goals**: a territory holding up to 500 groups answers in under one second (SC-004);
one page is a single indexed predicate plus a count; enrichment reads upstream only for new,
stale-version or 7-day-old groups, so a steady cycle reads nothing

**Constraints**: read-only and unauthenticated; identifiers remain strings at every stage
(`69`, `2A`, `01001`, `42218`); the whole answer uses one active reference version; no
second geographic rule, no coordinates-to-commune guessing, no runtime third-party geocoder;
existing routes, contracts and event reads unchanged; business modules stay within 100–150 lines;
canonical timezone `Europe/Paris` untouched (the feature carries no time values)

**Scale/Scope**: live catalogue sample of 2,959 groups (951 active) on 2026-11-18, all carrying
coordinates; 34,868 communes per reference version; one page ≤ 200 groups; one upstream detail
read per group needing enrichment, never per request

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Independent Features — PASS**: the area parser, criteria resolver and attachment mapping
  are pure `packages/core` modules tested without HTTP or PostgreSQL. The Prisma reader, the
  address writer and the Nest controller are separate boundaries. The public read can be tested
  with prepared `ingestion_scope` rows, and the enrichment with a stub detail source and one
  group.
- **II. TypeScript and Verified Types — PASS**: every boundary has an explicit type — parsed
  criteria, group detail, enricher attachment, listing item, diagnostics. The upstream catalogue
  and detail documents are validated with the existing Zod schemas before use; no `any` and no
  unchecked assertion is needed. Prisma row types are mapped explicitly to domain records.
- **III. Test-First Quality — PASS**: the plan names a test surface for each business rule before
  tasks are generated: parsing/validation (normal and rejection paths), ambiguous names, unknown
  identifiers, attachment states, eligibility, ordering, paging, empty results, unavailability,
  a failed detail read, and catalogue transaction isolation.
- **IV. Small and Maintainable Business Logic — PASS**: the work is split into focused modules —
  `group-area-parameters` (surface), `group-area-filter` (parse + resolve),
  `group-area-validator` (unknown identifiers), `group-attachment` (enricher result mapping, no
  rule of its own), `postgres-group-listing` (read), `postgres-group-attachment` (selection and
  persistence), `group-locations` (address rows). Each stays under the 150-line ceiling.
- **V. Deployable by Default — PASS**: no new container, image, extension or dataset. The
  migration runs through the existing `migrate` service; the worker reuses its upstream client
  and existing configuration; the API and worker keep their current environment and health
  behaviour.

**Post-design re-check (after Phase 1)**: PASS. The design adds nullable columns, three indexes
and one route; it introduces no new table, no new dataset, no new deployable unit, no secret and
no host assumption. The reference refresh keeps its current contract unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/010-geographic-group-listing/
├── plan.md                       # this file
├── research.md                   # Phase 0 decisions
├── data-model.md                 # Phase 1 entities, states, migration
├── quickstart.md                 # Phase 1 validation guide
├── contracts/
│   └── group-listing.md          # historical contract, points at the canonical one
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md                      # created later by /speckit-tasks
```

The canonical contract is [`specs/contracts/http/groups.md`](../contracts/http/groups.md) and is
indexed in [`specs/contracts/README.md`](../contracts/README.md).

### Source Code (repository root)

```text
prisma/
├── schema.prisma                              # MODIFY: nine attachment columns + three indexes
└── migrations/0009_geographic_group_listing/  # NEW

packages/core/src/
├── adapters/
│   └── action-populaire-schemas.ts            # MODIFY: validateGroupDetail on the existing locationSchema
├── geography/
│   ├── group-area-parameters.ts               # NEW: parameter surface + paging bounds
│   ├── group-area-parameters.ts#tests         # NEW
│   ├── group-area-filter.ts                   # NEW: parse + resolve the area criteria
│   ├── group-area-filter.test.ts              # NEW
│   ├── group-area-validator.ts                # NEW: reject unknown department/commune codes
│   └── index.ts                               # MODIFY: export the new modules
├── groups/
│   ├── group-attachment.ts                    # NEW: enricher result -> attachment columns (no rule)
│   └── group-attachment.test.ts               # NEW
├── models/
│   └── group-listing.ts                       # NEW: request/response types + reader port
├── persistence/
│   ├── postgres-group-listing.ts              # NEW: indexed read + identifier validation
│   ├── postgres-group-attachment.ts           # NEW: candidate selection + attachment write
│   ├── group-locations.ts                     # NEW: address + point rows, reusing the event tables
│   ├── postgres-group-directory.ts            # MODIFY: stated country alongside the name
│   ├── geographic-reference-repository.ts     # MODIFY: commune lookup by code
│   └── postgres-group-queries.ts              # MODIFY: unattached count in the operator report
└── index.ts                                   # MODIFY: export the new modules

apps/worker/src/
├── adapters/action-populaire-client.ts        # MODIFY: fetchGroupDetail, reusing the request helper
├── catalogue/group-catalogue.ts               # MODIFY: pass the stated country
├── geography/group-attachment-refresher.ts    # NEW: address enrichment of listed groups
└── main.ts                                    # MODIFY: run enrichment after the directory sync

apps/api/src/
├── controllers/groups.controller.ts           # NEW
├── controllers/groups-answer-schema.ts        # NEW
├── constants.ts                               # MODIFY: GROUP_LISTING / GROUP_AREA_RESOLVER tokens
├── app.module.ts                              # MODIFY: conditional controller/provider
├── server.ts                                  # MODIFY: ServerOptions.groupListing / groupAreaResolver
└── main.ts                                    # MODIFY: wire PostgresGroupListing + resolver

apps/api/tests/groups.controller.test.ts       # NEW
tests/integration/group-listing.test.ts        # NEW
tests/integration/group-attachment.test.ts     # NEW
```

**Structure Decision**: the feature follows the existing monorepo split — pure rules and SQL
readers in `packages/core`, orchestration in `apps/worker`, transport in `apps/api`, and
cross-cutting persistence proofs in `tests/integration`. No new package or app is introduced.

## Phase Sequencing

1. **Schema and detail read** — attachment columns, migration, `fetchGroupDetail` on the
   existing client, `validateGroupDetail` on the existing location schema.
2. **Attachment** — mapping of the enricher result, incremental selection, address and point
   rows, enrichment step in the cycle, counters.
3. **Read** — area parser/resolver, identifier validation, Prisma reader, controller and wiring,
   canonical contract.
4. **Proofs** — unit, API and integration tests, then quickstart validation.

Step 1 ships without step 2 (groups stay unattached); step 3 is independently testable with
prepared rows.

## Complexity Tracking

No constitution violation is introduced, so this table stays empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| —         | —          | —                                    |
