# Implementation Plan: Minimal Update Progress View

**Branch**: `011-update-progress-view` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-update-progress-view/spec.md`

**Design artifacts**: [research.md](research.md) · [data-model.md](data-model.md) ·
[contracts/update-status.md](contracts/update-status.md) · [quickstart.md](quickstart.md)

**References**: canonical ingestion lifecycle [`specs/contracts/ingestion/scopes.md`](../contracts/ingestion/scopes.md) ·
operator metrics [`specs/contracts/operations/metrics.md`](../contracts/operations/metrics.md) ·
published edge [`specs/contracts/http/observability.md`](../contracts/http/observability.md) ·
existing web shell [`apps/web/src/shared/components/AppShell.vue`](../../apps/web/src/shared/components/AppShell.vue)

## Summary

Add one public, read-only JSON read — `GET /updates` — and a dedicated public page at `/etat`
that consumes it, linked from a compact footer entry point in the existing calendar experience. The read aggregates the refresh work the worker already records in
`processing_period` and `ingestion_ledger`: current-cycle processed/failed/remaining counts, the
last completed cycle with its duration and outcome, and a bounded history of recent cycles.
Nothing new is written by this feature, and the worker is not changed.

The public constraint is the hard part. Anonymous visitors see aggregate counts and times only:
no scope identifiers, no job identifiers, no failure reasons, no queue or infrastructure state.
A missing or unreadable source becomes an explicit `unknown` state rather than a reassuring zero.
A small in-process cache limits the polling load on PostgreSQL, and every response carries a
short public cache lifetime.

The web side stays deliberately small: one status line with three primary figures, a
`<details>` disclosure for the five most recent cycles, refresh every 30 seconds while visible,
and a manual refresh control. Existing pages, contracts and performance are unchanged.

## Technical Context

**Language/Version**: TypeScript 6.0 on Node.js ≥ 26, strict compiler settings, pnpm 12
workspace

**Primary Dependencies**: existing NestJS 12 + Fastify 5 API, Prisma 7 with the
`@prisma/adapter-pg` driver, Vue 3 + Vite 5 web app, Vitest 5, Playwright. **No new runtime
dependency**: the aggregate read uses Prisma queries, the cache is a bounded `Map`, and the
web indicator uses the existing fetch client, design tokens and component patterns.

**Storage**: PostgreSQL 18 through Prisma. **No new table and no new column.** One additive
index on `ingestion_ledger(period_token)` supports the per-period aggregate, which currently has
no supporting index (the existing unique key starts with `scope_id`). Redis remains the BullMQ
transport only and is never read by the public route.

**Testing**: Vitest unit tests in `packages/core` (state classification, progress arithmetic,
history selection, duration clamping), `apps/api/tests` (HTTP contract, cache header, graceful
unknown, absence of internal fields), `apps/web/tests` (formatter, polling composable,
component states), PostgreSQL integration in `tests/integration` (`update-status.test.ts`,
`edge-surface.test.ts`), and the Playwright suite (`apps/web/tests/update-status.spec.ts`);
`pnpm typecheck`, `pnpm lint`, `pnpm check:dead`, `pnpm check:cycles`, `pnpm check:spell`.

**Target Platform**: Linux API and web containers; PostgreSQL 18 without PostGIS; public static
site served by the existing nginx edge

**Project Type**: pnpm TypeScript monorepo — core library, NestJS API, BullMQ worker, static Vue
web app

**Performance Goals**: the read answers in under 200 ms p95 against the aggregate queries and is
served from a 10-second in-process cache otherwise; one refresh costs at most two indexed
queries; the first useful status appears in under 2 seconds (SC-007); a change becomes visible
within 30 seconds (SC-003)

**Constraints**: public and unauthenticated; strictly read-only; aggregate-only payload; no
personal data; no internal identifiers or failure reasons; times rendered in `Europe/Paris`;
same-origin fetch under the existing CSP (`connect-src 'self'`); business modules stay within
100–150 lines; no change to existing routes, contracts or web behaviour

**Scale/Scope**: 951 active scopes at the 2026-11-18 catalogue sample, refreshed every 15 minutes
(≈ 91 k ledger rows per day); five history cycles per response; one request every 30 seconds per
open tab, absorbed by the cache; response under 2 KB

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Independent Features — PASS**: the classifier and progress arithmetic are pure
  `packages/core` functions tested without HTTP, PostgreSQL or a browser. The Prisma reader, the
  controller, the cache and the Vue component are separate boundaries with their own tests. The
  API can be exercised with a stub reader; the web component with a mocked `fetch`.
- **II. TypeScript and Verified Types — PASS**: the response, the reader port, the aggregate rows
  and the web formatter all have explicit types. Prisma `groupBy` results are mapped explicitly;
  no `any` and no unchecked assertion. The API declares the response schema for OpenAPI.
- **III. Test-First Quality — PASS**: the plan names a test surface for every rule before tasks
  are generated: each state transition, the arithmetic invariant, empty/never-updated, abandoned
  periods, partial and failed outcomes, history bound and order, unreadable sources, cache
  behaviour, and the absence of internal fields. Integration tests seed real ledger rows.
- **IV. Small and Maintainable Business Logic — PASS**: the work is split into focused modules —
  `updates/update-status.ts` (classification and arithmetic), `postgres-update-status.ts` (two
  aggregate queries), `update-status.service.ts` (cache and graceful degradation),
  `updates.controller.ts` (transport), `useUpdateStatus.ts` (polling and visibility),
  `update-status-format.ts` (labels and `Europe/Paris` formatting), one dedicated page, one small
  CSS progress visualization, and a compact footer link.
  Each stays under the 150-line ceiling, and none mixes rules with transport.
- **V. Deployable by Default — PASS**: no new container, image, secret or dataset. The migration
  adds one index through the existing `migrate` service. The route is published by editing the
  existing edge routing table, and the web build remains a static artifact. The API and web keep
  their current environment and health behaviour.
- **Boundary check**: the feature reads ingestion state through a new port; it does not import
  worker modules into the API, and the worker does not import API modules. The web calls the
  documented public route only.

**Post-design re-check (after Phase 1)**: PASS. The final design adds one index, one public
read, one web component and one route entry; it introduces no new table, no worker change, no
new deployable unit and no runtime dependency. No constitution violation requires a complexity
entry.

## Project Structure

### Documentation (this feature)

```text
specs/011-update-progress-view/
├── plan.md                       # this file
├── research.md                   # Phase 0 decisions
├── data-model.md                 # Phase 1 derived read model and aggregation rules
├── quickstart.md                 # Phase 1 validation guide
├── contracts/
│   └── update-status.md          # historical contract, points at the canonical one
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md                      # created later by /speckit-tasks
```

During implementation the canonical contract becomes
[`specs/contracts/http/updates.md`](../contracts/http/updates.md), indexed in
[`specs/contracts/README.md`](../contracts/README.md) and added to the public allowlist in
[`specs/contracts/http/observability.md`](../contracts/http/observability.md). The edge-surface
test currently asserts entries against the historical
[009 contract](../009-release-hardening-observability/contracts/edge-surface.md); the
implementation switches that assertion to the canonical file, so the historical record is not
rewritten.

### Source Code (repository root)

```text
prisma/
├── schema.prisma                                   # MODIFY: @@index([periodToken]) on IngestionLedger
└── migrations/0010_update_progress_index/          # NEW: additive index

