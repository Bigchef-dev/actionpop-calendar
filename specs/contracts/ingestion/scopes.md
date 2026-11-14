# Contract: Ingestion Scope Lifecycle and Scheduling

**Owner:** [004 — Reliable Event–Group Attribution During Ingestion](../../004-event-group-attribution/spec.md)
**Amendments:** [005 event scopes](../../005-event-ingestion-scopes/contracts/scope-lifecycle.md), [006 map scope](../../006-map-event-discovery/contracts/map-discovery.md)
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`apps/worker/src/dispatcher`](../../../apps/worker/src/dispatcher), [`apps/worker/src/catalogue`](../../../apps/worker/src/catalogue)

## Registry

One table, `ingestion_scope`, holds every ingestion target. Identity is `(scope_kind, scope_key)`.
Kinds:

| Kind    | Created when                                                                                                                      | Initial state                                                                                  |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `group` | A complete directory response lists it, or a complete observation states it                                                       | directory: `listed`/`active` or `inactive`/`stopped_inactive`; discovery: `unlisted`/`pending` |
| `event` | A complete observation of any scope observes an event that states no group and whose `endTime` is after the publication timestamp | `not_applicable` / `pending`, `event_ends_at = endTime`                                        |
| `map`   | Provisioned as the singleton `map-discovery` scope                                                                                | active singleton, one job per period                                                           |

Every query that answers a question about organizers filters `scope_kind = 'group'`.

## Directory synchronisation (groups)

Input: the validated complete response of `GET /carte/liste_groupes/`. Applied in one transaction
after the whole response validates:

1. For each entry: upsert the group scope with `display_name`, `map_status = is_active ? 'listed'
   : 'inactive'`, `retrieval_status = is_active ? 'active' : 'stopped_inactive'`, and
   `discovery_source = 'directory'` only when the row is created.
2. For every row currently `map_status IN ('listed', 'inactive')` whose identifier is absent from
   the response: `map_status = 'removed'`, `retrieval_status` unchanged.
3. `first_observed_at`, `last_observed_at` and `discovery_source` are never overwritten by the
   directory.
4. A failed or partial response changes nothing.

Forcing `active` for every `is_active = true` entry is also the recovery path after a systemic
unknown-group outage, so recovery costs at most one cycle.

## Discovery from payloads (groups)

Applied during publication for every stated group:

- Missing row: create with `map_status = 'unlisted'`, `retrieval_status = 'pending'`,
  `discovery_source = 'event_payload'`, `first_observed_at = last_observed_at = now`.
- Existing row: update `display_name` when a name is stated, set `last_observed_at = now`, and:
  - `retrieval_status = 'stopped_unknown'` → `active` (re-enablement);
  - `map_status = 'inactive'` → stays `stopped_inactive`;
  - otherwise unchanged.

Discovery never schedules work in the cycle that discovers it: new rows are `pending`.

## Event scope creation

1. One row per `(kind, key)`; a repeated observation refreshes `event_ends_at`, `last_observed_at`
   and `display_name` and never changes the state.
2. A new row is `pending`, so discovery never adds work to the cycle that discovered it.
3. A retired event scope is never duplicated: when the event qualifies again (no stated group, not
   ended) the existing row returns to `pending` with `stopped_at` and `stopped_reason` cleared.

## Dispatcher order per cycle

1. **Reconcile**, before dispatch: a row left in `scheduled`, `running`, `publishing` or
   `retrying` for over an hour is aligned with what the queue recorded — `completed` →
   `succeeded`, `failed` → `failed` with the queue's reason, absent from the queue → `failed` with
   `abandoned: the queue no longer holds this job`. A row whose job is still `live` is left
   untouched.
2. **Retire ended event scopes**: `retrieval_status IN ('pending','active') AND scope_kind =
   'event' AND event_ends_at <= now` → `retired` (`event_ended`); bounded batch, each row
   confirmed by the state guard, then one bounded update.
3. **Promote**: rows with `retrieval_status = 'pending'`, both kinds, ordered by
   `first_observed_at ASC NULLS FIRST, scope_id ASC`, at most the remainder of
   `ingestion.maxNewGroupsPerCycle` for the current period → `active`. The ceiling is **per
   cycle, not per dispatcher call**; the dispatcher reads `groups.scheduled` for the period and
   promotes only the remainder, so a restart inside a period cannot promote a second batch.
4. **Select**: rows with `retrieval_status = 'active'`, both kinds, with their kind.
5. **Record then enqueue**: ledger `scheduled` is written **before** the job is added, with job
   identity `buildIngestionJobId(scopeId, periodStart)`; job data carries `scopeKind`. A scope is
   skipped only when its ledger row says the run finished, or when the ledger says it is live
   **and the queue still holds the job**. A job dropped by a Redis restart is enqueued again in
   the same period.
6. **Report**: promoted count, group gauges, event-scope gauges and the previous period's
   counters.

A scope appears at most once per cycle. Promotion and enqueue happen under the dispatcher lock.

## Retirement (event scopes only)

| Trigger                                                                          | Where decided                                           | `stopped_reason`     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------- |
| `event_ends_at <= now`, at dispatch or from the end time a detail reading reports | Dispatcher, before promotion; publisher for the reading | `event_ended`        |
| The complete observation being published states at least one group               | Publisher, inside the publication transaction           | `event_group_stated` |
| The detail resource answers 404                                                  | Processor, job outcome                                  | `event_unknown`      |

Retirement happens at most once per qualifying state, preserves the scope row, the event, its
attributions, observations and snapshots, and is reported. It is re-opened — never duplicated —
if the event later stops stating a group while still not ended. An observation only retires on
what it states itself.

## Unknown group

`fetchEventPage` throws `UnknownGroupError` when the group listing answers 404. The processor then
sets `retrieval_status = 'stopped_unknown'`, `stopped_reason = 'upstream_unknown_group'`,
`stopped_at = now`; records the ledger status `stopped`; increments `groups.stopped_unknown`; and
returns normally so no retry is attempted. Any other error never changes group status.

## Isolation rules

1. Directory synchronization touches only `scope_kind = 'group'`; it never creates, deactivates,
   removes or demotes an event scope.
2. Group gauges and counters count only `scope_kind = 'group'`; retired event scopes are never
   counted as stopped groups.
3. An event scope is never written as an attribution, never appears in calendar group properties
   and never becomes a discovery source.
4. Creating or retiring an event scope never changes a group's `map_status` or `retrieval_status`.

## Transitions

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
