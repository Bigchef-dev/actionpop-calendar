# Contract: Ingestion and Attribution

**Owner:** [004 — Reliable Event–Group Attribution During Ingestion](../../004-event-group-attribution/spec.md)
**Amendments:** [005 event ingestion](../../005-event-ingestion-scopes/contracts/event-ingestion.md)
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`apps/worker/src/ingestion`](../../../apps/worker/src/ingestion), [`apps/worker/src/persistence`](../../../apps/worker/src/persistence)

Internal boundary between the worker, the snapshot publisher and PostgreSQL. No HTTP surface
changes.

## Payload mapping

`ActionPopulaireEventPayload.groups` is validated and becomes:

```ts
export interface ObservedGroup {
  readonly id: string; // trimmed; empty ids removed before this point
  readonly name?: string;
}

export interface IncomingEvent {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  description?: string;
  location: LocationEvent | null;
  eventType?: string;
  geography?: GeographicAttachment;
  groups: readonly ObservedGroup[]; // sorted by id, deduplicated
}
```

Mapping rules:

- Identifiers are trimmed; duplicates collapse to the first occurrence; an identifier that trims
  to empty is dropped and reported through the listing's data-quality count.
- `groups` is absent-safe: an empty array means "no group stated".
- Ordering is normalized (sorted by identifier) so the content hash and stored rows are
  deterministic.
- The payload schema does not reject a blank group identifier; the rest of the event validation is
  unchanged, so an invalid event still fails the listing.

## Content hash

`NormalizedCalendarContent` gains `groupIds?: string[]`, included only when non-empty and always
sorted. An event with no stated group produces the same hash as before this feature, so unchanged
payloads keep their `SEQUENCE`.

## Publication (per complete listing)

`PostgresCalendarDatasetRepository.saveCurrent({ scopeId, revision, generatedAt, events })` keeps
its single transaction and performs, per event:

```text
stated = event.groups                       // already normalized
registerGroups(stated, periodToken)         // upsert group scope, new rows pending + unlisted
upsert event_record                         // content, location, geography, event type
delete event_group_link
  where event_id = event.id
    and observed_via_scope_id = scopeId
    and scope_id not in stated
upsert event_group_link (event.id, g, scopeId) for each g in stated
upsert event_observation (event.id, scopeId)
  set stated_group_count = |stated|, last_seen_period = periodToken
recompute event_record.group_attribution
  = exists(link for event) ? 'stated' : 'none_stated'
then append counters to ingestion_cycle_metric
```

Guarantees:

| Guarantee                    | How                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Complete observations only   | `SnapshotPublisher` refuses `complete = false`; a failed page throws before publication |
| No attribution lost on failure | Deletes only target links contributed by this listing; nothing is written on failure   |
| Union across listings        | A link is only removed for the observing listing, never for another listing             |
| Idempotent replay            | Replaying the same listing deletes nothing and inserts nothing new                      |
| Atomic visibility            | Links, observations, event rows and snapshot commit in one transaction                  |

## Event detail ingestion (scope kind `event`)

Source resource:

```http
GET {UPSTREAM_BASE_URL}/api/evenements/{eventId}/details/
accept: application/json
```

One document per event, no pagination. It is a superset of a listing event; the calendar consumes
the fields already validated by the listing schema:

| Field                              | Use                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `id`                               | Event identity; must equal the requested identifier                          |
| `name`, `description`              | Published summary and description                                            |
| `startTime`, `endTime`, `timezone` | Timing; `endTime` also decides scope lifetime                                |
| `location`                         | Address, commune and coordinates, enriched exactly like a listing location   |
| `groups[]`                         | Stated organizers; joins the attribution union                               |
| `subtype.label`                    | Event type, validated against the reference table                            |

Ignored: `illustration`, `metaImage`, `routes`, `rsvp*`, `options`, `calendars`,
`eventSpeakers`, `contact`, `distance`, `hasSubscriptionForm`, `isPast` and every other
presentation field.

Processing order for one job:

```text
ledger running
→ GET detail resource
→ 404 ⇒ retire the scope (event_unknown) and complete without throwing
→ validate the document with the listing schema
→ identifier mismatch ⇒ failure (retryable), nothing published
→ event-type validation (same rules as a listing)
→ geography enrichment (same rules as a listing)
→ toIncomingEvent
→ publish as a complete observation of this event scope
→ ledger succeeded
```

`saveCurrent({ scopeId, scopeKind: 'event', revision, generatedAt, periodToken, events: [event] })`
performs, in one transaction:

```text
bootstrap the event scope (pending when missing, never active)
register the groups the payload states (existing discovery rules)
upsert event_record and its location
delete this scope's links no longer stated
upsert stated links with observed_via_scope_id = event scope
upsert event_observation (event, event scope) with stated_group_count
recompute event_record.group_attribution
record event_ends_at and last_observed_at on this event scope
retire the event scope when this document states a group, or when the reported end time has passed
append counters to ingestion_cycle_metric
append the snapshot
```

Guarantees: same content as a listing (same schema, mapper and writer); non-destructive
attribution (only this scope's links are reconciled); no organizer created (the observing scope is
written only to provenance columns); complete observations only; atomic visibility; idempotent
replay (an unchanged document inserts, removes and retires nothing).

## Counter semantics

- `attributions.added`: links inserted that did not exist before this observation.
- `attributions.removed`: links deleted from this observation's contribution.
- `events.without_group`: events in this listing whose normalized `groups` is empty.
- `groups.discovered_unlisted`: groups inserted by this listing with `map_status = 'unlisted'`.
- `groups.re_enabled`: groups that were `stopped_unknown` and became `active` because this listing
  named them.

## Failure behaviour

| Situation                                   | Scope status                | Ledger status         | Job result                 |
| ------------------------------------------- | --------------------------- | --------------------- | -------------------------- |
| Successful complete retrieval               | unchanged (`active`)        | `succeeded`           | completed                  |
| Timeout, network, 429, 5xx                   | unchanged                   | `retrying` / `failed` | throws, retried per policy |
| 404 on the group listing                    | `stopped_unknown`           | `stopped`             | completes without throwing |
| 404 on the detail resource                  | `retired` (`event_unknown`) | `stopped`             | completes without throwing |
| Document states a group                     | `retired` (`event_group_stated`) | `succeeded`      | completed                  |
| Reported end time already passed            | `retired` (`event_ended`)   | `succeeded`           | completed                  |
| Identifier mismatch with the requested event | unchanged                  | `retrying` / `failed` | throws, retried per policy |
| Other 4xx                                   | unchanged                   | `failed`              | throws, no retry           |
| Invalid / unreadable payload                | unchanged                   | `failed`              | throws, no state change    |
