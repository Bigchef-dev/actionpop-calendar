# Research: Dedicated Ingestion for Events Without a Stated Group

## Decision 1: The detail resource is validated by the existing event schema

**Decision**: `GET /api/evenements/{id}/details/` is parsed by `validateActionPopulaireEvent`, the same schema used for listing events, and mapped by the existing `toIncomingEvent`.

**Rationale**: The detail document is a superset of a listing event: it carries `id`, `name`, `startTime`, `endTime`, `timezone`, `location`, `groups[{id,name}]`, `description` and `subtype`. The schema already strips unknown fields (`.strip()`), so the extra presentation keys (`illustration`, `rsvp`, `routes`, `calendars`, …) are ignored. A probe against a live document validates successfully and yields exactly the ten fields the publisher consumes. Reusing the schema and the mapper means a detail observation and a listing observation produce byte-identical `IncomingEvent` values, which is what makes "same content, one event row" true by construction rather than by duplication.

**Alternatives considered**:

- A dedicated details schema — a second validation surface that would drift from the listing one; the source states the same event either way.
- Publishing only the fields that differ from the listing — requires diffing against a previous version and reintroduces a second source of truth.

## Decision 2: Ingestion scopes share one registry, discriminated by kind

**Decision**: Rename `group_scope` to `ingestion_scope`, add `scope_kind` (`group` | `event`) and `event_ends_at`, and make identity `(scope_kind, scope_key)`. Event scopes store the event identifier as `scope_id`, `map_status = 'not_applicable'`, `discovery_source = 'event_payload'`, and reuse `retrieval_status` with a new `retired` value outside the group transitions, reopened only by re-qualification.

**Rationale**: The spec chose one scope registry with a discriminator. Both kinds need exactly the same scheduling machinery — one row per target, a pending/active lifecycle, discovery order, a shared promotion ceiling, ledger entries per job and one retrieval per cycle — so a second table would duplicate the dispatcher, the promotion query and the ledger identity. The discriminator alone is not enough for identity: real identifiers on both sides are UUIDs (the map directory today returns 2,923 group UUIDs, 893 active; event identifiers are UUIDs too), so uniqueness must be `(kind, key)` rather than `key`. Renaming the table keeps the domain name honest once it holds two kinds; it is a pure rename with no data movement, and the affected call sites are mechanical (18 Prisma model references, 13 raw-SQL strings).

**Alternatives considered**:

