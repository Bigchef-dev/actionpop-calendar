# ActionPop Calendar

ActionPop Calendar is a pnpm TypeScript monorepo with three workspace units:

- `packages/core`: shared domain contracts and adapters
- `apps/api`: public read-only calendar API
- `apps/worker`: scheduled ingestion and BullMQ processing

## Requirements

- Node.js 20+ LTS
- Corepack with pnpm enabled

Enable the pinned package-manager version and install dependencies from the lockfile:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Run the complete repository quality pipeline:

```bash
pnpm quality
```

The quality pipeline runs strict project-reference type checking, linting, package
tests, integration tests, and builds for all workspace units. Individual checks are
also available:

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm lint
pnpm build
```

Focused package commands use pnpm filters:

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/api test
pnpm --filter @actionpop/worker test
```

`pnpm dev` starts the Redis and Postgres containers, applies pending Prisma
migrations, then builds and runs the API. If Docker requires elevated rights on your
machine, start the dependencies once with `sudo pnpm dev:infra` (or add your user to
the `docker` group) before running `pnpm dev`. Startup aborts with a single message
naming the unreachable dependency instead of retrying forever.

### Map event discovery

The worker reads the public map listing (`GET /carte/liste_evenements/`) once per
cycle to fill coverage gaps left by group and event ingestions. A listed identity is
selected only when no active scope keeps it fresh, it has no pending or active event
scope, it has not ended, and its reconciliation is due. Selected identities become
**pending event scopes**, so the existing promotion ceiling, detail processor,
publication and attribution remain the only path to the calendar.

The map summary is never canonical: it supplies identity and change hints only. The
detail document remains the sole source of content. Absence from the listing never
cancels or removes an event. Configuration:

- `INGESTION_MAP_DISCOVERY_ENABLED` (default `true`)
- `INGESTION_MAP_FRESHNESS_HORIZON_MS` (default one hour)
- `INGESTION_MAP_RECONCILIATION_INTERVAL_MS` (default seven days)

Operator counters include `map.entries`, `map.gap_candidates`, `map.selected`,
`map.skipped`, `map.rejected`, `map.hints_dropped` and the `map.outcomes_*` family.

### Geographic reference

Events are attached to a country, a department and a commune from the raw Action
Populaire fields (`location.country`, `location.departement`, `location.commune.name`
or `location.city`). Map coordinates are stored but never used for that decision, and
region, EPCI, constituency and arrondissement levels are out of scope for now.

The reference lives in Postgres (`geographic_reference_version`,
`department_reference`, `commune_reference`) and is refreshed by an operator:

```bash
pnpm geo:refresh                                    # publication date defaults to today
GEOGRAPHIC_PUBLICATION_DATE=2026-01-01 pnpm geo:refresh
EVENT_TYPES="tractage,boitage,diffusion-tracts" pnpm geo:event-types
```

Run the worker with `pnpm dev:worker` (watch mode) or `pnpm start:worker` (built output).

`pnpm geo:refresh` parses `data/communes-france-2026.csv`, validates it, stages a
version and activates it in one transaction; a failed refresh leaves the previous
version active. Event-type labels are registered automatically on first sight, so a new
platform value never breaks ingestion; `pnpm geo:event-types` pre-seeds that registry
from a known list, useful before a first run or for backfilling. Without an active
reference version, events are still published with their stated country and a
`geographic_status` of `unavailable`. PostgreSQL integration tests read `TEST_DATABASE_URL` (falling
back to `DATABASE_URL`) and isolate each test file in its own schema.

Prisma Studio provides a local visual interface for the persisted Postgres data and
`pnpm dev:tools` additionally starts RedisInsight and Bull Board:

```bash
pnpm dev:tools
pnpm db:setup
pnpm dev:studio
```

`pnpm db:setup` also tries to start the dependencies, so it can be used on its own.
When Docker requires elevated rights it prints a warning and the migration fails with
an explicit hint naming the unreachable Postgres.

`pnpm dev:tools` starts Redis, Postgres, RedisInsight (`http://127.0.0.1:5540`) and
Bull Board (`http://127.0.0.1:5541`). Stop the development stack with `pnpm dev:down`,
or run `docker compose down` from `infra/compose`; no environment variable is needed
to stop or inspect the stack.

Containers are named after the Compose project (`actionpop`), so no explicit
`container_name` is used. If a container created by an older revision of this
repository still holds a fixed name, remove it once:

```bash
docker rm -f bull-board dev-redisinsight
```

Prisma Studio is available at `http://127.0.0.1:5552` and binds only to loopback.
The API can then be started in a second terminal:

```bash
pnpm dev
```

Environment files are loaded by the API and worker entry points and by every
`pnpm prisma:*` script: `.env` holds shared defaults and the optional `.env.local`
holds machine-specific overrides such as loopback hostnames. Recreate them once with:

```bash
cp .env.example .env
printf 'REDIS_URL=redis://127.0.0.1:6379\nDATABASE_URL=postgresql://actionpop:actionpop@127.0.0.1:5432/actionpop\nNODE_ENV=development\n' > .env.local
pnpm db:setup
```

