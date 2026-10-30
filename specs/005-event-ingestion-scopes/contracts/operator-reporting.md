# Contract: Operator Reporting

No public calendar change. Every signal is reachable from the worker's `/metrics` endpoint or its structured logs.

## Per-cycle counters (`ingestion_cycle_metric`)

The eight counters of the previous feature are unchanged. `groups.scheduled` now counts **every scope promoted**, group or event, because the ceiling and the budget are shared; its meaning is widened and its key is kept for dashboard compatibility.

| Key                           | Incremented by          | Meaning                                                                   |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `groups.discovered_unlisted`  | Publication             | Groups first inserted with `map_status = 'unlisted'`                      |
| `groups.scheduled`            | Dispatcher promotion    | Scopes moved `pending` → `active`, both kinds, against the shared ceiling |
| `groups.stopped_unknown`      | Processor               | Groups moved to `stopped_unknown` after a 404                             |
| `groups.re_enabled`           | Publication             | Groups moved `stopped_unknown` → `active` by a new observation            |
| `groups.blank_identifier`     | Publication             | Group identifiers dropped because they trim to empty                      |
| `events.without_group`        | Publication             | Published events with an empty stated group set                           |
| `attributions.added`          | Publication             | Attribution links inserted that did not exist                             |
| `attributions.removed`        | Publication             | Attribution links deleted from an observation's contribution              |
| `event_scopes.created`        | Publication             | Event scopes inserted by this observation                                 |
| `event_scopes.retired`        | Publication, dispatcher | Event scopes moved to `retired`                                           |
| `event_scopes.reading_failed` | Processor               | Detail readings that failed and left the scope scheduled                  |

## Gauges

| Gauge                            | Source                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| `actionpop_groups_active`        | `count(scope_kind='group' AND retrieval_status='active')`         |
| `actionpop_groups_pending`       | `count(scope_kind='group' AND retrieval_status='pending')`        |
| `actionpop_groups_unlisted`      | `count(scope_kind='group' AND map_status='unlisted')`             |
| `actionpop_groups_stopped`       | `count(scope_kind='group' AND retrieval_status LIKE 'stopped_%')` |
| `actionpop_event_scopes_pending` | `count(scope_kind='event' AND retrieval_status='pending')`        |
| `actionpop_event_scopes_active`  | `count(scope_kind='event' AND retrieval_status='active')`         |
| `actionpop_event_scopes_retired` | `count(scope_kind='event' AND retrieval_status='retired')`        |

Cumulative counters, in addition to the seven existing ones:

`actionpop_event_ingestions_created_total`, `actionpop_event_ingestions_retired_total`, `actionpop_event_readings_failed_total`.

## Structured logs

**Cycle summary** (dispatcher, once per cycle), extended with an event block:

```json
{
  "operation": "dispatcher-cycle",
  "outcome": "completed",
  "promoted": 12,
  "active": 1840,
  "pending": 43,
  "unlisted": 87,
  "stopped": 5,
  "eventScopes": { "active": 61, "pending": 7, "retired": 4, "retiredNow": 2 },
  "previousPeriod": { "…": "the eleven per-cycle counters" }
}
```

**Event ingestion completion** (one line per detail reading):

```json
{
  "operation": "event-ingestion",
  "outcome": "success",
  "scopeId": "777ed907-c8fa-4f3b-9209-9c73c6b7b23a",
  "attribution": {
    "events": 1,
    "eventsWithoutGroup": 1,
    "attributionsAdded": 0,
    "attributionsRemoved": 0
  },
  "retired": false
}
```

**Event ingestion retired**:

```json
{ "operation": "event-ingestion", "outcome": "retired", "scopeId": "…", "reason": "event_unknown" }
```

## Operator workflow

- Are group-less events covered? Compare `actionpop_event_scopes_active` with `event_scopes.created`; a rising gap means the ceiling is saturated.
- Is a refresh path broken? `event_scopes.reading_failed` above zero for several cycles, or `actionpop_event_scopes_active` dropping without `event_scopes.retired` rising.
- Why did an ingestion stop? `stopped_reason`: `event_ended`, `event_group_stated`, `event_unknown`.
- Is discovery still bounded? `groups.scheduled` must never exceed the configured ceiling in one period.
