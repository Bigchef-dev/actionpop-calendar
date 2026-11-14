# Contract: Metrics, Monitoring and Operator Reporting

**Owner:** [009 — Release Hardening and Observability](../../009-release-hardening-observability/spec.md)
**Amendments:** [004 operator reporting](../../004-event-group-attribution/contracts/operator-reporting.md), [005 operator reporting](../../005-event-ingestion-scopes/contracts/operator-reporting.md)
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`packages/core/src/operations/metrics.ts`](../../../packages/core/src/operations/metrics.ts), [`apps/api/src/observability`](../../../apps/api/src/observability), [`apps/worker/src/operations`](../../../apps/worker/src/operations), [`infra/monitoring`](../../../infra/monitoring)

No public calendar change. Every signal is reachable from the metrics endpoints or the structured
logs.

## Exposure

| Endpoint                | Process | Port | Consumer                                |
| ----------------------- | ------- | ---- | --------------------------------------- |
| `GET /internal/metrics` | API     | 3000 | Prometheus over the `monitoring` network |
| `GET /metrics`          | worker  | 8081 (`WORKER_HEALTH_PORT`) | Prometheus over `monitoring` |

Private: never routed at the edge (see [`../http/observability.md`](../http/observability.md)).

## Format rules

Prometheus text exposition format `0.0.4`, `Content-Type: text/plain; version=0.0.4`.

1. Every family carries a `# TYPE` line exactly once, before its first sample.
2. Every family carries a `# HELP` line exactly once, before its `# TYPE`.
3. Histograms emit `_bucket` (cumulative, with explicit `+Inf`), `_sum` and `_count`.
4. Counters end in `_total`.
5. Label names and values are emitted in a stable order so exposition is diffable.
6. Values are escaped: `\` → `\\`, `"` → `\"`, newline → `\n`.
7. An empty registry still answers `200` with a valid, possibly empty, body.

```text
# HELP actionpop_http_requests_total Completed HTTP responses.
# TYPE actionpop_http_requests_total counter
actionpop_http_requests_total{method="GET",route="/calendar.ics",status_class="2xx"} 42
# HELP actionpop_http_request_duration_seconds Observed request duration in seconds.
# TYPE actionpop_http_request_duration_seconds histogram
actionpop_http_request_duration_seconds_bucket{method="GET",route="/calendar.ics",le="0.05"} 30
actionpop_http_request_duration_seconds_bucket{method="GET",route="/calendar.ics",le="+Inf"} 42
actionpop_http_request_duration_seconds_sum{method="GET",route="/calendar.ics"} 3.71
actionpop_http_request_duration_seconds_count{method="GET",route="/calendar.ics"} 42
```

## Families

The authoritative list (types, label enumerations, bucket boundaries) is
[`../data/model.md`](../data/model.md) and section 1 of
[`../../009-release-hardening-observability/data-model.md`](../../009-release-hardening-observability/data-model.md).
Key families:

| Family                                                | Type      | Labels                                   |
| ----------------------------------------------------- | --------- | ---------------------------------------- |
| `actionpop_build_info`                                | gauge     | `deployment`, `version`                  |
| `actionpop_http_requests_total`                       | counter   | `route`, `method`, `status_class`        |
| `actionpop_http_request_duration_seconds`             | histogram | `route`, `method`                        |
| `actionpop_http_failures_total`                       | counter   | `route`, `failure_kind`                  |
| `actionpop_calendar_requests_total`                   | counter   | `subject_kind`, `delivery`, `client_kind` |
| `actionpop_calendar_truncated_total`                  | counter   | `subject_kind`, `reason`                 |
| `actionpop_calendar_filters_total`                    | counter   | `filter`, `cardinality`                  |
| `actionpop_journey_steps_total`                       | counter   | `step`, `subject_kind`                   |
| `actionpop_telemetry_rejected_total`                  | counter   | `reason`                                 |
| `actionpop_search_requests_total`                     | counter   | `outcome`                                |
| `actionpop_client_request_band_total`                 | counter   | `band`                                   |
| `actionpop_queue_depth`                               | gauge     | —                                        |
| `actionpop_ingestion_last_success_timestamp`          | gauge     | —                                        |
| `actionpop_redis_ready`                               | gauge     | —                                        |

