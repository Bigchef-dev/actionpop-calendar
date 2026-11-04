# ActionPop Calendar

ActionPop Calendar is a pnpm TypeScript monorepo with four workspace units:

- `packages/core`: shared domain contracts and adapters
- `apps/api`: public read-only calendar API
- `apps/worker`: scheduled ingestion and BullMQ processing
- `apps/web`: Vue 3 + Vite campaign agenda, published on GitHub Pages
  (see [apps/web/README.md](apps/web/README.md))

## Requirements

- Node.js 26+ (the floor is declared once in `engines.node` and mirrored by every
  workflow and Docker image)
- pnpm 12.8.1, the version pinned by `packageManager`

Install the pinned package manager, then install dependencies from the lockfile:

```bash
npm install --global pnpm@12.8.1
pnpm install --frozen-lockfile
```

Node 26 no longer bundles corepack, so the Docker images install pnpm the same way.

TypeScript is held at 6.0.x on purpose: `typescript-eslint` declares `typescript

> =4.8.4 <6.1.0`, so TypeScript 7 would silently disable type-aware linting. Dependabot
> ignores that major; raising it needs the linter's support first.

Runtime images are pinned to a current major in `infra/compose/docker-compose.yml`, and
`.github/workflows/integration.yml` runs the same tags, asserted by
`tests/integration/images.test.ts`. Two rules follow from datastore persistence:

- **A datastore major may only move forward.** Redis refuses to load a data directory
  written by a newer major, and PostgreSQL refuses to start on data from a newer major,
  so a downgrade is a data-loss decision, not an image change.
- **A datastore major bump recreates its volume.** The named volumes carry the format of
  the major that wrote them. Recreating them is deliberate:
  `docker compose -f infra/compose/docker-compose.yml down -v`, then `up -d`. That drops
  the queue and the database; the dispatcher re-schedules group work on the next cycle,
  so nothing is lost that PostgreSQL does not already hold.

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

`pnpm install` runs `prisma generate` through the `prepare` script, so a fresh clone
always has a generated client. The root `typecheck`, `test`, `test:integration` and
`build` scripts generate it too, which makes each command self-sufficient on any runner:
a pipeline only needs `pnpm install` and the command itself, with no hidden ordering.

Generation needs no database: `scripts/prisma.mjs` requires `DATABASE_URL` only for the
commands that open a connection (`migrate`, `studio`, `db`), so `generate` and `validate`
work on a checkout without any `.env`.

Vitest resolves `@actionpop/core` to its source through a `resolve.alias`, so no suite
needs a prior `pnpm build`. The packaged artifacts are still verified by the Docker build
in `docker.yml`.

### Static quality gates

`pnpm quality` stays focused on type checking, linting, tests, integration tests and
builds so the local loop stays fast. The checks below run in CI and are available
individually:

```bash
pnpm check:dead      # knip: unused files, dependencies and unlisted imports
pnpm check:cycles    # madge: rejects new circular imports against .madge-baseline.json
pnpm check:spell     # cspell: code, comments, docs and YAML (English + French)
pnpm check:licenses  # rejects licenses outside the permissive allowlist
pnpm check:toolchain # dev tooling must run on the Node major CI installs
pnpm audit:high      # fails only on high or critical production advisories
pnpm check:static    # typecheck, lint and the five checks above
```

`pnpm check:cycles` compares the current graph to `.madge-baseline.json`. Seven cycles
predate this gate; they are recorded there and shown by `node scripts/check-cycles.mjs`
when resolved. A new cycle fails the check, and `--update` re-records the baseline
after a deliberate refactor.

`pnpm check:licenses` reads `pnpm licenses list --json` and accepts only permissive
licenses. Two data-only packages are exempted in `scripts/check-licenses.mjs` with
their reason recorded next to the exemption.

`pnpm check:toolchain` reads the `node-version` used by every workflow and fails when a
dev dependency declares `engines.node` that excludes that major. This is the guard that
catches a tool upgrade requiring a newer runtime before CI does, so raising the floor
stays a deliberate choice. When a tool genuinely needs a newer Node, raise
`node-version` in all workflows and `engines.node` together.

Tests read the same configuration files as the runtime: `tests/setup-env.ts` loads
`.env` and `.env.local` before any suite runs, so `pnpm test:integration` finds
`DATABASE_URL` without an exported variable.

