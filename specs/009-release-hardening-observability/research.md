# Phase 0 Research: Release Hardening and Observability

All Technical Context items are resolved below. No `NEEDS CLARIFICATION` remains.

## R1 — Metrics implementation: extend the in-house registry

**Decision**: Extend `MetricsRegistry` in `packages/core/src/operations/metrics.ts` with
histogram support and a Prometheus text exposition carrying `# TYPE` and `# HELP`. No metrics
library is added.

**Rationale**: the registry is already the single injection point for both the API
(`apps/api/src/server.ts`, `apps/api/src/internal/internal.controller.ts`) and the worker
(`apps/worker/src/main.ts`). It is small, unit-tested, dependency-free, and its label
normalization (`allowedLabels` → `other`) is exactly the cardinality guard FR-016 and FR-022
require. A third-party registry would run in parallel with it, duplicating names and formats.

**Alternatives considered**:
- `prom-client`: mature, but adds a runtime dependency, a second registry, and a second
  exposition path; the worker and API would need to be migrated to avoid two sources of truth.
- Client-side summaries for latency: not aggregatable across instances (FR-029) and unbounded in
  memory, which contradicts the cardinality constraints.

**Consequences**: `actionpop_http_request_duration_seconds` changes from an accumulated counter
(cumulative seconds) to a histogram. Nothing scrapes it today — `infra/monitoring/` is not a
working configuration — so the change costs nothing and is recorded in
`contracts/metrics-exposition.md`.

## R2 — Histogram mechanics

**Decision**: fixed bucket boundaries, monotonic `_bucket` series with an implicit `+Inf`, plus
`_sum` and `_count`. No client-side `_quantile` series. Quantiles are computed by Prometheus via
`histogram_quantile`.

**Rationale**: client-side quantiles cannot be aggregated across instances (two instances at
cutover, FR-029) and their accuracy is not bounded. Prometheus computes quantiles from buckets at
query time, which keeps the exposition small and exact enough for launch review.

**Bucket set for request duration (seconds)**: `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`.
Rationale: a healthy calendar read is 10–150 ms; the tail matters up to 10 s, where a visitor
notices. Eleven buckets × ≤10 route templates × 3 methods ≈ 330 series worst case.

**Alternatives considered**: exponential/derived buckets (harder to reason about), one bucket for
"slow" (loses the p95/p99 distinction SC-005 needs).

## R3 — Route label must be a template, not a URL

**Decision**: normalize every request URL to a bounded template before using it as a label value:
`/calendar.ics`, `/events`, `/search/subjects`, `/feed/:scopeId`, `/telemetry/journey`,
`/internal/metrics`, `/internal/live`, `/internal/ready`, `/openapi.json`, `/other`.

**Rationale**: the current `onResponse` hook logs `${request.method} ${request.url}`, which
contains query strings (search terms, territory identifiers). Using that as a metric label would
violate FR-016/FR-022 and break cardinality. Templates keep series bounded and reveal nothing
about what a visitor searched for.

**Alternatives considered**: hashing the URL (still unbounded), recording only the first path
segment (ambiguity between `/feed/:scopeId` instances is acceptable, but `/search/subjects` and
`/search/other` would collapse — harmless, yet a table is clearer and testable).

## R4 — Client classification

**Decision**: classify by signature patterns into `agenda`, `browser`, `automated`,
`indeterminate`. Anything unmatched — including a missing signature — is `indeterminate`.

**Rationale**: FR-021 requires the three families and the spec clarification requires a fourth
visible class so the classes always sum to the total. Guessing would silently distort
subscription counts, which is the number the launch review depends on.

**Alternatives considered**: defaulting unknown to `browser` (inflates visitors), defaulting to
`automated` (hides real visitors), no classification (loses FR-019/FR-021 entirely).

## R5 — Client volume band

**Decision**: an in-memory map keyed by `HMAC-SHA256(salt_of_the_day, clientIp + userAgent)`.
Each key holds a request count and a window start. The salt is derived from
`OBSERVABILITY_BAND_SALT` plus the current date in `Europe/Paris`, so the key space is re-created
daily. The map is capped (10 000 entries, FIFO eviction). Only the band is exported as a counter
label: `low`, `moderate`, `high`, `very_high`, `extreme`.

**Rationale**: FR-012 asks for per-client volume; FR-016/FR-017 forbid singularizing a visitor.
The daily rotation bounds identifiability to one day, the in-memory-only rule means nothing is
persisted, and exporting only a band keeps the label set to five values.

**Alternatives considered**: a plain IP key (identifying and unbounded), a durable table (violates
"no stored visitor records"), no band at all (loses the abuse signal that justifies a future
limit). Rate limiting itself stays out of scope by decision.

**Band thresholds (requests per day per client)**: 1–19 `low`, 20–99 `moderate`, 100–499 `high`,
500–1999 `very_high`, 2000+ `extreme`.

## R6 — Journey telemetry transport

**Decision**: the SPA posts to `POST /telemetry/journey` on its own origin, routed by the edge to
the API. Payloads are batched, capped at 2 KB, `application/json` only, and sent with
`navigator.sendBeacon` when the page may be unloading (export, subscribe) and with `fetch`
`keepalive` otherwise. Nothing is retried on failure.

