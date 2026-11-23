---
description: 'Task list for the Minimal Update Progress View feature'
---

# Tasks: Minimal Update Progress View

**Input**: Design documents from `/specs/011-update-progress-view/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/update-status.md](contracts/update-status.md),
[quickstart.md](quickstart.md)

**Tests**: Required. Constitution principle III ("every feature MUST include automated tests for
its business rules") makes tests mandatory, so each story carries its own test tasks. Write them
first and confirm they fail before implementing.

**Organization**: tasks are grouped by user story so each story is independently implementable
and testable. Story priority comes from [spec.md](spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4; setup, foundational and polish tasks carry no story label
- Every task names the exact file it touches

## Path Conventions

pnpm TypeScript monorepo, per [plan.md](plan.md) "Project Structure":
`packages/core/src/` (pure rules and Prisma readers), `apps/api/src/` + `apps/api/tests/`
(NestJS transport), `apps/web/src/` + `apps/web/tests/` (Vue presentation), `prisma/` (schema and
migrations), `tests/integration/` (PostgreSQL and edge proofs), `infra/edge/` (public allowlist).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the read model contract, the pure rules module and the index the aggregate needs

- [x] T001 Add `@@index([periodToken])` to the `IngestionLedger` model in `prisma/schema.prisma` and create `prisma/migrations/0010_update_progress_index/migration.sql` with `CREATE INDEX "ingestion_ledger_period_token_idx" ON "ingestion_ledger"("period_token");` — additive, no table and no column; verify with `pnpm prisma:validate`, `pnpm prisma:generate` and `pnpm prisma:migrate`
- [x] T002 [P] Create `packages/core/src/models/update-status.ts` with the contract types `UpdateState` (`updating` | `up_to_date` | `stale` | `partial` | `unknown`), `UpdateOutcome` (`complete` | `partial` | `failed`), `CurrentRun`, `CompletedRun`, `UpdateStatusAnswer`, plus the reader port `UpdateStatusReader { current(periodStartUtc: Date): Promise<CurrentRunReading | null>; settled(limit: number, beforePeriodStartUtc: Date, now: Date): Promise<readonly SettledRun[]> }`, and the internal types `CurrentRunCounts`, `CurrentRunReading { counts: CurrentRunCounts; completedAt: Date | null }` and `SettledRun { periodStartUtc: Date; completedAt: Date; counts: CurrentRunCounts }` — the port carries no `scopeId`, `jobId`, `periodToken` or error field
- [x] T003 [P] Create `packages/core/src/updates/update-status.ts` with the pure rules: status buckets (`processed = succeeded + stopped`, `failed = failed`, `remaining = scheduled + running + publishing + retrying` plus unknown statuses), the invariant `processed + failed + remaining = total`, outcome classification (`failed = 0` → complete; all terminal rows failed → failed; otherwise partial), duration clamped at 0, and the ordered state classifier from [research.md](research.md) R5
- [x] T004 [P] Add `packages/core/src/updates/update-status.test.ts` covering bucket mapping for every ledger status, the sum invariant, outcome classification and duration clamping at 0
- [x] T005 [P] Create `packages/core/src/persistence/postgres-update-status.ts` implementing `UpdateStatusReader`: `current` groups `ingestion_ledger` by `status` for one `period_token` (canonical `toISOString()`), mapping `succeeded`/`stopped`/`failed`/live statuses into a `CurrentRunReading` with the latest `updated_at`; `settled(limit, beforePeriodStartUtc, now)` reads the most recent `processing_period` rows strictly before `beforePeriodStartUtc`, groups ledgers by period and status, and returns at most `limit` settled runs newest first — explicit `select`/`groupBy` only, never `scope_id`, `job_id` or `last_error`
- [x] T006 [P] Export `models/update-status.js`, `updates/update-status.js` and `persistence/postgres-update-status.js` from `packages/core/src/index.ts`, with `pnpm --filter @actionpop/core typecheck` and `lint` green
- [x] T007 Add `tests/integration/update-status.test.ts` against `startIntegrationPostgres`: seed one current period with mixed statuses and five settled periods, and assert the current bucket counts, the sum invariant, newest-first settled order, and that the reader returns no internal identifier or error field
- [x] T008 [P] Add `packages/core/src/persistence/postgres-update-status.test.ts` asserting the row-mapping and bucket projection for a stubbed Prisma client, including an unknown status counted as `remaining`

**Checkpoint**: the index exists, the pure rules and the two aggregate reads are tested, and no API or web surface exists yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the answer builder shared by every story

**⚠️ CRITICAL**: no story can produce a stable payload until T009–T012 are complete

- [x] T009 Implement `buildUpdateStatus(input)` in `packages/core/src/updates/update-status.ts`: accepts `now`, `refreshIntervalSeconds`, optional current counts, settled runs, per-section availability flags, and returns `UpdateStatusAnswer` with `checkedAt`, `state`, `current`, `lastCompleted`, `history` and `available` — `history` is bounded to 5 and its first entry equals `lastCompleted`
- [x] T010 Extend `packages/core/src/updates/update-status.test.ts` with the builder's structural rules: `lastCompleted` selection (most recent settled run with a terminal row), the five-entry history bound, `history[0]` equal to `lastCompleted`, a settled period with no terminal row ignored, and availability flags honoured
- [x] T011 [P] Add `apps/api/src/controllers/update-status-answer-schema.ts` declaring the exact OpenAPI schema for `UpdateStatusAnswer`, including the three `available` booleans and no extra property
- [x] T012 [P] Add `apps/api/src/services/update-status.service.ts` skeleton with the 10-second successful-answer cache, `Cache-Control: public, max-age=15` success policy, `no-store` unknown policy, `Promise.allSettled` over the two reader reads, and internal `logger.warn` for failures — no error text in the answer

**Checkpoint**: `pnpm --filter @actionpop/core test` is green and every story can consume one stable answer builder.

---

## Phase 3: User Story 1 — Know whether the calendar is current (Priority: P1) 🎯 MVP

**Goal**: `GET /updates` reports the current refresh state, when the last refresh finished and
how old the data is; the public footer shows that freshness line.

**Independent Test**: with a settled successful cycle, the route answers `200` with
`state: "up_to_date"` and a populated `lastCompleted`; with no settled cycle it answers
`state: "unknown"` and `lastCompleted: null`; with a settled read failure it answers `200` and
`available.lastCompleted: false`.

### Tests for User Story 1

- [x] T013 [P] [US1] Extend `packages/core/src/updates/update-status.test.ts` with `up_to_date`, `stale` at the boundary (`age == interval` is not stale, `age > interval` is), never-updated (`state: unknown`, `lastCompleted: null`, `history: []`, `available.lastCompleted: true`) and a last run older than one interval, asserting the exact `checkedAt`, `refreshIntervalSeconds` and `lastCompleted` shape
- [x] T014 [P] [US1] Add `apps/api/tests/update-status.controller.test.ts` using `buildApp` with a stub `UpdateStatusReader`: `200` freshness answer, exact top-level keys, `Cache-Control: public, max-age=15`, and `200` with `available.lastCompleted: false` when the settled read rejects

### Implementation for User Story 1

- [x] T015 [US1] Create `apps/api/src/controllers/update-status.controller.ts` as a NestJS `@Controller('updates')` with `@Get()`, `@Header('Cache-Control', 'public, max-age=15')`, `@ApiTags('updates')`, `@ApiOperation`, `@ApiOkResponse({ schema: UPDATE_STATUS_ANSWER_SCHEMA })`, delegating to an injected `UPDATE_STATUS` service
- [x] T016 [US1] Implement the freshness path in `apps/api/src/services/update-status.service.ts`: compute the current period with `calculateProcessingPeriod(now, config.queue.dispatcherIntervalMs)` but query with `periodStartUtc.toISOString()`, call `settled(5, periodStartUtc, now)`, and build the answer with `lastCompleted` populated, `current: null`, `history: []`
- [x] T017 [US1] Register the surface in `apps/api/src/constants.ts` (`UPDATE_STATUS`), `apps/api/src/app.module.ts` (controller and provider only when `options.updateStatus` is present, like `GroupsController`), `apps/api/src/server.ts` (`ServerOptions.updateStatus`) and `apps/api/src/main.ts` (wire `new PostgresUpdateStatus(postgres)` and `config.queue.dispatcherIntervalMs`)
- [x] T018 [P] [US1] Add `UpdateStatusAnswer` and its nested types to `apps/web/src/types.ts` and `fetchUpdateStatus(signal?)` to `apps/web/src/shared/api/client.ts`, using `API_BASE_URL`, `accept: application/json` and the existing `ApiError`
- [x] T019 [P] [US1] Create `apps/web/src/features/updates/utils/update-status-format.ts` with French state labels, a relative-age helper ("à l'instant", "il y a N min", "il y a N h") and an absolute-time helper using `Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' })`; add `apps/web/tests/updates/update-status-format.test.ts` with a fixed `now`
- [x] T020 [US1] Create `apps/web/src/features/updates/composables/useUpdateStatus.ts`: fetch on mount, repeat every 30 seconds only while `document.visibilityState === 'visible'`, refresh immediately on visibility regain, abort in-flight requests on unmount, expose `refresh()`, and keep the last successful answer with a `stale` flag on a failed fetch; add `apps/web/tests/updates/use-update-status.test.ts` with `// @vitest-environment jsdom`, fake timers and a stubbed `visibilityState`
- [x] T021 [US1] Create `apps/web/src/features/updates/components/UpdateStatusIndicator.vue` as a `role="status"` line showing the state and the last-update age, with a labelled manual refresh button; mount it in the footer of `apps/web/src/shared/components/AppShell.vue`; add `/updates` to the dev proxy in `apps/web/vite.config.ts`
- [x] T022 [P] [US1] Add `apps/web/tests/updates/update-status-indicator.test.ts` with `// @vitest-environment jsdom`: `up_to_date`, `stale`, `unknown` and never-updated wording, the refresh button calling `fetchUpdateStatus` again, and the line still readable when the last fetch failed
- [x] T023 [US1] Add exact `location = /updates { limit_except GET HEAD { deny all; } error_page 403 = @read_method_not_allowed; proxy_pass http://api_upstream; }` to `infra/edge/snippets/routes.conf` and add `= /updates` to the expected list in `tests/integration/edge-surface.test.ts`
- [x] T024 [P] [US1] Add `apps/web/tests/update-status.spec.ts` (Playwright) intercepting `**/updates` and asserting the visible freshness line, the `Europe/Paris` time and the manual refresh without a page reload

