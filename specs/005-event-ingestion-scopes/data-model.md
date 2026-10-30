# Data Model: Dedicated Ingestion for Events Without a Stated Group

## Ingestion scope

One row per retrieval target. The table is the renamed `group_scope`, now shared by both kinds. `scope_id` stays the primary key, so a scope is addressed by that identifier alone; `(scope_kind, scope_key)` is the **unique identity** that prevents the same source identifier from existing twice per kind.

| Column                                                                                     | Type                              | Meaning                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `scope_id`                                                                                 | `TEXT` PK                         | Source identifier of the target: a group identifier for `group`, an event identifier for `event`       |
| `scope_key`                                                                                | `TEXT` NOT NULL                   | `lower(trim(scope_id))`; unique together with `scope_kind`                                             |
| `scope_kind`                                                                               | `TEXT` NOT NULL DEFAULT `'group'` | `group` or `event`                                                                                     |
| `event_ends_at`                                                                            | `TIMESTAMP(3)` NULL               | End of the refreshed event; NULL for group scopes. Decides the "event ended" retirement without a join |
| `display_name`                                                                             | `TEXT` NULL                       | Last name stated by the source (group name, or event summary for an event scope)                       |
| `discovery_source`                                                                         | `TEXT` NOT NULL                   | `directory` or `event_payload`; never rewritten                                                        |
| `map_status`                                                                               | `TEXT` NOT NULL                   | `listed`, `inactive`, `unlisted`, `removed` for groups; `not_applicable` for events                    |
| `retrieval_status`                                                                         | `TEXT` NOT NULL                   | `pending`, `active`, `stopped_inactive`, `stopped_unknown`, `retired`                                  |
| `first_observed_at`                                                                        | `TIMESTAMP(3)` NULL               | First time the target was observed; the promotion order                                                |
| `last_observed_at`                                                                         | `TIMESTAMP(3)` NULL               | Last time the target was observed                                                                      |
| `stopped_at`                                                                               | `TIMESTAMP(3)` NULL               | When retrieval stopped or the scope retired                                                            |
| `stopped_reason`                                                                           | `TEXT` NULL                       | `map_inactive`, `upstream_unknown_group`, `event_ended`, `event_group_stated`, `event_unknown`         |
| `scope_type`, `source_subtype`, `certified`, `source_link`, `source_filter`, `location_id` | unchanged                         | Group directory metadata; NULL for event scopes                                                        |

Indexes: unique `(scope_kind, scope_key)`; `(scope_kind, retrieval_status)` for selection, promotion and counting; `(map_status)`, `(retrieval_status)`, `(first_observed_at)` as today; `(scope_kind, event_ends_at)` for the retirement pass.

### Identity invariants

- `scope_kind = 'group'` → `map_status <> 'not_applicable'`; `event_ends_at IS NULL`.
- `scope_kind = 'event'` → `map_status = 'not_applicable'`; `event_ends_at IS NOT NULL`.
- One row per `(scope_kind, scope_key)`: repeated discovery across listings and cycles never creates a second scope.
- Retirement is not terminal while the qualifying condition recurs: a retired event scope returns to `pending` when the event again qualifies, which keeps its history instead of creating a duplicate row.
- An event scope's `scope_id` is the event identifier, so it is also the identifier of the single event it observes.

### Retrieval state machine (both kinds)

