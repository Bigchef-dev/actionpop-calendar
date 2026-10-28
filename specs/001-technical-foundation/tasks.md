---
description: "Task list for the Technical Foundation feature"
---

# Tasks: Technical Foundation

**Input**: Design documents from `specs/001-technical-foundation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and the repository constitution.

**Organization**: Tasks are grouped by user story so each increment can be implemented and validated independently after the shared foundation is complete.

**Test policy**: Tests are included because the specification requires automated tests, the constitution requires test-first quality, and `quickstart.md` defines unit, contract, integration, failure-path, persistence, and capacity scenarios.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the pnpm TypeScript monorepo and reproducible developer commands.

- [X] T001 Create the pnpm workspace manifests for `packages/core`, `apps/api`, and `apps/worker` in `pnpm-workspace.yaml`, `package.json`, `packages/core/package.json`, `apps/api/package.json`, and `apps/worker/package.json`, using Node.js 20+ LTS and `workspace:` dependencies.
- [X] T002 [P] Create the shared strict TypeScript project-reference configuration in `tsconfig.json`, `tsconfig.base.json`, `packages/core/tsconfig.json`, `apps/api/tsconfig.json`, and `apps/worker/tsconfig.json` with ESM NodeNext module resolution and compiled `dist/` output.
- [X] T003 [P] Configure package-local Vitest projects and shared test conventions in `vitest.config.ts`, `packages/core/vitest.config.ts`, `apps/api/vitest.config.ts`, and `apps/worker/vitest.config.ts`.
- [X] T004 [P] Configure ESLint and formatting for strict TypeScript source and tests in `eslint.config.js` and `.prettierrc.json`.
- [X] T005 [P] Add the repository quality scripts for install, type checking, unit tests, integration tests, linting, and build validation in `package.json` and each workspace package manifest.
- [X] T006 [P] Add the initial source and test directory entry points in `packages/core/src/index.ts`, `packages/core/tests/index.test.ts`, `apps/api/src/index.ts`, `apps/api/tests/index.test.ts`, `apps/worker/src/index.ts`, and `apps/worker/tests/index.test.ts`.
- [X] T007 [P] Document Node.js 20+ LTS, Corepack/pnpm, local quality commands, and workspace package boundaries in `README.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared configuration, domain contracts, Redis/BullMQ execution primitives, Prisma/Postgres persistence, and operational primitives required by all user stories.

**Critical**: No user story implementation starts until this phase is complete.

