# Contract: Scope Lifecycle and Scheduling

Two kinds share one registry: `group` and `event`. Identity is `(scope_kind, scope_key)`. Every query that answers a question about organizers filters `scope_kind = 'group'`.

## Creation

| Kind    | Created when                                                                                                                      | Initial state                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `group` | A complete directory response lists it, or a complete observation states it                                                       | directory: `listed`/`active` or `inactive`/`stopped_inactive`; discovery: `unlisted`/`pending` |
| `event` | A complete observation of any scope observes an event that states no group and whose `endTime` is after the publication timestamp | `not_applicable` / `pending`, `event_ends_at = endTime`                                        |

Creation rules:

1. One row per `(kind, key)`; a repeated observation refreshes `event_ends_at`, `last_observed_at` and `display_name` and never changes the state.
2. A new row is `pending`, so discovery never adds work to the cycle that discovered it.
3. A retired event scope is never duplicated: when the event qualifies again (no stated group, not ended) the existing row returns to `pending` with its `stopped_at` and `stopped_reason` cleared.

## Dispatcher order per cycle

1. **Retire ended event scopes**: `retrieval_status IN ('pending','active') AND scope_kind = 'event' AND event_ends_at <= now` → `retired` (`event_ended`); one bounded `SELECT` capped to a batch, each row confirmed by `nextEventScopeStatus`, then one bounded `UPDATE`.
2. **Promote**: rows with `retrieval_status = 'pending'`, both kinds, ordered by `first_observed_at ASC NULLS FIRST, scope_id ASC`, at most the remainder of `ingestion.maxNewGroupsPerCycle` for the current period → `active`. The ceiling is shared, per cycle, not per dispatcher call.
3. **Select**: rows with `retrieval_status = 'active'`, both kinds, with their kind.
4. **Record then enqueue**: ledger `scheduled` before enqueueing, job identity `(scope, period)` unchanged; job data carries `scopeKind`.
5. **Report**: promoted count, group gauges, event-scope gauges and the previous period's counters.

A scope appears at most once per cycle. Promotion and enqueue happen under the existing dispatcher lock.

## Retirement (event scopes only)

| Trigger                                                                           | Where decided                                           | `stopped_reason`     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------- |
| `event_ends_at <= now`, at dispatch or from the end time a detail reading reports | Dispatcher, before promotion; publisher for the reading | `event_ended`        |
| The complete observation being published states at least one group for the event  | Publisher, inside the publication transaction           | `event_group_stated` |
| The detail resource answers 404                                                   | Processor, job outcome                                  | `event_unknown`      |

Retirement happens at most once per qualifying state, preserves the scope row, the event, its attributions, observations and snapshots, and is reported. It is re-opened — never duplicated — if the event later stops stating a group while still not ended.

An observation only ever retires on what it states itself: a listing that returns the event without a group, or a detail reading that states none, leaves the scope scheduled even when another observation already contributes a link.

## Isolation rules

1. The directory synchronization reads, inserts and updates only `scope_kind = 'group'`; it never creates, deactivates, removes or demotes an event scope.
2. Group gauges and group counters count only `scope_kind = 'group'`; retired event scopes are never counted as stopped groups.
3. An event scope is never written as an attribution, never appears in calendar group properties, and never becomes a discovery source.
4. Creating or retiring an event scope never changes a group's `map_status` or `retrieval_status`.

## Transitions at a glance

```text
                      ┌──────────── shared promotion ceiling ────────────┐
                      │                                                  │
group discovered ─pending─► active ──404──► stopped_unknown ──named/listed──► active
                             ▲  │
     directory inactive      │  └──► stopped_inactive ──directory active──► active
                             └──────────────────────────────────────────────┘

event discovered ─pending─► active ──detail read──► active  (content refreshed)
                             │  │
                             │  ├── event ends ──► retired (event_ended)
                             │  ├── a group is stated ──► retired (event_group_stated)
                             │  └── 404 on the detail ──► retired (event_unknown)
                             └── ceiling unavailable ──► pending (waits, never dropped)

retired ──the event states no group again, still upcoming──► pending (same row, history kept)
```