**Checkpoint**: `curl http://127.0.0.1:3000/updates` answers the freshness payload, the footer shows it, and User Story 1 is demonstrable without live progress or history.

---

## Phase 4: User Story 2 — Never learn more than freshness (Priority: P1)

**Goal**: the public route and component expose aggregate state, counts and times only — no
identifier, failure reason, group or event name, queue or infrastructure detail.

**Independent Test**: inspect every object in the response and the rendered component with a
payload deliberately carrying extra internal keys; none of those keys or values appears.

### Tests for User Story 2

- [x] T025 [P] [US2] Extend `apps/api/tests/update-status.controller.test.ts` with an exact nested key-set assertion for `current` and `lastCompleted` when present, plus a recursive scan proving the serialized body contains no `scopeId`, `jobId`, `periodToken`, `lastError`, `error`, `displayName`, `communeId`, `countryCode`, `queue`, `workerId` or `host` (the `history` entry key set is asserted in T040)
- [x] T026 [P] [US2] Add a test in `apps/web/tests/updates/update-status-indicator.test.ts` mounting the component with a payload containing extra internal fields and asserting they are never rendered
- [x] T027 [P] [US2] Extend `tests/integration/edge-surface.test.ts` to assert against [contracts/update-status.md](contracts/update-status.md) and `specs/contracts/http/observability.md`, checking `/updates` is present exactly once with `limit_except GET HEAD` and that `/internal`, `/reference` and `/openapi.json` stay unrouted; T046 later switches the assertion to the canonical `specs/contracts/http/updates.md`

