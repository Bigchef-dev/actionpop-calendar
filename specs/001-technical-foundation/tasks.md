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

- [ ] T001 Create the pnpm workspace manifests for `packages/core`, `apps/api`, and `apps/worker` in `pnpm-workspace.yaml`, `package.json`, `packages/core/package.json`, `apps/api/package.json`, and `apps/worker/package.json`, using Node.js 20+ LTS and `workspace:` dependencies.
- [ ] T002 [P] Create the shared strict TypeScript project-reference configuration in `tsconfig.json`, `tsconfig.base.json`, `packages/core/tsconfig.json`, `apps/api/tsconfig.json`, and `apps/worker/tsconfig.json` with ESM NodeNext module resolution and compiled `dist/` output.
- [ ] T003 [P] Configure package-local Vitest projects and shared test conventions in `vitest.config.ts`, `packages/core/vitest.config.ts`, `apps/api/vitest.config.ts`, and `apps/worker/vitest.config.ts`.
- [ ] T004 [P] Configure ESLint and formatting for strict TypeScript source and tests in `eslint.config.js` and `.prettierrc.json`.
- [ ] T005 [P] Add the repository quality scripts for install, type checking, unit tests, integration tests, linting, and build validation in `package.json` and each workspace package manifest.
- [ ] T006 [P] Add the initial source and test directory entry points in `packages/core/src/index.ts`, `packages/core/tests/index.test.ts`, `apps/api/src/index.ts`, `apps/api/tests/index.test.ts`, `apps/worker/src/index.ts`, and `apps/worker/tests/index.test.ts`.
- [ ] T007 [P] Document Node.js 20+ LTS, Corepack/pnpm, local quality commands, and workspace package boundaries in `README.md`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared configuration, domain contracts, Redis access, and operational primitives required by all user stories.

**Critical**: No user story implementation starts until this phase is complete.

- [ ] T008 [P] Define shared runtime configuration types, environment parsing, validation errors, and the `Europe/Paris` default timezone in `packages/core/src/config/runtime-config.ts` and `packages/core/src/config/runtime-config.test.ts`.
- [ ] T009 [P] Define shared status enums and domain types for `Scope`, `ProcessingPeriod`, `EventRecord`, `CalendarSnapshot`, `IngestionJob`, `IngestionLedger`, `LocationRecord`, and `GeoPoint` in `packages/core/src/domain/types.ts`.
- [ ] T010 [P] Implement deterministic scope and period token normalization, including the colon-free `ingest-v1_scope-<canonical-scope-token>_period-<utc-slot>` job identity, in `packages/core/src/domain/job-identity.ts` and `packages/core/src/domain/job-identity.test.ts`.
- [ ] T011 [P] Implement timezone-aware processing-period calculations with UTC identity and `Europe/Paris` audit values in `packages/core/src/domain/processing-period.ts` and `packages/core/src/domain/processing-period.test.ts`.
- [ ] T012 [P] Implement normalized calendar content hashing and event sequence revision rules in `packages/core/src/domain/event-revision.ts` and `packages/core/src/domain/event-revision.test.ts`, preserving stable source event IDs and incrementing `sequence` only when normalized content changes.
- [ ] T013 [P] Implement external payload schemas and validation helpers for identifiers, timestamps, timezone, nullable fields, typed locations, and GeoJSON coordinates with longitude `-180..180` and latitude `-90..90` in `packages/core/src/adapters/action-populaire-schemas.ts` and `packages/core/src/adapters/action-populaire-schemas.test.ts`.
- [ ] T014 [P] Implement the Redis connection factory, namespaced key builders, health ping, and safe shutdown in `packages/core/src/infrastructure/redis.ts` and `packages/core/src/infrastructure/redis.test.ts`.
- [ ] T015 [P] Implement structured JSON logging with service, environment, request/job ID, scope/period, operation, outcome, duration, and sanitized failure context in `packages/core/src/operations/logger.ts` and `packages/core/src/operations/logger.test.ts`.
- [ ] T016 [P] Implement bounded-label metrics primitives for HTTP, jobs, queue depth, retries, upstream failures, Redis connectivity, and ingestion freshness in `packages/core/src/operations/metrics.ts` and `packages/core/src/operations/metrics.test.ts`.
- [ ] T017 [P] Add shared error classes and retry classification for network failures, timeouts, HTTP 429/5xx, temporary Redis failures, malformed payloads, invalid scope configuration, and permanent authentication failures in `packages/core/src/operations/errors.ts` and `packages/core/src/operations/retry-policy.ts`.
- [ ] T018 Create the core package public exports and package build boundary in `packages/core/src/index.ts` and `packages/core/package.json`.
- [ ] T019 [P] Add the Redis AOF configuration, `noeviction` policy, named volume, private network, and service healthcheck in `infra/redis/redis.conf` and `infra/compose/docker-compose.yml`.
- [ ] T020 [P] Add the integration-test Redis lifecycle, isolated key namespace, and environment setup in `tests/integration/setup.ts` and `tests/integration/test-environment.ts`.
- [ ] T021 [P] Define shared HTTP, worker, and Redis liveness/readiness/startup check contracts in `packages/core/src/operations/health.ts` and `packages/core/src/operations/health.test.ts`.

