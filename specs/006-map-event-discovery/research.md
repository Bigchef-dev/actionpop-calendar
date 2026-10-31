# Research: Map Event Discovery and Detail Resolution

## R1 — How is the map listing scheduled?

**Decision**: A singleton ingestion scope of a new kind `map` (`scope_id = map-discovery`) is created idempotently at worker startup when the feature is enabled. The dispatcher schedules it once per processing period exactly like any other active scope, and `job-dispatch.ts` routes it to a dedicated map discovery processor.

**Rationale**: The existing dispatcher already provides deterministic job identities, Redis locking, per-period deduplication through the ledger, BullMQ retry and the shared worker concurrency. A map scope reuses all of it without adding a second scheduler. Keeping the dispatcher fast also preserves its current responsibility: it schedules, it does not fetch.

**Alternatives considered**:

- Dispatcher fetches the listing: rejected because it would make the dispatcher an HTTP client, slow the scheduling lock and add work to the cycle that discovers it.
- A separate cron/timer: rejected because it duplicates job identity, retry and observability already owned by the queue.
- An unscoped special job in `main.ts`: rejected because it bypasses the ledger, the period token and the existing readiness/retry semantics.

## R2 — Where is the discovery state stored?

**Decision**: A new `map_event_observation` table with one row per listed identity. Columns: `event_id` (primary key), `summary_fingerprint`, `display_name`, `start_time`, `end_time`, `subtype_id`, `first_seen_at`, `last_seen_at`, `last_requested_at`, `last_outcome`, `next_reconcile_at`.

**Rationale**: Change detection and reconciliation need history that outlives a single cycle, but the canonical event tables must not be polluted with a second representation. A narrow table keeps the discovery ledger auditable, deletable and independent from publication. At about 2,700 rows per full listing, storage is small.

**Alternatives considered**:

- Columns on `ingestion_scope`: rejected because observations exist before any scope is requested and for events covered by group scopes, so most rows would be unrelated to a scope.
- Columns on `event_record`: rejected because it would mix retrieval bookkeeping into the canonical event and break the "one event shape" boundary.
- In-memory only: rejected because a restart would lose reconciliation and change detection.

## R3 — How is a detail read requested?

**Decision**: Selected identities are inserted as **pending event scopes** through the existing `requestEventScopes`, with `discovery_source = 'map_listing'`. The dispatcher promotes them under the existing shared ceiling, and the existing event ingestion processor reads the detail document.

**Rationale**: This reuses the only publication path, the content hash, the attribution union and the retirement rules. It also bounds detail volume automatically: discovery can request thousands of rows, but promotion is capped per cycle. The map job never reads a detail document and never writes a canonical event.

**Alternatives considered**:

- Direct detail jobs from the map processor: rejected because it would bypass the ceiling, duplicate event-scope state and create a second publication path.
- Publish from the map job directly: rejected because the listing is not authoritative content.
- One global event scope: rejected because retirement and per-event end times are per event.

## R4 — How is "new or changed" detected?

**Decision**: A fingerprint over the summary's machine values: `name`, `start_time`, `end_time`, coordinates (`longitude`, `latitude`) and `subtype`. A changed fingerprint clears `next_reconcile_at` so the identity is selected in the same cycle. The display `date` and `link` are excluded because they are presentation only.

**Rationale**: The listing has no modification timestamp, so only its own values can drive change detection. A fingerprint is compact, deterministic and does not persist a second canonical payload. Excluding the French display string avoids false positives from formatting.

**Alternatives considered**:

- Store the full summary: rejected as a second representation with no added rule.
- Compare with the canonical event: rejected because a difference cannot be attributed to the listing and would let a summary overwrite canonical content.
- Re-read every detail every cycle: rejected because ~2,700 detail calls per cycle would overload the source.

## R5 — How is "already kept fresh" determined?

**Decision**: An identity is covered when `event_observation` has a row observed within the freshness horizon through a scope that is still `active`. An identity is also excluded when an event scope for it is `pending` or `active`, because the retry is already owned by that scope.

**Rationale**: `event_observation` is written by every publication path (group listing and event detail), so it is the single source of truth for "this event was observed recently by an active retrieval target". Checking the observing scope's status prevents a retired or stopped scope from masking a gap. The explicit event-scope exclusion prevents the map job from duplicating a retry that is already scheduled.

**Alternatives considered**:

- `event_record.last_seen_period`: rejected because it does not state which scope observed the event or whether that scope is still active.
- `event_group_link`: rejected because it only covers group attribution, not event-scope observations, and would miss group-less events.
- No coverage check: rejected because it would duplicate all group work.

## R6 — How are invalid listing entries handled?

