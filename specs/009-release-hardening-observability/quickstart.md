# Quickstart: Validating Release Hardening and Observability

Each scenario is independently runnable and states what proves it. Contracts referenced here are
the source of truth for shapes: [metrics-exposition.md](./contracts/metrics-exposition.md),
[journey-telemetry.md](./contracts/journey-telemetry.md),
[edge-surface.md](./contracts/edge-surface.md),
[monitor-package.md](./contracts/monitor-package.md).

## Prerequisites

- Node 26 and pnpm 12.8.1 (`pnpm install --frozen-lockfile`)
- Docker and Docker Compose
- A monitoring stack of your own, or the local one described in scenario 5
- `OBSERVABILITY_BAND_SALT` set to any random string (never commit it)
- `OBSERVABILITY_DEPLOYMENT` set to a short instance name when running two instances

## Scenario 1 — Metrics carry types and a distribution (FR-026, FR-029)

```bash
pnpm --filter @actionpop/core test
```

Expected: `metrics.test.ts` passes and asserts, on the exposition text, that
`actionpop_http_request_duration_seconds` declares `# TYPE ... histogram`, that `_bucket` series
are cumulative ending at `+Inf`, that `_sum` and `_count` are present, and that
`actionpop_build_info{deployment="..."} 1` is emitted.

Manual check against a running API:

```bash
curl -s http://127.0.0.1:3000/internal/metrics | grep -E '^# TYPE|_bucket'
```

Expected: one `# TYPE` line per family, and duration buckets per route template.

## Scenario 2 — Journey steps are counted and never stored (FR-014, FR-015, FR-017)

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/telemetry/journey \
  -H 'content-type: application/json' \
  -d '{"v":1,"visit":"abcdefgh","steps":[{"s":"arrival"},{"s":"search"},{"s":"subject_selected","k":"commune"}]}'
curl -s http://127.0.0.1:3000/internal/metrics | grep actionpop_journey_steps_total
```

Expected: `204`, then one series per accepted step with `subject_kind` bounded to the enumeration.
No row is written to PostgreSQL and no log line contains the payload.

Rejection paths:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X GET  http://127.0.0.1:3000/telemetry/journey   # 405
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/telemetry/journey \
  -H 'content-type: text/plain' -d 'x'                                                     # 415
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/telemetry/journey \
  -H 'content-type: application/json' --data-binary @<(head -c 3000 /dev/zero | tr '\0' 'a') # 413
```

## Scenario 3 — Calendar deliveries are classified (FR-019 to FR-024)

```bash
curl -sI 'http://127.0.0.1:3000/calendar.ics?insee_commune=35238' | grep -i etag
curl -sI 'http://127.0.0.1:3000/calendar.ics?insee_commune=35238' -H 'if-none-match: "<etag>"'
curl -s  http://127.0.0.1:3000/internal/metrics | grep actionpop_calendar_requests_total
```

Expected: a first `200` counted as `delivery="first"`, the conditional request as
`delivery="revalidated"`, an invalid filter as `delivery="rejected"`, and no label carrying the
territory identifier. `sum by (client_kind)` equals the total number of calendar requests.

## Scenario 4 — Published surface is closed by default (FR-007 to FR-011, SC-004)

```bash
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.security.yml up -d --build
for p in / /robots.txt /calendar.ics /search/subjects /events /feed/xyz /telemetry/journey /internal/metrics /reference /openapi.json /nope; do
  printf '%-24s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080$p)"
done
curl -sI http://127.0.0.1:8080/ | grep -Ei 'content-security-policy|x-frame-options|referrer-policy|permissions-policy|x-content-type-options'
```

Expected: `200`/`404`/`405` for the allowlisted paths and the semantics in
[journey-telemetry.md](./contracts/journey-telemetry.md); `404` for `/internal/metrics`,
`/reference`, `/openapi.json` and `/nope`; every security header present.

Positive/negative pairs for the allowlist are also asserted by
`tests/integration/edge-surface.test.ts`.

## Scenario 5 — Monitoring package mounts without editing (FR-030 to FR-035, SC-008, SC-009)

Create a shared network once, outside this repository:

```bash
docker network create monitoring
```

Start the application stack (api, worker, web, edge) and your monitoring project on the same
network, mounting the package as described in `infra/monitoring/README.md`.

Expected: within one scrape interval, `up{job="actionpop"}` is `1` for both targets, the two
dashboards appear without manual import, and the launch dashboard shows non-zero visits after
clicking through the SPA.

Negative control:

```bash
docker compose -f infra/compose/docker-compose.yml stop api
```

Expected: `ActionPopUnreachable` fires, and health panels show the target as absent — not as zero
usage.

## Scenario 6 — Every launch-relevant alert is provable (SC-010)

| Condition | How to provoke | Expected alert |
|---|---|---|
| API down | `stop api` | `ActionPopUnreachable` |
| No usage data | stop both targets | `ActionPopMetricsMissing` |
| Stale ingestion | stop `worker` past the horizon | `ActionPopIngestionStale` |
| Dependency down | stop `redis` | `ActionPopDependencyDown` |
| Rejected burst | loop invalid calendar requests | `ActionPopRejectedBurst` |
| Calendar unavailable | stop `postgres` then request a calendar | `ActionPopCalendarUnavailable` |

## Scenario 7 — Absence renders as zero, never as a gap (SC-011)

Request no traffic for a full period, then open the launch dashboard over that range.

Expected: traffic panels show `0`; health panels keep the target visible. No panel shows
"No data" for a period in which the service was up.

## Scenario 8 — Reporting is optional for the visitor (SC-006, SC-007)

```bash
pnpm test:e2e -- --grep telemetry
```

Expected: with reporting blocked (request interception), the calendar still renders and the
journey is absent; with reporting enabled, the interaction timing measured in the test is not
worse than the blocked baseline.

## Scenario 9 — The security gate blocks a release (SC-001, SC-002)

Run the ZAP job locally through the same override:

```bash
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.security.yml up -d --build
mkdir -p zap-report
docker run --rm --network host -v "$PWD:/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://127.0.0.1:8080 -c .zap/rules.tsv \
  -J zap-report/zap-report.json -r zap-report/zap-report.html
node scripts/zap-gate.mjs zap-report/zap-report.json
```

Expected on a clean tree: `FAIL-NEW: 0`, `WARN-NEW: 0`, and the gate exits `0`. The report paths
are relative on purpose: ZAP resolves them under `/zap/wrk`, so an absolute `/zap/wrk/...` path
becomes `/zap/wrk/zap/wrk/...` and the report is silently not written.

Then introduce a deliberate high-severity condition once, re-run, and confirm a non-zero exit —
this is the evidence recorded for SC-002. The gate itself is covered by
`tests/integration/zap-gate.test.ts`, which proves it fails on a high-severity report.

## Scenario 10 — Pages fallback still builds (assumption)

```bash
VITE_BASE_PATH=/agenda-rennes/ pnpm --filter @actionpop/web build
pnpm --filter @actionpop/web build
```

Expected: both builds succeed, the first producing `/agenda-rennes/` asset paths and the second
root-relative ones.
