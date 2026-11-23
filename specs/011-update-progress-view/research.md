# Research: Minimal Update Progress View

**Feature**: [Minimal Update Progress View](spec.md) · **Date**: 2026-11-23

All technical unknowns from the plan's Technical Context are resolved below. No
`NEEDS CLARIFICATION` remains.

## R1 — Where the progress data comes from

- **Decision**: derive everything from the worker's existing persistence —
  `processing_period` and `ingestion_ledger` — read through PostgreSQL in the API. The worker is
  not modified.
- **Rationale**: the ledger already records one row per scheduled scope and period with the
  statuses `scheduled`, `running`, `publishing`, `retrying`, `succeeded`, `failed` and `stopped`,
  plus `updated_at`. That is precisely the material needed to compute processed, failed and
  remaining work. Adding a new snapshot table or a worker-side progress publisher would create a
  second source of truth that can disagree with the queue.
- **Alternatives considered**:
  - _Prometheus gauges_: designed for trends and scraping, not for per-request public reads; the
    API would have to scrape itself, and the values are not historical.
  - _A dedicated `update_progress` table written by the worker_: duplicates ledger state, adds a
    write to every job, and can drift after a crash. Rejected.
  - _Reading BullMQ queue counts_: leaks queue topology, cannot distinguish scope kinds, and
    Redis is declared BullMQ-only. Rejected by the public privacy constraint.

## R2 — Period identity and query token

- **Decision**: compute the current period with the shared
  `calculateProcessingPeriod(now, config.queue.dispatcherIntervalMs)` helper and query
  `ingestion_ledger.period_token` with `periodStartUtc.toISOString()`, the canonical form the
  ledger writer stores.
- **Rationale**: `calculateProcessingPeriod` returns a compact token (`20261123T211500Z`) in
  `periodToken`, while `PostgresIngestionLedgerStore` and `PostgresCycleMetrics` persist
  `periodStartUtc.toISOString()`. Querying with the compact form silently returns nothing. The
  API already loads the full root configuration, so `queue.dispatcherIntervalMs` is available and
  cannot drift from the worker's cadence.
- **Alternatives considered**: re-deriving the interval from the latest period (fragile at
  startup), or hard-coding 15 minutes (loses a documented deployment setting).

## R3 — Progress arithmetic

- **Decision**: `processed = succeeded + stopped`, `failed = failed`, and
  `remaining = scheduled + running + publishing + retrying`; `total = processed + failed +
remaining`. The invariant is asserted in tests.
- **Rationale**: `stopped` is a terminal, non-error outcome (the upstream group is unknown and
  the scope is retired), so it must count as work done. `retrying` is still outstanding work.
  The sum makes the displayed figures add up, which the spec requires.
- **Alternatives considered**: excluding `stopped` (progress would never reach 100% on a cycle
  containing a retired scope); treating `retrying` as failed (a transient retry would look like a
  defect on a public page).

## R4 — Settled, current and abandoned periods

- **Decision**: the current period is the one containing `now`. A non-current period is
  **settled** when it has no live ledger row or when its start is older than
  `LEDGER_GRACE_MS` (1 hour, the existing constant). The history reads the five most recent
  settled periods before the current one. The last completed run is the most recent settled
  period holding at least one terminal row.
- **Rationale**: a crashed worker can leave a live row forever. Without a grace rule the history
  would freeze at the crash, and the page would claim an update has been running for days. The
  existing one-hour grace is already the project's definition of an abandoned ledger row, so the
  public read reuses it instead of inventing a second rule.
- **Alternatives considered**: a new 30-minute threshold (duplicates a project rule); hiding
  unresolved periods (a crash becomes invisible); treating any live row as current (stuck display).

## R5 — Outcome and state classification

- **Decision**: a period's outcome is `complete` when it has no failed rows, `failed` when every
  processed-or-failed row failed, and `partial` otherwise. Overall state, in priority order:
  `updating` (current period has remaining work and is not abandoned), `unknown` (the last
  completed read is unavailable or no run has ever completed), `partial` (last outcome is not
  `complete`), `stale` (age of last completion exceeds one refresh interval), `up_to_date`.
- **Rationale**: these map one-to-one onto the five visitor-facing states in the spec and keep a
  single authoritative ordering. A running update is more informative than a stale last run, and
  an unreadable source never masquerades as healthy.
- **Alternatives considered**: exposing the raw ledger status (internal vocabulary); adding a
  sixth "never updated" state (the spec fixed five; `unknown` plus `lastCompleted: null` carries
  the distinction without leaking availability semantics).

## R6 — Public payload and privacy boundary

- **Decision**: `GET /updates` returns only `checkedAt`, `refreshIntervalSeconds`, `state`,
  `current`, `lastCompleted`, `history` and per-section `available` flags. Absent:
  `scope_id`, `job_id`, `period_token`, `last_error`, display names, geo identifiers, queue
  names, worker identifiers and infrastructure status. A failed row reason is never serialized.
- **Rationale**: aggregate counts support the freshness promise without giving an anonymous
  visitor a list of targets or a diagnostic handle. The spec's P1 security story makes this a
  hard boundary, so the reader port itself returns a type that cannot carry those fields.