Both files are git-ignored except `.env.example`. Every Prisma script prints the
resolved target (host and database only) so migrations, Studio, and the application
are guaranteed to use the same database. `pnpm prisma:migrate:status` reports pending
migrations when Studio shows an empty or missing table.

After a schema change, the database and the generated client must both follow it:
`relation "ingestion_scope" does not exist` means migrations were not applied, and
`Cannot read properties of undefined (reading 'findMany')` means the client was not
regenerated. The API and worker refuse to start in either case and name the fix;
`pnpm prisma:generate` then `pnpm prisma:migrate` (or `pnpm db:setup`) resolves both.

The API is then available at `http://127.0.0.1:3000`. The public surface remains
the read-only `GET /feed/{scopeId}` route; Redis, worker responsibilities, and
internal health routes are not exposed by the development command. The dev
override binds Redis to loopback only; the production Compose configuration keeps
Redis private to the Docker network.

To verify the typecheck gate, run the dedicated regression test. It creates a
temporary public TypeScript value with an invalid type and expects `tsc -b` to report
the affected file:

```bash
pnpm exec vitest run tests/integration/typecheck-gate.test.ts --config vitest.config.ts
```

The workspace keeps the API and worker independently deployable. Shared code belongs
in `packages/core`; service-specific code stays in its application package. Runtime
configuration and deployment details are documented in the technical foundation
quickstart under `specs/001-technical-foundation/quickstart.md`.

Build and start the independent runtime targets:

```bash
docker build -t actionpop-api:test -f infra/docker/Dockerfile.api .
docker build -t actionpop-worker:test -f infra/docker/Dockerfile.worker .
cp infra/compose/.env.example infra/compose/.env
docker compose -f infra/compose/docker-compose.yml up -d
```

The public surface is the read-only `GET /feed/{scopeId}` route, the read-only
`GET /events` route, and the read-only `GET /calendar.ics` route. `/events` filters events
by `country`, `department`, `commune` and `event_type` with `AND` semantics. Geographic
identifiers are strings, so `01`, `2A` and `01001` keep their leading zeroes.

`GET /calendar.ics` returns the matching events as an iCalendar (RFC 5545) document that a
calendar client can subscribe to:

```text
GET /calendar.ics?department=69&insee_commune=69123,69124&event_type=tractage
GET /calendar.ics?commune_name=Lyon,Villeurbanne&event_type=tractage
```

It accepts `country`, `department`, `commune_name`, `insee_commune` and `event_type`. Values
inside one parameter combine with OR, distinct parameters combine with AND, and
`commune_name`/`insee_commune` form one commune dimension whose values union. A commune name
that stays ambiguous without a `department` is rejected with a diagnostic instead of being
chosen arbitrarily. The calendar covers a configurable window and includes an event when it
overlaps it.

Each entry carries the standard `LOCATION`, `URL`, `CATEGORIES` and `GEO` properties when the
event states them, plus `X-ACTIONPOP-*` experimental properties whose set depends on the
configured metadata level: `off`, `identity`, `standard` (default) or `full`. `standard`
emits the event identifier, the last update and processing period, the event type, the source
page and the contributing groups; `full` adds the geographic attachment, its diagnostics and
the raw source values.

### Shared configuration file

The whole application configuration lives in one YAML document, `config/actionpop.yaml`,
created from the commented reference `config/actionpop.example.yaml`. The API and the worker
read the same document, every value has a documented default, and an environment variable
overrides the matching key without editing the file. Secrets and credential-bearing endpoints
(`DATABASE_URL`, `REDIS_URL`, `UPSTREAM_BASE_URL`, `UPSTREAM_TOKEN`) stay environment-only.

```bash
cp config/actionpop.example.yaml config/actionpop.yaml
CALENDAR_LOOKBACK_DAYS=7 CALENDAR_LOOKAHEAD_DAYS=60 pnpm dev
```

Invalid values abort startup with a message naming the setting and whether it came from the
file or the environment. The calendar settings are `enabled`, `lookbackDays`,
`lookaheadDays`, `maxEntries`, `maxGroupsPerEvent`, `revalidationSeconds`, `metadataLevel` and
`disabledFamilies`; see `specs/003-icalendar-filtered-feed/contracts/configuration-file.md`
for the complete table.

The API also serves its own OpenAPI document and an interactive Scalar reference, generated
from the running service: `GET /openapi.json` and the `/reference` page
(`http://127.0.0.1:3000/reference` in development). Set `API_REFERENCE=false` to stop
serving the page. Redis, BullMQ,
worker responsibilities, and internal health routes stay on the private network.
Production traffic must terminate HTTPS at the deployment edge.

GitHub Actions runs install, typecheck, lint, tests, integration checks, builds, and
both Docker targets. Pushes to `main` publish immutable API and worker images to
GHCR using the commit SHA; registry credentials are supplied by GitHub Actions.

Worker operations use a 15-minute dispatcher period by default. Retry limits and
backoff are configured with `QUEUE_ATTEMPTS` and `QUEUE_BACKOFF_MS`; inspect queue
depth, exhausted jobs, upstream failures, and Redis readiness through the monitoring
configuration under `infra/monitoring/`.
