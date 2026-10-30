# Contract: Event Ingestion

Internal boundary between the worker, the source's per-event detail resource and the publisher. No HTTP surface changes.

## Source resource

```http
GET {UPSTREAM_BASE_URL}/api/evenements/{eventId}/details/
accept: application/json
```

One document per event, no pagination. It is a superset of a listing event; the fields the calendar consumes are the ten already validated by the listing schema.

| Field                              | Use                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `id`                               | Event identity; must equal the requested identifier                        |
| `name`, `description`              | Published summary and description                                          |
| `startTime`, `endTime`, `timezone` | Timing; `endTime` also decides scope lifetime                              |
| `location`                         | Address, commune and coordinates, enriched exactly like a listing location |
| `groups[]`                         | Stated organizers; joins the attribution union                             |
| `subtype.label`                    | Event type, validated against the reference table                          |

Ignored: `illustration`, `metaImage`, `routes`, `rsvp*`, `options`, `calendars`, `eventSpeakers`, `contact`, `distance`, `hasSubscriptionForm`, `isPast` and every other presentation field.

## Processing order (one job)

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

## Publication semantics

`PostgresCalendarDatasetRepository.saveCurrent({ scopeId, scopeKind: 'event', revision, generatedAt, periodToken, events: [event] })` performs, in one transaction:

```text
bootstrap the event scope (pending when missing, never active)
register the groups the payload states (existing discovery rules)
upsert event_record and its location
delete this scope's links no longer stated
upsert stated links with observed_via_scope_id = event scope
upsert event_observation (event, event scope) with stated_group_count
recompute event_record.group_attribution
record event_ends_at and last_observed_at on this event scope
retire the event scope when this document states a group, or when the end time it reports has passed
append counters to ingestion_cycle_metric
append the snapshot
```

Guarantees:

| Guarantee                   | How                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Same content as a listing   | Same schema, same mapper, same writer                                                |
| Non-destructive attribution | Only this scope's links are reconciled; links from listings survive                  |
| No organizer created        | The observing scope is written only to provenance columns                            |
| Complete observations only  | The processor publishes only after a fully validated document                        |
| Atomic visibility           | Content, attribution, scope retirement and snapshot commit together                  |
| Idempotent replay           | Replaying an unchanged document inserts nothing, removes nothing and retires nothing |

## Failure behaviour

| Situation                                                 | Scope state                              | Ledger status         | Job result                 |
| --------------------------------------------------------- | ---------------------------------------- | --------------------- | -------------------------- |
| Valid document that states no group, event still upcoming | unchanged (`active`), end time refreshed | `succeeded`           | completed                  |
| Document states a group                                   | `retired` (`event_group_stated`)         | `succeeded`           | completed                  |
| Document reports an end time that has already passed      | `retired` (`event_ended`)                | `succeeded`           | completed                  |
| Timeout, network, 429, 5xx                                | unchanged                                | `retrying` / `failed` | throws, retried per policy |
| Unreadable document                                       | unchanged                                | `failed`              | throws, no state change    |
| Identifier mismatch with the requested event              | unchanged                                | `retrying` / `failed` | throws, retried per policy |
| 404                                                       | `retired` (`event_unknown`)              | `stopped`             | completes without throwing |
| Other 4xx                                                 | unchanged                                | `failed`              | throws, no state change    |
