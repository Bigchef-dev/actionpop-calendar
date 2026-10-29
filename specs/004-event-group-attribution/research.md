# Research: Reliable Event–Group Attribution During Ingestion

## Decision 1: The payload's stated groups become the attribution authority

**Decision**: Map `event.groups[]` into `IncomingEvent.groups` and use it as the only source of an event's group attribution. The listing that returned the event is stored as provenance, never as an attribution.

**Rationale**: The schema in `packages/core/src/adapters/action-populaire-schemas.ts` already validates `groups` (identifier and name), and `toIncomingEvent` currently drops it. Attribution therefore depends on which listing happened to return the event, which is exactly the reported defect: an organizer missing from `/carte/liste_groupes/` is invisible, and a group-less event is attributed to whoever listed it. The source already states the truth; the pipeline discards it.

**Alternatives considered**:

- Union of stated groups and the retrieving listing (spec option B) — keeps something when the source omits groups, but a group that merely displays another group's event becomes an organizer, contradicting FR-002.
- Keeping the retrieving listing as the authority (spec option C) — smallest change, leaves the defect in place.

**Note on the content hash**: the sorted stated group identifiers join the normalized content used by `nextEventRevision`, so an organizer change bumps the entry's `SEQUENCE` like any other visible change. Events without groups produce exactly the same hash as before, so existing revision tests stay valid.

## Decision 2: A provenance-carrying link table plus an observation table

**Decision**: `event_group_link` gains `observed_via_scope_id`, with the primary key `(event_id, scope_id, observed_via_scope_id)`. A new `event_observation` row records `(event_id, via_scope_id)` with the count of stated groups and the periods it was seen in.

**Rationale**: Attribution must be the union across observations while still being removable per observation. Storing which listing contributed which group makes deletion exact: when listing S re-observes event E and no longer states group G, only the row `(E, G, S)` disappears, and a row contributed by listing T survives. The observation row carries the evidence for observations that state zero groups — an event with no links but one observation is unambiguously "no group stated", not "not yet observed".

**Alternatives considered**:

- A separate table per concern (attribution + provenance) — two tables with the same key shape and no way to tell which provenance contributed which group.
- JSON `statedGroupIds` on the event row — loses per-observation removal and forces a full rewrite of the JSON on every observation.
- Deriving attribution at read time from observations — moves work to every calendar request and makes the read path depend on reconciliation internals.

## Decision 3: Reconcile per observation inside the publication transaction

**Decision**: For each event of a complete listing, inside the existing `saveCurrent` transaction: delete the links contributed by this listing and no longer stated, upsert the stated links, upsert the observation, then set the event's `group_attribution` to `stated` or `none_stated`.

**Rationale**: The current publication is already atomic per listing (`$transaction` around events, locations and the snapshot), so reconciliation inherits the "no partially published event" guarantee and no new failure mode appears. Only complete snapshots can be published (`SnapshotPublisher.publish` rejects `complete = false`), which is exactly the FR-009 evidence rule.

**Alternatives considered**:

- Reconcile after publication in a second transaction — a reader could observe an event whose attribution is being rewritten.
- Recompute the whole event set each cycle — correct but O(all events) per listing; the per-observation diff is bounded by the listing size.

**Deletion rule**: links are only deleted for the observing listing. When a listing stops returning an event entirely, its previous contribution is left untouched, which preserves history for past events and avoids treating absence from an "upcoming" list as evidence of anything.

## Decision 4: Replace `group_scope.active` with explicit lifecycle statuses

**Decision**: Introduce `map_status` (`listed` | `inactive` | `unlisted` | `removed`) and `retrieval_status` (`pending` | `active` | `stopped_inactive` | `stopped_unknown`), plus `discovery_source`, `first_observed_at`, `last_observed_at`, `stopped_at` and `stopped_reason`. Drop `active` with a backfill.

**Rationale**: Today `active` carries three meanings at once — "the map says active", "this group was published" and "schedule it" — and both `PostgresCalendarDatasetRepository.saveCurrent` and `PostgresIngestionLedgerStore.transition` create rows with `active: true` as a side effect. That implicit activation is precisely how an unlisted group can become ingestable without anyone deciding it. Two orthogonal columns make the four spec states expressible and remove the side effect.

**Alternatives considered**:

- Keep `active` and add a status column — two sources of truth for "may this be retrieved"; the first bug would be a row with `active=true` and `retrieval_status='stopped_unknown'`.
- Encode statuses as a single `status` column — mixes "what the map says" with "what the scheduler does", which the spec keeps separate (a group can be absent from the map and still retrieved).