### CI workflows

| Workflow          | Trigger                               | Purpose                                                                                                                                         |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`          | push on `main`, pull requests, manual | `static` and `unit` jobs; documentation-only changes are skipped but a `gate` job still reports so a required check never blocks a pull request |
| `integration.yml` | code, schema or test changes          | PostgreSQL 16 and Redis services, then `pnpm test:integration`                                                                                  |
| `docker.yml`      | Docker, dependency or source changes  | builds both images without pushing; publication stays with `publish-images.yml` on `main`                                                       |
| `security.yml`    | dependency changes, weekly, manual    | gitleaks and `pnpm audit --prod --audit-level=high`                                                                                             |
| `web.yml`         | `apps/web` or lockfile changes        | `vue-tsc` type check and Vite build, with the bundle uploaded as an artifact                                                                    |
| `pages.yml`       | `apps/web` changes on `main`          | publishes `apps/web/dist` to GitHub Pages                                                                                                       |

All workflows use `ubuntu-latest`, cancel superseded runs through `concurrency`, and
cap each job with `timeout-minutes`. Dependabot (`.github/dependabot.yml`) opens weekly
grouped updates for npm, GitHub Actions and Docker, and leaves major upgrades of
`prisma`, `@prisma/client`, `typescript` and `bullmq` to manual work.

`pnpm dev` starts the Redis and Postgres containers, applies pending Prisma
migrations, builds `@actionpop/core`, then runs the API **and** the public web
application together: the API on `http://127.0.0.1:3000` and the site on
`http://127.0.0.1:5173/agenda-rennes/`. The command also allows the two local development
origins through CORS, so the search works without any extra setup. If Docker requires
elevated rights on your machine, start the dependencies once with `sudo pnpm dev:infra`
(or add your user to the `docker` group) before running `pnpm dev`. Startup aborts with a
single message naming the unreachable dependency instead of retrying forever.

| Command           | Starts                                                               |
| ----------------- | -------------------------------------------------------------------- |
| `pnpm dev`        | dependencies, migrations, core build, then **API + web** in parallel |
| `pnpm dev:api`    | the same preparation, then the API only (`tsx watch`)                |
| `pnpm dev:web`    | the web application only, useful when the API already runs elsewhere |
| `pnpm dev:worker` | the same preparation, then the worker (`tsx watch`)                  |

`pnpm dev:web` reads the API origin from `VITE_API_BASE_URL` (default
`http://127.0.0.1:3000`). When the site is served from another port or another host, add that
origin to `API_CORS_ORIGINS` on the API side, otherwise the browser blocks the search
request.

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

In production the database is only reachable from the Compose network, so run the refresh
from the repository root inside a one-off worker container. The worker image does not embed
`data/` (the commune export is 20 MB) or `scripts/`, so bind-mount them read-only and reuse
the service environment, which already declares `DATABASE_URL`:

```bash
docker compose -f infra/compose/docker-compose.yml run --rm --no-deps \
  -v "$PWD/data:/app/data:ro" \
  -v "$PWD/scripts:/app/scripts:ro" \
  -e GEOGRAPHIC_PUBLICATION_DATE=2026-01-01 \
  -e GEOGRAPHIC_EPCI_GROUPEMENTS_PATH=/app/data/liste-des-groupements.csv \
  --entrypoint node \
  worker /app/scripts/geographic-refresh.mjs
```

Omit `GEOGRAPHIC_EPCI_GROUPEMENTS_PATH` to derive the intercommunal reference from the
commune dataset instead of the authoritative "liste des groupements" export. The command
prints the staged/active version and its counts; the version is content-addressed, so
repeating an identical refresh is a no-op, and a rejected refresh leaves the previous
active version untouched. Check the result with:

```bash
docker compose -f infra/compose/docker-compose.yml exec postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
   -c "select version, status, publication_date, commune_count, department_count
       from geographic_reference_version where status = \$\$active\$\$;"'
```

Event types are seeded the same way, without the data mount:

```bash
docker compose -f infra/compose/docker-compose.yml run --rm --no-deps \
  -v "$PWD/scripts:/app/scripts:ro" \
  -e EVENT_TYPES="tractage,boitage,diffusion-tracts" \
  --entrypoint node \
  worker /app/scripts/event-types-sync.mjs
```

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
The API and the web application are then started together with:

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
`GET /events` route, the read-only `GET /search/subjects` route, and the read-only
`GET /calendar.ics` route. `/events` filters events by `country`, `department`, `commune` and
`event_type` with `AND` semantics. Geographic identifiers are strings, so `01`, `2A` and `01001`
keep their leading zeroes.

