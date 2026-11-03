---

description: "Task list for Release Hardening and Observability"
---

# Tasks: Release Hardening and Observability

**Input**: Design documents from `/specs/009-release-hardening-observability/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: included. Constitution Principle III makes automated tests mandatory for every feature
("Every feature MUST include automated tests for its business rules before it is considered
complete"), and the specification's success criteria are only verifiable through them.

**Organization**: tasks are grouped by user story so each story is independently implementable,
testable and demonstrable.

**Test placement rule**: a test lives where the repository actually runs it. `apps/*/src/**` and
`packages/*/src/**` are collected by each package's own `vitest run`; `tests/integration/**` is
collected by `pnpm test:integration`; `apps/web/tests/*.spec.ts` is a Playwright suite. Files
outside a workspace package (for example `infra/**`) are **not** collected by any runner, so edge
and monitoring contract tests belong in `tests/integration/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5, matching the user stories in spec.md
- Every task names its exact file path

## Path Conventions

pnpm monorepo, as captured in [plan.md](./plan.md): `packages/core/src/`, `apps/api/src/`,
`apps/worker/src/`, `apps/web/src/`, `infra/`, `docs/`, `tests/integration/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuration surface for every story; no behaviour yet.

- [x] T001 [P] Add `ObservabilityScopeConfig` (deployment, bandSalt, telemetryEnabled) to `packages/core/src/config/config.interface.ts` and wire it into `RootConfig`
- [x] T002 [P] Add the matching keys, zod constraints and defaults to `packages/core/src/config/config-schema.ts` and `packages/core/src/config/defaults.config.ts`; `deployment` must accept only `[a-z0-9_-]{1,32}` and fall back to `unknown`
- [x] T003 [P] Document `OBSERVABILITY_DEPLOYMENT`, `OBSERVABILITY_BAND_SALT`, `TELEMETRY_ENABLED`, `MONITORING_NETWORK` and `API_REFERENCE` in `infra/compose/.env.example` and `config/actionpop.example.yaml`, marking the salt environment-only

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the metric vocabulary, the request hook, the published-surface infrastructure, and
the test execution the whole feature depends on.

**⚠️ CRITICAL**: no user story work begins until this phase is complete.

- [x] T004 Extract fixed-bucket histogram support into `packages/core/src/operations/metrics-histogram.ts`: boundaries `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`, cumulative `_bucket` with an explicit `+Inf`, plus `_sum` and `_count`
- [x] T005 [P] Extract the text format into `packages/core/src/operations/metrics-exposition.ts`: emit `# HELP` then `# TYPE` once per family before its first sample, stable label ordering, escape `\` `"` and newline, counter names ending in `_total`
- [x] T006 Rewrite `packages/core/src/operations/metrics.ts` as a façade exposing `increment`, `observe` and `setGauge`, deducing the family type from the called method, and applying the `deployment` const label to every sample
- [x] T007 [P] Extend `packages/core/src/operations/metrics.test.ts`: histogram `_bucket` monotonicity ending at `+Inf`, `_sum`/`_count` presence, `# TYPE ... histogram`, `actionpop_build_info{deployment="..."} 1`, escaping, stable ordering, and label normalization to `other`
- [x] T008 [P] Create `apps/api/src/observability/route-template.ts` mapping a URL to exactly one of `/calendar.ics`, `/events`, `/search/subjects`, `/feed/:scopeId`, `/telemetry/journey`, `/internal/live`, `/internal/ready`, `/internal/metrics`, `/openapi.json`, `/other`
- [x] T009 [P] Create `apps/api/src/observability/client-kind.ts` classifying a signature into `agenda`, `browser`, `automated` or `indeterminate`; a missing or unmatched signature is `indeterminate`, never a guess
- [x] T010 [P] Test `apps/api/src/observability/route-template.test.ts` and `apps/api/src/observability/client-kind.test.ts`, including that a URL carrying a query string never leaks the query into the template
- [x] T011 [P] Extract the Fastify request instrumentation out of `apps/api/src/server.ts` (138 lines today) into `apps/api/src/observability/request-hook.ts`, keeping `buildApp` as composition only, so the hook can grow without breaching the 150-line ceiling
- [x] T012 Wire the histogram and route templates into the extracted hook in `apps/api/src/observability/request-hook.ts`: `actionpop_http_requests_total{route,method,status_class}` and `actionpop_http_request_duration_seconds` as a histogram, replacing the accumulated-seconds counter
- [x] T013 Record `actionpop_http_failures_total{route,failure_kind}` in `apps/api/src/observability/request-hook.ts` with `failure_kind` ∈ `client_rejected|dependency_unavailable|internal_error` — 4xx, 503 and any other 5xx respectively; add `apps/api/src/observability/request-hook.test.ts` proving a 400 and a 503 land in distinct kinds
- [x] T014 [P] Emit `actionpop_build_info{deployment,version} 1` from `apps/api/src/internal/internal.controller.ts` and `apps/worker/src/main.ts`
- [x] T015 [P] Create `infra/docker/Dockerfile.web`: build `@actionpop/web` in a Node 26 stage and serve `dist/` from `nginx:1.27-alpine` as a non-root user
- [x] T016 Add the `web` service to `infra/compose/docker-compose.yml` on the `private` network with a health check, and keep `apps/web/` out of the API and worker images
- [x] T017 [P] Create `infra/edge/security-headers.conf` with the exact header set from [contracts/edge-surface.md](./contracts/edge-surface.md): CSP (`frame-ancestors 'none'`, `script-src 'self'`), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`
- [x] T018 Rewrite `infra/edge/https.conf` as the explicit allowlist from [contracts/edge-surface.md](./contracts/edge-surface.md) — including the root-level static-asset rule for `apps/web/public/` — with `404` for everything else and the shared header snippet included
- [x] T019 [P] Make the web build origin-agnostic: `VITE_BASE_PATH` (default `/`) in `apps/web/vite.config.ts`, same-origin `API_BASE_URL` default in `apps/web/src/config.ts`, and a Vite dev proxy so `pnpm dev` keeps working
- [x] T020 Add an `e2e` job to `.github/workflows/ci.yml` running `pnpm test:e2e`; no workflow runs Playwright today, so every browser assertion in this feature would otherwise never execute

**Checkpoint**: metrics carry types and a distribution, the SPA is servable at `/`, the edge
publishes an explicit allowlist with security headers, and both test suites this feature relies on
actually run.

---

## Phase 3: User Story 1 - Publish with a security verdict (Priority: P1) 🎯 MVP

**Goal**: an outsider-style review of the published surface, automated where possible, with every
finding dispositioned.

**Independent Test**: a reviewer who did not write the review reproduces each finding against a
locally started stack and confirms it is fixed, mitigated or accepted with a reason.

- [x] T021 [P] [US1] Flip the API reference default in `apps/api/src/main.ts` so `/reference` and `/openapi.json` answer `404` unless explicitly enabled by configuration
- [x] T022 [P] [US1] Test in `apps/api/src/server.test.ts` that both exploratory routes are absent by default and present only when enabled
- [x] T023 [P] [US1] Create `.zap/rules.tsv` tuning known-benign rules, and `.zap/ignore` for findings accepted in `docs/security/findings.md`
- [x] T024 [US1] Create `infra/compose/docker-compose.security.yml` and `infra/edge/http-scan.conf` so the edge serves plain HTTP on `127.0.0.1:8080` with the same shared header snippet
- [x] T025 [US1] Add the `zap-baseline` job to `.github/workflows/security.yml`: start the stack through the scan override, run the baseline scan, upload the HTML and JSON report as an artifact on every outcome, and fail the job on any high-severity alert
- [x] T026 [P] [US1] Create `docs/security/findings.md` with the field set from [data-model.md](./data-model.md) §4: scanner severity, reviewer judgement, evidence, disposition (`fixed|mitigated|accepted`), and a revisit trigger whenever accepted
- [x] T027 [P] [US1] Create `docs/security/pre-publication-checklist.md` recording the tested configuration and one explicit outcome per item, covering headers, transport, routes, dependencies, secrets and the dependency audit
- [x] T028 [US1] Prove the gate blocks a release: introduce one deliberate high-severity condition, confirm the `zap-baseline` job fails, revert it, and record the evidence in `docs/security/findings.md` (SC-002)
- [x] T029 [US1] Verify the supply-chain checks still hold and cover this feature's perimeter: confirm `.github/workflows/security.yml` (gitleaks and `pnpm audit --prod --audit-level=high`) and `.github/workflows/ci.yml` (`pnpm audit:high`) run on any change this feature introduces, including `infra/docker/Dockerfile.web`, and record the outcome in `docs/security/pre-publication-checklist.md` (FR-006)

**Checkpoint**: US1 delivers the verdict. The calendar itself is unchanged.

---

## Phase 4: User Story 2 - See the visitor journey (Priority: P1)

**Goal**: every journey step counted once per visit and attributed to the visit that produced it,
with no stored visitor data.

**Independent Test**: scripted visits reaching different stages produce one counting series per
stage in the exposition, and a visitor with blocked reporting still gets a working calendar.

- [x] T030 [P] [US2] Create `apps/api/src/observability/journey-events.ts` parsing untrusted JSON into a discriminated result: `v` must be literal `1`; `visit` is `[A-Za-z0-9_-]{1,64}`; `steps` holds 1–10 items; an unknown `s` is dropped and counted as `unknown_step`; an unknown `k` normalizes to `none`
- [x] T031 [P] [US2] Test `apps/api/src/observability/journey-events.test.ts` for every acceptance and rejection reason in [contracts/journey-telemetry.md](./contracts/journey-telemetry.md)
- [x] T032 [US2] Create `apps/api/src/observability/telemetry.controller.ts` serving `POST /telemetry/journey` with `204` accepted, `405` other methods, `413` above 2 000 bytes, `415` for a non-JSON content type and `400` for unparseable or out-of-range bodies; no response echoes the payload
- [x] T033 [US2] Test `apps/api/src/observability/telemetry.controller.test.ts` for each status and that a rejected batch records no step
- [x] T034 [US2] Register the controller in `apps/api/src/app.module.ts`, add `/telemetry/journey` to `apps/api/src/observability/route-template.ts`, and add the location to `infra/edge/https.conf`
- [x] T035 [P] [US2] Create `apps/web/src/shared/telemetry/visit.ts`: `localStorage` marker under `actionpop.visit` holding a random UUID, `startedAt` and `lastActivityAt`; a gap above 30 minutes starts a new visit; an unavailable storage falls back to an in-tab marker shared by every tab of the session
- [x] T036 [P] [US2] Create `apps/web/src/shared/telemetry/journey.ts` with the step vocabulary (`arrival`, `search`, `search_empty`, `subject_selected`, `suggestion_accepted`, `calendar_shown`, `type_filter`, `group_filter`, `detail_opened`, `export`, `subscribe`) and a bounded, non-blocking queue flushed on a timer
- [x] T037 [P] [US2] Create `apps/web/src/shared/telemetry/send.ts` posting batches with `navigator.sendBeacon` when the page may unload and `fetch` with `keepalive: true` otherwise; failures are dropped and never retried
- [x] T038 [P] [US2] Extract the emission plumbing out of `apps/web/src/App.vue` (183 lines today) into `apps/web/src/features/calendar/composables/useJourneyEmission.ts`, so the component keeps rendering concerns only
- [x] T039 [US2] Emit the steps by calling `useJourneyEmission` from `apps/web/src/App.vue` (search, search_empty, subject_selected, suggestion_accepted, type_filter, group_filter, detail_opened, export, subscribe) and from `apps/web/src/features/calendar/composables/useCalendarFeed.ts` (`calendar_shown` when at least one event is displayed)
- [x] T040 [US2] Add `apps/web/tests/telemetry.spec.ts` covering three cases: a blocked-reporting visit still renders the calendar (SC-006); interaction timing is not worse than the blocked baseline, with the p95 delta under 5 ms over 30 interactions (SC-007); and two tabs produce one visit while a 30-minute idle gap with a tab still open produces a new one (FR-014)

**Checkpoint**: US2 delivers the journey funnel, independently of the security work.

---

## Phase 5: User Story 3 - Count calendar subscriptions and renewal (Priority: P2)

**Goal**: separate a first subscription, a renewal, an export and a failure, per territory family,
without ever recording the territory identifier.

**Independent Test**: a scripted mix of first fetch, agenda refresh, 304 revalidation and a
browser download produces four distinct, correctly attributed series.

- [x] T041 [P] [US3] Create `apps/api/src/observability/calendar-metrics.ts` producing `actionpop_calendar_requests_total{subject_kind,delivery,client_kind}`, `actionpop_calendar_truncated_total{subject_kind,reason}` and `actionpop_calendar_filters_total{filter,cardinality}` with the enumerations of [data-model.md](./data-model.md) §1.3 (`cardinality` ∈ `none|one|few|many`)
- [x] T042 [P] [US3] Test `apps/api/src/observability/calendar-metrics.test.ts` for the classification order `unavailable` → `rejected` → `revalidated` → `first`, and that `sum by (client_kind)` covers every request
- [x] T043 [US3] Instrument `apps/api/src/controllers/calendar-ics.controller.ts`: classify the delivery, record truncation with `entry_ceiling` or `group_ceiling`, and record filter cardinality without the filter values
- [x] T044 [US3] Instrument `apps/api/src/controllers/calendar.controller.ts` so `/feed/:scopeId` is counted with `subject_kind="group"`
- [x] T045 [US3] Record `actionpop_search_requests_total{outcome,kind}` in `apps/api/src/controllers/search.controller.ts` with `outcome` ∈ `fruitful|unfruitful|rejected` and `kind` ∈ `commune|department|group|epci|all|other`, never the query text
- [x] T046 [US3] Set the `actionpop_events_without_territory{status}` gauge each cycle in `apps/worker/src/dispatcher/cycle-report.ts` with `status` ∈ `incomplete|invalid|unavailable|unknown`
- [x] T047 [US3] Add `tests/integration/telemetry-invariants.test.ts` asserting the five invariants of [data-model.md](./data-model.md) §6, in particular that no label value contains a query string or a territory identifier

**Checkpoint**: US3 delivers subscription measurement on top of the foundational metric vocabulary.

---

## Phase 6: User Story 4 - Consume usage data from the existing monitor (Priority: P2)

**Goal**: the operator's existing Prometheus and Grafana show this application with no manual step
and no public exposure, and staleness is measured per source.

**Independent Test**: with both Compose projects started, `up{job="actionpop"}` is `1` for both
targets, both dashboards exist, and nothing is reachable from the internet.

- [x] T048 [US4] Give `actionpop_ingestion_last_success_timestamp` a `source` label (`calendar`, `map`) in `apps/worker/src/ingestion/calendar-ingestion-processor.ts` and `apps/worker/src/ingestion/map-discovery-processor.ts`, which today both write `{}` and overwrite each other; add `apps/worker/src/ingestion/ingestion-freshness.test.ts` proving the two series coexist and that a stalled source stops refreshing (FR-028)
- [x] T049 [P] [US4] Add the external `monitoring` network (`MONITORING_NETWORK`, default `monitoring`) to the `api`, `worker`, `web` and `edge` services in `infra/compose/docker-compose.yml`, and document the required `docker network create`
- [x] T050 [P] [US4] Create `infra/monitoring/prometheus/scrape-snippet.yml`: job `actionpop` with targets `api:3000` (`/internal/metrics`) and `worker:8081` (`/metrics`), `scrape_interval: 30s`, `scrape_timeout: 10s`, and a `service` label per target
- [x] T051 [P] [US4] Create `infra/monitoring/prometheus/alert-rules.yml` with the eight rules of [contracts/monitor-package.md](./contracts/monitor-package.md), including `absent(...)` guards and `severity` labels
- [x] T052 [P] [US4] Create `infra/monitoring/grafana/provisioning/datasources/actionpop.yml` (stable `uid`, `${DS_PROMETHEUS}`) and `infra/monitoring/grafana/provisioning/dashboards/actionpop.yml` (file provider)
- [x] T053 [P] [US4] Create `infra/monitoring/grafana/dashboards/actionpop-launch.json` (schema 39, stable `uid`) covering visits (read from the `arrival` step), usable-calendar ratio, territory families, fruitful searches, subscriptions, renewals, exports and events missing a territory, with `or vector(0)` on traffic panels
- [x] T054 [P] [US4] Create `infra/monitoring/grafana/dashboards/actionpop-operations.json` (schema 39, stable `uid`) covering latency p50/p95/p99, errors by route and failure kind, calendar unavailability, truncations, queue depth, ingestion freshness per source, request-volume bands, client class mix with `indeterminate` visible, and targets up
- [x] T055 [US4] Write `infra/monitoring/README.md`: how to create and name the network, what to mount where, how to reload Prometheus and Grafana, how to verify the application appears, and how to prove each alert fires
- [x] T056 [US4] Add `tests/integration/monitoring-package.test.ts`: every JSON parses, every `expr` references a metric name present in [contracts/metrics-exposition.md](./contracts/metrics-exposition.md), every alert has `expr`, `for` and `severity`, and both dashboards declare schema 39 with a stable `uid`
- [x] T057 [US4] Remove the superseded and non-functional `infra/monitoring/dashboard.json` and `infra/monitoring/alerts.yml`

**Checkpoint**: US4 delivers operational visibility through the existing stack.

---

## Phase 7: User Story 5 - Keep the published surface closed by default (Priority: P3)

**Goal**: only the routes the calendar experience needs are reachable, private surfaces are
unreachable from the internet yet reachable by the monitor, and abuse is visible without being
blocked.

**Independent Test**: every allowlisted path answers as documented, every other path answers
`404` without disclosing whether it exists, the monitor can still read the private surfaces, and
an abusive client is visible in the bands.

- [x] T058 [US5] Create `apps/api/src/observability/client-volume-band.ts`: `HMAC-SHA256` of the client-derived value salted with `OBSERVABILITY_BAND_SALT` plus the `Europe/Paris` date, an in-memory map capped at 10 000 entries with FIFO eviction, bands `low|moderate|high|very_high|extreme` (1–19, 20–99, 100–499, 500–1999, 2000+), never persisted, logged or emitted as a label value
- [x] T059 [P] [US5] Test `apps/api/src/observability/client-volume-band.test.ts`: band boundaries, salt rotation resetting the key space, map cap and eviction, and that the key never appears in any output
- [x] T060 [US5] Wire `actionpop_client_request_band_total{band}` into `apps/api/src/observability/request-hook.ts`, excluding the `/internal/*` routes
- [x] T061 [P] [US5] Add `tests/integration/edge-surface.test.ts` parsing `infra/edge/https.conf` and asserting the location table matches [contracts/edge-surface.md](./contracts/edge-surface.md) exactly and that no `location` matches `/internal`
- [x] T062 [US5] Extend `tests/integration/edge-surface.test.ts` to assert the header set on every proxied location, the `301` upgrade on port 80 and `Strict-Transport-Security` on HTTPS
- [x] T063 [US5] Extend `tests/integration/edge-surface.test.ts` to assert that `/internal/metrics`, `/internal/live`, `/internal/ready`, `/reference`, `/openapi.json` and an arbitrary unknown path are refused without disclosing existence
- [x] T064 [US5] Add `tests/integration/observability-reachability.test.ts`: `/internal/metrics` and `/internal/ready` answer `200` from inside the application network, and the route set registered by the API equals the edge allowlist, so a new controller route cannot silently become either public or unreachable (FR-008, SC-004)
- [x] T065 [US5] Add a Playwright smoke test through a running edge asserting the SPA renders at `/` with no CSP violation in the console

**Checkpoint**: all five user stories are independently functional; US5 can be verified against the
foundational edge without US1–US4.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T066 [P] Document the observability model and the security process in `README.md`, linking the contracts and the monitoring README
- [x] T067 [P] Update `infra/compose/README.md` with the `web` service, the monitoring network and the security scan override
- [x] T068 [P] Add `infra/docker/Dockerfile.web` to the path filters of `.github/workflows/docker.yml` and build the web image there
- [x] T069 [P] Set `VITE_BASE_PATH=/agenda-rennes/` and `VITE_API_BASE_URL` in `.github/workflows/pages.yml`, otherwise the same-origin default from T019 points the Pages build at the Pages host and the fallback silently breaks
- [x] T070 Run the full static gate declared in `package.json` (`pnpm typecheck`, `pnpm lint`, `pnpm check:dead`, `pnpm check:cycles`, `pnpm check:spell`, `pnpm check:licenses`) and fix every failure
- [x] T071 Run every scenario of `specs/009-release-hardening-observability/quickstart.md`; record security outcomes in `docs/security/pre-publication-checklist.md` and monitoring outcomes in `infra/monitoring/README.md`, including the two negative controls (unreachable API, absent metrics)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–7)**: all depend on Foundational; US1 and US2 are both P1 and can run in
  parallel by different people
- **Polish (Phase 8)**: depends on the stories you intend to ship

### Story Dependency Map

```text
Setup (T001-T003)
   │
Foundational (T004-T020)
   ├─► US1 (T021-T029)  security verdict        ─┐
   ├─► US2 (T030-T040)  visitor journey         ─┤
   ├─► US3 (T041-T047)  subscriptions            ─┼─► Polish (T066-T071)
   ├─► US4 (T048-T057)  existing monitor         ─┤
   └─► US5 (T058-T065)  closed surface          ─┘
```

- **US1** needs the edge from T018 and the scan override from T024; it never needs US2–US5
- **US2** needs the registry (T004–T007), the route template (T008) and the edge location (T018)
- **US3** needs the registry and `client-kind.ts` (T009); it is independent of US2 and US4
- **US4** consumes metric names only, so it can start as soon as T004–T014 land; dashboards that
  reference US2/US3 families are written after those families exist
- **US5** needs the edge, the extracted hook (T011) and the reachability harness (T064); it can
  run before US2–US4
- **T020** (the `e2e` job) must land before T040 and T065 can be verified in CI

### Within Each Story

Tests are written first and must fail before the implementation task beside them. Models and pure
modules precede wiring. Wiring precedes the integration or end-to-end check.

---

## Parallel Examples

### Setup

```text
T001 config interface  ‖ T002 schema and defaults  ‖ T003 environment documentation
```

### Foundational

```text
T004 histogram ‖ T008 route template ‖ T009 client kind ‖ T011 hook extraction
T015 Dockerfile.web ‖ T017 headers ‖ T019 web build ‖ T020 e2e job
```
then `T005` → `T006` → `T007`, and `T012` → `T013` after `T006`, `T008` and `T011`, and `T018`
after `T016` and `T017`.

### User Story 1

```text
T021 reference off ‖ T022 test ‖ T023 zap rules ‖ T026 findings register ‖ T027 checklist
```
then `T024` → `T025` → `T028` → `T029`.

### User Story 2

```text
T030 journey parser ‖ T035 visit ‖ T036 journey queue ‖ T037 send ‖ T038 emission composable
```
then `T031` → `T032` → `T033` → `T034` → `T039` → `T040`.

### User Story 3

```text
T041 calendar metrics ‖ T042 test ‖ T045 search metrics ‖ T046 coverage gauge
```
then `T043` → `T044` → `T047`.

### User Story 4

```text
T048 freshness by source ‖ T049 network ‖ T050 scrape ‖ T051 alerts ‖ T052 provisioning
T053 launch dashboard ‖ T054 operations dashboard
```
then `T055` → `T056` → `T057`.

### User Story 5

```text
T058 volume band ‖ T059 band test ‖ T061 edge contract test
```
then `T060` → `T062` → `T063` → `T064` → `T065`.

---

## Implementation Strategy

### MVP scope

**US1 alone** is the minimum shippable increment: it delivers the security verdict, the route
allowlist, the security headers and the removal of the default public API reference. Publishing
becomes defensible even if no telemetry ships.

**US1 + US2** is the recommended first release candidate: a defensible publication plus a readable
funnel.

### Incremental delivery

1. Setup + Foundational → the surface is hardened, the metric vocabulary exists, both test suites run
2. US1 → verdict available, publication unblocked
3. US2 → funnel visible on the raw exposition
4. US4 → the funnel becomes a dashboard in the existing monitor
5. US3 → subscriptions and renewals become measurable
6. US5 → the closed surface is proven automatically rather than by inspection

### Notes for implementers

- Never add a label value outside its declared enumeration; normalize to `other`, `none` or
  `indeterminate` instead (Constitution II and the invariants of data-model.md §6)
- Never record a query string, a territory identifier or a client address anywhere, including logs
- The 150-line ceiling applies: `metrics.ts` is split (T004–T006), the request hook is extracted
  (T011) and the web emission is extracted (T038) rather than grown in place
- A test that no runner collects is not a test: place contract tests for `infra/**` in
  `tests/integration/**`
- `pnpm check:spell` covers Markdown; add new technical terms to `.cspell/actionpop.txt` in the
  same change