Constraints:

- No label value may derive from a query string, a territory identifier, a search term or a client
  address.
- No family whose label set is not a closed enumeration.
- The `deployment` label identifies the instance and is distinct from Prometheus's scrape-time
  `instance` label.
- Histogram bucket boundaries (seconds): `0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`.

## Ingestion counters and gauges

Per-cycle counters (`ingestion_cycle_metric`), read by the dispatcher from the previous period:

| Key                           | Incremented by          | Meaning                                                                    |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `groups.discovered_unlisted`  | Publication             | Groups first inserted with `map_status = 'unlisted'`                       |
| `groups.scheduled`            | Dispatcher promotion    | Scopes moved `pending` → `active`, both kinds, against the shared ceiling  |
| `groups.stopped_unknown`      | Processor               | Groups moved to `stopped_unknown` after a 404                              |
| `groups.re_enabled`           | Publication             | Groups moved `stopped_unknown` → `active` by a new observation             |
| `groups.blank_identifier`     | Publication             | Group identifiers dropped because they trim to empty                       |
| `events.without_group`        | Publication             | Published events with an empty stated group set                            |
| `attributions.added`          | Publication             | Attribution links inserted that did not exist                              |
| `attributions.removed`        | Publication             | Attribution links deleted from an observation's contribution               |
| `event_scopes.created`        | Publication             | Event scopes inserted by this observation                                  |
| `event_scopes.retired`        | Publication, dispatcher | Event scopes moved to `retired`                                            |
| `event_scopes.reading_failed` | Processor               | Detail readings that failed and left the scope scheduled                   |

Gauges at cycle start:

| Gauge                            | Source                                                            |
| -------------------------------- | ----------------------------------------------------------------- |
| `actionpop_groups_active`        | `count(scope_kind='group' AND retrieval_status='active')`         |
| `actionpop_groups_pending`       | `count(scope_kind='group' AND retrieval_status='pending')`        |
| `actionpop_groups_unlisted`      | `count(scope_kind='group' AND map_status='unlisted')`             |
| `actionpop_groups_stopped`       | `count(scope_kind='group' AND retrieval_status LIKE 'stopped_%')` |
| `actionpop_event_scopes_pending` | `count(scope_kind='event' AND retrieval_status='pending')`        |
| `actionpop_event_scopes_active`  | `count(scope_kind='event' AND retrieval_status='active')`         |
| `actionpop_event_scopes_retired` | `count(scope_kind='event' AND retrieval_status='retired')`        |

Cumulative counters: `actionpop_groups_discovered_total`, `actionpop_groups_scheduled_total`,
`actionpop_groups_unknown_total`, `actionpop_groups_re_enabled_total`,
`actionpop_events_without_group_total`, `actionpop_attributions_added_total`,
`actionpop_attributions_removed_total`, `actionpop_event_ingestions_created_total`,
`actionpop_event_ingestions_retired_total`, `actionpop_event_readings_failed_total`.

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
  "eventScopes": { "active": 61, "pending": 7, "retired": 4, "retiredNow": 2 },
  "previousPeriod": { "…": "the eleven per-cycle counters" }
}
```

**Ingestion completion** (one line per listing):

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

**Event ingestion completion / retirement**:

```json
{ "operation": "event-ingestion", "outcome": "success", "scopeId": "…", "attribution": { "events": 1, "eventsWithoutGroup": 1, "attributionsAdded": 0, "attributionsRemoved": 0 }, "retired": false }
```

```json
{ "operation": "event-ingestion", "outcome": "retired", "scopeId": "…", "reason": "event_unknown" }
```

**Unknown group**:

```json
{ "operation": "ingestion", "outcome": "stopped", "scopeId": "…", "reason": "upstream_unknown_group" }
```

## Monitoring package

Lives in `infra/monitoring/` and is mounted by the monitoring Compose project already on the host.
Applying it must not require hand-editing a shipped file.

```text
infra/monitoring/
├── README.md
├── prometheus/
│   ├── scrape-snippet.yml
│   └── alert-rules.yml
└── grafana/
    ├── provisioning/{datasources,dashboards}/actionpop.yml
    └── dashboards/
        ├── actionpop-launch.json
        └── actionpop-operations.json