- [X] T008 [P] Define shared runtime configuration types, environment parsing, validation errors, and the `Europe/Paris` default timezone in `packages/core/src/config/runtime-config.ts` and `packages/core/src/config/runtime-config.test.ts`.
- [X] T009 [P] Define shared status enums and domain types for `Scope`, `ProcessingPeriod`, `EventRecord`, `CalendarSnapshot`, `IngestionJob`, `IngestionLedger`, `LocationRecord`, and `GeoPoint` in `packages/core/src/domain/types.ts`.
- [X] T010 [P] Implement deterministic scope and period token normalization, including the colon-free `ingest-v1_scope-<canonical-scope-token>_period-<utc-slot>` job identity, in `packages/core/src/domain/job-identity.ts` and `packages/core/src/domain/job-identity.test.ts`.
- [X] T011 [P] Implement timezone-aware processing-period calculations with UTC identity and `Europe/Paris` audit values in `packages/core/src/domain/processing-period.ts` and `packages/core/src/domain/processing-period.test.ts`.
- [X] T012 [P] Implement normalized calendar content hashing and event sequence revision rules in `packages/core/src/domain/event-revision.ts` and `packages/core/src/domain/event-revision.test.ts`, preserving stable source event IDs and incrementing `sequence` only when normalized content changes.
- [X] T013 [P] Implement external payload schemas and validation helpers for identifiers, timestamps, timezone, nullable fields, typed locations, and GeoJSON coordinates with longitude `-180..180` and latitude `-90..90` in `packages/core/src/adapters/action-populaire-schemas.ts` and `packages/core/src/adapters/action-populaire-schemas.test.ts`.
- [X] T014 [P] Implement the Redis connection factory, namespaced key builders, health ping, and safe shutdown in `packages/core/src/infrastructure/redis.ts` and `packages/core/src/infrastructure/redis.test.ts`.
- [X] T015 [P] Implement structured JSON logging with service, environment, request/job ID, scope/period, operation, outcome, duration, and sanitized failure context in `packages/core/src/operations/logger.ts` and `packages/core/src/operations/logger.test.ts`.
- [X] T016 [P] Implement bounded-label metrics primitives for HTTP, jobs, queue depth, retries, upstream failures, and ingestion freshness in `packages/core/src/operations/metrics.ts` and `packages/core/src/operations/metrics.test.ts`.
- [X] T017 [P] Add shared error classes and retry classification for network failures, timeouts, HTTP 429/5xx, temporary Redis failures, malformed payloads, invalid scope configuration, and permanent authentication failures in `packages/core/src/operations/errors.ts` and `packages/core/src/operations/retry-policy.ts`.
- [X] T018 Create the core package public exports and package build boundary in `packages/core/src/index.ts` and `packages/core/package.json`.
- [X] T019 [P] Add the Redis AOF configuration, `noeviction` policy, named volume, private network, and service healthcheck in `infra/redis/redis.conf` and `infra/compose/docker-compose.yml`.
- [X] T084 [P] Add Prisma, `@prisma/client`, Postgres runtime configuration, and Prisma generation/migration scripts in `package.json`, `packages/core/package.json`, and `infra/compose/.env.example`.
- [X] T085 [P] Define Prisma models for groups, events, subscriptions, locations, ingestion ledgers, and calendar snapshots with source identifiers, relationships, status fields, and unique constraints in `prisma/schema.prisma`.
- [X] T086 [P] Add Postgres service configuration, named volume, private network, and readiness healthcheck in `infra/compose/docker-compose.yml` and `infra/postgres/`.
- [X] T087 [P] Implement the typed Prisma client factory, health check, transaction helper, and graceful shutdown in `packages/core/src/infrastructure/postgres.ts` and `packages/core/src/infrastructure/postgres.test.ts`.
- [X] T102 [P] Add loopback-only Prisma Studio and local Postgres startup commands in `package.json`, `README.md`, and `infra/compose/docker-compose.dev.yml`.
- [X] T020 [P] Add the integration-test Redis lifecycle, isolated key namespace, and environment setup in `tests/integration/setup.ts` and `tests/integration/test-environment.ts`.
- [X] T021 [P] Define shared HTTP, worker, and Redis liveness/readiness/startup check contracts in `packages/core/src/operations/health.ts` and `packages/core/src/operations/health.test.ts`.

**Checkpoint**: The shared package, strict compiler, Redis client, configuration validation, domain primitives, observability primitives, and test infrastructure are ready for independent story work.

---

## Phase 3: User Story 1 - Start a Consistent Development Environment (Priority: P1) MVP

**Goal**: A clean checkout can install workspace dependencies and run strict type checks and automated tests through documented repository commands.

**Independent Test**: From a clean supported Node.js 20+ checkout, run `corepack enable`, `pnpm install`, `pnpm typecheck`, and `pnpm test`; introduce a deliberate invalid public type and verify the quality check identifies the affected package or file.

### Tests for User Story 1

- [X] T022 [P] [US1] Add a clean-install and workspace-package discovery check in `tests/integration/workspace-install.test.ts` covering `pnpm` workspace resolution and `workspace:` dependencies.
- [X] T023 [P] [US1] Add a strict typecheck regression fixture and command-level assertion in `tests/integration/typecheck-gate.test.ts` proving an invalid public type fails `tsc -b` with the affected package or file.
- [X] T024 [P] [US1] Add package-local smoke tests for core, API, and worker test commands in `packages/core/tests/smoke.test.ts`, `apps/api/tests/smoke.test.ts`, and `apps/worker/tests/smoke.test.ts`.

### Implementation for User Story 1

- [X] T025 [US1] Implement the root install, typecheck, test, integration-test, lint, and build command pipeline in `package.json` and `scripts/quality.mjs`.
- [X] T026 [US1] Add strict compiler options, project references, declaration output, and no-implicit-any enforcement to `tsconfig.base.json`, `packages/core/tsconfig.json`, `apps/api/tsconfig.json`, and `apps/worker/tsconfig.json`.
- [X] T027 [US1] Configure deterministic lockfile-based dependency installation and supported-engine validation in `package.json` and `pnpm-lock.yaml`.
- [X] T028 [US1] Document the clean-checkout workflow, expected successful output, focused package commands, and deliberate type-failure check in `README.md` and `specs/001-technical-foundation/quickstart.md`.
- [X] T029 [US1] Verify all three workspace units compile and publish their public exports without undeclared workspace dependencies in `packages/core/package.json`, `apps/api/package.json`, and `apps/worker/package.json`.

