# Quickstart Validation: Technical Foundation

This guide validates the Phase 1 foundation without requiring a public production
endpoint. Run commands from the repository root.

## Prerequisites

- Node.js 20+ LTS
- Corepack with pnpm enabled
- Docker Engine and Docker Compose
- Registry credentials only for image publishing checks

## Workspace checks

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm quality
```

Expected outcomes:

- All workspace packages install through pnpm with the lockfile enforced.
- Strict TypeScript checking passes across `packages/core`, `apps/api`, and
  `apps/worker`.
- Core, API, and worker tests run independently.
- Integration tests use real Redis and clean up their test data.

The individual quality commands are available when a focused failure needs to be
diagnosed:

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm lint
pnpm build
```

To verify that an invalid public type is rejected by the compiler gate:

```bash
pnpm exec vitest run tests/integration/typecheck-gate.test.ts --config vitest.config.ts
```

The test creates a temporary invalid export, runs `tsc -b`, and checks that the
affected file and TypeScript diagnostic are reported.

Focused examples:

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/api test
pnpm --filter @actionpop/worker test
```

## Docker and persistence checks

```bash
docker compose -f infra/compose/docker-compose.yml up -d redis
# Confirm Redis readiness, AOF configuration, and the named volume.
docker compose -f infra/compose/docker-compose.yml ps

docker compose -f infra/compose/docker-compose.yml down
# Restart Redis without removing its named volume, then verify test data remains.
docker compose -f infra/compose/docker-compose.yml up -d redis
```

The persistence test must verify that a prepared dataset and a queued test job remain
available after a normal Redis container restart. It must not claim disaster recovery
from host or volume loss.

## Dispatcher and worker checks

```bash
pnpm --filter @actionpop/worker test -- dispatcher
pnpm --filter @actionpop/worker test -- ingestion
```

Verify:

1. Two dispatcher attempts for one scope-period produce one active job.
2. A slow scheduling cycle cannot overlap a second cycle.
3. Three workers process 100 jobs with one active owner per job.
4. A worker terminated after claiming a job allows redelivery.
5. A replayed job does not duplicate event effects or increment `sequence` without a
   normalized content change.
6. A partial upstream response does not cancel missing events.
7. A complete successful snapshot publishes atomically for API readers.

## Capacity checks

Run a representative capacity test with 5,000 subscribed users, 2,000 active groups,
and 100,000 prepared events. The test data may be synthetic, but it must exercise
the same pagination, bounded concurrency, batching, and Redis publication paths as
production.

Verify that:

- Upstream pages are processed incrementally rather than loaded all at once.
- Worker memory remains bounded as group and event counts increase.
- Queue depth does not grow without bound during a complete cycle.
- Redis memory, disk usage, AOF rewrite behavior, and write latency remain within
  configured operational limits.
- Adding worker instances increases throughput without duplicate active ownership.

Optional Redis-backed scaling and capacity checks are enabled explicitly:

```bash
RUN_REDIS_INTEGRATION=1 pnpm test:integration
RUN_CAPACITY_TEST=1 pnpm exec vitest run tests/integration/capacity.test.ts
```

The worker defaults to a 15-minute dispatcher interval. Configure `QUEUE_ATTEMPTS`
and `QUEUE_BACKOFF_MS`, then inspect failed jobs and queue growth using the metrics
and alert rules in `infra/monitoring/`.

## Backup and restore

Validate AOF persistence and perform an external backup with the commands in
`infra/redis/README.md`. A normal Redis container restart must preserve datasets and
queued jobs; loss of the host or named volume is outside the recovery guarantee.

## API contract checks

```bash
pnpm --filter @actionpop/api test -- feed
```

Verify:

- `GET /feed/{scopeId}` returns `text/calendar` with stable UIDs and valid CRLF lines.
- The route reads prepared Redis data and does not call Action Populaire.
- `If-None-Match` returns `304` for an unchanged feed revision.
- Public mutation methods are rejected.
- Redis, BullMQ, readiness internals, and administration routes are not public.
- HTTP is rejected or redirected at the deployment edge; HTTPS serves the feed.

## Operational checks

```bash
# Build both runtime targets.
docker build -t actionpop-api:test -f infra/docker/Dockerfile.api .
docker build -t actionpop-worker:test -f infra/docker/Dockerfile.worker .

# Start the local stack and inspect health, logs, and metrics.
cp infra/compose/.env.example infra/compose/.env
docker compose -f infra/compose/docker-compose.yml up -d
```

The API exposes only `GET /feed/{scopeId}` publicly. `POST`, `PUT`, `PATCH`, and
`DELETE` feed requests return `405`; Redis, BullMQ, worker health, and administration
surfaces remain private. Configure registry image names with `API_IMAGE` and
`WORKER_IMAGE`; provide secrets through the deployment environment.

Verify that healthchecks distinguish liveness from readiness, JSON logs include job
or request context without secrets, metrics expose queue and failure signals, and a
simulated recoverable interruption reconnects or restarts services without silently
losing queued jobs.
