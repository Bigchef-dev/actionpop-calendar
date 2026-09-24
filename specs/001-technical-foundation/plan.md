# Implementation Plan: Technical Foundation

**Branch**: `001-technical-foundation` | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-technical-foundation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the Phase 1 foundation for ActionPop Calendar as a pnpm TypeScript monorepo
with an independently deployable Fastify API, a horizontally scalable BullMQ worker,
and a dispatcher running in the worker image. Redis 7+ with AOF and a named Docker
volume is the durable store for calendar datasets, cache entries, and queue state.
The design uses deterministic scope-period job identities, a Redis scheduling lock,
idempotent writes, standard operational signals, and a private deployment network.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript on Node.js 20+ LTS, ESM with NodeNext module resolution

**Primary Dependencies**: pnpm workspaces, Fastify, BullMQ, Redis 7+, Vitest, Docker,
and an HTTPS deployment edge

**Storage**: Redis 7+ with AOF `appendfsync everysec`, `noeviction`, and a named
Docker volume mounted at `/data`; external backups are operationally required but
Redis replication is out of scope

**Testing**: Vitest package-local unit/contract tests, Fastify injection tests,
mocked worker boundary tests, and focused integration tests against real Redis

**Target Platform**: Linux containers deployed with registry-backed Docker Compose;
API and worker images run as separate services

**Project Type**: Backend web service and background worker in a pnpm monorepo

**Performance Goals**: Dispatcher defaults to a 15-minute interval; the baseline
deployment must support 5,000 subscribed users, 2,000 active groups, and 100,000
prepared events per ingestion cycle; at least 3 workers must process a representative
load without concurrent duplicate ownership; public feeds read prepared data without
calling Action Populaire synchronously

**Constraints**: Public feed access is read-only over HTTPS; Redis, BullMQ, health
internals, and administration are private; application time uses `Europe/Paris`;
jobs are at-least-once and all effects must be idempotent; business modules target
100-150 lines maximum

**Scale/Scope**: Planning baseline of 5,000 subscribed users, 2,000 active groups,
and 100,000 events per full ingestion cycle. One API service, one Redis service, one
dispatcher role, and horizontally scalable identical worker instances in Phase 1;
three workspace units (`core`, `api`, `worker`); no Redis replication or formal
availability target

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Independent features**: PASS. Core, API, dispatcher, and worker boundaries have
  independent contracts and focused tests.
- **TypeScript and verified types**: PASS. Strict TypeScript is a required build gate;
  external inputs receive runtime validation at adapter boundaries.
- **Test-first quality**: PASS. Unit, contract, integration, and failure-path tests
  are required by the spec and quickstart.
- **Small maintainable business logic**: PASS. Domain responsibilities remain focused
  and the 100-150 line guideline is included in the technical constraints.
- **Deployable by default**: PASS. API and worker have separate multi-stage images,
  externalized configuration, healthchecks, and documented startup validation.

## Project Structure

### Documentation (this feature)

```text
specs/001-technical-foundation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
packages/
└── core/
  ├── src/
  └── tests/
apps/
├── api/
│   ├── src/
│   └── tests/
└── worker/
  ├── src/
  └── tests/
infra/
├── docker/
└── compose/
tests/
└── integration/
```

**Structure Decision**: Use the three-unit pnpm workspace requested by the feature:
`packages/core` owns domain contracts and focused adapters, `apps/api` owns the
public read-only Fastify surface, and `apps/worker` owns dispatcher, BullMQ, upstream
retrieval, transformation, persistence publication, retries, and worker operations.
`infra` contains Docker and deployment configuration; integration tests are separate
from package-local tests.

## Post-Design Constitution Check

- **Independent features**: PASS. `core`, API feed handling, dispatcher scheduling,
  and worker ingestion each have focused contracts and independently runnable tests.
- **TypeScript and verified types**: PASS. Shared strict compiler settings, package
  exports, runtime validation at external boundaries, and `tsc -b` enforce contracts.
- **Test-first quality**: PASS. Quickstart scenarios cover normal paths, retries,
  redelivery, persistence, public feed behavior, and operational failures.
- **Small maintainable business logic**: PASS. Dispatcher, API, and ingestion stages
  remain separate responsibilities; no fourth deployable unit was introduced.
- **Deployable by default**: PASS. Multi-stage API/worker images, named Redis volume,
  private internal network, HTTPS edge, healthchecks, and external configuration are
  documented by the contracts and quickstart.

The design explicitly accepts BullMQ at-least-once delivery and compensates with
idempotent Redis effects, deterministic job identities, retained ingestion state, and
atomic snapshot publication. No constitution violation remains unjustified.

## Complexity Tracking

No constitution violations require a complexity exception. The dispatcher remains in
`apps/worker` rather than becoming a fourth deployable unit; worker processing can
scale independently while a Redis lock protects the single scheduling role.