**Checkpoint**: User Story 1 is independently usable when a clean checkout installs, typechecks, tests, and reports deliberate public type failures consistently.

---

## Phase 4: User Story 2 - Deploy API and Worker Independently (Priority: P1)

**Goal**: API and worker are separate Fastify/BullMQ workloads with independent multi-stage runtime images, externalized configuration, private internals, and Redis-backed deployment persistence.

**Independent Test**: Build `api` and `worker` image targets separately, start each with its required environment, verify the API serves only prepared read-only feed data, and verify the worker starts its dispatcher/queue responsibilities without exposing the API.

### Tests for User Story 2

- [X] T030 [P] [US2] Add Fastify injection contract tests for `GET /feed/{scopeId}`, `ETag`/`304`, stable calendar output, invalid scope `400`, unknown scope `404`, unavailable Redis `503`, and mutation `405` in `apps/api/tests/feed.contract.test.ts`.
- [X] T031 [P] [US2] Add API boundary tests proving feed requests read the current Redis snapshot and never call Action Populaire in `apps/api/tests/feed-read-boundary.test.ts`.
- [X] T032 [P] [US2] Add worker startup/readiness tests proving BullMQ and Redis configuration is required while the worker exposes no API route in `apps/worker/tests/startup.contract.test.ts`.
- [X] T033 [P] [US2] Add Docker image and runtime contract tests for separate `api` and `worker` targets, non-root execution, required environment failures, and runtime-only files in `tests/integration/images.test.ts`.
- [X] T034 [P] [US2] Add Redis restart integration coverage proving a prepared dataset and queued test job survive a normal container restart with the named volume in `tests/integration/redis-persistence.test.ts`.

### Implementation for User Story 2

- [X] T035 [P] [US2] Implement the calendar domain model, iCalendar escaping, CRLF serialization, stable UID/SEQUENCE, UTC `DTSTAMP`/`LAST-MODIFIED`, and feed revision generation in `packages/core/src/calendar/ical-feed.ts` and `packages/core/src/calendar/ical-feed.test.ts`.
- [X] T036 [P] [US2] Implement Redis snapshot read and feed cache access against `dataset:{scopeToken}:current` and complete snapshots in `packages/core/src/persistence/calendar-dataset-repository.ts` and `packages/core/src/persistence/calendar-dataset-repository.test.ts`.
- [X] T037 [US2] Implement the public read-only Fastify feed route, private liveness/readiness routes, conditional requests, sanitized errors, and request metrics in `apps/api/src/server.ts`, `apps/api/src/routes/feed.ts`, and `apps/api/src/routes/health.ts`.
- [X] T038 [US2] Implement API startup validation, Redis reconnect behavior, structured request logging, and graceful shutdown in `apps/api/src/config.ts` and `apps/api/src/main.ts`.
- [X] T039 [P] [US2] Implement worker process startup, private readiness/liveness checks, BullMQ connection initialization, and graceful shutdown without registering an HTTP feed server in `apps/worker/src/main.ts`, `apps/worker/src/health.ts`, and `apps/worker/src/config.ts`.
- [X] T040 [P] [US2] Create separate multi-stage Dockerfiles for `api` and `worker`, with pnpm production dependency installation, compiled runtime files, and non-root Alpine runtime users in `infra/docker/Dockerfile.api` and `infra/docker/Dockerfile.worker`.
- [X] T041 [P] [US2] Define registry-backed API/worker image tags, HTTPS edge routing, private internal network exposure, required environment variables, restart policies, and Redis dependencies in `infra/compose/docker-compose.yml`, `infra/compose/.env.example`, and `infra/compose/README.md`.
- [X] T042 [US2] Add production build, registry publish, startup, healthcheck, HTTPS, and read-only public-feed validation commands to `README.md` and `specs/001-technical-foundation/quickstart.md`.

**Checkpoint**: User Story 2 is independently deployable when API and worker images build/start separately, use only environment-provided configuration, preserve Redis data, and expose only their documented surfaces.