**Checkpoint**: The shared package, strict compiler, Redis client, configuration validation, domain primitives, observability primitives, and test infrastructure are ready for independent story work.

---

## Phase 3: User Story 1 - Start a Consistent Development Environment (Priority: P1) MVP

**Goal**: A clean checkout can install workspace dependencies and run strict type checks and automated tests through documented repository commands.

**Independent Test**: From a clean supported Node.js 20+ checkout, run `corepack enable`, `pnpm install`, `pnpm typecheck`, and `pnpm test`; introduce a deliberate invalid public type and verify the quality check identifies the affected package or file.

### Tests for User Story 1

- [ ] T022 [P] [US1] Add a clean-install and workspace-package discovery check in `tests/integration/workspace-install.test.ts` covering `pnpm` workspace resolution and `workspace:` dependencies.
- [ ] T023 [P] [US1] Add a strict typecheck regression fixture and command-level assertion in `tests/integration/typecheck-gate.test.ts` proving an invalid public type fails `tsc -b` with the affected package or file.
- [ ] T024 [P] [US1] Add package-local smoke tests for core, API, and worker test commands in `packages/core/tests/smoke.test.ts`, `apps/api/tests/smoke.test.ts`, and `apps/worker/tests/smoke.test.ts`.

### Implementation for User Story 1

- [ ] T025 [US1] Implement the root install, typecheck, test, integration-test, lint, and build command pipeline in `package.json` and `scripts/quality.mjs`.
- [ ] T026 [US1] Add strict compiler options, project references, declaration output, and no-implicit-any enforcement to `tsconfig.base.json`, `packages/core/tsconfig.json`, `apps/api/tsconfig.json`, and `apps/worker/tsconfig.json`.
- [ ] T027 [US1] Configure deterministic lockfile-based dependency installation and supported-engine validation in `package.json` and `pnpm-lock.yaml`.
- [ ] T028 [US1] Document the clean-checkout workflow, expected successful output, focused package commands, and deliberate type-failure check in `README.md` and `specs/001-technical-foundation/quickstart.md`.
- [ ] T029 [US1] Verify all three workspace units compile and publish their public exports without undeclared workspace dependencies in `packages/core/package.json`, `apps/api/package.json`, and `apps/worker/package.json`.

**Checkpoint**: User Story 1 is independently usable when a clean checkout installs, typechecks, tests, and reports deliberate public type failures consistently.

---

## Phase 4: User Story 2 - Deploy API and Worker Independently (Priority: P1)

**Goal**: API and worker are separate Fastify/BullMQ workloads with independent multi-stage runtime images, externalized configuration, private internals, and Redis-backed deployment persistence.

**Independent Test**: Build `api` and `worker` image targets separately, start each with its required environment, verify the API serves only prepared read-only feed data, and verify the worker starts its dispatcher/queue responsibilities without exposing the API.

### Tests for User Story 2