```

Scrape configuration: two targets, one job, `scrape_interval: 30s`, `scrape_timeout: 10s`, a
`service` label per target (`api`, `worker`).

**`actionpop-launch`** must answer, from data alone: visits; visits reaching a usable calendar;
most-wanted territory families; fruitful vs unfruitful searches; new subscriptions; renewals;
exports; events missing a territory.

**`actionpop-operations`** must answer: latency p50/p95/p99; errors by route; calendar
unavailable; truncations; queue depth; ingestion freshness; request-volume bands; client class mix
(`indeterminate` visible, never folded); targets up.

Alert rules:

| Alert                         | Condition                                                              | For |
| ----------------------------- | ---------------------------------------------------------------------- | --- |
| `ActionPopUnreachable`        | `up{job="actionpop"} == 0`                                             | 2m  |
| `ActionPopMetricsMissing`     | `absent(actionpop_http_requests_total)`                                | 10m |
| `ActionPopIngestionStale`     | `time() - actionpop_ingestion_last_success_timestamp > 3600`           | 10m |
| `ActionPopDependencyDown`     | `actionpop_redis_ready == 0`                                           | 2m  |
| `ActionPopRejectedBurst`      | `sum(rate(actionpop_http_failures_total{failure_kind="client_rejected"}[5m])) > 5` | 10m |
| `ActionPopCalendarUnavailable` | `sum(rate(actionpop_calendar_requests_total{delivery="unavailable"}[5m])) > 0` | 5m  |
| `ActionPopQueueGrowing`       | `actionpop_queue_depth > 100`                                          | 15m |
| `ActionPopTruncation`         | `increase(actionpop_calendar_truncated_total[1h]) > 0`                 | 5m  |

Severity `warning` on traffic alerts; `critical` on `ActionPopUnreachable`,
`ActionPopDependencyDown` and `ActionPopMetricsMissing`.

Gap versus zero: traffic panels use `sum(...) or vector(0)` so a quiet period renders as `0`;
health panels use `absent(...)` so a missing target is an alert, never a silent zero.

## Operator workflow

- Are the reported attribution defects shrinking? Compare `groups.discovered_unlisted` across
  cycles; a stable zero means the map now covers the organizers encountered.
- Are events missing organizers? `events.without_group` per cycle and `event_record` rows with
  `group_attribution = 'none_stated'`.
- Did attribution converge? `attributions.added` and `attributions.removed` must both be zero when
  replaying unchanged source data.
- Is group discovery stuck? `actionpop_groups_pending` above zero for several cycles means the
  ceiling is saturated or the queue is backpressured.
- Are group-less events covered? Compare `actionpop_event_scopes_active` with
  `event_scopes.created`; a rising gap means the ceiling is saturated.
- Is a refresh path broken? `event_scopes.reading_failed` above zero for several cycles, or
  `actionpop_event_scopes_active` dropping without `event_scopes.retired` rising.
- Why did an ingestion stop? `stopped_reason`: `event_ended`, `event_group_stated`,
  `event_unknown`, `upstream_unknown_group`.
- Is discovery still bounded? `groups.scheduled` must never exceed the configured ceiling in one
  period.

## Verification

- `packages/core/src/operations/metrics.test.ts` — `# TYPE`/`# HELP` presence, histogram bucket
  monotonicity and `+Inf`, escaping, stable ordering, label normalization to `other`.
- `apps/api/src/observability/*.test.ts` — enumerations and invariants.
- `tests/integration/monitoring-package.test.ts` — every JSON file parses; every `expr` references
  a metric present here; every alert has `expr`, `for` and `severity`; both dashboards declare
  schema 39 and a stable `uid`.
- `tests/integration/observability-reachability.test.ts` — metrics/readiness answer `200` over the
  `monitoring` network and the API route set equals the edge allowlist.