---

## Phase 5: User Story 3 - Scale Scheduled Ingestion Safely (Priority: P1)

**Goal**: Multiple workers share deterministic BullMQ jobs safely, paginate and validate Action Populaire data, publish idempotent Redis snapshots, retry recoverable failures, and recover after interruption.

**Independent Test**: Dispatch 100 jobs to at least 3 workers, verify one active owner per job, simulate worker termination and upstream failures, confirm bounded retry/final failure state, restart Redis, and verify queued jobs and complete datasets remain recoverable.

### Tests for User Story 3

- [X] T043 [P] [US3] Add Action Populaire group catalogue contract tests for complete synchronization, active/inactive preservation, GeoJSON validation, and rejection of partial catalogues in `apps/worker/tests/action-populaire-groups.contract.test.ts`.
- [X] T044 [P] [US3] Add paginated event adapter contract tests for one-based `page`, configurable `page_size` capped at `1000`, short/empty page termination, valid nullable fields, coordinate bounds, and failure classification in `apps/worker/tests/action-populaire-events.contract.test.ts`.
- [X] T045 [P] [US3] Add dispatcher tests for the default 15-minute interval, Redis lock token validation, non-overlapping cycles, deterministic scope-period IDs, active-only dispatch, and duplicate suppression in `apps/worker/tests/dispatcher.test.ts`.
- [X] T046 [P] [US3] Add ingestion processing tests for retrieve-validate-transform-write-ack order, no acknowledgement after failed writes, bounded concurrency, backpressure, and worker readiness in `apps/worker/tests/ingestion.test.ts`.
- [X] T047 [P] [US3] Add retry and redelivery tests for exponential backoff with jitter, retry limits, exhausted jobs, at-least-once delivery, interrupted-worker lease recovery, and durable ledger failure details in `apps/worker/tests/retry-redelivery.test.ts`.
- [X] T048 [P] [US3] Add snapshot publication tests for staging, completeness validation, atomic current-pointer replacement, idempotent replay, unchanged content sequence stability, changed content sequence increment, and partial-fetch non-cancellation in `apps/worker/tests/snapshot-publication.test.ts`.
- [X] T049 [P] [US3] Add multi-worker Redis integration tests for 3 workers and 100 scheduled jobs, one normal active owner per job, queue recovery after restart, and persisted calendar data in `tests/integration/worker-scaling.test.ts`.
- [X] T050 [P] [US3] Add a representative capacity test for 5,000 subscribed users, 2,000 active groups, and 100,000 prepared events covering incremental pagination, bounded memory, queue backpressure, Redis write behavior, and no silent job loss in `tests/integration/capacity.test.ts`.

### Implementation for User Story 3

