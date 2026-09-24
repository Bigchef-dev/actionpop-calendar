# Feature Specification: Technical Foundation

**Feature Branch**: `001-technical-foundation`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Phase 1: Technical Foundation & Infrastructure with Node.js 20+ LTS, strict TypeScript, pnpm workspaces, Fastify, isolated API and worker applications, Redis persistence, BullMQ-based worker scaling, multi-stage Docker images, and registry-ready deployment."

## Clarifications

### Session 2026-09-24

- Q: Quel stockage physique doit être la source de vérité des événements et des états de traitement ? → A: Redis avec AOF et un volume Docker persistant pour les données, la file BullMQ et le cache.
- Q: Dans quel ordre le dispatcher et les workers doivent-ils exécuter une mise à jour d’événements ? → A: Dispatcher → file BullMQ → worker récupère l’API Action Populaire → valide et transforme → écrit dans Redis → confirme le job.
- Q: À quelle fréquence le dispatcher doit-il lancer une nouvelle période de mise à jour ? → A: Intervalle configurable avec une valeur par défaut de 15 minutes.
- Q: Quel niveau de contrôle opérationnel et de fiabilité veux-tu garantir en production ? → A: Niveau production standard avec healthchecks, logs structurés, métriques, alertes, retries et reprise automatique.
- Q: Comment veux-tu protéger l’API et les flux calendrier en production ? → A: Flux publics en lecture seule, services internes privés, secrets hors du dépôt et HTTPS obligatoire.
- Q: Comment paginer les événements des groupes Action Populaire ? → A: Paramètres `page` et `page_size`, pages commençant à 1, taille configurable plafonnée à 1000, jusqu’à une page courte ou vide.
- Q: Comment découvrir la liste des groupes actifs à traiter ? → A: Utiliser `GET /carte/liste_groupes/` comme source d’autorité, synchroniser le catalogue dans Redis et ne planifier que les groupes dont `is_active` vaut `true`.
- Q: Quelle source doit être considérée comme la source d’autorité pour découvrir les groupes actifs et récupérer les événements à ingérer ? → A: Le dispatcher lit le catalogue des groupes via `GET /carte/liste_groupes/`; ensuite, pour chaque groupe actif, le worker récupère les événements par pages via `GET /events?page=X&page_size=Y` jusqu’à la page courte ou vide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a Consistent Development Environment (Priority: P1)

As a developer, I want one repository command to install dependencies, check types,
and run the project checks so that every contributor works from the same foundation.

**Why this priority**: A consistent foundation prevents setup drift and is required
before the API or worker can be developed reliably.

**Independent Test**: A clean checkout can install dependencies and complete the
project's type and test checks without relying on a developer-specific machine setup.

**Acceptance Scenarios**:

1. **Given** a clean checkout and the supported Node.js LTS runtime, **When** the
   developer runs the documented setup command, **Then** all workspace dependencies
   install successfully through pnpm.
2. **Given** the installed workspace, **When** the developer runs the quality
   commands, **Then** strict TypeScript checking and automated tests complete with
   clear success or failure output.
3. **Given** a package with an invalid public type, **When** type checking runs,
   **Then** the check fails and identifies the affected package or file.

---

### User Story 2 - Deploy API and Worker Independently (Priority: P1)

As an operator, I want separate API and worker images that can be built and started
independently so that each workload can be deployed, restarted, and scaled without
rebuilding or replacing the other.

**Why this priority**: The API serves calendar clients while the worker performs
scheduled ingestion; their resource and failure profiles are different.

**Independent Test**: Build and start only the API image, then only the worker image,
and verify that each has its documented startup behavior and configuration contract.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** the image build commands run, **Then** they
   produce separate minimal runtime images for the API and worker.
2. **Given** the required runtime configuration, **When** the API image starts,
   **Then** it exposes its documented service behavior without starting worker jobs.
3. **Given** the required runtime configuration, **When** the worker image starts,
   **Then** it processes worker responsibilities without exposing the API service.
4. **Given** a deployment with no hard-coded secrets, **When** configuration is
   supplied through the deployment environment, **Then** both images start using the
   supplied values.

---

### User Story 3 - Scale Scheduled Ingestion Safely (Priority: P1)

As an operator, I want multiple worker instances to share scheduled ingestion jobs
without duplicate ownership so that worker capacity can increase without multiplying
requests to the Action Populaire service.

**Why this priority**: Horizontal scaling is necessary for reliable ingestion while
protecting the upstream service from duplicate scheduled work.

**Independent Test**: Enqueue a known set of jobs, run multiple worker instances, and
verify that each job is completed once, retried according to policy when it fails,
and remains recoverable after a worker interruption.

**Acceptance Scenarios**:

1. **Given** multiple workers connected to the same queue, **When** scheduled jobs
  are dispatched, **Then** each job is claimed by one worker, which retrieves,
  validates, transforms, and writes its data before confirming completion.
