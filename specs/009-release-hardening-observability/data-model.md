# Phase 1 Data Model: Release Hardening and Observability

This feature adds **no PostgreSQL table and no Prisma schema change**. The "data model" here is
the bounded measurement vocabulary: metric families, label enumerations, band thresholds, and the
journey step vocabulary. It is the contract every dashboard, alert and test reads.

## 1. Metric families

Every family below is registered in `packages/core/src/operations/metrics.ts` and exposed by
`GET /internal/metrics` (API) and `GET /metrics` (worker).

### 1.1 Deployment identity — FR-029

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_build_info` | gauge | `deployment`, `version` | Always `1`. One series per running instance, so two instances at cutover stay distinguishable. |

`deployment` comes from `OBSERVABILITY_DEPLOYMENT` (default: sanitized hostname). `version` comes
from the package version shipped in the image.

**Validation**: `deployment` is restricted to `[a-z0-9_-]{1,32}`; anything else is normalized to
`unknown`, which is itself a bounded value.

### 1.2 HTTP — FR-026, FR-027

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_http_requests_total` | counter | `route`, `method`, `status_class` | Every completed response. |
| `actionpop_http_request_duration_seconds` | histogram | `route`, `method` | Full observed distribution. |
| `actionpop_http_failures_total` | counter | `route`, `failure_kind` | Failures separated by nature. |

Label enumerations:

- `route` ∈ `/calendar.ics`, `/events`, `/search/subjects`, `/feed/:scopeId`,
  `/telemetry/journey`, `/internal/live`, `/internal/ready`, `/internal/metrics`,
  `/openapi.json`, `/other`
- `method` ∈ `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `other`
- `status_class` ∈ `1xx`, `2xx`, `3xx`, `4xx`, `5xx`
- `failure_kind` ∈ `client_rejected` (4xx), `dependency_unavailable` (503 emitted for a failed
  dependency), `internal_error` (5xx other than 503)

Only failures produce a `failure_kind` sample; a successful response produces none, so the
failure families stay meaningful.

**Bucket boundaries** (seconds), identical for every histogram:
`0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`.

### 1.3 Calendar deliveries — FR-019, FR-020, FR-021, FR-022, FR-024

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_calendar_requests_total` | counter | `subject_kind`, `delivery`, `client_kind` | One per calendar request. |
| `actionpop_calendar_truncated_total` | counter | `subject_kind`, `reason` | Result cut by a ceiling. |
| `actionpop_calendar_filters_total` | counter | `filter`, `cardinality` | Filters present in an accepted request. |

Label enumerations:

- `subject_kind` ∈ `commune`, `department`, `group`, `epci`, `multi`, `none`
  (`multi` when several subject parameters are combined; `none` when the request carries no
  subject, e.g. `/feed/:scopeId` uses `group`)
- `delivery` ∈ `first` (200 with body), `revalidated` (304), `rejected` (400/405),
  `unavailable` (503)
- `client_kind` ∈ `agenda`, `browser`, `automated`, `indeterminate`
- `reason` ∈ `entry_ceiling`, `group_ceiling`
- `filter` ∈ `type`, `group`
- `cardinality` ∈ `none`, `one`, `few` (2–5), `many` (6+)

**Deliberate omission**: the specific territory identifier never appears. A commune's identifier
is a bounded value in principle, but recording it would let anyone reconstruct which village a
visitor follows, which FR-016/FR-022 forbid.

**Derived subscription signals** (documented for the dashboards, not stored as separate families):

- new subscription ≈ `sum by (subject_kind) (rate(actionpop_calendar_requests_total{delivery="first",client_kind="agenda"}[1d]))`
- renewal ≈ `... {delivery="revalidated"}` on the same grouping
- export (a human download) ≈ `... {delivery="first",client_kind="browser"}`

### 1.4 Search — FR-015, FR-016

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_search_requests_total` | counter | `outcome`, `kind` | One per search answer. |

- `outcome` ∈ `fruitful` (at least one subject), `unfruitful` (zero subjects), `rejected` (invalid
  parameters or unavailable reader)
- `kind` ∈ `commune`, `department`, `group`, `epci`, `all`, `other`

The query text is never recorded.

### 1.5 Journey — FR-014, FR-015

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_journey_steps_total` | counter | `step`, `subject_kind` | One per accepted journey step. |
| `actionpop_telemetry_rejected_total` | counter | `reason` | Steps or batches refused. |

- `step` ∈ `arrival`, `search`, `search_empty`, `subject_selected`, `suggestion_accepted`,
  `calendar_shown`, `type_filter`, `group_filter`, `detail_opened`, `export`, `subscribe`
- `reason` ∈ `malformed`, `too_large`, `wrong_type`, `unknown_step`, `rate_limited`
  (`rate_limited` exists for a future limit; this release never emits it)