- [X] T051 [P] [US3] Implement Action Populaire HTTP transport, timeout/status handling, retryable versus permanent error classification, and structured upstream metrics in `apps/worker/src/adapters/action-populaire-client.ts` and `apps/worker/src/adapters/action-populaire-client.test.ts`.
- [X] T052 [P] [US3] Implement catalogue synchronization and active-scope repository behavior so a complete `GET /carte/liste_groupes/` response upserts active/inactive groups while a failed or partial response preserves the last complete catalogue in `apps/worker/src/catalogue/group-catalogue.ts` and `apps/worker/src/catalogue/group-catalogue.test.ts`.
- [X] T053 [P] [US3] Implement paginated group event retrieval with one-based pages, `page_size` capped at `1000`, incremental processing, bounded concurrency, configurable batching, and explicit complete/failed retrieval state in `apps/worker/src/ingestion/event-pages.ts` and `apps/worker/src/ingestion/event-pages.test.ts`.
- [X] T054 [P] [US3] Implement dispatcher locking, processing-period computation, active group discovery, deterministic BullMQ `calendar-ingestion` jobs, and scheduled ledger updates in `apps/worker/src/dispatcher/dispatcher.ts`, `apps/worker/src/dispatcher/lock.ts`, and `apps/worker/src/dispatcher/dispatcher.test.ts`.
- [X] T055 [P] [US3] Implement BullMQ queue configuration with configurable retry limits, delayed exponential backoff and jitter, retained failed jobs, bounded queue settings, and worker concurrency in `apps/worker/src/queue/queue.ts` and `apps/worker/src/queue/queue.test.ts`.
- [X] T056 [US3] Implement ingestion ledger transitions for `scheduled`, `running`, `publishing`, `succeeded`, `retrying`, and `failed`, retaining job ID, scope/period, attempts, lifecycle timestamps, worker ID, source revision, and sanitized errors in `apps/worker/src/operations/ingestion-ledger.ts` and `apps/worker/src/operations/ingestion-ledger.test.ts`.
- [X] T057 [US3] Implement staged Redis snapshot publication, event/location persistence, stable source IDs, content-hash sequence changes, complete-snapshot cancellation rules, and atomic `current` pointer replacement in `apps/worker/src/persistence/snapshot-publisher.ts`, `apps/worker/src/persistence/event-repository.ts`, and `apps/worker/src/persistence/snapshot-publisher.test.ts`.
- [X] T058 [US3] Implement the worker processor in the required order: retrieve upstream data, validate and transform it, write the staged result to Redis, publish the current snapshot, then acknowledge BullMQ only after successful publication in `apps/worker/src/ingestion/processor.ts`.
- [X] T059 [US3] Add worker operational metrics, structured job logs, exhausted-job reporting, queue-depth/oldest-job signals, upstream failure signals, and recovery alerts in `apps/worker/src/operations/observability.ts`, `infra/monitoring/alerts.yml`, and `infra/monitoring/dashboard.json`.
- [X] T060 [US3] Integrate dispatcher and processor startup with automatic reconnect/restart behavior, Redis persistence checks, and private readiness dependencies in `apps/worker/src/main.ts` and `infra/compose/docker-compose.yml`.
- [X] T061 [US3] Document dispatcher interval, retry/backoff, page-size, batching, worker scaling, persistence recovery, capacity validation, and failure-state inspection commands in `README.md` and `specs/001-technical-foundation/quickstart.md`.

**Checkpoint**: User Story 3 is independently functional when distributed workers process jobs at least once with idempotent effects, complete paginated snapshots atomically, retry recoverable failures, and expose durable recovery state.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close quality, security, documentation, operational-readiness, and Redis/Postgres migration gaps across all stories.