- [ ] T030 [P] [US2] Add Fastify injection contract tests for `GET /feed/{scopeId}`, `ETag`/`304`, stable calendar output, invalid scope `400`, unknown scope `404`, unavailable Redis `503`, and mutation `405` in `apps/api/tests/feed.contract.test.ts`.
- [ ] T031 [P] [US2] Add API boundary tests proving feed requests read the current Redis snapshot and never call Action Populaire in `apps/api/tests/feed-read-boundary.test.ts`.
- [ ] T032 [P] [US2] Add worker startup/readiness tests proving BullMQ and Redis configuration is required while the worker exposes no API route in `apps/worker/tests/startup.contract.test.ts`.
- [ ] T033 [P] [US2] Add Docker image and runtime contract tests for separate `api` and `worker` targets, non-root execution, required environment failures, and runtime-only files in `tests/integration/images.test.ts`.
- [ ] T034 [P] [US2] Add Redis restart integration coverage proving a prepared dataset and queued test job survive a normal container restart with the named volume in `tests/integration/redis-persistence.test.ts`.

### Implementation for User Story 2

- [ ] T035 [P] [US2] Implement the calendar domain model, iCalendar escaping, CRLF serialization, stable UID/SEQUENCE, UTC `DTSTAMP`/`LAST-MODIFIED`, and feed revision generation in `packages/core/src/calendar/ical-feed.ts` and `packages/core/src/calendar/ical-feed.test.ts`.
- [ ] T036 [P] [US2] Implement Redis snapshot read and feed cache access against `dataset:{scopeToken}:current` and complete snapshots in `packages/core/src/persistence/calendar-dataset-repository.ts` and `packages/core/src/persistence/calendar-dataset-repository.test.ts`.
- [ ] T037 [US2] Implement the public read-only Fastify feed route, private liveness/readiness routes, conditional requests, sanitized errors, and request metrics in `apps/api/src/server.ts`, `apps/api/src/routes/feed.ts`, and `apps/api/src/routes/health.ts`.
- [ ] T038 [US2] Implement API startup validation, Redis reconnect behavior, structured request logging, and graceful shutdown in `apps/api/src/config.ts` and `apps/api/src/main.ts`.
- [ ] T039 [P] [US2] Implement worker process startup, private readiness/liveness checks, BullMQ connection initialization, and graceful shutdown without registering an HTTP feed server in `apps/worker/src/main.ts`, `apps/worker/src/health.ts`, and `apps/worker/src/config.ts`.
- [ ] T040 [P] [US2] Create the multi-stage Dockerfile with separate `api` and `worker` targets, pnpm production dependency installation, compiled runtime files, and non-root Alpine runtime users in `infra/docker/Dockerfile`.
- [ ] T041 [P] [US2] Define registry-backed API/worker image tags, HTTPS edge routing, private internal network exposure, required environment variables, restart policies, and Redis dependencies in `infra/compose/docker-compose.yml`, `infra/compose/.env.example`, and `infra/compose/README.md`.
- [ ] T042 [US2] Add production build, registry publish, startup, healthcheck, HTTPS, and read-only public-feed validation commands to `README.md` and `specs/001-technical-foundation/quickstart.md`.

**Checkpoint**: User Story 2 is independently deployable when API and worker images build/start separately, use only environment-provided configuration, preserve Redis data, and expose only their documented surfaces.

---

## Phase 5: User Story 3 - Scale Scheduled Ingestion Safely (Priority: P1)

**Goal**: Multiple workers share deterministic BullMQ jobs safely, paginate and validate Action Populaire data, publish idempotent Redis snapshots, retry recoverable failures, and recover after interruption.

**Independent Test**: Dispatch 100 jobs to at least 3 workers, verify one active owner per job, simulate worker termination and upstream failures, confirm bounded retry/final failure state, restart Redis, and verify queued jobs and complete datasets remain recoverable.

### Tests for User Story 3

