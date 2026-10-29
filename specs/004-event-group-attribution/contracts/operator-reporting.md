# Contract: Operator Reporting

No public calendar change. Every signal below is reachable from the worker's existing `/metrics` endpoint or its structured logs (FR-013, P-VISIBILITY = A).

## Per-cycle counters (`ingestion_cycle_metric`)

| Key | Incremented by | Meaning |
|-----|----------------|---------|
| `groups.discovered_unlisted` | Publication | Groups first inserted with `map_status = 'unlisted'` |
| `groups.scheduled` | Dispatcher promotion | Groups moved `pending` → `active` |
| `groups.stopped_unknown` | Processor | Groups moved to `stopped_unknown` after a 404 |
| `groups.re_enabled` | Publication | Groups moved `stopped_unknown` → `active` by a new observation |
| `groups.blank_identifier` | Publication | Group identifiers dropped because they trim to empty |
| `events.without_group` | Publication | Published events with an empty stated group set |
| `attributions.added` | Publication | Attribution links inserted that did not exist |
| `attributions.removed` | Publication | Attribution links deleted from an observation's contribution |

The dispatcher reads the previous period's rows at the start of each cycle and emits them, so "the last completed cycle" is answerable without log aggregation.

## Gauges (registry state at cycle start)

| Gauge | Source |
|-------|--------|
| `actionpop_groups_active` | `count(retrieval_status = 'active')` |
| `actionpop_groups_pending` | `count(retrieval_status = 'pending')` |
| `actionpop_groups_unlisted` | `count(map_status = 'unlisted')` |
| `actionpop_groups_stopped` | `count(retrieval_status LIKE 'stopped_%')` |

Counters are cumulative since process start and use dedicated names to avoid the registry's normalizing label whitelist:

`actionpop_groups_discovered_total`, `actionpop_groups_scheduled_total`, `actionpop_groups_unknown_total`, `actionpop_groups_re_enabled_total`, `actionpop_events_without_group_total`, `actionpop_attributions_added_total`, `actionpop_attributions_removed_total`.

## Structured logs

**Cycle summary** (dispatcher, once per cycle):

```json
{
  "operation": "dispatcher-cycle",
  "outcome": "completed",
  "promoted": 12,
  "active": 1840,
  "pending": 43,
  "unlisted": 87,
  "stopped": 5,
  "previousPeriod": {
    "groups.discovered_unlisted": 9,
    "groups.scheduled": 12,
    "groups.stopped_unknown": 1,
    "groups.re_enabled": 2,
    "groups.blank_identifier": 0,
    "events.without_group": 3,
    "attributions.added": 41,
    "attributions.removed": 6
  }
}
```

**Ingestion completion** (existing line, extended):

```json
{
  "operation": "ingestion",
  "outcome": "success",
  "scopeId": "…",
  "geography": { "resolved": 120 },
  "attribution": {
    "events": 120,
    "eventsWithoutGroup": 2,
    "attributionsAdded": 130,
    "attributionsRemoved": 4,
    "unlistedDiscovered": 1
  }
}
```

**Unknown group**:

```json
{
  "operation": "ingestion",
  "outcome": "stopped",
  "scopeId": "…",
  "reason": "upstream_unknown_group"
}
```

## Operator workflow

- Are the reported defects shrinking? Compare `groups.discovered_unlisted` across cycles; a stable zero means the map now covers the organizers encountered.
- Are events missing organizers? `events.without_group` per cycle, and `event_record` rows with `group_attribution = 'none_stated'`.
- Did attribution converge? `attributions.added` and `attributions.removed` must both be zero when replaying unchanged source data (SC-006).
- Is discovery stuck? `actionpop_groups_pending` above zero for several cycles means the ceiling is saturated or the queue is backpressured.