- [X] T062 [P] Add CI jobs for install, strict typecheck, lint, package tests, integration tests with Redis, Docker builds, and artifact validation in `.github/workflows/ci.yml`.
- [X] T063 [P] Add registry publishing with immutable commit-based API and worker tags and environment-provided credentials in `.github/workflows/publish-images.yml`.
- [X] T064 [P] Add HTTPS-only edge configuration, public-feed read-only enforcement, private Redis/BullMQ/health/admin network rules, and secret scanning checks in `infra/edge/https.conf`, `infra/compose/docker-compose.yml`, and `.github/workflows/security.yml`.
- [X] T065 [P] Add operational alert thresholds relative to the 15-minute dispatcher interval and retry window for unavailable services, stale ingestion, queue growth, exhausted jobs, upstream failures, Redis failure, disk/memory pressure, and unavailable metrics in `infra/monitoring/alerts.yml`.
- [X] T066 [P] Add backup/restore and Redis AOF rewrite validation documentation without claiming recovery from host or named-volume loss in `infra/redis/README.md` and `specs/001-technical-foundation/quickstart.md`.
- [x] T067 Run the complete quickstart validation, including clean install, typecheck, tests, Docker builds, Redis restart, API feed checks, worker scaling, operational signals, and capacity test, and record any environment-specific prerequisites in `specs/001-technical-foundation/quickstart.md`.
- [X] T068 Review production modules against the 100-150 line maintainability guideline, split oversized cohesive responsibilities, and update affected exports/tests in `packages/core/src/`, `apps/api/src/`, and `apps/worker/src/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; tasks T002-T007 marked `[P]` can proceed after the workspace manifests establish the paths they target.
- **Phase 2 Foundational**: Depends on Phase 1; T008-T017, T019-T021 can proceed in parallel by area, while T018 completes the core public boundary after core implementation tasks exist.
- **User Stories**: All depend on Phase 2. User Story 1 is the smallest validation increment; User Stories 2 and 3 can proceed in parallel after the shared foundation, with US3 using the Redis and observability contracts established by Phase 2.
- **Phase 6 Polish**: Depends on the desired user stories being complete; CI and documentation tasks can proceed in parallel, while T067 and T068 are final validation/review tasks.
- **Phase 9 Persistence Migration**: Depends on Phase 2 and the existing worker/API boundaries; T084-T087 establish Prisma/Postgres infrastructure, then T088-T101 migrate durable data and validate Redis queue recovery.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; no dependency on another story. Recommended first increment and MVP.
- **User Story 2 (P1)**: Starts after Phase 2; consumes core calendar and Postgres snapshot contracts, but is independently testable with prepared Postgres data and does not require the worker to fetch upstream data.
- **User Story 3 (P1)**: Starts after Phase 2; consumes core configuration, Redis, job identity, errors, metrics, and health contracts. It can be developed in parallel with US2 and must not couple the worker to the public API server.

### Within Each User Story

- Tests are written before their corresponding implementation tasks and must fail for the missing behavior.
- Domain models, schemas, and repositories precede services; services precede routes/processors; integration and capacity validation follow the implementation.
- A story checkpoint must pass independently before relying on it as a deployment or operational prerequisite for another story.

### Parallel Opportunities

- **Setup**: T002-T007 are parallel after T001 establishes workspace package paths.
- **Foundational**: Configuration, domain primitives, Redis, logging, metrics, errors, health, and Docker/Redis infrastructure are separable by file set.
- **US1**: T022-T024 are parallel test tasks; T026-T029 can be split by compiler, dependency, documentation, and package-boundary concerns.
- **US2**: T030-T034 are parallel contract/integration tests; T035-T036, T039-T041 are parallel implementation groups on distinct files.
- **US3**: T043-T050 are parallel test suites; adapter, catalogue, pagination, queue, and observability tasks are separable before dispatcher/processor integration.
- **Across stories**: After Phase 2, separate developers can take US1, US2, and US3; US2 and US3 only coordinate on the shared core exports and Redis key contracts.

## Parallel Example: User Story 1

```text
Task T022: Clean-install and workspace discovery test in tests/integration/workspace-install.test.ts
Task T023: Strict typecheck regression test in tests/integration/typecheck-gate.test.ts
Task T024: Package-local smoke tests in packages/core/tests/smoke.test.ts, apps/api/tests/smoke.test.ts, and apps/worker/tests/smoke.test.ts
```

## Parallel Example: User Story 2

```text
Task T030: API feed contract tests in apps/api/tests/feed.contract.test.ts
Task T032: Worker startup contract tests in apps/worker/tests/startup.contract.test.ts
Task T033: Separate image contract tests in tests/integration/images.test.ts
Task T034: Redis restart persistence test in tests/integration/redis-persistence.test.ts
```

## Parallel Example: User Story 3

```text
Task T043: Group catalogue contract tests in apps/worker/tests/action-populaire-groups.contract.test.ts
Task T044: Paginated event contract tests in apps/worker/tests/action-populaire-events.contract.test.ts
Task T045: Dispatcher lock and deduplication tests in apps/worker/tests/dispatcher.test.ts
Task T047: Retry and redelivery tests in apps/worker/tests/retry-redelivery.test.ts
Task T048: Snapshot publication tests in apps/worker/tests/snapshot-publication.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational contracts and infrastructure.
3. Complete Phase 3 User Story 1.
4. Run the clean-checkout, typecheck, and package test checks independently.
5. Stop at the US1 checkpoint before expanding into deployment and ingestion.

### Incremental Delivery

1. Add User Story 2 to deploy independent API and worker images over the shared Redis foundation.
2. Add User Story 3 to populate Redis through safely scaled, retried, idempotent ingestion.
3. Complete Phase 6 for CI, HTTPS/private boundaries, alerts, persistence recovery documentation, and capacity evidence.
4. Validate each checkpoint before moving to the next increment; retain all previous story checks.

## Independent Test Criteria

- **US1**: Clean supported checkout installs with pnpm; `pnpm typecheck` and `pnpm test` pass; a deliberate invalid public type fails with an actionable package/file diagnostic.
- **US2**: Separate API and worker images build/start independently; API serves prepared `text/calendar` data with `ETag`/`304` and rejects mutation/private access; worker starts queue responsibilities without an API surface; Redis data and jobs survive a normal named-volume restart.
- **US3**: Three workers process 100 jobs without simultaneous ownership; interrupted jobs are redelivered; retryable failures obey configured limits and expose exhausted state; complete paginated data publishes atomically and replay is idempotent; queued work recovers after Redis restart while durable datasets remain in Postgres.

