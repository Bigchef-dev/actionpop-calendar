# Data Model: Reliable Event–Group Attribution During Ingestion

## Group

An organizer known to the calendar. One row per source identifier; identity is the source identifier, and a case-only difference is not a new group.

| Column | Type | Meaning |
|--------|------|---------|
| `scope_id` | `TEXT` PK | Source group identifier, first-seen spelling |
| `scope_key` | `TEXT` UNIQUE NOT NULL | `lower(trim(scope_id))`; identity is case-insensitive because the dispatcher already lowercases identifiers in job IDs |
| `display_name` | `TEXT` NULL | Last name stated by the source (map entry or payload) |
| `discovery_source` | `TEXT` NOT NULL | `directory` when first seen in the map listing, `event_payload` when first seen in an event payload; never rewritten |
| `map_status` | `TEXT` NOT NULL | `listed`, `inactive`, `unlisted`, `removed` — see the map state machine |
| `retrieval_status` | `TEXT` NOT NULL | `pending`, `active`, `stopped_inactive`, `stopped_unknown` — see the retrieval state machine |
| `first_observed_at` | `TIMESTAMP(3)` NULL | First time the source named the group as an organizer |
| `last_observed_at` | `TIMESTAMP(3)` NULL | Last time the source named the group as an organizer |
| `stopped_at` | `TIMESTAMP(3)` NULL | When the retrieval stopped, for operator diagnosis |
| `stopped_reason` | `TEXT` NULL | `map_inactive` or `upstream_unknown_group` |
| `scope_type`, `source_subtype`, `certified`, `source_link`, `source_filter`, `location_id` | unchanged | Directory metadata |

Indexes: `(retrieval_status)`, `(map_status)`, `(first_observed_at)` for the promotion query. The `active` column is removed; its two meanings are replaced by `map_status` and `retrieval_status`.

### Map state machine (`map_status`)

| From | Event | To |
|------|-------|----|
| `unlisted` | complete directory contains the group with `is_active = true` | `listed` |
| `unlisted` | complete directory contains the group with `is_active = false` | `inactive` |
| `listed`, `removed` | complete directory contains it with `is_active = true` | `listed` |
| `listed`, `removed` | complete directory contains it with `is_active = false` | `inactive` |
| `listed` | complete directory no longer contains it | `removed` |
| `inactive` | complete directory no longer contains it | `removed` |
| `inactive`, `removed` | payload names it as organizer | unchanged (`unlisted` only applies to a group never listed) |

An incomplete or rejected directory response changes nothing (FR-015).

### Retrieval state machine (`retrieval_status`)

| From | Event | To |
|------|-------|----|
| `pending` | dispatcher promotion with available ceiling | `active` |
| `pending`, `active` | directory entry with `is_active = false` | `stopped_inactive` |
| `stopped_inactive`, `stopped_unknown`, `pending`, `removed`-mapped entry | directory entry with `is_active = true` | `active` |
| `active` | group listing answers 404 | `stopped_unknown` |
| `stopped_unknown` | payload names it as organizer again | `active` |

Invariants:

- A new row created by discovery is always `pending` and `unlisted`; a new row created by the directory sync is `active` or `stopped_inactive` and `listed` or `inactive`.
- Publication never changes `retrieval_status`; only the directory sync, promotion and the unknown-group rule do.
- Absence from the directory (`map_status = 'removed'`) does not change `retrieval_status` (FR-017).

## Event attribution

### `event_record` additions

| Column | Type | Meaning |
|--------|------|---------|
| `group_attribution` | `TEXT` NOT NULL DEFAULT `'unknown'` | `stated`, `none_stated`, or `unknown` for rows written before this feature |

`group_attribution` is set during publication: `stated` when the event has at least one attribution link, `none_stated` when it has none but at least one observation exists, `unknown` only for historical rows that no complete observation has refreshed yet (FR-008, SC-003).

### `event_group_link` (reshaped)

| Column | Type | Meaning |
|--------|------|---------|
| `event_id` | `TEXT` | Event the group is attributed to |
| `scope_id` | `TEXT` | Attributed group |
| `observed_via_scope_id` | `TEXT` | Listing whose observation stated this attribution |

Primary key `(event_id, scope_id, observed_via_scope_id)`; index on `(scope_id)`; foreign keys to `event_record` (cascade) and `group_scope` (cascade) for both group columns, with distinct relation names.

