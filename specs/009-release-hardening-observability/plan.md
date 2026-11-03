# Implementation Plan: Release Hardening and Observability

**Branch**: `009-release-hardening-observability` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-release-hardening-observability/spec.md`

## Summary

Ship two things before publication: (1) a reproducible security verdict — an automated
exploitation scan in CI against the real published surface, a manual pre-publication checklist,
and runtime hardening (closed-by-default route allowlist at the edge, browser security headers,
public API reference turned off by default); (2) fine-grained usage measurement — journey
telemetry from the SPA, calendar subscription and renewal counters, bounded request-volume bands,
and a mount-ready dashboard/alert package for the monitoring stack already running on the host.

The technical approach is deliberately additive to what exists: the in-house `MetricsRegistry`
in `@actionpop/core` grows histograms and `# TYPE`/`# HELP` exposition rather than pulling a
metrics library; the SPA reports journey steps to a same-origin `POST /telemetry/journey` on the
existing API, so no CORS rule and no extra service is needed; the API and worker join an external
Docker network owned by the existing monitoring stack, so nothing is republished on the host.

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 26, pnpm 12.8.1 workspace

**Primary Dependencies**: NestJS 11 + Fastify (API), BullMQ + ioredis (worker), Prisma 7 /
PostgreSQL 16, Vue 3.4 + Vite 5 + Tailwind 4 (web), vitest 5, Playwright 1.64. No new runtime
dependency is planned: the histogram and the exposition format are implemented in
`@actionpop/core`.

**Storage**: PostgreSQL for calendar and ingestion data. **No new table**: journey telemetry is
aggregated into counters and never persisted per visitor (spec FR-017, SC-012).

**Testing**: vitest unit and integration (`pnpm test`, `tests/integration`), Playwright acceptance
(`pnpm test:e2e`), plus a new CI job running an OWASP ZAP baseline scan against the edge.

**Target Platform**: Linux host running Docker Compose, alongside an existing monitoring stack
(Prometheus + Grafana) in a separate Compose project.

**Project Type**: pnpm monorepo — `apps/api` (web service), `apps/worker` (queue consumer),
`apps/web` (static SPA), `packages/core` (business logic), `infra/` (compose, edge, monitoring).

**Performance Goals**: journey reporting adds no perceptible delay to any interaction (SC-007);
the telemetry route answers under 20 ms at p95; metric exposition stays under 50 ms with the
bounded label sets in [contracts/metrics-exposition.md](./contracts/metrics-exposition.md).

**Constraints**: metric cardinality bounded by enumerated label values only — no territory
identifier, no search term, no client identity (FR-016, FR-022); no rejection-based rate limit on
published traffic (FR-012); request-volume bands live in process memory only and are re-keyed
daily (spec Clarifications, Session 2026-11-02).

**Scale/Scope**: single host, at most two application instances during a cutover (FR-029), about
ten public routes, four territory families, four client classes, eleven journey steps.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Independent Features | PASS — telemetry lives in a self-contained `apps/api/src/observability/` module with no persistence dependency; the metric registry stays generic in `@actionpop/core` and is unit-testable without HTTP, Redis or Postgres. |
| II. TypeScript and Verified Types | PASS — every metric name, label value and journey step is a literal union type; no `any` and no assertion at the telemetry boundary, which parses untrusted JSON through an explicit validator returning a discriminated result. |
| III. Test-First Quality | PASS — each contract gets a test: histogram exposition, route templating, client classification, journey validation, volume banding and rotation, edge allowlist, and dashboard/alert validity. The security gate itself is proven by deliberately provoking one high-severity finding once. |
| IV. Small and Maintainable Business Logic | AT RISK if unmanaged — `packages/core/src/operations/metrics.ts` is 65 lines today and histogram support would push it past the 150-line ceiling. **Mitigation**: split into `metrics.ts` (registry façade), `metrics-histogram.ts` (buckets, sum, count) and `metrics-exposition.ts` (text format), each well under the ceiling. Every new module has an expected size in the structure below. |
| V. Deployable by Default | PASS — one new `web` image through a new `Dockerfile.web`; the external network name and the fingerprint salt come from environment variables only; no secret is committed; the documented `docker compose up` path keeps working because the monitoring network is declared `external: true` and documented. |
| Timezone rule | PASS — daily salt rotation and volume-band windows use `Europe/Paris`, the project's canonical timezone. |