**Rationale**: the SPA is served by the application's own edge after this feature, so same-origin
removes CORS entirely and removes the need for a second collector service. Dropping retries
guarantees FR-018 (reporting never delays or retries into the visitor's path) and makes the
"blocked telemetry" edge case observable as a shortfall rather than hidden.

**Alternatives considered**: a separate collector (extra service, extra surface),
`navigator.sendBeacon` only (no control over content type on all browsers), a Server-Sent
Events stream (overkill for eleven counters).

## R7 — Client visit lifetime

**Decision**: `sessionStorage` holds an opaque visit marker and a last-activity timestamp. A visit
ends after 30 minutes without activity. Multiple tabs share the marker, so opening a second tab
does not create a second visit, and closing one tab does not end the visit.

**Rationale**: 30 minutes is the industry convention and matches a realistic event-search session;
an unbounded visit (tab left open all day) would make SC-005 unreadable. The marker never leaves
the browser, so no consent banner is required by the project's own reading of the rule.

**Alternatives considered**: `localStorage` (survives across days, inflates), a server-side
session cookie (persisted visitor identity, rejected by the spec's out-of-scope list).

## R8 — Edge allowlist and static delivery

**Decision**: serve the built SPA from a `web` container (nginx) behind the edge at `/`, proxy the
API paths explicitly, and answer `404` for every other path. Headers live in one shared snippet
included by both the HTTPS server and the plain-HTTP scan server.

**Rationale**: GitHub Pages cannot set HTTP headers, so FR-009/FR-010 (CSP, HSTS,
frame-ancestors) are impossible there. A shared snippet means the CI scan tests exactly the
headers production serves — otherwise the scan would validate a configuration that is not
deployed.

**Alternatives considered**: `meta` CSP tags on Pages (no HSTS, no frame-ancestors), an external
CDN configuration (out of the project's deployment model).

**Base path**: `vite.config.ts` reads `VITE_BASE_PATH` (default `/`). `pages.yml` keeps
`/agenda-rennes/`, so the static fallback keeps working during the transition, as the spec
assumes.

## R9 — Exploitation scanning in CI

**Decision**: an OWASP ZAP baseline scan against the edge served over plain HTTP on
`127.0.0.1:8080`, started by a dedicated Compose override
(`infra/compose/docker-compose.security.yml` + `infra/edge/http-scan.conf`). The job fails on a
high-severity alert, and the full report is uploaded as an artifact on every outcome.

**Rationale**: FR-002 requires scanning a real, started deployment, and FR-003 requires the run
to fail on high severity. Scanning the edge (rather than the API container directly) tests the
published surface including headers, which is where the hardening lives. Plain HTTP avoids
generating certificates in CI while keeping the same header snippet.

**Alternatives considered**: scanning the API container (misses the edge, which is the new
surface), scanning a deployed staging host (needs credentials and a second environment), full
DAST with authentication (the surface is unauthenticated, so baseline is the right depth).

**Noise control**: `.zap/rules.tsv` tunes known-benign rules; anything accepted is recorded in
`docs/security/findings.md` with its reason and revisit trigger (FR-004).

## R10 — Monitoring stack integration

**Decision**: the API, worker, web and edge join an external Docker network named by
`MONITORING_NETWORK` (default `monitoring`), owned by the existing Compose project. Prometheus
scrapes `api:3000/internal/metrics` and `worker:8081/metrics` directly. Nothing is published on
the host.

**Rationale**: FR-030/FR-031 require reachability by the existing monitor and no public exposure.
An external network achieves both without changing either stack's Compose project ownership.
Publishing a host port would expose usage data on every interface unless carefully bound, and
would break if the monitor moves to another host.

**Alternatives considered**: publishing `127.0.0.1:9464` (works, but leaks if ever bound to
`0.0.0.0`, and couples the monitor to host networking), a scrape proxy (another moving part).

**Instance identity (FR-029)**: `actionpop_build_info{deployment="...",version="..."} 1`, where
`deployment` comes from `OBSERVABILITY_DEPLOYMENT` (default: hostname). The label is named
`deployment`, not `instance`, because Prometheus attaches its own `instance` label from the scrape
target and a collision would force `honor_labels` tuning.

## R11 — Dashboard and alert packaging

**Decision**: a mount-ready directory — `prometheus/scrape-snippet.yml`,
`prometheus/alert-rules.yml`, `grafana/provisioning/{datasources,dashboards}`, and two dashboard
JSON files (Grafana schema 39, stable `uid`, `${DS_PROMETHEUS}` datasource) — plus a README with
the installation steps.

**Rationale**: FR-032/FR-033 require a package that needs no hand-editing, and the operator's
Grafana is already provisioned from files. Two dashboards keep each readable: one answers the
launch questions (SC-005), the other serves operations (latency percentiles, queue, freshness,
rejections).

**Gap-vs-zero rule (FR-035)**: every panel expression is wrapped so an absent series renders as
`0` for traffic panels, while health panels use `absent(...)` so a missing target is explicit.
The two must not be confused, so health panels are visually grouped and titled as such.

**Drift guard**: a unit test parses every dashboard JSON and alert rule and asserts each metric
name referenced exists in `contracts/metrics-exposition.md`.

**Alternatives considered**: importing dashboards by hand through the UI (violates "no manual
step"), a single mega-dashboard (unreadable at launch-review time).