## Notes

- `[P]` means the task targets a distinct file set and has no dependency on an incomplete task in the same phase.
- `[US1]`, `[US2]`, and `[US3]` map directly to the three P1 user stories in `spec.md`.
- Every implementation task names the target file or directory and preserves the contracts from `spec.md`, `data-model*.md`, `contracts/`, `research.md`, and the repository diagrams.
- MVP scope is Phase 1, Phase 2, and Phase 3 (User Story 1). Deployment and ingestion are incremental follow-on deliveries.

## Phase 7: Convergence

- [X] T069 Wire the worker runtime to dispatch and process BullMQ ingestion jobs in retrieve-validate-transform-write-ack order per FR-006 and FR-013 (contradicts)
- [X] T070 Persist the group catalogue, ingestion ledger, and permanent failure state in Prisma/Postgres; retain BullMQ execution state in Redis so active scopes and recovery state survive restarts per FR-011 and FR-026 (migration follow-up in Phase 9)
- [X] T071 Implement Action Populaire event retrieval through `GET /events?page=X&page_size=Y` with one-based pagination, a maximum page size of 1000, and short-or-empty page termination per FR-011A (partial)
- [X] T072 Replace process-local dispatcher duplicate suppression with shared durable scope-period job identity handling per FR-010 and FR-011 (partial)
- [X] T073 Implement complete staged snapshot validation and atomic current-pointer replacement in Prisma/Postgres per FR-030 and plan: snapshot publication decision (migration follow-up in Phase 9)
- [X] T074 Connect BullMQ retry limits, delayed backoff, exhausted-job reporting, and non-retryable Zod failures to the worker runtime and ledger per FR-014 and FR-031 (missing)
- [X] T075 Connect structured request/job logs, metrics exporters or endpoints, and actionable alert rules to the API and worker runtime per FR-023, FR-024, and FR-025 (missing)
- [X] T076 Integrate the HTTPS edge and private network boundaries so public feeds are read-only HTTPS endpoints and internal health, Redis, BullMQ, and administration surfaces are not publicly reachable per FR-019 and FR-020 (contradicts)
- [X] T077 Replace opt-in placeholder integration checks with executable Redis restart, three-worker/100-job, and capacity validations per SC-004, SC-005, and SC-006 (partial)
- [X] T078 Connect the dispatcher to authoritative `GET /carte/liste_groupes/` discovery and synchronize only complete active-group catalogues per FR-011 (missing)
- [X] T079 Expose a deployment-facing worker liveness/readiness healthcheck and configure it in Compose per FR-022 (missing)
- [X] T080 Align completed task file targets with the actual implementation surfaces or create the promised route, adapter, catalogue, ingestion, and dispatcher test boundaries per tasks T037, T051-T054 (partial)

## Phase 8: Convergence

- [X] T081 Wire structured request/job logs, complete runtime metrics production and export, and actionable alert signals for request failures, job duration, queue depth, retries, exhausted jobs, upstream failures, ingestion freshness, and Redis connectivity per FR-023/FR-024/FR-025 (missing)
- [X] T082 Implement executable Redis-backed restart, three-worker/100-job ownership and redelivery, retry exhaustion, and representative capacity validations instead of environment-only or skipped assertions per SC-004/SC-005/SC-006 (partial)
- [X] T083 Align the completed implementation and test targets with the planned focused route, adapter, catalogue, ingestion, and dispatcher boundaries, creating equivalent executable tests where those boundaries are absent per T080 (partial; durable persistence migration remains in Phase 9)

## Phase 9: Redis/Postgres Persistence Migration

**Purpose**: Migrate durable groups, events, subscriptions, ingestion state, and calendar snapshots from Redis to Prisma/Postgres while retaining Redis/BullMQ for job execution state, queue coordination, retries, and transient cache.