The event's published attribution is `DISTINCT scope_id` for the event, which is what the calendar query reads.

### `event_observation` (new)

| Column | Type | Meaning |
|--------|------|---------|
| `event_id` | `TEXT` | Observed event |
| `via_scope_id` | `TEXT` | Listing that returned it |
| `stated_group_count` | `INTEGER` NOT NULL | Number of distinct groups stated by that observation |
| `first_seen_period` | `TEXT` NOT NULL | First period token in which the listing returned the event |
| `last_seen_period` | `TEXT` NOT NULL | Latest period token in which the listing returned the event |

Primary key `(event_id, via_scope_id)`; index on `(last_seen_period)`; foreign keys to `event_record` and `group_scope` (cascade).

An observation row is evidence of retrieval provenance and of "zero groups stated". It is never deleted by the feature, which is what preserves history when a listing stops returning an event.

## `ingestion_cycle_metric` (new)

| Column | Type | Meaning |
|--------|------|---------|
| `period_token` | `TEXT` | Canonical period token of the cycle |
| `metric` | `TEXT` | One of the keys below |
| `value` | `INTEGER` NOT NULL DEFAULT 0 | Atomic counter |

Primary key `(period_token, metric)`; foreign key to `processing_period` (cascade).

Metric keys (see [contracts/operator-reporting.md](contracts/operator-reporting.md)): `groups.discovered_unlisted`, `groups.scheduled`, `groups.stopped_unknown`, `groups.re_enabled`, `groups.blank_identifier`, `events.without_group`, `attributions.added`, `attributions.removed`.

## Relationships

```text
group_scope 1──n event_group_link (as attributed group)
group_scope 1──n event_group_link (as observing listing)
group_scope 1──n event_observation (as observing listing)
event_record 1──n event_group_link
event_record 1──n event_observation
processing_period 1──n ingestion_cycle_metric
```

An event and a group may be linked once per observing listing; the union is the attribution.

## Validation rules

- Stated group identifiers are trimmed; empty identifiers are dropped and reported as a data-quality diagnostic; duplicates collapse to one, keeping the first stated name (FR-011).
- A group name that is absent or unreadable falls back to the identifier for display.
- Only complete observations write links, observations or `group_attribution` (FR-009).
- Deleting a group row is never triggered by the feature; cascades only apply when an operator deletes data explicitly (FR-012).

## Migration and backfill (`0004_event_group_attribution`)

1. `group_scope`: add `discovery_source` (default `directory`), `map_status`, `retrieval_status`, `first_observed_at`, `last_observed_at`, `stopped_at`, `stopped_reason`; backfill from `active`; drop `active`; create the three indexes.
2. `event_record`: add `group_attribution` with default `unknown`; index on `group_attribution`.
3. `event_group_link`: add `observed_via_scope_id`, backfill with `scope_id`, set NOT NULL, replace the primary key, add the index and the second foreign key.
4. Create `event_observation` and `ingestion_cycle_metric`.

No attribution repair is performed (P-HISTORY = A): the backfilled `observed_via_scope_id = scope_id` reproduces current behaviour exactly, and the next complete observation of each event replaces it with the stated truth.

## Affected callsites

| Location | Change |
|----------|--------|
| `apps/worker/src/catalogue/group-catalogue.ts` | Directory sync writes map/retrieval statuses instead of `active` |
| `apps/worker/src/persistence/snapshot-publisher.ts` | `PublishedEvent` carries `groups` |
| `packages/core/src/persistence/postgres-calendar-repository.ts` | No implicit `groupScope.upsert(active: true)`; delegates to writers |
| `apps/worker/src/operations/ingestion-ledger.ts` | Scope bootstrap creates a `pending`/`unlisted` row when missing |
| `packages/core/src/persistence/postgres-calendar-event-query.ts` | Deduplicates and sorts `groupIds` |
| `apps/worker/src/dispatcher/dispatcher.ts` | Promotes pending scopes, then enqueues active ones |
| `packages/core/src/domain/types.ts` | `IngestionLedgerStatus` gains `stopped` for the unknown-group outcome |
| `packages/core/src/index.ts` | Exports the group rules and the new persistence modules |
| `tests/integration/*` | Seeded scopes keep working through the defensive bootstrap; assertions on `active` move to `retrievalStatus` |