No violation requires the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/009-release-hardening-observability/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── journey-telemetry.md
│   ├── metrics-exposition.md
│   ├── edge-surface.md
│   └── monitor-package.md
├── checklists/requirements.md
├── spec.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── operations/
│   ├── metrics.ts                    # registry façade: increment/observe/setGauge (~90 lines)
│   ├── metrics-histogram.ts          # fixed buckets, sum and count (~60 lines)
│   ├── metrics-exposition.ts         # Prometheus text format with HELP/TYPE (~80 lines)
│   └── metrics.test.ts               # extended: histogram and TYPE lines
└── config/
    ├── config.interface.ts           # + ObservabilityScopeConfig
    ├── config-schema.ts              # + observability keys
    └── defaults.config.ts            # + defaults

apps/api/src/
├── observability/
│   ├── request-hook.ts               # Fastify onRequest/onResponse/onError instrumentation (~90)
│   ├── route-template.ts             # URL -> bounded route template (~50 lines)
│   ├── client-kind.ts                # signature -> agenda|browser|automated|indeterminate (~60)
│   ├── client-volume-band.ts         # salted daily band, in-memory map (~80 lines)
│   ├── journey-events.ts             # untrusted JSON -> validated steps (~90 lines)
│   ├── telemetry.controller.ts       # POST /telemetry/journey (~60 lines)
│   └── calendar-metrics.ts           # delivery / subject kind / truncation labels (~80 lines)
├── controllers/                      # instrumentation wiring for calendar, search, events
├── server.ts                         # composition only, stays under the 150-line ceiling
└── main.ts                           # API_REFERENCE default flips to false

apps/web/src/
├── shared/telemetry/
│   ├── visit.ts                      # localStorage marker + 30 min inactivity (~70 lines)
│   ├── journey.ts                    # step vocabulary + non-blocking queue (~80 lines)
│   └── send.ts                       # fetch keepalive / sendBeacon (~40 lines)
├── config.ts                         # API base becomes same-origin by default
├── App.vue                           # keeps rendering; delegates emission
├── features/calendar/composables/useJourneyEmission.ts  # step emission plumbing (~60 lines)
└── features/calendar/composables/useCalendarFeed.ts   # emits calendar_shown

infra/
├── docker/Dockerfile.web             # NEW: vite build -> nginx static
├── edge/
│   ├── security-headers.conf         # shared header snippet (CSP, HSTS, frame, permissions)
│   ├── https.conf                    # explicit allowlist, everything else 404
│   └── http-scan.conf                # plain-HTTP variant for the CI scan
├── compose/
│   ├── docker-compose.yml            # + web service, monitoring external network
│   ├── docker-compose.security.yml   # NEW: scan-only override
│   └── .env.example                  # + OBSERVABILITY_* keys
└── monitoring/
    ├── README.md                     # installation procedure (FR-033)
    ├── prometheus/scrape-snippet.yml
    ├── prometheus/alert-rules.yml
    └── grafana/
        ├── provisioning/datasources/prometheus.yml
        ├── provisioning/dashboards/actionpop.yml
        └── dashboards/{launch,operations}.json

tests/integration/
├── edge-surface.test.ts              # allowlist, headers, redirect, denials (US5)
├── observability-reachability.test.ts # /internal reachable privately, routes == allowlist
├── monitoring-package.test.ts        # dashboards and alerts against the metric contract (US4)
└── telemetry-invariants.test.ts      # the five invariants of data-model.md §6 (US3)

docs/security/
├── findings.md                       # every finding and its disposition (FR-004)
└── pre-publication-checklist.md      # repeatable manual procedure (FR-005)