| From                                             | Event                                                                                           | To                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pending`                                        | dispatcher promotion with available shared budget                                               | `active`                                              |
| `pending`, `active`                              | group: directory entry with `is_active = false`                                                 | `stopped_inactive`                                    |
| `stopped_inactive`, `stopped_unknown`, `pending` | group: directory entry with `is_active = true`                                                  | `active`                                              |
| `active`                                         | group: listing answers 404                                                                      | `stopped_unknown`                                     |
| `stopped_unknown`                                | group: payload names it as organizer again                                                      | `active`                                              |
| `pending`, `active`                              | event: `event_ends_at <= now`, either at dispatch or from the end time a detail reading reports | `retired`                                             |
| `pending`, `active`                              | event: the complete observation being published states at least one group for the event         | `retired`                                             |
| `active`                                         | event: detail resource answers 404                                                              | `retired`                                             |
| `retired`                                        | event: a complete observation observes it again with no stated group, before its end            | `pending` (`stopped_at` and `stopped_reason` cleared) |

Map state machine unchanged for groups, and extended with `not_applicable` for event scopes. The directory synchronization only ever writes rows with `scope_kind = 'group'`.

## Event scope qualification

An event qualifies (to create its scope, or to re-open a retired one) when a **complete observation** of any scope observes it and all of the following hold:

1. the payload states no group (normalized group list is empty), and
2. the payload's `endTime` is strictly after the publication timestamp (the cycle's `generatedAt`).

Retirement follows the opposite input: only the groups **that observation** states are considered, never the union of earlier observations. A reading that states no group therefore leaves the scope scheduled even when another listing already attributes the event.

Every complete detail reading also records `event_ends_at` and `last_observed_at` on its own scope, whatever state that scope is in, so an event whose end time moves earlier stops being retrieved. A reading that reports an end time already in the past retires the scope as `event_ended`.

All three decisions are taken by `nextEventScopeStatus` / `requiresEventIngestion` in `packages/core/src/scopes/event-scope.ts`; the SQL only writes what the rule decides.

Neither a failed retrieval nor a group scope's own absence from a listing creates, retires or changes anything.

## Event (`event_record`)

Unchanged: `group_attribution` still carries `stated`, `none_stated` or the historical `unknown`. An event scope publication rewrites the same row through the same writer, so a group-less event keeps `none_stated` unless a detail observation states groups.

## Observation (`event_observation`)

Unchanged shape. `via_scope_id` now may reference an event scope, which is how a detail reading becomes provenance: `(event, via_event_scope)` with `stated_group_count = 0`. Because the observing scope is only ever written to `observed_via_scope_id` and never to `event_group_link.scope_id`, an event scope can never be attributed to an event.

## Attribution (`event_group_link`)

Unchanged shape and rules. A detail observation contributes only the groups its payload states, removes only links it previously contributed itself, and therefore never deletes another observation's contribution.

## Cycle metric (`ingestion_cycle_metric`)

Keys added by this feature, next to the eight existing ones:

| Key                           | Incremented by             | Meaning                                                               |
| ----------------------------- | -------------------------- | --------------------------------------------------------------------- |
| `event_scopes.created`        | Publication                | Event scopes inserted by this observation                             |
| `event_scopes.retired`        | Publication and dispatcher | Event scopes moved to `retired` (`event_group_stated`, `event_ended`) |
| `event_scopes.reading_failed` | Processor                  | Failed detail readings that left the scope scheduled                  |

## Migration and backfill (`0005_event_ingestion_scopes`)

1. `ALTER TABLE "group_scope" RENAME TO "ingestion_scope"`; rename its indexes to the `ingestion_scope_*` prefix. Foreign keys follow the table automatically.
2. Add `scope_kind TEXT NOT NULL DEFAULT 'group'` and `event_ends_at TIMESTAMP(3)`.
3. Replace the unique index on `scope_key` with a unique index on `(scope_kind, scope_key)`; add `(scope_kind, retrieval_status)` and `(scope_kind, event_ends_at)`.
4. Backfill: every existing row keeps `scope_kind = 'group'` through the column default; `map_status` and `retrieval_status` are untouched, so the previous feature's lifecycle data is preserved as-is.
5. No event scope exists after the migration: the first complete cycle creates them from the events it already publishes, which is the same convergence rule the previous feature used.

## Validation rules

- Only complete observations write scopes, links, observations or `group_attribution`.
- A detail payload must carry the identifier of the requested event; otherwise nothing is published.
- An event scope is never written by the directory synchronization, never appears as an attribution, never appears as a calendar group identifier, and is never counted in a group gauge or group counter.
- Nothing in this feature deletes a scope, an event, an attribution, an observation or a snapshot.

## Affected callsites

| Location                                                        | Change                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                          | `GroupScope` → `IngestionScope`, `@@map("ingestion_scope")`, new columns and indexes                         |
| `prisma/migrations/0005_event_ingestion_scopes/migration.sql`   | Rename, rename indexes, add `scope_kind`/`event_ends_at`, replace the unique index, add the two kind indexes |
| `packages/core/src/scopes/scope-kind.ts`                        | New: `ScopeKind` and its guard                                                                               |
| `packages/core/src/scopes/event-scope.ts`                       | New: qualification, end-time and retirement decisions (`nextEventScopeStatus`)                               |
| `packages/core/src/persistence/postgres-group-registry.ts`      | Kind-aware bootstrap and promotion; delegates discovery and reads                                            |
| `packages/core/src/persistence/postgres-group-discovery.ts`     | New: group registration (`scope_kind = 'group'`)                                                             |
| `packages/core/src/persistence/postgres-group-directory.ts`     | Every statement filtered to `scope_kind = 'group'`                                                           |
| `packages/core/src/persistence/postgres-scope-queries.ts`       | New: `activeScopes()` with both kinds, `countEventScopes()`                                                  |
| `packages/core/src/persistence/postgres-group-queries.ts`       | Group-only reads and counts, filtered by kind                                                                |
| `packages/core/src/persistence/postgres-event-scopes.ts`        | New: request/re-open, observation refresh, retirement of stated-group, ended and unknown scopes              |
| `packages/core/src/persistence/attribution-writer.ts`           | Reports the number of groups the observation states, which drives retirement                                 |
| `packages/core/src/persistence/postgres-calendar-repository.ts` | Request event scopes, retire on stated groups, refresh the observed scope, accept a scope kind               |
| `packages/core/src/domain/types.ts`                             | `RetrievalStatus` gains `retired`                                                                            |
| `apps/worker/src/adapters/action-populaire-client.ts`           | `fetchEventDetails`, 404 → `UnknownEventError`, identity mismatch → `EventIdentityMismatchError`             |
| `apps/worker/src/ingestion/event-ingestion-processor.ts`        | New: the detail job body                                                                                     |
| `apps/worker/src/ingestion/event-preparation.ts`                | New: shared enrichment used by both kinds                                                                    |
| `apps/worker/src/ingestion/publication.ts`                      | New: shared publication, revision and counter path                                                           |
| `apps/worker/src/ingestion/job-dispatch.ts`                     | New: processor chosen from `scopeKind`                                                                       |
| `apps/worker/src/dispatcher/dispatcher.ts`                      | Retire ended event scopes before promotion; carry the kind into job data                                     |
| `apps/worker/src/ingestion/ingestion-outcome.ts`                | Retirement branch for a definitive unknown event                                                             |
| `tests/integration/*.test.ts`                                   | `prisma.groupScope` → `prisma.ingestionScope` (8 files), plus the two new event-scope suites                 |
