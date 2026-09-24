# Data Model: Operations

## IngestionJob

BullMQ execution state for one scope-period.

| Field | Rule |
|---|---|
| `jobId` | Versioned, deterministic, colon-free, unique per scope-period |
| `scopeId` | Active or historically known scope |
| `periodStartUtc` | Matches the job identity |
| `status` | `waiting`, `delayed`, `active`, `completed`, or `failed` |
| `attemptsMade` | Non-negative queue attempt count |
| `createdAt` | Required timestamp |
| `lastError` | Present for retry or final failure |

BullMQ is at-least-once. Redelivery after worker loss is expected, so effects must be
idempotent.

## IngestionLedger

Durable application state retained independently of BullMQ auto-removal.

**Redis key**: `ingestion:{scopeToken}:{periodToken}`

Statuses are `scheduled`, `running`, `publishing`, `succeeded`, `retrying`, and
`failed`. The ledger retains job ID, scope and period, attempt count, lifecycle
 timestamps, worker ID, sanitized error details, and optional source revision.

## RuntimeConfiguration

Deployment-provided values for Redis, dispatcher interval, queue retry/backoff,
upstream access, public URL, metrics/alerts, and environment name. Secrets are never
committed.

## OperationalSignal

A bounded, sanitized log, metric, health status, or alert containing service,
operation, outcome, duration, and request/job context. It never includes credentials,
authorization headers, raw payloads, Redis URLs, or private feed tokens.
