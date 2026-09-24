# Operations Contract

## Health checks

Health routes are private. Separate checks are required:

- **Liveness**: process and event loop respond; dependency failures do not make a
  healthy process appear dead.
- **Readiness**: API can read a current snapshot; worker can use Redis/BullMQ; the
  dispatcher can acquire its scheduling dependency; Redis responds to `PING` and
  reports no blocking persistence error.
- **Startup**: configuration is valid and required connections can initialize.

Docker healthchecks may drive local restart behavior. External monitoring must also
check the public HTTPS feed and private readiness routes.

## Structured logs

JSON logs go to stdout and include timestamp, service, environment, level, request or
job ID, scope and period when relevant, operation, outcome, duration in milliseconds,
and sanitized failure context. Logs must not include secrets, authorization headers,
raw upstream payloads, Redis URLs, or private feed tokens.

## Metrics

Metrics use bounded labels and cover:

- HTTP request count, status, and latency
- Feed cache and conditional-response outcomes
- Job duration, completed/retried/failed/exhausted counts
- Queue depth and oldest waiting-job age
- Dispatcher cycle success and duration
- Upstream failures and latency
- Redis connectivity, command errors, memory, disk, and AOF persistence errors
- Last successful ingestion timestamp

## Alerts

Alert on public feed 5xx/unavailability, API readiness failure, queue growth, stale
successful-ingestion timestamp, exhausted jobs, sustained upstream failures, Redis
connectivity or persistence failure, memory pressure, disk exhaustion, and unavailable
metrics/alerting pipelines.

Thresholds must be relative to the 15-minute dispatcher interval and retry window.
Redis replication and a formal availability target are outside Phase 1.