**Backfill**: `active = true` → `map_status='listed'`, `retrieval_status='active'`, `discovery_source='directory'`; `active = false` → `map_status='inactive'`, `retrieval_status='stopped_inactive'`.

## Decision 5: Discovery is a side effect of complete observations, bounded per cycle

**Decision**: Stated groups are upserted during publication. A new group is inserted `pending` with `map_status='unlisted'` and `first_observed_at`, and the dispatcher promotes at most `ingestion.maxNewGroupsPerCycle` pending groups per cycle, ordered by `first_observed_at` then `scope_id`, before enqueueing.

**Rationale**: The spec chose automatic coverage (option B) but forbade adding work to the discovering cycle and required a ceiling. Promotion at dispatch time is the only place where the ceiling can be enforced for the whole cycle, and it makes "next cycle" literal: a group discovered in cycle N is promoted and enqueued in cycle N+1. Ordering by first observation keeps the backlog FIFO and deterministic.

**Alternatives considered**:

- Scheduling discovered groups from inside the ingestion job — unbounded fan-out within a cycle and a queue that grows while it is being consumed.
- Counting only, no ingestion — the spec's rejected option A.
- A separate "discovery" job — another queue and another failure mode for one `UPDATE`.

## Decision 6: Only an unknown-group answer stops a retrieval, and the directory is the recovery path

**Decision**: `ActionPopulaireClient.fetchEventPage` maps a 404 on the group listing to a dedicated `UnknownGroupError` declared in `packages/core/src/operations/errors.ts`. The processor marks the scope `stopped_unknown` and records the ledger status `stopped` without rethrowing, so BullMQ does not retry a definitive answer. Every other failure follows the existing retry classification and never touches group status. A directory entry with `is_active = true` always forces `active`, and a later observation of the group as organizer sets it back to `active` as well.

**Rationale**: FR-006 and SC-010 require the distinction, and the existing `classifyRetry` already treats a 4xx as permanent, so rethrowing would log a job failure without ever stopping the group from being scheduled again. The directory forcing `active` is also the recovery path for a systemic misconfiguration (for instance a wrong base URL answering 404 for every group): the next catalogue sync restores every listed group, so the outage lasts at most one cycle and no data is lost.

**Alternatives considered**:

- Treating any 4xx as unknown — a 403 on a private group would silently remove a real organizer forever.
- A circuit breaker on repeated failures — rejected in the spec clarification; transient outages must never deactivate a group.

## Decision 7: A periodic metric table for per-cycle reporting

**Decision**: Add `ingestion_cycle_metric(period_token, metric, value)` with atomic increments from ingestion jobs, and have the dispatcher read the previous period's rows at the start of each cycle to emit a `ingestion cycle summary` log line and Prometheus gauges.

**Rationale**: FR-013 requires engine-level counts per cycle — discovered unlisted groups, newly scheduled, waiting, stopped, re-enabled, events without a stated group, attributions added and removed. `MetricsRegistry` is an in-memory registry, so cumulative counters cannot answer "the last completed cycle", and deriving the numbers from data rows would need transition timestamps on every link. Seven rows per 15-minute cycle is negligible and directly queryable.

**Alternatives considered**:

- Log-only reporting — requires an external aggregator, and SC-007 asks for a one-minute answer.
- Transition timestamps on `event_group_link` and `group_scope` — many columns and still no count of "attributions added then removed" within a period.
- Cumulative in-memory counters only — reset on restart and cannot isolate a cycle.

## Decision 8: The calendar read path is unchanged apart from deduplication

**Decision**: Keep `X-ACTIONPOP-GROUP` and the whole public contract exactly as specified by feature 003. `PostgresCalendarEventQuery` deduplicates and sorts `groupIds` because the link primary key now includes the observing listing.

**Rationale**: FR-014 and the visibility decision (operators only) forbid a public contract change. The only necessary adjustment is mechanical: without deduplication, an event observed through two listings that state the same group would expose that identifier twice and count against the five-group ceiling.

## Decision 9: Configuration addition

**Decision**: Add an `ingestion` scope to the shared YAML document with `maxNewGroupsPerCycle` (default 200) and the override `INGESTION_MAX_NEW_GROUPS_PER_CYCLE`.

**Rationale**: The spec fixes the default at 200 (one tenth of the 2,000-group planning baseline) and requires it to be adjustable without a rebuild. The document schema is `.strict()`, so the new key needs an explicit schema, interface and example entry; the environment override follows the existing mapping convention and the fail-fast message names the origin.

**Alternatives considered**:

- A hard-coded constant — violates the adjustability requirement.
- Deriving the ceiling from a percentage of active groups — implicit and harder to reason about operationally.