A visit is counted by `actionpop_journey_steps_total{step="arrival"}`. There is deliberately no
separate visit family: one event, one series, so "visits" and "arrivals" can never diverge.

### 1.6 Client volume band — FR-012

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_client_request_band_total` | counter | `band` | One per request attributed to a band. |

- `band` ∈ `low` (1–19/day), `moderate` (20–99), `high` (100–499), `very_high` (500–1999),
  `extreme` (2000+)

The band is computed from an in-memory, salt-rotated key. The key itself is never a label, never
logged, never persisted.

### 1.7 Geographic coverage — FR-025

| Name | Type | Labels | Meaning |
|---|---|---|---|
| `actionpop_events_without_territory` | gauge | `status` | Unattributed events, refreshed by the worker each cycle. |

- `status` ∈ `incomplete`, `invalid`, `unavailable`, `unknown`
  (`unknown` means the record carries no status at all; `national` and `international` are
  legitimately territory-less and are never counted as a gap)

### 1.8 Preserved families

`actionpop_queue_depth`, `actionpop_redis_ready`, `actionpop_jobs_completed_total`,
`actionpop_jobs_failed_total`, `actionpop_jobs_retried_total`, `actionpop_jobs_exhausted_total`,
`actionpop_upstream_failures_total`, `actionpop_groups_*`, `actionpop_event_scopes_*` keep their
current names and semantics.

`actionpop_ingestion_last_success_timestamp` gains a `source` label (FR-028): `source` ∈
`calendar`, `map`. Two producers write this gauge today with no label, so they overwrite each
other and the staleness alert can be masked by an unrelated successful ingestion. Each producer
must set its own series, and a missing series must stay missing rather than inherit the other
source's timestamp.

## 2. Journey batch (transient)

Not stored. Exists only for the duration of one request inside the API.

| Field | Type | Rules |
|---|---|---|
| `v` | literal `1` | Any other value → `malformed`. |
| `visit` | string | 1–64 chars, `[A-Za-z0-9_-]` only. Opaque; the server never decodes it. |
| `steps` | array | 1–10 items. |
| `steps[].s` | `JourneyStep` | Unknown value → counted as `unknown_step` and dropped, batch still accepted. |
| `steps[].k` | `SubjectKind` or absent | Unknown value → normalized to `none`. |

Body limit 2 000 bytes. Content type must be `application/json`.

## 3. Visit (browser-local)

Held in `localStorage` under `actionpop.visit`.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Random v4 UUID, generated on first arrival. |
| `startedAt` | ISO 8601 string | Set once per visit. |
| `lastActivityAt` | ISO 8601 string | Updated on every step; a gap > 30 min starts a new visit. |

**Retention audit (SC-012)**: the record contains a random identifier, two timestamps and nothing
else. It is never transmitted as a whole — only `id` travels, as an opaque string. It lives in
`localStorage` rather than `sessionStorage` because `sessionStorage` is per tab, which would make
two tabs two visits and contradict FR-014; the thirty-minute idle rule is what bounds its lifetime,
and an expired record is replaced rather than reused. No IP, no user agent, no referrer, no
territory is stored beside it.

## 4. Security finding (documented, not stored)

`docs/security/findings.md` holds one entry per finding.

| Field | Rules |
|---|---|
| Identifier | Sequential, stable (`SEC-001`). |
| Scanner severity | Taken verbatim from the scan report. |
| Reviewer judgement | One line; may disagree with the scanner and must say why. |
| Evidence | The command or request that reproduces it. |
| Disposition | `fixed`, `mitigated`, `accepted`. |
| Revisit trigger | Required when `accepted`: the condition that reopens the decision. |

## 5. State transitions

**Visit**: `absent` → `active` (arrival) → `active` (each step refreshes `lastActivityAt`) →
`ended` (30 min idle) → `active` again creates a **new** visit with a new identifier.

**Calendar delivery**: a request is classified exactly once, in this order —
`unavailable` (dependency failed) → `rejected` (invalid filter or method) → `revalidated`
(304) → `first` (200 with a body). The order is part of the contract and is tested.

**Volume band**: a band grows monotonically within a day for one key; at salt rotation the key
space is rebuilt, so the same client restarts at `low`. Bands are never summed across days.

## 6. Invariants (tested)

1. `sum(actionpop_calendar_requests_total)` equals the number of calendar requests observed by the
   HTTP hook, filtered to the calendar route.
2. `sum by (client_kind)` covers every calendar request: the four classes always sum to the total
   (no request is silently unclassified).
3. `sum(actionpop_client_request_band_total)` equals the number of published requests that are
   eligible for banding.
4. Every label value emitted belongs to its declared enumeration; anything else becomes `other`,
   `none` or `indeterminate` — never a new value.
5. No metric label value, and no log line, ever contains a query string, a search term, a
   visitor-derived territory identifier, or a client address. A group scope identifier that
   already appears in the public feed URL is not visitor-derived and may appear in an error log.