- **Alternatives considered**: reusing the operator report (contains `scopeId`, error reasons and
  per-kind counters); proxying `/internal/metrics` (private by design and exposes infrastructure).

## R7 — Caching and load

- **Decision**: a bounded in-process cache with a 10-second lifetime for successful answers, and
  `Cache-Control: public, max-age=15` on the response. Unknown answers are not cached and are
  sent with `Cache-Control: no-store`.
- **Rationale**: visitors poll every 30 seconds; without a cache each tab costs two aggregate
  queries. Ten seconds keeps the display within the 30-second visibility requirement while
  reducing database work by roughly an order of magnitude at any realistic concurrency. Unknown
  answers are cheap and must not stay sticky.
- **Alternatives considered**: no cache (traffic-proportional database load); edge caching (nginx
  does not cache proxy responses in this deployment); a longer TTL (breaks SC-003 when many tabs
  poll at staggered offsets); Redis cache (adds a failure mode and Redis is BullMQ-only).

## R8 — Web integration and refresh

- **Decision**: expose the status on a dedicated `/etat` page (plus a `#/etat` fallback for
  static hosting), reached from a compact footer link in `AppShell`. The page polls every 30
  seconds only while `document.visibilityState === 'visible'`, refreshes immediately when the tab
  becomes visible again, aborts in-flight requests on unmount, and offers a manual refresh. It
  keeps the last known answer on a network failure and marks it as no longer refreshing.
- **Rationale**: a dedicated page gives the visualization room without competing with the
  calendar, while the footer link keeps the status discoverable from every screen. Visibility-aware
  polling satisfies the spec's "while visible" rule without a websocket or a server push. Keeping
  the last answer avoids a blank spot on a transient error while the timestamp still tells the
  truth.
- **Alternatives considered**: a footer-only line (too little room for a visualization); a header
  badge (competes with navigation and dark-mode control); websockets/SSE (new surface and
  infrastructure for a 30-second freshness target).

## R9 — Time display

- **Decision**: the API returns ISO-8601 UTC instants; the web formats them with
  `Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' })` for absolute time and a small
  relative-age helper for "il y a N min". Both are pure functions tested with a fixed `now`.
- **Rationale**: the project's canonical timezone is `Europe/Paris`, and formatting belongs on
  the client so the payload stays locale-free and cacheable. A pure helper avoids flaky tests
  around the current clock.
- **Alternatives considered**: server-side formatted strings (not cacheable per locale and harder
  to assert); browser-local timezone (violates the constitution's canonical timezone).

## R10 — Accessibility and minimalism

- **Decision**: the status line is a `role="status"` region with `aria-live="polite"`; the
  history is a native `<details>/<summary>`; the manual refresh is a labelled button; the
  component uses existing design tokens and no animation beyond the existing surface styles.
  Three primary figures at most, and the history is collapsed by default.
- **Rationale**: assistive technology announces status changes without stealing focus, the native
  disclosure is keyboard-accessible for free, and the progressbar plus five-cycle strip stay
  small enough for a single screen.
- **Alternatives considered**: a custom dropdown (more code, more accessibility risk); a chart
  library (new dependency for a five-value strip).

## R11 — Publication at the edge

- **Decision**: add an exact `location = /updates` to the existing routing table with
  `limit_except GET HEAD`, exactly like `/events` and `/groups`; extend the edge-surface
  integration test's expected allowlist.
- **Rationale**: the edge is closed by default, so a public read is only public because the
  routing table says so. Reusing the read-route pattern keeps method rejection and headers
  consistent.
- **Alternatives considered**: a wildcard prefix (would also expose future `/updates/...` paths
  unintentionally); relying on the API route alone (the edge would answer 404).

## R12 — Testing strategy

- **Decision**: pure rules in `packages/core`; reader mapping in a focused core test; seeded
  PostgreSQL aggregates in `tests/integration`; HTTP shape, cache header and unknown degradation
  in `apps/api/tests`; formatter, polling and component states with Vitest; one Playwright
  scenario that intercepts `/updates` and asserts the visible freshness line and history bound;
  the existing edge test proves the allowlist.
- **Rationale**: each boundary is proven where it lives, matching the constitution's independent
  testability rule. The Playwright scenario covers the real rendering path without a seeded
  database, consistent with the existing suite.
- **Alternatives considered**: only end-to-end tests (slow, poor failure localisation); only unit
  tests (no proof of the SQL or the public shape).

## R13 — Explicit per-kind progress

- **Decision**: every run carries `groups` and `events` `n/total` figures. `groups` counts
  group-kind ledger rows for the period. `events` counts distinct events whose latest observation
  belongs to the period, out of every distinct event ever observed.
- **Rationale**: the visitor asked for "n/total groupes mis à jour" and "n/total événements
  considérés à jour". A single aggregate cannot answer either question, and event-detail scopes
  are a small subset of events, so they cannot stand in for event coverage. The observation table
  already records the period of the latest look at each event.
- **Alternatives considered**: counting event-detail ledger scopes (only 6 in the live sample,
  not the published events); counting `event_record.last_seen_period` (all null in the live
  sample); a new coverage table (duplicates data the observation already records).
