# Quickstart: Map Event Discovery and Detail Resolution

Validation guide for the feature. Contracts and rules are in [contracts/map-listing.md](contracts/map-listing.md), [contracts/map-discovery.md](contracts/map-discovery.md) and [data-model.md](data-model.md).

## Prerequisites

- Node.js >= 20 and `pnpm` (the repository pins `pnpm@12.8.1`).
- Docker for PostgreSQL and Redis, or reachable `DATABASE_URL` and `REDIS_URL`.
- `UPSTREAM_BASE_URL=https://actionpopulaire.fr` for a live smoke test. Automated tests use fixtures and never require the live source.

```bash
pnpm install
pnpm dev:infra       # PostgreSQL + Redis
pnpm db:setup        # prisma generate + migrate deploy
```

## 1. Unit validation — formats and selection

```bash
pnpm --filter @actionpop/core test -- discovery
pnpm --filter @actionpop/core test -- action-populaire-schemas
```

Expected:

- A valid array yields one summary per identity.
- An entry with a blank or missing `id` is rejected and counted; the rest of the array is kept.
- Invalid `start_time`, `end_time`, `coordinates`, `name`, `date`, `link` or `subtype` values are dropped and counted individually; the identity remains.
- Repeated identities collapse to one and increment the duplicate counter.
- A fingerprint changes when `name`, `start_time`, `end_time`, coordinates or `subtype` change, and does not change when `date` or `link` change.
- Selection excludes ended identities, recently observed identities, and identities with a pending or active event scope.

## 2. Contract validation — client and map job

```bash
pnpm --filter @actionpop/worker test -- map
pnpm --filter @actionpop/worker test -- action-populaire-client
```

Expected:

- `fetchMapEventListing()` requests `GET /carte/liste_evenements/` with no pagination parameters.
- A `429` retries in place after the delay the source states; an exhausted budget surfaces an `HttpError` with `status = 429`.
- A `404`/`403` does not retry; a timeout, network failure or `5xx` is retryable.
- The map job calls `fetchMapEventListing()` once and never `fetchEventDetails()`.
- The map job requests pending event scopes only for gap candidates and records `map_listing` as the discovery source.
- An empty array is a successful complete listing, not a failure.
- A non-array body is a `PayloadValidationError` and requests no scope.
- A detail document describing another identity keeps the existing retryable classification and is counted as `mismatched`; a canonical detail ignores its presentation fields.

## 3. Integration validation — PostgreSQL

```bash
pnpm test:integration -- map-discovery
```

Expected:

- `map_event_observation` upserts one row per identity with `first_seen_at`, `last_seen_at` and a fingerprint.
- Re-reading an unchanged listing advances `last_seen_at` and does not clear `next_reconcile_at`.
- Changing a summary value clears `next_reconcile_at`, so the identity is selected in the same cycle.
- An event observed through an active group scope within the freshness horizon is not selected.
- An event observed through a retired or stopped scope is selected again when its reconciliation is due.
- An identity with a pending or active event scope is not requested twice.
- A selected identity produces a `pending` event scope with `discovery_source = 'map_listing'` and a nullable `event_ends_at` when the hint is absent.
- A later detail outcome writes `resolved`, `unknown`, `mismatched` or `failed` on the existing map observation and leaves a missing row untouched.
- A `mismatched` or `failed` attempt is selectable again under the reconciliation/retry rule.
- Absence from a later listing changes neither the observation row nor the event scope state.
- Enabling creates the `map` scope as `active`; disabling moves it to `stopped_disabled`, removes it from `activeScopes()`, and makes an in-flight map job stop before reading the listing.

## 4. Full quality gate

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
```

Expected: strict typecheck passes, ESLint reports no new findings, and all existing group, attribution, calendar, API and event-scope tests remain green.

## 5. Live smoke test (optional)

Read the two sources and confirm the shapes the contracts depend on:

```bash
curl -sS -H 'accept: application/json' https://actionpopulaire.fr/carte/liste_evenements/ \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a.length, Object.keys(a[0]).join(','))})"
```

Expected: a single array; every entry has `id`, `name`, `coordinates`, `date`, `link`, `start_time`, `end_time` and `subtype`.

```bash
curl -sS -H 'accept: application/json' \
  https://actionpopulaire.fr/api/evenements/0b75e623-33b2-4e4e-8e73-add257957513/details/ \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s);console.log(e.id, e.timezone, e.startTime, e.endTime, Array.isArray(e.groups))})"
```

Expected: a single object already accepted by the canonical event contract; `groups` is an array and may be empty.

Then start the worker with the feature enabled and inspect the observation ledger after one or two cycles:

```bash
pnpm start:worker
```

```sql
SELECT count(*) AS observations, count(*) FILTER (WHERE last_requested_at IS NOT NULL) AS requested
FROM map_event_observation;

SELECT scope_kind, retrieval_status, discovery_source, count(*)
FROM ingestion_scope
WHERE scope_kind IN ('map', 'event')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
```

Expected:

- One `map` scope with `retrieval_status = 'active'`.
- `map_event_observation` grows to the listing size.
- Event scopes appear first as `pending` with `discovery_source = 'map_listing'`, then `active` as the dispatcher promotes them under the existing ceiling.
- After detail reads, the calendar does not gain a second event representation: the existing event tables remain the only published source, and group ingestion results are unchanged.

## 6. Disable and re-enable

Set `INGESTION_MAP_DISCOVERY_ENABLED=false`, restart the worker, and verify:

- The `map` scope is `stopped_disabled` and no map job is scheduled.
- An in-flight map job stops before reading the listing and writes nothing.
- Existing event scopes keep running; existing observations and published events are preserved.

Set it back to `true` and verify the map scope returns to `active` on the next startup.