- A separate `event_scope` table — duplicates promotion, retirement, counting and job identity; the shared ceiling becomes a cross-table merge of two ordered sets, which is harder to make FIFO and atomic.
- Prefixing `scope_key` with the kind (`event:<uuid>`) — keeps a single-column unique index but makes every key derivation kind-dependent and silently changes existing keys.
- Keeping `scope_kind` out of identity — a UUID that is both a group and an event would collide, and the failure would be silent (the second target would attach to the first row's history).

## Decision 3: `map_status` gains `not_applicable` for event scopes

**Decision**: `MapStatus` becomes `listed | inactive | unlisted | removed | not_applicable`. Event scopes are always `not_applicable`; the directory synchronization and every group count filter on `scope_kind = 'group'`.

**Rationale**: The column answers "what does the map directory say about this organizer". An event ingestion is not an organizer, so no existing value is true; `unlisted` would be a lie that only happens not to leak because of the kind filter. Making the exclusion explicit in the type keeps the state machine honest, and the filter is applied in one place per query rather than trusting every reader to remember it.

**Alternatives considered**:

- Nullable `map_status` — turns "not applicable" into "unknown", which the existing invariants read as a missing observation.
- Reusing `unlisted` — pollutes the `actionpop_groups_unlisted` gauge the moment a query forgets its kind filter.

## Decision 4: Retirement is a state, decided by three explicit rules

**Decision**: `retrieval_status` gains `retired`. An event scope is retired by exactly three rules, and only from `pending` or `active`:

1. **Event ended** — a bounded `UPDATE` in the dispatcher before promotion and selection, using `event_ends_at <= now`.
2. **A group is stated** — after the attribution write of any complete observation, when the event ends up with at least one link.
3. **Event unknown** — the source answers a definitive 404; the processor retires the scope with `stopped_reason = 'event_unknown'`.

Each rule sets `stopped_reason` (`event_ended`, `event_group_stated`, `event_unknown`) and `stopped_at`, and never deletes a row. Retirement is not terminal while the qualifying condition recurs: an event that stops stating a group while still upcoming returns its existing row to `pending`, because a terminal retirement would strand exactly the events this feature exists to keep fresh, and a new row would break the one-scope-per-event identity.

**Rationale**: Three rules with three natural triggers is cheaper and more truthful than a single reconciliation pass. The ended rule must run before promotion, otherwise an ended scope can be promoted and even scheduled for a cycle in which it is guaranteed useless. The "group stated" rule is decided where the knowledge is produced — inside the publication transaction, on the same event row — which avoids a second pass over the event table. The unknown rule mirrors the group rule of the previous feature so that a definitive answer stops work while every other failure keeps retrying.

**Alternatives considered**:

- Retiring only at retrieval time — an ended scope waiting for the ceiling would never be retired, and it would consume a promotion slot.
- A periodic reconciliation pass — adds a cycle of lag and a fourth place where lifecycle is decided.
- Deleting retired scopes — destroys the evidence of coverage that operators need, and contradicts the preservation requirement.

## Decision 5: Event scopes are requested inside the publication transaction

**Decision**: `saveCurrent` inserts one event scope per observed event that states no group and whose `endTime` is after the publication timestamp, with `ON CONFLICT (scope_kind, scope_key) DO UPDATE` refreshing only `event_ends_at`, `last_observed_at` and `display_name`. The new rows are `pending`, so the discovering cycle adds no work.

**Rationale**: This is the same mechanism that registers discovered groups, and it inherits the same guarantees: one transaction, at most one row per event whatever the number of listings that returned it, no work added to the discovering cycle, and a promotion decision left to the single place that owns the ceiling. Refreshing `event_ends_at` on conflict matters because an event can be rescheduled; refreshing nothing else is what keeps an active scope active. A retired scope is re-opened only by the explicit re-qualification transition of the same statement, never as a side effect of a refresh.

**Alternatives considered**:

- Creating the scope from the ingestion job after publication — a failed publication would still create work, and a job that partially succeeded could create scopes for events it never published.
- Creating it at dispatch time from `event_record` — moves qualification into SQL over a large table and makes "discovered by a group ingestion" impossible to distinguish from "existing historical row".

## Decision 6: One job identity, two job bodies

**Decision**: The job keeps its current identity `(scope, period)`; job data gains `scopeKind`, and the worker dispatches to either the group processor or a new event processor. Both share one publication helper.

**Rationale**: Identity already answers "did this target already run this cycle", and `(kind, scope)` is unique in the database, so no collision is possible. Changing the identifier format would re-enumerate every in-flight job once at deploy; keeping it avoids that for no loss of correctness. Two job bodies keep each retrieval path readable (the group body paginates and validates a listing, the event body reads one document and checks its identity), while the shared helper guarantees both produce the same snapshot, revision and attribution writes.

**Alternatives considered**:

- One processor with two branches — a single module above the size rule, mixing pagination and identity checks.
- Adding the kind to the job identifier — forces a one-off re-enqueue of every scope in the deploy period.

## Decision 7: The promotion ceiling is shared, and its counter keeps its name

**Decision**: `promotePendingScopes(limit)` already selects every pending row in discovery order without a kind filter; the dispatcher's per-cycle budget therefore covers both kinds automatically. The per-cycle counter keeps the key `groups.scheduled` and is documented as "scopes promoted (groups and event ingestions)".

**Rationale**: The spec chose one shared ceiling and one shared budget. The existing query and budget arithmetic already implement a single FIFO queue, so sharing is a documentation change rather than a code change. Renaming the counter to `scopes.scheduled` would break existing dashboards and the recorded operator contract for a cosmetic gain; widening its documented meaning is honest and reversible.

**Alternatives considered**:

- A second ceiling for event ingestions — the spec explicitly rejected a separate budget; it would also need a second ordered backlog and a second promotion query.
- Renaming the counter — a breaking change for operators with no functional benefit.

## Decision 8: Failures are classified like group failures, with one addition

**Decision**: 404 on the detail resource becomes `UnknownEventError` (retire, ledger `stopped`, no retry). Timeout, network, 429, 5xx, unreadable payload and an identifier mismatch keep the scope scheduled and retryable and change nothing. The identifier mismatch gets its own error class and a new retry reason `other`, because the spec requires it to be retryable while a validation error is classified permanent.

**Rationale**: The retry policy already encodes "only a definitive answer may stop work". The mismatch is a transient upstream inconsistency (a proxy, a stale cache, a shuffled response), not a payload the calendar can act on, so it must not become the new permanent-stall path. `other` already exists in the metrics label whitelist.

**Alternatives considered**:

- Treating a mismatch as a permanent validation failure — one bad response would permanently stall an event's refresh while leaving the scope active and silent.
- Publishing anyway — would attribute another event's content to this one.

## Decision 9: Event scope activity is reported separately from group activity

**Decision**: New per-cycle counters `event_scopes.created`, `event_scopes.retired`, `event_scopes.reading_failed`, new gauges `actionpop_event_scopes_pending`, `_active`, `_retired`, new cumulative counters `actionpop_event_ingestions_created_total` and `_retired_total`, and an `event-scopes` block in the dispatcher cycle log. Group gauges and counters keep their names and their `scope_kind = 'group'` filter.

**Rationale**: The spec requires creation, waiting, active, retired and failed counts. Keeping kinds apart in reporting is what lets a maintainer answer "are group-less events covered?" without subtracting group numbers, and it satisfies the requirement that retired event ingestions are never counted as stopped groups.

**Alternatives considered**:

- Adding event scopes to the existing group gauges — would make the group numbers meaningless and violate the spec's isolation requirement.