**Decision**: Identity-first validation. `id` must be a non-empty string; a missing or blank identity rejects the entry and increments a rejection counter. Each optional field is validated independently; an invalid value is dropped, counted by field, and the entry remains discoverable. The whole response must still be a JSON array. Duplicate identities collapse to the first occurrence and increment a duplicate counter.

**Rationale**: The detail document is authoritative, so a malformed hint cannot justify hiding a valid identity. This is deliberately different from the strict all-or-nothing canonical event schema, and it is safe because absent entries never cancel anything.

**Alternatives considered**:

- Strict whole-snapshot rejection: rejected because one bad hint among thousands would block all discovery.
- Accept any object with an `id` and no validation: rejected because the dropped-hint counts and change detection would lose meaning.
- Reject only identity-less entries and silently accept all other values: rejected because invalid times or coordinates would poison change detection.

## R7 — What are the freshness and reconciliation defaults?

**Decision**: `mapDiscoveryEnabled = true`, `mapFreshnessHorizonMs = 3,600,000` (one hour, four default dispatcher periods), `mapReconciliationIntervalMs = 604,800,000` (seven days). All three are configuration keys with environment overrides.

**Rationale**: One hour absorbs a delayed or retried cycle without treating a briefly delayed event as uncovered. Seven days re-reads description-only or address-only changes, which the summary cannot detect, at a bounded cost. Enabling by default lets an existing deployment benefit without a configuration edit; an operator can disable it instantly.

**Alternatives considered**:

- One dispatcher period as the freshness horizon: rejected because a single delayed cycle would trigger redundant discovery.
- Daily reconciliation: rejected because it multiplies detail reads for changes the summary cannot see.
- Disabled by default: rejected because the feature would not run unless configured, contrary to the deployable-by-default principle.

## R8 — How is the listing read performed?

**Decision**: One `GET /carte/liste_evenements/` per map job through the existing `request()` helper. No pagination parameters are sent. The response must be a JSON array. The existing timeout, throttle-in-place retry, network classification and 4xx/5xx classification are reused.

**Rationale**: The observed source ignores `page`, `page_size` and `limit` and always returns the complete array with a five-minute public cache. Adding parameters would imply a contract the source does not honour.

**Alternatives considered**:

- Pagination: rejected because the source exposes none.
- Conditional requests (`ETag`/`If-None-Match`): the response currently carries no usable validator; the upstream cache already absorbs repeated reads.

## R9 — How do detail outcomes reach the observation ledger?

**Decision**: The event ingestion processor receives an optional `mapDiscovery.recordOutcome(eventId, outcome, at)` dependency. It records `resolved` after a successful publication, `unknown` when the source answers 404, `mismatched` when the document describes another identity, and `failed` for every other failure. The map observation row is only updated when it exists, so group-less events discovered through group listings keep their current behaviour.

**Rationale**: The map job cannot know the detail outcome because the detail is read later by another job. Recording at the only place that knows the outcome keeps the ledger accurate without a second job. Making the dependency optional avoids a migration of existing tests and keeps the event processor usable without map discovery.

**Alternatives considered**:

- Infer outcomes from scope state in the next map cycle: rejected because a failure and a not-yet-run scope are indistinguishable.
- A separate outcome job: rejected as unnecessary work for one row update.

## R10 — How is the map scope enabled or disabled?

**Decision**: `ensureMapScope(enabled)` runs at worker startup. Enabled upserts an active `map` scope; disabled moves it to `stopped_disabled` so `activeScopes()` no longer returns it. `bootstrapScope` treats kind `map` as `not_applicable` map status and active retrieval when it has to create the row. A map processor that starts while the feature is disabled stops before reading the listing and marks the ledger `stopped`; the observation ledger is never deleted.

**Rationale**: The scope must exist before the first dispatcher cycle, and disabling must stop scheduling without deleting the observation ledger. Treating a bootstrapped map scope as active avoids a pending map scope being promoted like a discovered group.

**Alternatives considered**:

- Insert the row in the migration: rejected because the migration cannot read deployment configuration and would make disabling awkward.
- Delete the row on disable: rejected because it discards observation history and race with in-flight jobs.

## R11 — What stays unchanged?

**Decision**: The canonical event schema, the public calendar contract, the group catalogue flow, group event pagination, attribution rules, content hashing, event retirement rules and the HTTP API are unchanged. The map summary never maps to canonical fields; only the detail document does.

**Rationale**: Compatibility is an explicit requirement. The feature adds a discovery input and a new scope kind; it does not alter any existing output.

**Alternatives considered**:

- Reuse the canonical event schema for the listing: rejected because the shapes differ (`start_time` vs `startTime`, integer subtype, no timezone/location/groups).
- Extend the canonical schema with optional snake_case fields: rejected because it would weaken the validated detail boundary.