### Implementation for User Story 2

- [x] T028 [US2] Harden `packages/core/src/persistence/postgres-update-status.ts` so every query selects only `period_token`, `status` and `updated_at` aggregates; assert in code review and tests that no row mapping can carry `scope_id`, `job_id` or `last_error`
- [x] T029 [US2] Harden `apps/api/src/services/update-status.service.ts` and the controller: catch reader failures, log them internally with the route's logger only, return the `unknown`/`available: false` shape, and never serialize an exception message, stack or driver detail
- [x] T030 [US2] Ensure `UpdateStatusIndicator.vue` renders only named fields from `UpdateStatusAnswer` and never iterates the raw payload, so an unexpected extra field cannot reach the DOM
- [x] T031 [P] [US2] Update `specs/contracts/http/observability.md` with the `/updates` allowlist row and the privacy note, keeping the closed-by-default principle

**Checkpoint**: User Stories 1 and 2 both hold; the route is publishable to anonymous visitors.

---

## Phase 5: User Story 3 — Follow a running refresh (Priority: P2)

**Goal**: while a refresh runs, the route and indicator show processed, remaining and failed
counts that add up, plus a "taking longer than usual" flag.

**Independent Test**: seed a current period with mixed live and terminal rows; the route reports
`state: "updating"` with `processed + failed + remaining = total`, and a start older than one
interval sets `takingLongerThanUsual: true`.

