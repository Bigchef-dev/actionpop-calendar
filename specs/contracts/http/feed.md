# Contract: Dataset Feed

**Owner:** [001 — Technical Foundation](../../001-technical-foundation/spec.md)
**Amendments:** none
**Status:** Living contract · consolidated 2026-11-14 (rewritten for PostgreSQL as the source of truth)
**Implementation:** [`apps/api/src/controllers/calendar.controller.ts`](../../../apps/api/src/controllers/calendar.controller.ts), [`apps/api/src/services/calendar.service.ts`](../../../apps/api/src/services/calendar.service.ts)

## Purpose

Serve a complete, deployment-scoped calendar snapshot for one configured scope, read-only and
never contacting Action Populaire during a request.

## Storage boundary

- **PostgreSQL is the single source of truth.** The API reads the current complete published
  state through the dataset repository (`CalendarSnapshot` + `EventRecord`).
- **Redis carries BullMQ only.** It is not a durable store for events, datasets, snapshots or
  subscriptions and is not read on the feed path.
- A request never triggers ingestion, enrichment or upstream access.

## Request

```http
GET /feed/{scopeId} HTTP/1.1
Host: calendar.example
Accept: text/calendar
If-None-Match: "optional-feed-revision"
```

`scopeId` is a canonical configured scope identifier matching
`^[a-z0-9]+(?:-[a-z0-9]+)*$`.

## Successful response

```http
HTTP/1.1 200 OK
Content-Type: text/calendar; charset=utf-8
ETag: "feed-revision"
Cache-Control: public, max-age=900

BEGIN:VCALENDAR
...
END:VCALENDAR
```

The calendar uses stable event `UID` values, deterministic `SEQUENCE` values, CRLF line endings,
valid escaping and timezone-safe date values. `DTSTAMP` and `LAST-MODIFIED` are emitted in UTC;
application scheduling remains `Europe/Paris`.

## Conditional response

```http
HTTP/1.1 304 Not Modified
ETag: "unchanged-feed-revision"
```

Returned when `If-None-Match` matches the current feed revision. No body.

## Error responses

| Status | When                                                          | Body                                         |
| ------ | ------------------------------------------------------------- | -------------------------------------------- |
| `400`  | Invalid or unknown scope identifier format                    | `{ "error": "invalid scope identifier" }`    |
| `404`  | Valid route but no configured or published scope dataset      | `{ "error": "scope not found" }`             |
| `405`  | Mutation or unsupported method on the public feed             | `{ "error": "read-only feed" }`              |
| `503`  | PostgreSQL or the current snapshot is unavailable             | `{ "error": "calendar data unavailable" }`   |

Error bodies are not calendar data and must not disclose credentials, internal connection
details or private administration routes.

## Readiness boundary

Readiness is private and verifies datastore connectivity plus access to the required current
snapshot path. Liveness only verifies that the API process is responsive. See
[`http/observability.md`](observability.md).

## Compatibility

`scopeId` semantics and `ETag`/`304` behaviour are stable. A feed is complete: the API never
serves a partially published dataset.