.github/workflows/
├── ci.yml                            # + e2e job for Playwright
├── security.yml                      # + zap-baseline job
└── pages.yml                         # kept as fallback, base path and API URL from environment
```

**Structure Decision**: the existing monorepo layout is kept. New server-side behaviour is
grouped under `apps/api/src/observability/` rather than spread across controllers, so the feature
can be tested and reviewed as one bounded module (Constitution Principle I). Static delivery of
the SPA moves into `infra/docker/Dockerfile.web` plus the edge, mirroring how the API image is
already built.

Contract tests for `infra/` live in `tests/integration/` on purpose: the root `vitest.config.ts`
collects `packages/*/tests`, `apps/*/tests` and `tests/integration` only, and each package config
collects its own `src` and `tests`. A test placed under `infra/` would never run.

## Runtime Shape

```text
                    Internet
                        │
                  ┌─────▼─────┐
                  │   edge    │   explicit allowlist, security headers, HSTS redirect
                  │  (nginx)  │   everything else -> 404
                  └──┬─────┬──┘
        /  /assets    │     │ /calendar.ics /search/ /events /feed/ /telemetry/
                  ┌───▼───┐ ┌▼──────────┐
                  │  web  │ │    api    │
                  │ nginx │ │  NestJS   │
                  └───────┘ └─────┬─────┘
                                │
          ┌─────────────────────┼───────────────┐
     ┌────▼────┐          ┌─────▼─────┐   ┌─────▼─────┐
     │ redis   │          │ postgres  │   │  worker   │
     └─────────┘          └───────────┘   └───────────┘
                                ▲
                    network `monitoring` (external)
                                │
                ┌───────────────┴───────────────┐
                │  prometheus ──► grafana       │   owned by the existing stack
                └───────────────────────────────┘
```

`/internal/*` is **not** routed by the edge. Prometheus reaches `api:3000/internal/metrics` and
`worker:8081/metrics` directly over the shared `monitoring` network (FR-030, FR-031).

## Phase 0: Outline & Research

Research outcomes are consolidated in [research.md](./research.md). All Technical Context items
are resolved and no `NEEDS CLARIFICATION` remains.

## Phase 1: Design & Contracts

- [data-model.md](./data-model.md) — metric families, label enumerations, band thresholds, journey
  step vocabulary, and the retained-field audit that proves SC-012.
- [contracts/journey-telemetry.md](./contracts/journey-telemetry.md) — `POST /telemetry/journey`.
- [contracts/metrics-exposition.md](./contracts/metrics-exposition.md) — every metric name, type,
  label set and bucket boundary.
- [contracts/edge-surface.md](./contracts/edge-surface.md) — the route allowlist and header set.
- [contracts/monitor-package.md](./contracts/monitor-package.md) — dashboards, alerts, scrape
  configuration, and the acceptance checks they must satisfy.
- [quickstart.md](./quickstart.md) — end-to-end validation scenarios.

## Post-Design Constitution Re-check

| Principle | Result |
|---|---|
| I. Independent Features | PASS — the four new contracts are exercised by unit tests without a database; the only integration test starts the API with stubbed readers. |
| II. Verified Types | PASS — `JourneyBatch`, `MetricLabels` value unions and `RouteTemplate` are explicit types; the JSON boundary returns a discriminated `JourneyParseResult`. |
| III. Test-First | PASS — every contract names its automated check; the scan job has a self-test asserting that a deliberately vulnerable path fails it. |
| IV. Module Size | PASS — the largest planned module is `journey-events.ts` at about 90 lines; `metrics.ts` is split rather than grown. |
| V. Deployable by Default | PASS — `web` image added to compose, monitoring network declared external, no committed secret, health checks preserved. |

## Implementation Notes

Behaviours discovered while implementing, recorded because they contradict a naive reading of the
plan and would otherwise be rediscovered later:

| Discovery | Consequence |
|---|---|
| A visit must be stored in `localStorage`, not `sessionStorage` | `sessionStorage` is per tab, so two tabs produced two visits and contradicted FR-014. The thirty-minute idle rule bounds the record instead of the tab lifetime. Asserted by the Playwright suite. |
| nginx answers `403` to `limit_except`, not `405` | The contract promises `405`; the edge now maps the refusal through `error_page 403 = @journey_method_not_allowed`. |
| Docker cannot publish a port from an `internal: true` network | The scan edge joins the project's default network in addition; the API and worker still publish nothing. |
| FullCalendar embeds its icon font as a `data:` URI | `font-src` needs `data:`, found only by the end-to-end smoke test. Scripts remain `'self'`. |
| The web image cannot run the root `prepare` hook | `prisma generate` is not part of a static build, so the install uses `--ignore-scripts`, and the site reads its catalogue from `data/` rather than `@actionpop/core`. |
| nginx refuses to start as non-root with the stock pid path | The image rewrites `pid` to `/tmp/nginx.pid` before dropping privileges. |

## Complexity Tracking

No constitution violations. The three-way split of the metrics module is a size mitigation, not a
deviation.
