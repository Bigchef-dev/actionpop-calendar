# Contract: Group Lifecycle and Scheduling

## Directory synchronisation

Input: the validated complete response of `GET /carte/liste_groupes/`.

Rules, applied in one transaction after the whole response validates:

1. For each entry: upsert `group_scope` with `display_name`, `map_status = is_active ? 'listed' : 'inactive'`, `retrieval_status = is_active ? 'active' : 'stopped_inactive'`, and `discovery_source = 'directory'` only when the row is created.
2. For every row currently `map_status IN ('listed', 'inactive')` whose identifier is absent from the response: `map_status = 'removed'`, `retrieval_status` unchanged.
3. `first_observed_at`, `last_observed_at` and `discovery_source` are never overwritten by the directory.
4. A failed or partial response changes nothing (FR-015).

Forcing `active` for every `is_active = true` entry is also the recovery path after a systemic unknown-group outage, so recovery costs at most one cycle.

## Discovery from payloads

Applied during publication for every stated group:

- Missing row: create with `map_status = 'unlisted'`, `retrieval_status = 'pending'`, `discovery_source = 'event_payload'`, `first_observed_at = last_observed_at = now`.
- Existing row: update `display_name` when a name is stated, set `last_observed_at = now`, and:
  - if `retrieval_status = 'stopped_unknown'` → `active` (re-enablement, FR-018);
  - if `map_status = 'inactive'` → stays `stopped_inactive` (FR-016);
  - otherwise unchanged.

Discovery never schedules work in the cycle that discovers it: new rows are `pending`.

## Dispatcher

Per cycle, in this order:

1. **Reconcile**, before the dispatcher runs: a row left in `scheduled`, `running`, `publishing` or `retrying` for over an hour is aligned with what the queue recorded — `completed` → `succeeded`, `failed` → `failed` with the queue's reason, absent from the queue → `failed` with `abandoned: the queue no longer holds this job`. A row whose job is still `live` is left untouched, so in-flight work is never overwritten.
2. **Promote** rows with `retrieval_status = 'pending'`, ordered by `first_observed_at ASC NULLS FIRST, scope_id ASC`, and set them `active`. The ceiling `ingestion.maxNewGroupsPerCycle` applies **per cycle, not per dispatcher call**: the dispatcher first reads `groups.scheduled` recorded for the current period and promotes at most the remainder, so a restart inside a period cannot promote a second batch.
3. **Select** every row with `retrieval_status = 'active'`.
4. **Record then enqueue**: the ledger transition to `scheduled` is written **before** the job is added, with the existing `buildIngestionJobId(scopeId, periodStart)` identity. A worker can complete a job in milliseconds, so writing `scheduled` afterwards would overwrite the outcome it reported. A scope is skipped only when its ledger row says the run finished, or when the ledger says it is live **and the queue still holds the job**: a job dropped by a Redis restart is enqueued again in the same period instead of blocking the scope.
5. **Report** the promoted count and the registry gauges.

A scope appears at most once per cycle; promotion and enqueue happen under the existing dispatcher lock.

## Unknown group

`ActionPopulaireClient.fetchEventPage` throws `UnknownGroupError` when the group listing answers 404. The processor then:

1. sets `retrieval_status = 'stopped_unknown'`, `stopped_reason = 'upstream_unknown_group'`, `stopped_at = now`;
2. records the ledger status `stopped` with the upstream message;
3. increments `groups.stopped_unknown`;
4. returns normally, so no retry is attempted.

Any other error never changes group status.

## Transitions at a glance

```text
discovered ──pending──► active ──404──► stopped_unknown ──named again / listed──► active
                          ▲   │
        directory inactive │   └──► stopped_inactive ──directory active──► active
                           └───────────────────────────────────────────────┘
```

A group absent from the directory keeps its retrieval status; only an explicit `inactive` entry or an unknown-group answer stops it.