### Tests for User Story 3

- [x] T032 [P] [US3] Extend `packages/core/src/updates/update-status.test.ts` with the current-run arithmetic invariant, `updating` only while `remaining > 0`, a current period abandoned past `LEDGER_GRACE_MS` not reported as updating, and `takingLongerThanUsual` before/at/after one interval
- [x] T033 [P] [US3] Extend `apps/api/tests/update-status.controller.test.ts` with an `updating` payload and with `available.current: false` when only the current-period read fails (state derives from the settled read)
- [x] T034 [P] [US3] Extend `tests/integration/update-status.test.ts` with a current period holding `scheduled`, `running`, `succeeded`, `failed` and `stopped` rows, asserting the exact bucket counts and `total`

### Implementation for User Story 3

- [x] T035 [US3] Populate `current` in `apps/api/src/services/update-status.service.ts` from `reader.current(periodStartUtc)` through the core builder, including `startedAt`, the three counts, `total` and `takingLongerThanUsual`
- [x] T036 [US3] Extend `UpdateStatusIndicator.vue` with the live progress line (`processed` of `total`, `remaining`, and a neutral failed figure only when above zero), keeping at most three primary figures and `aria-live="polite"`
- [x] T037 [P] [US3] Extend `apps/web/tests/updates/update-status-indicator.test.ts` with the updating line, the long-running wording, the zero-failure omission and the accessibility region
- [x] T038 [P] [US3] Extend `apps/web/tests/update-status.spec.ts` with an intercepted `updating` response asserting the progress line and its update after a manual refresh

**Checkpoint**: User Stories 1–3 work independently; a live cycle is visible and coherent.

---

## Phase 6: User Story 4 — See recent update reliability (Priority: P2)

**Goal**: the indicator exposes a collapsed history of the five most recent settled runs with
completion time, duration and outcome.

**Independent Test**: seed seven settled runs with complete, partial and failed outcomes; the route
returns five newest first, `history[0]` equals `lastCompleted`, and the disclosure lists exactly
those five.

### Tests for User Story 4

- [x] T039 [P] [US4] Extend `packages/core/src/updates/update-status.test.ts` with history newest-first order, the five-entry bound, `history[0] === lastCompleted`, exclusion of the current period, and empty history when nothing settled
- [x] T040 [P] [US4] Extend `apps/api/tests/update-status.controller.test.ts` with a bounded ordered history and `available.history: false` when the settled read fails
- [x] T041 [P] [US4] Extend `tests/integration/update-status.test.ts` with seven settled periods and mixed outcomes, asserting the returned five, their order and their outcomes