- [ ] T043 [P] [US3] Add Action Populaire group catalogue contract tests for complete synchronization, active/inactive preservation, GeoJSON validation, and rejection of partial catalogues in `apps/worker/tests/action-populaire-groups.contract.test.ts`.
- [ ] T044 [P] [US3] Add paginated event adapter contract tests for one-based `page`, configurable `page_size` capped at `1000`, short/empty page termination, valid nullable fields, coordinate bounds, and failure classification in `apps/worker/tests/action-populaire-events.contract.test.ts`.
- [ ] T045 [P] [US3] Add dispatcher tests for the default 15-minute interval, Redis lock token validation, non-overlapping cycles, deterministic scope-period IDs, active-only dispatch, and duplicate suppression in `apps/worker/tests/dispatcher.test.ts`.
- [ ] T046 [P] [US3] Add ingestion processing tests for retrieve-validate-transform-write-ack order, no acknowledgement after failed writes, bounded concurrency, backpressure, and worker readiness in `apps/worker/tests/ingestion.test.ts`.
- [ ] T047 [P] [US3] Add retry and redelivery tests for exponential backoff with jitter, retry limits, exhausted jobs, at-least-once delivery, interrupted-worker lease recovery, and durable ledger failure details in `apps/worker/tests/retry-redelivery.test.ts`.
- [ ] T048 [P] [US3] Add snapshot publication tests for staging, completeness validation, atomic current-pointer replacement, idempotent replay, unchanged content sequence stability, changed content sequence increment, and partial-fetch non-cancellation in `apps/worker/tests/snapshot-publication.test.ts`.
- [ ] T049 [P] [US3] Add multi-worker Redis integration tests for 3 workers and 100 scheduled jobs, one normal active owner per job, queue recovery after restart, and persisted calendar data in `tests/integration/worker-scaling.test.ts`.
- [ ] T050 [P] [US3] Add a representative capacity test for 5,000 subscribed users, 2,000 active groups, and 100,000 prepared events covering incremental pagination, bounded memory, queue backpressure, Redis write behavior, and no silent job loss in `tests/integration/capacity.test.ts`.

### Implementation for User Story 3

- [ ] T051 [P] [US3] Implement Action Populaire HTTP transport, timeout/status handling, retryable versus permanent error classification, and structured upstream metrics in `apps/worker/src/adapters/action-populaire-client.ts` and `apps/worker/src/adapters/action-populaire-client.test.ts`.
- [ ] T052 [P] [US3] Implement catalogue synchronization and active-scope repository behavior so a complete `GET /carte/liste_groupes/` response upserts active/inactive groups while a failed or partial response preserves the last complete catalogue in `apps/worker/src/catalogue/group-catalogue.ts` and `apps/worker/src/catalogue/group-catalogue.test.ts`.
- [ ] T053 [P] [US3] Implement paginated group event retrieval with one-based pages, `page_size` capped at `1000`, incremental processing, bounded concurrency, configurable batching, and explicit complete/failed retrieval state in `apps/worker/src/ingestion/event-pages.ts` and `apps/worker/src/ingestion/event-pages.test.ts`.
- [ ] T054 [P] [US3] Implement dispatcher locking, processing-period computation, active group discovery, deterministic BullMQ `calendar-ingestion` jobs, and scheduled ledger updates in `apps/worker/src/dispatcher/dispatcher.ts`, `apps/worker/src/dispatcher/lock.ts`, and `apps/worker/src/dispatcher/dispatcher.test.ts`.
- [ ] T055 [P] [US3] Implement BullMQ queue configuration with configurable retry limits, delayed exponential backoff and jitter, retained failed jobs, bounded queue settings, and worker concurrency in `apps/worker/src/queue/queue.ts` and `apps/worker/src/queue/queue.test.ts`.
- [ ] T056 [US3] Implement ingestion ledger transitions for `scheduled`, `running`, `publishing`, `succeeded`, `retrying`, and `failed`, retaining job ID, scope/period, attempts, lifecycle timestamps, worker ID, source revision, and sanitized errors in `apps/worker/src/operations/ingestion-ledger.ts` and `apps/worker/src/operations/ingestion-ledger.test.ts`.
- [ ] T057 [US3] Implement staged Redis snapshot publication, event/location persistence, stable source IDs, content-hash sequence changes, complete-snapshot cancellation rules, and atomic `current` pointer replacement in `apps/worker/src/persistence/snapshot-publisher.ts`, `apps/worker/src/persistence/event-repository.ts`, and `apps/worker/src/persistence/snapshot-publisher.test.ts`.
- [ ] T058 [US3] Implement the worker processor in the required order: retrieve upstream data, validate and transform it, write the staged result to Redis, publish the current snapshot, then acknowledge BullMQ only after successful publication in `apps/worker/src/ingestion/processor.ts`.
- [ ] T059 [US3] Add worker operational metrics, structured job logs, exhausted-job reporting, queue-depth/oldest-job signals, upstream failure signals, and recovery alerts in `apps/worker/src/operations/observability.ts`, `infra/monitoring/alerts.yml`, and `infra/monitoring/dashboard.json`.
- [ ] T060 [US3] Integrate dispatcher and processor startup with automatic reconnect/restart behavior, Redis persistence checks, and private readiness dependencies in `apps/worker/src/main.ts` and `infra/compose/docker-compose.yml`.
- [ ] T061 [US3] Document dispatcher interval, retry/backoff, page-size, batching, worker scaling, persistence recovery, capacity validation, and failure-state inspection commands in `README.md` and `specs/001-technical-foundation/quickstart.md`.

