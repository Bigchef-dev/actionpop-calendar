# Contract: Ingestion and Attribution

Internal boundary between the worker, the snapshot publisher and PostgreSQL. No HTTP surface changes.

## Payload mapping

`ActionPopulaireEventPayload.groups` is validated today and dropped. It becomes:

```ts
export interface ObservedGroup {
  readonly id: string;   // trimmed; empty ids removed before this point
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
  groups: readonly ObservedGroup[];   // NEW: sorted by id, deduplicated
}
```

Mapping rules:

- Identifiers are trimmed; duplicates collapse to the first occurrence; an identifier that trims to empty is dropped and reported through the listing's data-quality count.
- `groups` is absent-safe: an empty array is valid and means "no group stated".
- Ordering is normalized (sorted by identifier) so the content hash and the stored rows are deterministic.
- The payload schema stops rejecting a blank group identifier; validation of the rest of the event is unchanged, so an invalid event still fails the listing.

## Content hash

`NormalizedCalendarContent` gains `groupIds?: string[]`, included only when non-empty and always sorted. An event with no stated group produces the same hash as before this feature, so unchanged payloads keep their `SEQUENCE` (SC-008).

## Publication (per complete listing)

`PostgresCalendarDatasetRepository.saveCurrent({ scopeId, revision, generatedAt, events })` keeps its signature and its single transaction, and performs for each event:

```text
stated = event.groups                       // already normalized
registerGroups(stated, periodToken)         // upsert group_scope, new rows pending + unlisted
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

| Guarantee | How |
|-----------|-----|
| Complete observations only | `SnapshotPublisher` refuses `complete = false`; a failed page throws before publication |
| No attribution lost on failure | Deletes only target links contributed by this listing; nothing is written on a failed retrieval |
| Union across listings | A link is only removed for the observing listing, never for another listing |
| Idempotent replay | Replaying the same listing deletes nothing and inserts nothing new; counters report zero changes |
| Atomic visibility | Links, observations, event rows and snapshot commit in one transaction |

## Counter semantics

- `attributions.added`: links inserted that did not exist before this observation.
- `attributions.removed`: links deleted from this observation's contribution.
- `events.without_group`: events in this listing whose normalized `groups` is empty.
- `groups.discovered_unlisted`: groups inserted by this listing with `map_status = 'unlisted'`.
- `groups.re_enabled`: groups that were `stopped_unknown` and became `active` because this listing named them.

## Failure behaviour

| Situation | Scope status | Ledger status | Job result |
|-----------|--------------|---------------|------------|
| Successful complete retrieval | unchanged (`active`) | `succeeded` | completed |
| Timeout, network, 429, 5xx | unchanged | `retrying` / `failed` | throws, BullMQ retries per policy |
| 404 on the group listing | `stopped_unknown` | `stopped` | completes without throwing |
| Other 4xx | unchanged | `failed` | throws, no retry, no status change |
| Invalid payload | unchanged | `failed` | throws, no status change |