packages/core/src/
├── updates/
│   ├── update-status.ts                            # NEW: state, progress, history rules (pure)
│   └── update-status.test.ts                       # NEW
├── models/
│   └── update-status.ts                            # NEW: answer types + reader port
├── persistence/
│   ├── postgres-update-status.ts                   # NEW: two aggregate reads
│   └── postgres-update-status.test.ts              # NEW (unit-level query mapping)
└── index.ts                                        # MODIFY: export the new modules

apps/api/src/
├── controllers/
│   ├── update-status.controller.ts                 # NEW: GET /updates
│   └── update-status-answer-schema.ts              # NEW: OpenAPI schema
├── services/
│   └── update-status.service.ts                    # NEW: cache + graceful degradation
├── constants.ts                                    # MODIFY: UPDATE_STATUS token
├── app.module.ts                                   # MODIFY: conditional controller/provider
├── server.ts                                       # MODIFY: ServerOptions.updateStatus
└── main.ts                                         # MODIFY: wire Postgres reader + interval
apps/api/tests/update-status.controller.test.ts     # NEW

apps/web/src/
├── features/updates/
│   ├── components/UpdateStatusIndicator.vue        # NEW
│   ├── composables/useUpdateStatus.ts              # NEW: polling + visibility
│   └── utils/update-status-format.ts               # NEW: labels, age, Europe/Paris time
├── shared/
│   ├── api/client.ts                               # MODIFY: fetchUpdateStatus
│   ├── components/AppShell.vue                     # MODIFY: mount the footer link
│   ├── components/UpdateStatusPage.vue             # NEW: dedicated page
│   └── components/UpdateProgressVisual.vue         # NEW: progress bar + five-cycle strip
├── App.vue                                         # MODIFY: route the /etat page
├── main.ts                                         # MODIFY: resolve /etat and #/etat
├── types.ts                                        # MODIFY: UpdateStatusAnswer types
└── vite.config.ts                                  # MODIFY: dev proxy entry for /updates
apps/web/tests/updates/*.test.ts                    # NEW: formatter, composable, component
apps/web/tests/update-status.spec.ts                # NEW: Playwright acceptance

infra/edge/
├── snippets/routes.conf                            # MODIFY: exact /updates, GET/HEAD only
└── README.md                                       # MODIFY: verification example

tests/integration/
├── update-status.test.ts                           # NEW: seeded ledger aggregates
└── edge-surface.test.ts                            # MODIFY: expected allowlist, read the canonical
                                                     # observability contract instead of the 009 record

specs/contracts/
├── http/updates.md                                 # NEW canonical contract (implementation phase)
├── http/observability.md                           # MODIFY: allowlist row
└── README.md                                       # MODIFY: index row
```

**Structure Decision**: the feature follows the existing monorepo split — derived rules and the
SQL aggregate in `packages/core`, transport and caching in `apps/api`, presentation in
`apps/web`, and cross-cutting proofs in `tests/integration`. No new package or app is created.

## Phase Sequencing

1. **Read model and classifier** — response types, reader port, pure state/progress/history
   rules, unit tests. This step is independently testable and ships nothing public yet.
2. **Aggregate reader and index** — Prisma aggregate queries for the current period and the
   recent settled periods, additive index migration, integration test with seeded ledgers.
3. **Public route** — controller, answer schema, 10-second cache, `unknown` degradation, wiring,
   API tests, canonical contract and edge allowlist.
4. **Web indicator** — fetch function, polling composable with visibility handling, formatter,
   dedicated page, progress visualization, footer link, unit tests and the Playwright acceptance scenario.
5. **Proofs and documentation** — edge-surface expectation, canonical contract index, README
   pointer, `pnpm check:static` and the targeted quickstart scenarios.

Step 1 delivers pure, verifiable value without a route. Step 2 proves the SQL before any visitor
sees it. Steps 3 and 4 are independently demonstrable: the JSON can be inspected with `curl`,
and the component can be driven with a stubbed response.

## Complexity Tracking

No constitution violation is introduced, so this table stays empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
