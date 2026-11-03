# Contract: Monitoring Package

The package lives in `infra/monitoring/` and is mounted by the monitoring Compose project that
already runs on the host. Applying it must not require hand-editing a shipped file (FR-032).

## Files

```text
infra/monitoring/
├── README.md                                  # installation procedure (FR-033)
├── prometheus/
│   ├── scrape-snippet.yml                     # merge into the existing scrape_configs
│   └── alert-rules.yml                        # mounted into rule_files
└── grafana/
    ├── provisioning/
    │   ├── datasources/actionpop.yml          # Prometheus datasource, stable uid
    │   └── dashboards/actionpop.yml           # file provider
    └── dashboards/
        ├── actionpop-launch.json              # the launch review questions
        └── actionpop-operations.json          # service health
```

## Scrape configuration

Two targets, one job, because they share labels and dashboards:

| Target | Metric path |
|---|---|
| `api:3000` | `/internal/metrics` |
| `worker:8081` | `/metrics` |

Recommended in the snippet: `scrape_interval: 30s`, `scrape_timeout: 10s`, a `service` label per
target (`api`, `worker`) and a `relabel_configs` step that copies the scrape target into
`instance` (Prometheus does this by default, so the snippet only documents it).

## Dashboards

Both use Grafana schema 39, a stable `uid`, and the package datasource `${DS_PROMETHEUS}`.

**`actionpop-launch`** must answer, from data alone (SC-005):

| Panel | Expression shape |
|---|---|
| Visits | `sum(increase(actionpop_journey_steps_total{step="arrival"}[$__range]))` |
| Visits reaching a usable calendar | `sum(increase(actionpop_journey_steps_total{step="calendar_shown"}[$__range]))` over visits, with the ratio as a stat |
| Most-wanted territory families | `sum by (subject_kind) (increase(actionpop_journey_steps_total{step="subject_selected"}[$__range]))` |
| Searches, fruitful vs unfruitful | `sum by (outcome) (increase(actionpop_search_requests_total[$__range]))` |
| New subscriptions | `sum by (subject_kind) (increase(actionpop_calendar_requests_total{delivery="first",client_kind="agenda"}[$__range]))` |
| Renewals | same with `delivery="revalidated"` |
| Exports | same with `delivery="first",client_kind="browser"` |
| Events missing a territory | `sum by (status) (actionpop_events_without_territory)` |

**`actionpop-operations`** must answer:

| Panel | Expression shape |
|---|---|
| Latency p50 / p95 / p99 | `histogram_quantile(0.95, sum by (le) (rate(actionpop_http_request_duration_seconds_bucket[5m])))` |
| Errors by route | `sum by (route, failure_kind) (rate(actionpop_http_failures_total[5m]))` |
| Calendar unavailable | `sum by (subject_kind) (rate(actionpop_calendar_requests_total{delivery="unavailable"}[5m]))` |
| Truncations | `sum by (reason) (increase(actionpop_calendar_truncated_total[$__range]))` |
| Queue depth | `actionpop_queue_depth` |
| Ingestion freshness | `time() - actionpop_ingestion_last_success_timestamp` |
| Request-volume bands | `sum by (band) (increase(actionpop_client_request_band_total[$__range]))` |
| Client class mix | `sum by (client_kind) (increase(actionpop_calendar_requests_total[$__range]))` — `indeterminate` must be visible, never folded into another class (FR-021) |
| Targets up | `up{job="actionpop"}` |

## Alert rules

| Alert | Condition | For |
|---|---|---|
| `ActionPopUnreachable` | `up{job="actionpop"} == 0` | 2m |
| `ActionPopMetricsMissing` | `absent(actionpop_http_requests_total)` | 10m |
| `ActionPopIngestionStale` | `time() - actionpop_ingestion_last_success_timestamp > 3600` | 10m |
| `ActionPopDependencyDown` | `actionpop_redis_ready == 0` | 2m |
| `ActionPopRejectedBurst` | `sum(rate(actionpop_http_failures_total{failure_kind="client_rejected"}[5m])) > 5` | 10m |
| `ActionPopCalendarUnavailable` | `sum(rate(actionpop_calendar_requests_total{delivery="unavailable"}[5m])) > 0` | 5m |
| `ActionPopQueueGrowing` | `actionpop_queue_depth > 100` | 15m |
| `ActionPopTruncation` | `increase(actionpop_calendar_truncated_total[1h]) > 0` | 5m |

Severity label `severity: warning` on traffic alerts, `severity: critical` on
`ActionPopUnreachable`, `ActionPopDependencyDown` and `ActionPopMetricsMissing`.

## Gap versus zero (FR-035)

- Traffic panels use `sum(...) or vector(0)` so a quiet period renders as `0`.
- Health panels use `absent(...)` so a missing target is an alert, never a silent zero.
- The two panel groups are visually separated and titled, so a reviewer cannot mistake one for the
  other.

## Verification

- `tests/integration/monitoring-package.test.ts` — every JSON file parses; every `expr`
  references a metric name present in [metrics-exposition.md](./metrics-exposition.md); every
  alert has `expr`, `for` and `severity`; both dashboards declare schema 39 and a stable `uid`.
  This location is deliberate: `tests/integration/**` is the only suite the repository actually
  executes for files outside a workspace package.
- `quickstart.md` scenario 5 — a clean mount shows both dashboards with live data and no manual
  edit.
- `tests/integration/observability-reachability.test.ts` — `/internal/metrics` and
  `/internal/ready` answer `200` over the `monitoring` network, and the set of routes the API
  registers equals the edge allowlist (FR-008, SC-004).
- `quickstart.md` scenario 6 — provoking each alert condition fires the matching rule.
