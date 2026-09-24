# Phase 0 Research: Technical Foundation

## Decision: pnpm TypeScript workspace with three units

**Decision**: Use `packages/core`, `apps/api`, and `apps/worker` in one pnpm
workspace. Use `workspace:` dependencies, strict TypeScript project references,
package-local Vitest tests, and compiled `dist/` output per unit.

**Rationale**: The layout matches the independent feature and independent deployment
requirements while avoiding a fourth deployable dispatcher application. The core
package contains domain contracts and focused adapters; Fastify remains isolated in
the API; BullMQ and scheduling remain in the worker.

**Alternatives considered**:

- One application package: rejected because API and worker responsibilities would be
  coupled and harder to scale or test independently.
- Turborepo or Nx: deferred because pnpm filters and recursive scripts are sufficient
  for three units in Phase 1.
- CommonJS: rejected in favor of deliberate NodeNext ESM behavior for Node 20+.

## Decision: Redis AOF is durable storage for Phase 1

**Decision**: Use Redis 7+ with `appendonly yes`, `appendfsync everysec`,
`maxmemory-policy noeviction`, and a named Docker volume mounted at `/data`.
Redis replication is out of scope; external backup and restore testing are required
for deployment readiness.

**Rationale**: AOF and a named volume preserve queue, cache, and prepared calendar
state across normal container restarts. `everysec` balances durability and write
latency. `noeviction` prevents silent removal of BullMQ or calendar keys.

**Alternatives considered**:

- RDB-only persistence: rejected because recent queue and calendar writes could be lost.
- `appendfsync always`: reserved for a stricter recovery point objective because it
  increases write latency.
- Anonymous volume: rejected because replacement containers would not reliably reuse it.
- PostgreSQL: deferred outside this phase because Redis is the explicitly selected
  sole persistence store.

## Decision: Dispatcher lock plus deterministic at-least-once jobs

**Decision**: Keep the dispatcher in `apps/worker`. Run it at a configurable interval
(default 15 minutes), protect each scheduling cycle with a Redis lock, and enqueue
one deterministic job per scope and processing period. Use the queue name
`calendar-ingestion` and a colon-free job ID with a version prefix, such as
`ingest-v1_scope-<scope-token>_period-<utc-slot>`.

**Rationale**: The lock prevents concurrent scheduler cycles when multiple worker
containers use the same image. The deterministic ID protects repeated cycles, while
BullMQ's at-least-once semantics require idempotent writes and a retained application
ledger. UTC identity prevents daylight-saving ambiguity while the application still
uses `Europe/Paris` for user-facing time handling.

**Alternatives considered**:

- Local process mutex: rejected because it does not coordinate multiple containers.
- Deterministic IDs without a ledger: rejected because removed queue records can make
  old IDs reusable.
- One recurring BullMQ scheduler per scope: deferred because scope discovery and
  period identity are clearer in one dispatcher cycle for Phase 1.
- Exactly-once processing: rejected because worker loss can cause redelivery.

## Decision: Idempotent snapshot publication

**Decision**: A worker retrieves, validates, transforms, writes a complete staged
snapshot, atomically publishes its current-snapshot pointer, and only then returns
success to BullMQ. Event writes use stable source event IDs and content hashes.
Missing events are cancelled only after a complete successful source snapshot.

**Rationale**: The API must never read a partially written dataset, and replayed jobs
must not increment event sequence or corrupt state. A staging snapshot and pointer
make publication atomic from the API's perspective.

**Alternatives considered**:

- Write each event directly to the live dataset: rejected because API reads could
  observe partial ingestion.
- Content hash as event identity: rejected because source event IDs are the stable
  identity; hashes only detect normalized content changes.

## Decision: Bounded retries and failure classification

**Decision**: Retry network failures, timeouts, HTTP 429/5xx, and temporary Redis
failures with configurable exponential backoff and jitter. Do not automatically retry
malformed payloads, invalid scope configuration, or permanent authentication failures.
Retain failed jobs and an ingestion ledger with final failure details.

**Rationale**: Bounded retries protect the upstream API and make operational failure
visible without retrying permanent defects indefinitely. The ledger provides durable
business state beyond BullMQ's operational history.

## Decision: Standard production operations

**Decision**: Provide private liveness/readiness checks, JSON logs, bounded-label
metrics, and alerts for unavailable services, queue growth, exhausted jobs, upstream
failures, Redis persistence failures, and missing successful ingestions. Use HTTPS at
the deployment edge; expose only public read-only calendar feeds.

**Rationale**: This is the selected production standard and keeps internal dependency
and administration surfaces private. The feed is public for compatibility with
calendar clients; Redis replication and formal availability targets remain outside
Phase 1.

**Alternatives considered**:

- Logs only: rejected because queue and persistence failures need measurable alerts.
- Full high availability with Redis replication and on-call targets: deferred to a
  later phase due to scope and operational cost.

## Decision: Separate public API and worker images

**Decision**: Build API and worker runtime images from multi-stage Docker builds,
run as non-root users, publish immutable commit-based tags, and deploy with a
registry-backed Docker Compose setup on one host for Phase 1.

**Rationale**: Separate images preserve independent scaling and failure domains while
avoiding premature orchestration complexity. Compiled JavaScript and production-only
dependencies make the runtime contract predictable.

**Alternatives considered**:

- Kubernetes: rejected for Phase 1 because it adds operational complexity without a
  current availability requirement.
- API-triggered upstream fetches: rejected because calendar clients can create
  unpredictable request volume and upstream rate-limit pressure.

## Decision: Explicit Phase 1 scale baseline

**Decision**: Plan and validate the initial deployment against 5,000 subscribed
users, 2,000 active groups, and 100,000 prepared events per full ingestion cycle.
Workers must paginate upstream reads, bound concurrency to respect upstream limits,
batch Redis writes where safe, and apply queue backpressure instead of loading an
entire national dataset into one process at once.

**Rationale**: “Several thousand” is an operational requirement, not just a future
optimization. Explicit baseline values make capacity tests, Redis sizing, worker
concurrency, and alert thresholds verifiable while leaving room to scale worker
instances horizontally.

**Alternatives considered**:

- Relying only on the 100-job test: rejected because it does not exercise thousands
  of scopes or events.
- Unbounded worker concurrency: rejected because it risks upstream rate limits,
  memory pressure, and Redis saturation.
- Loading all groups and events in memory: rejected because peak memory would grow
  with the full dataset rather than the configured page and batch sizes.