2. **Given** a worker fails while processing a job, **When** the job lease expires,
   **Then** the job becomes eligible for retry without being silently lost.
3. **Given** a transient upstream failure, **When** the retry policy is applied,
   **Then** the system retries within the configured limits and records a final
   failure when those limits are exhausted.
4. **Given** Redis is restarted with persistence enabled, **When** the services
   reconnect, **Then** queued work and required calendar data remain available.

### Edge Cases

- A developer runs setup with an unsupported Node.js version.
- A package has an undeclared workspace dependency or a type error.
- An image starts without a required environment variable or with an invalid value.
- API and worker containers start in either order while Redis is unavailable.
- Two workers receive the same scheduling signal at nearly the same time.
- A worker stops after claiming a job but before recording completion.
- Redis reaches its configured storage limit or loses connectivity during a write.
- A job repeatedly fails because the upstream service remains unavailable.
- A full ingestion cycle contains thousands of groups or events and must paginate,
  bound concurrency, and apply backpressure without exhausting worker memory or Redis.
- A dispatcher retries a scheduling cycle and must not create a second active job
  for the same scope and processing period.
- The configured dispatcher interval is missing, invalid, or shorter than the time
  needed to complete the previous scheduling cycle.
- A client attempts to write data, access Redis, reach an administration endpoint,
  or connect to a calendar feed without HTTPS.
- All application dates and times must use the project timezone, `Europe/Paris`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST support Node.js 20 or a newer supported LTS release.
- **FR-002**: The project MUST use strict TypeScript checking across all production
  packages and fail quality checks when public types are invalid.
- **FR-003**: The repository MUST use pnpm workspaces to manage the shared package,
  API application, and worker application from one source repository.
- **FR-004**: The repository MUST provide a reusable core package for domain models,
  Action Populaire payload types, Redis access, and calendar generation logic.
- **FR-005**: The repository MUST provide an API application that serves web calendar
  requests and reads prepared data without executing worker ingestion responsibilities.
- **FR-006**: The repository MUST provide a worker application that retrieves and
  prepares upstream data without exposing the API service.
- **FR-007**: The API and worker MUST be buildable as separate multi-stage Docker
  images containing only the runtime files and dependencies they need.
- **FR-008**: The deployment MUST support pulling the API and worker images from a
  container registry and starting them with environment-provided configuration.
- **FR-009**: The deployment MUST provide Redis as the sole persistence store for
  prepared events, cache entries, and BullMQ state, with append-only persistence and
  a named Docker data volume so those values survive service restarts.
- **FR-010**: Scheduled ingestion MUST use a shared Redis-backed queue whose job
  ownership prevents simultaneous workers from processing the same job.
- **FR-011**: The dispatcher MUST discover active update scopes from `GET
  /carte/liste_groupes/`, synchronize the group catalogue in Redis, and MUST enqueue
  one deterministically identified job for each scope and processing period without
  creating a second active job for that same scope and period.
- **FR-011A**: For every active group, the worker MUST retrieve upstream events by
  paginating `GET /events?page=X&page_size=Y` until a short or empty page is
  reached, then validate, transform, and write the resulting dataset to Redis in a
  single processing cycle.
- **FR-012**: The dispatcher MUST run on a configurable interval with a default of
  15 minutes, and MUST prevent overlapping scheduling cycles.
- **FR-013**: A worker MUST process a claimed job in this order: retrieve upstream
  data, validate and transform it, write the result to Redis, then acknowledge the
  job only after the write succeeds.
- **FR-014**: The queue MUST support configurable retry limits, delayed retries, and
  observable final failure state for jobs that cannot be completed.
- **FR-015**: The worker deployment MUST support increasing worker instance count
  without changing job definitions or dispatching duplicate work.
- **FR-016**: Workers MUST process upstream groups and events through pagination,
  bounded concurrency, and configurable batching or backpressure so a full cycle
  does not require loading all source data into one process at once.
- **FR-017**: Runtime configuration MUST be externalized and MUST NOT require secrets
  or host-specific values to be committed to the repository.
- **FR-018**: Calendar feeds MUST be publicly readable and MUST reject write or
  administration operations from the public interface.
- **FR-019**: Redis, BullMQ, dispatcher controls, health internals, and
  administration endpoints MUST remain private to the deployment network.
- **FR-020**: Production traffic to public calendar feeds MUST use HTTPS, and the
  deployment MUST keep credentials and private configuration out of the repository.
- **FR-021**: Date and time values created or interpreted by this feature MUST use
  `Europe/Paris` unless an explicitly scoped feature specification overrides it.
- **FR-022**: The API, worker, dispatcher, and Redis service MUST expose health
  checks that identify readiness and dependency failure clearly.
- **FR-023**: The API and worker MUST emit structured logs containing the service,
  job or request identifier, outcome, duration, and failure reason when applicable.