`GET /search/subjects` resolves a human query to calendar subjects so a visitor can start from
"my town", "my department" or "my action group":

```text
GET /search/subjects?q=lyon
GET /search/subjects?q=rhone&kind=department
GET /search/subjects?q=npa&kind=group&limit=10
```

It returns at most six entries per kind and eighteen in total, ranked exact match first, then
prefix, then contains. Each entry carries the exact filter parameters to use, so a client never
derives them. A too-short, too-long, unknown-kind or invalid-limit request answers `400` with a
diagnostic; an unavailable data source answers `503`. The route is served with CORS restricted to
`API_CORS_ORIGINS` (comma-separated origins, empty by default, which means no cross-origin access).
Contract: `specs/007-public-calendar-experience/contracts/search-api.md`.

`GET /calendar.ics` returns the matching events as an iCalendar (RFC 5545) document that a
calendar client can subscribe to:

```text
GET /calendar.ics?department=69&insee_commune=69123,69124&event_type=tractage
GET /calendar.ics?commune_name=Lyon,Villeurbanne&event_type=tractage
```

It accepts `country`, `department`, `commune_name`, `insee_commune`, `event_type` and `group`.
Values
inside one parameter combine with OR, distinct parameters combine with AND, and
`commune_name`/`insee_commune` form one commune dimension whose values union. A commune name
that stays ambiguous without a `department` is rejected with a diagnostic instead of being
chosen arbitrarily. `group` selects the events attributed to at least one listed action group, so
a group found through `/search/subjects` can be followed as a calendar. The calendar covers a
configurable window and includes an event when it overlaps it.

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
`SOCK_PROXY` is environment-only as well: when set, the worker sends every upstream request
through that proxy (`socks5://host:1080` or `http(s)://host:3128`), which lets the deployment
choose its own egress address. Left unset, the worker connects directly.

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
Production traffic must terminate HTTPS before it reaches the containers: the host-wide Caddy
reverse proxy owns ports 80/443 and forwards `calendar.example` to the nginx edge over the
`caddy_network` (see [infra/compose/README.md](infra/compose/README.md)).

GitHub Actions runs install, typecheck, lint, tests, integration checks, builds, and
both Docker targets. Pushes to `main` publish immutable API and worker images to
GHCR using the commit SHA; registry credentials are supplied by GitHub Actions.

Worker operations use a 15-minute dispatcher period by default. Retry limits and
backoff are configured with `QUEUE_ATTEMPTS` and `QUEUE_BACKOFF_MS`; inspect queue
depth, exhausted jobs, upstream failures, and Redis readiness through the monitoring
configuration under `infra/monitoring/`.

### Observability and security before publication

The application publishes its own metrics on two private ports and never on the internet:
`api:3000/internal/metrics` and `worker:8081/metrics`. Both are reachable only over the `monitoring`
Docker network, which the Prometheus and Grafana already running on the server join. The edge
never routes `/internal/*`, and the API reference (`/reference`, `/openapi.json`) is closed unless
`API_REFERENCE=true` is set explicitly.

What is measured, with the exact label sets and bucket boundaries, is specified once in
[`specs/009-release-hardening-observability/contracts/metrics-exposition.md`](specs/009-release-hardening-observability/contracts/metrics-exposition.md).
Three rules hold everywhere:

- a label value is always one of a closed enumeration; anything else becomes `other`, `none` or
  `indeterminate` rather than a new series;
- no query string, search term, visitor-derived territory identifier or client address is ever
  recorded in a metric or a log line;
- the client request-volume band lives in process memory only and is re-keyed every day, so it
  distinguishes abusive traffic without identifying anyone.

Install the dashboards and alerts by following
[`infra/monitoring/README.md`](infra/monitoring/README.md). The security review has a register at
[`docs/security/findings.md`](docs/security/findings.md) and a repeatable procedure at
[`docs/security/pre-publication-checklist.md`](docs/security/pre-publication-checklist.md). An
automated baseline scan runs on every pull request touching the application or `infra/`, and fails
the build on a high-severity finding.
