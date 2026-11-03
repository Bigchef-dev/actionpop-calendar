# Contract: Metrics Exposition

**Applies to**: `GET /internal/metrics` on the API (port 3000) and `GET /metrics` on the worker
(port 8081, `WORKER_HEALTH_PORT`).

**Consumers**: Prometheus, over the shared `monitoring` Docker network. Never the internet.

**Format**: Prometheus text exposition format, version `0.0.4`,
`Content-Type: text/plain; version=0.0.4`.

## Required structure

1. Every family carries a `# TYPE` line exactly once, before its first sample.
2. Every family carries a `# HELP` line exactly once, before its `# TYPE`.
3. Histograms emit `_bucket` (cumulative, with an explicit `+Inf`), `_sum` and `_count`.
4. Counters end in `_total`.
5. Label names and values are emitted in a stable order so exposition is diffable.
6. Values are escaped: `\` → `\\`, `"` → `\"`, newline → `\n`.
7. An empty registry still answers `200` with a valid, possibly empty, body.

Example shape:

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

The authoritative list, with types, label enumerations and bucket boundaries, is section 1 of
[../data-model.md](../data-model.md). Any change to a family must update that document, this
contract, the dashboards and the drift test in the same change.

## Breaking change accepted by this feature

`actionpop_http_request_duration_seconds` was an **accumulated counter of seconds** (each request
added its duration). It becomes a **histogram** (FR-026). Rationale and consequence are recorded
in [../research.md](../research.md) R1; nothing consumes it today because
`infra/monitoring/` was never a working configuration.

## Constraints

- No label value may derive from a query string, a territory identifier, a search term, or a
  client address (FR-016, FR-022, SC-012).
- No family may be added whose label set is not a closed enumeration.
- The `deployment` label identifies the instance (FR-029) and is distinct from Prometheus's own
  `instance` label, which is attached at scrape time.

## Verification

- `packages/core/src/operations/metrics.test.ts` — `# TYPE`/`# HELP` presence, histogram bucket
  monotonicity and `+Inf`, escaping, stable ordering, label normalization to `other`.
- `apps/api/src/observability/*.test.ts` — enumerations and invariants from
  [../data-model.md](../data-model.md) section 6.
- A parsing test reads the exposition text and asserts every family appears with its declared
  type.