- **FR-024**: The deployment MUST expose metrics for request failures, job duration,
  queue depth, retry count, exhausted jobs, and Redis connectivity.
- **FR-025**: The deployment MUST provide actionable alerts for unavailable services,
  growing queue depth, exhausted jobs, repeated upstream failures, and Redis failure.
- **FR-026**: Services MUST restart or reconnect automatically after a recoverable
  process or Redis interruption, while preserving queued work and exposing failure
  state when recovery is not possible.
- **FR-027**: The repository MUST document the commands for local setup, type checks,
  tests, image builds, image publishing, and production startup.

### Key Entities

- **Workspace Package**: A separately testable shared unit containing domain models,
  adapters, and reusable calendar or persistence behavior.
- **API Application**: The independently deployable service that responds to calendar
  client requests using prepared data.
- **Worker Application**: The independently deployable service that schedules and
  processes upstream data jobs.
- **Ingestion Job**: A uniquely identified unit of upstream retrieval and preparation,
  with a deterministic scope-period identity, ownership, retry, completion, and
  failure state.
- **Runtime Configuration**: Environment-provided values required to connect services,
  configure retries, and publish or consume container images.
- **Operational Signal**: A structured log, metric, health status, or alert that
  enables an operator to identify service, queue, upstream, or persistence failure.
- **Redis Persistence Store**: The physical Redis-backed store containing prepared
  event data, cache entries, and recoverable BullMQ state after a restart.
- **Calendar Dataset**: Prepared event data retained in the Redis Persistence Store
  for API consumption and restored after a Redis restart.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new developer can reach a successful dependency install, type check,
  and test run from a clean checkout using the documented commands in 10 minutes or
  less on a supported development machine.
- **SC-002**: 100% of production packages fail the quality check when a deliberate
  public type error is introduced.
- **SC-003**: Operators can build and start the API and worker as separate images,
  with each workload starting independently in 5 minutes or less after image pull.
- **SC-004**: In a test run with at least 3 concurrent workers and 100 scheduled jobs,
  each job is completed at most once concurrently and no job is silently lost.
- **SC-005**: After a controlled Redis restart, 100% of queued test jobs and persisted
  calendar datasets are recoverable.
- **SC-006**: A transient upstream failure is retried according to the configured
  policy, and 100% of exhausted jobs expose a final failure state for operations.
- **SC-007**: A reviewer can identify the setup, validation, image build, registry,
  and production startup commands from the project documentation without additional
  tribal knowledge.
- **SC-008**: The dispatcher starts scheduling cycles at the configured interval,
  defaults to 15 minutes when no override is provided, and never runs overlapping
  scheduling cycles in a test with a deliberately slow cycle.
- **SC-009**: Operators can determine the affected service, job or request, failure
  reason, and recovery state for every simulated API, worker, upstream, queue, and
  Redis failure using the documented logs, metrics, healthchecks, and alerts.
- **SC-010**: After a recoverable process or Redis interruption, services reconnect
  or restart automatically and recover 100% of queued test jobs without manual data
  repair.
- **SC-011**: Public feed requests over HTTPS return calendar data in read-only mode,
  while unauthenticated attempts to reach Redis, BullMQ, health internals, or
  administration endpoints are rejected in every deployment test.
- **SC-012**: A capacity test with 5,000 subscribed users, 2,000 active groups, and
  100,000 prepared events completes a full ingestion cycle without worker memory
  exhaustion, silent job loss, or unbounded queue growth.

## Assumptions

- The Action Populaire service exposes the upstream data needed by the worker and
  remains an external dependency of this phase.
- Redis with AOF and a named Docker volume is the sole physical persistence and queue
  service for the initial deployment model; replacing it with another database is
  outside this phase.
- BullMQ is the selected queue mechanism for Redis-backed job ownership and retries.
- The dispatcher interval defaults to 15 minutes and can be overridden through
  runtime configuration.
- Production uses standard operational controls: healthchecks, structured logs,
  metrics, actionable alerts, configurable retries, and automatic recovery for
  recoverable process or Redis interruptions. Redis replication and formal on-call
  availability targets are outside this phase.
- Calendar feeds are public and read-only because external calendar clients need to
  subscribe without an interactive login. Internal services and administration
  surfaces are private, and HTTPS is terminated by the deployment edge.
- Fastify is the selected HTTP framework for the API application.
- Docker images are built by CI and published to a registry such as GitHub Container
  Registry or Docker Hub; registry credentials are supplied by the deployment system.
- Alpine is the selected base image family for the final runtime images.
- Authentication, authorization, calendar endpoint behavior, and detailed Action
  Populaire mapping are separate features and are not implemented by this phase.
- The initial production deployment uses one Redis service and permits horizontal
  worker scaling through additional worker containers.
- Phase 1 capacity planning uses 5,000 subscribed users, 2,000 active groups, and
  100,000 events per full ingestion cycle as a baseline; actual production limits
  must be confirmed by load testing and Redis capacity measurements.