### Implementation for User Story 4

- [x] T042 [US4] Populate `history` in `apps/api/src/services/update-status.service.ts` from the settled runs through the core builder, capped at 5 and newest first, with `history[0]` equal to `lastCompleted`
- [x] T043 [US4] Extend `UpdateStatusIndicator.vue` with a native `<details><summary>Derniers cycles</summary>` list, collapsed by default, showing at most five entries with `Europe/Paris` time, outcome label and duration, and a plain empty state
- [x] T044 [P] [US4] Extend `apps/web/tests/updates/update-status-indicator.test.ts` with the collapsed default, the five-entry bound, complete/partial/failed labels and the empty state without failure placeholders
- [x] T045 [P] [US4] Extend `apps/web/tests/update-status.spec.ts` with the collapsed history assertion and the five-entry bound

**Checkpoint**: all four stories are independently functional and the full public payload is delivered.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: normative documentation, release evidence and full validation

- [x] T046 [P] Create the canonical `specs/contracts/http/updates.md` from [contracts/update-status.md](contracts/update-status.md), add its row to `specs/contracts/README.md`, and point the feature contract at it
- [x] T047 [P] Update `README.md` (public routes), `infra/edge/README.md` (verification example) and `specs/root.md` (feature status and artifact matrix)
- [x] T048 [P] Add any new domain word to `.cspell.json` and confirm `pnpm check:spell` reports no issue on `specs/011-update-progress-view/**`, `specs/contracts/http/updates.md` and the touched source files
- [x] T049 Run every scenario in [quickstart.md](quickstart.md): migration, unit and integration suites, the `curl` states (`up_to_date`, `updating`, `unknown`), the stopped-PostgreSQL degradation and the web footer checks
- [x] T050 Run the full quality gates for every touched workspace unit: `pnpm typecheck`, `pnpm lint`, `pnpm check:dead`, `pnpm check:cycles`, `pnpm --filter @actionpop/core test`, `pnpm --filter @actionpop/api test`, `pnpm --filter @actionpop/web test`, `pnpm test:integration`, `pnpm exec playwright test apps/web/tests/update-status.spec.ts` and `pnpm build`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependency; T001, T005 and T007 depend on one another as marked
- **Foundational (Phase 2)**: depends on Setup; T009–T012 block every story
- **User Stories (Phases 3–6)**: all depend on Foundational
  - US1 and US2 are both P1 and ship together: US2 hardens the surface US1 creates
  - US3 and US4 depend on US1's route and component; they add fields to the same files
- **Polish (Phase 7)**: depends on all desired stories

### User Story Dependencies

- **US1 (P1)**: independent after Foundational — the MVP
- **US2 (P1)**: depends on US1's route and component; ships in the same release
- **US3 (P2)**: depends on US1; adds `current` to the service and component
- **US4 (P2)**: depends on US1; adds `history` to the service and component. US3 and US4 touch
  different payload sections but the same two files, so run them sequentially unless coordinated.

### Within Each User Story

- Tests are written first and must fail before the implementation task
- Pure rules before the service, service before the route, route before the component
- A story is demonstrable at its checkpoint before the next one starts

### Parallel Opportunities

- Setup: T002, T003, T004, T005, T006 and T008 touch different files; T001 precedes T005/T007
- Foundational: T011 and T012 are independent files
- US1 tests T013 and T014 are independent; T018/T019 and T022/T024 are independent
- US2 tests T025, T026, T027 and documentation T031 are independent
- US3 tests T032, T033, T034 and UI tests T037/T038 are independent
- US4 tests T039, T040, T041 and UI tests T044/T045 are independent
- Polish: T046, T047 and T048 are independent

---

## Parallel Example: User Story 1

```bash
# Tests first, in parallel (different files):
Task: "Extend packages/core/src/updates/update-status.test.ts with freshness states"
Task: "Add apps/api/tests/update-status.controller.test.ts with the freshness contract"

# Independent client and formatter work:
Task: "Add fetchUpdateStatus to apps/web/src/shared/api/client.ts"
Task: "Create apps/web/src/features/updates/utils/update-status-format.ts with its test"
```