- [ ] T088 [P] Add Prisma client generation and clean-database migration checks in `tests/integration/prisma-migration.test.ts` and `scripts/quality.mjs`.
- [ ] T089 [P] Implement Postgres repositories for groups, events, subscriptions, locations, and calendar snapshots with transaction boundaries in `packages/core/src/persistence/`.
- [X] T090 [P] Replace Redis group catalogue persistence with Prisma/Postgres upserts while preserving the authoritative `GET /carte/liste_groupes/` discovery flow in `apps/worker/src/services/group-catalogue.ts`.
- [X] T091 [P] Replace Redis event, subscription, and location persistence with Prisma/Postgres upserts, preserving stable source IDs and idempotent event sequence updates in `apps/worker/src/ingestion/` and `packages/core/src/persistence/`.
- [X] T092 [P] Move the durable ingestion ledger and permanent failure state to Prisma/Postgres; retain BullMQ status, attempts, and redelivery state in Redis in `packages/core/src/persistence/ingestion-repository.ts` and `apps/worker/src/queue/`.
- [X] T093 Replace Redis staged dataset and current-pointer publication with transactional Prisma/Postgres calendar snapshots while preserving complete-snapshot-only API visibility in `packages/core/src/persistence/snapshot-repository.ts` and `apps/worker/src/ingestion/`.
- [X] T094 Update the ingestion processor to execute retrieve, validate, transform, persist to Postgres, then acknowledge BullMQ in `apps/worker/src/ingestion/processor.ts`.
- [X] T095 Update the API feed service to read only complete calendar snapshots from Prisma/Postgres and use Redis only for explicitly transient cache behavior in `apps/api/src/services/calendar-feed.ts` and `apps/api/src/routes/feed.ts`.
- [ ] T096 Update Redis key builders and repository tests so no durable group, event, subscription, ledger, or snapshot data is written to Redis in `packages/core/src/infrastructure/redis.ts`, `packages/core/src/persistence/`, and `apps/worker/tests/`.
- [ ] T097 [P] Add integration coverage for Postgres transaction rollback, idempotent upserts, stale-event preservation, snapshot publication, and API reads in `tests/integration/postgres-persistence.test.ts`.
- [ ] T098 [P] Update Redis restart and worker-scaling tests to assert queued jobs recover while durable business data remains in Postgres in `tests/integration/redis-persistence.test.ts` and `tests/integration/worker-scaling.test.ts`.
- [ ] T099 [P] Add Postgres backup/restore documentation and revise Redis recovery documentation to cover queue state and transient cache only in `infra/postgres/README.md`, `infra/redis/README.md`, and `specs/001-technical-foundation/quickstart.md`.
- [ ] T100 Update the plan, data-model files, contracts, and quickstart references that still identify Redis as durable storage in `plan.md`, `data-model-*.md`, `contracts/`, and `quickstart.md`.
- [ ] T101 Run the focused migration validation (`pnpm prisma:generate`, migrations, typecheck, Postgres integration tests, Redis queue recovery tests) and record results in `specs/001-technical-foundation/quickstart.md`.
- [X] T103 Add Prisma Studio verification to the development quickstart, including loopback binding and inspection of groups, events, subscriptions, ledgers, and snapshots in `specs/001-technical-foundation/quickstart.md`.
- [ ] T104 Validate the local visualization workflow with Postgres startup, migration deployment, Prisma Studio startup, and documentation checks; record the result in `specs/001-technical-foundation/quickstart.md` (blocked until Docker access is available).
- [X] T105 Load `.env` and optional `.env.local` automatically in the API and worker entry points, resolving the workspace root so native runs work from any package directory, in `packages/core/src/config/load-env.ts`, `apps/api/src/main.ts`, and `apps/worker/src/main.ts`.
- [X] T106 Add a startup preflight for Redis and Postgres so the API and worker abort with one actionable message, and start local dependencies from `pnpm dev`, in `packages/core/src/operations/preflight.ts`, `packages/core/src/infrastructure/redis.ts`, `apps/api/src/main.ts`, `apps/worker/src/main.ts`, and `package.json`.
- [X] T107 Make Prisma CLI, Studio, and migrations load `.env`/`.env.local` through `scripts/prisma.mjs`, add `db:setup` and `prisma:migrate:status`, and apply migrations from `pnpm dev`, so Studio cannot query an unmigrated or different database.
- [X] T108 Attach loopback-published dev services to a non-internal Compose network so Docker can publish ports from the private network in `infra/compose/docker-compose.dev.yml`.
- [X] T109 Register the internal health controller and include Postgres in readiness checks in `apps/api/src/app.module.ts` and `apps/api/src/internal/internal.controller.ts`.