**Checkpoint**: User Story 3 is independently functional when distributed workers process jobs at least once with idempotent effects, complete paginated snapshots atomically, retry recoverable failures, and expose durable recovery state.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Close quality, security, documentation, and operational-readiness gaps across all stories.

- [ ] T062 [P] Add CI jobs for install, strict typecheck, lint, package tests, integration tests with Redis, Docker builds, and artifact validation in `.github/workflows/ci.yml`.
- [ ] T063 [P] Add registry publishing with immutable commit-based API and worker tags and environment-provided credentials in `.github/workflows/publish-images.yml`.
- [ ] T064 [P] Add HTTPS-only edge configuration, public-feed read-only enforcement, private Redis/BullMQ/health/admin network rules, and secret scanning checks in `infra/edge/https.conf`, `infra/compose/docker-compose.yml`, and `.github/workflows/security.yml`.
- [ ] T065 [P] Add operational alert thresholds relative to the 15-minute dispatcher interval and retry window for unavailable services, stale ingestion, queue growth, exhausted jobs, upstream failures, Redis failure, disk/memory pressure, and unavailable metrics in `infra/monitoring/alerts.yml`.
- [ ] T066 [P] Add backup/restore and Redis AOF rewrite validation documentation without claiming recovery from host or named-volume loss in `infra/redis/README.md` and `specs/001-technical-foundation/quickstart.md`.
- [ ] T067 Run the complete quickstart validation, including clean install, typecheck, tests, Docker builds, Redis restart, API feed checks, worker scaling, operational signals, and capacity test, and record any environment-specific prerequisites in `specs/001-technical-foundation/quickstart.md`.
- [ ] T068 Review production modules against the 100-150 line maintainability guideline, split oversized cohesive responsibilities, and update affected exports/tests in `packages/core/src/`, `apps/api/src/`, and `apps/worker/src/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies; tasks T002-T007 marked `[P]` can proceed after the workspace manifests establish the paths they target.
- **Phase 2 Foundational**: Depends on Phase 1; T008-T017, T019-T021 can proceed in parallel by area, while T018 completes the core public boundary after core implementation tasks exist.
- **User Stories**: All depend on Phase 2. User Story 1 is the smallest validation increment; User Stories 2 and 3 can proceed in parallel after the shared foundation, with US3 using the Redis and observability contracts established by Phase 2.
- **Phase 6 Polish**: Depends on the desired user stories being complete; CI and documentation tasks can proceed in parallel, while T067 and T068 are final validation/review tasks.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; no dependency on another story. Recommended first increment and MVP.
- **User Story 2 (P1)**: Starts after Phase 2; consumes core calendar and Redis snapshot contracts, but is independently testable with prepared Redis data and does not require the worker to fetch upstream data.
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
- **US3**: Three workers process 100 jobs without simultaneous ownership; interrupted jobs are redelivered; retryable failures obey configured limits and expose exhausted state; complete paginated data publishes atomically and replay is idempotent; queued work and datasets recover after Redis restart.

## Notes

- `[P]` means the task targets a distinct file set and has no dependency on an incomplete task in the same phase.
- `[US1]`, `[US2]`, and `[US3]` map directly to the three P1 user stories in `spec.md`.
- Every implementation task names the target file or directory and preserves the contracts from `spec.md`, `data-model*.md`, `contracts/`, `research.md`, and the repository diagrams.
- MVP scope is Phase 1, Phase 2, and Phase 3 (User Story 1). Deployment and ingestion are incremental follow-on deliveries.