## Parallel Example: User Story 4

```bash
# All US4 proofs touch different files:
Task: "Extend packages/core/src/updates/update-status.test.ts with history order and bound"
Task: "Extend apps/api/tests/update-status.controller.test.ts with the bounded history"
Task: "Extend tests/integration/update-status.test.ts with seven settled periods"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 — public freshness route and footer line
4. Complete Phase 4: US2 — privacy hardening (required by the P1 security story)
5. **STOP and VALIDATE**: run [quickstart.md](quickstart.md) §1–§4 and the edge test
6. Deploy/demo the freshness indicator

### Incremental Delivery

1. Setup + Foundational → data layer and rules proven
2. US1 + US2 → public freshness, safe to publish (MVP)
3. US3 → live progress during a cycle
4. US4 → recent reliability history
5. Polish → canonical contract, docs and full gates

---

## Notes

- [P] tasks touch different files and can start together
- [Story] labels map tasks to the spec's user stories for traceability
- Never expose `scopeId`, `jobId`, `periodToken`, `lastError` or any name in the public payload;
  the exact key-set test is the gate
- Keep business modules under 150 lines; if `update-status.ts` grows, split the bucket mapping
  from the state classifier rather than compressing control flow
- Commit after each task or logical group; stop at each checkpoint to validate independently

---

## Phase 8: Convergence — Dedicated update page with a visualization

**Purpose**: honour the user's preference for a dedicated page with a small visualization, while
keeping the existing aggregate-only API contract. The existing 50 tasks remain valid; this phase
only adds the UI disposition chosen after implementation.

- [x] T051 Amend `specs/011-update-progress-view/spec.md` (FR-012, Assumptions) and `specs/011-update-progress-view/plan.md` + `research.md` R8/R10 to replace "single compact surface, no navigation, no charts" with a dedicated `/etat` page, a small progress visualization and a footer link, keeping the public aggregate-only privacy boundary, per user request / FR-012 (contradicts)
- [x] T052 Create `apps/web/src/features/updates/components/UpdateStatusPage.vue` rendering the full public status on a dedicated view — state and freshness, current-run counts, last completed run and the five-cycle history — reusing `useUpdateStatus` and the existing formatters, with the unknown/unavailable states preserved, per user request / US1/AC1 (missing)
- [x] T053 Create `apps/web/src/features/updates/components/UpdateProgressVisual.vue` with one accessible progress bar for the current run (`role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=total`, `aria-valuenow=processed+failed`, text alternative) and a compact five-bar or five-dot strip for recent outcomes, CSS-only with existing design tokens and no new dependency, per user request / US2/AC1 (missing)
- [x] T054 Detect `/etat` and `/etat/` in `apps/web/src/main.ts` or a small `apps/web/src/shared/composables/usePathRoute.ts`, render `UpdateStatusPage` there and the existing discovery/calendar experience elsewhere; add an exact `location = /etat` (and `/etat/` prefix) to `infra/edge/snippets/routes.conf` proxying to `web_upstream`; turn the footer `UpdateStatusIndicator` into a link to the page; extend the declared allowlist in `tests/integration/edge-surface.test.ts`, per user request / plan "Source Code" (missing)
- [x] T055 Add `apps/web/tests/updates/update-status-page.test.ts` for up-to-date, updating, stale, partial, unknown and never-updated states plus the progressbar ARIA values and five-cycle bound; extend `apps/web/tests/update-status.spec.ts` to visit `/etat` and assert the visual and link; update `apps/web/tests/updates/update-status-indicator.test.ts` for the new footer link, per US1–US4 / SC-002 (partial)
- [x] T056 Describe the `/etat` page and visualization in `README.md`, `apps/web/README.md` and `specs/011-update-progress-view/quickstart.md`, and add the page to the manual validation steps in `specs/011-update-progress-view/quickstart.md` §5, per quickstart / README (partial)
