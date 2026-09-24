# API Contract: Public Calendar Feed

## Scope

The API exposes only public, read-only calendar feeds in this phase. Redis, BullMQ,
health internals, dispatcher controls, and administration endpoints are private.
Public traffic reaches the service through HTTPS.

## Feed request

```http
GET /feed/{scopeId} HTTP/1.1
Host: calendar.example
Accept: text/calendar
If-None-Match: "optional-feed-revision"
```

`scopeId` is a canonical configured scope identifier. The API reads the current
complete snapshot from Redis and never calls Action Populaire during a feed request.

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

The calendar uses stable event `UID` values, deterministic `SEQUENCE` values,
CRLF line endings, valid escaping, and timezone-safe date values. `DTSTAMP` and
`LAST-MODIFIED` are emitted in UTC; application scheduling remains `Europe/Paris`.

## Conditional response

```http
HTTP/1.1 304 Not Modified
ETag: "unchanged-feed-revision"
```

The API returns `304` when `If-None-Match` matches the current feed revision.

## Error responses

- `400 Bad Request`: invalid or unknown scope identifier format.
- `404 Not Found`: valid route but no configured or published scope dataset.
- `405 Method Not Allowed`: mutation or unsupported method on the public feed.
- `503 Service Unavailable`: Redis or current snapshot unavailable.

Error bodies are not calendar data and must not disclose Redis, upstream credentials,
internal connection details, or private administration routes.

## Readiness boundary

Readiness is private and verifies Redis connectivity plus access to the required
current snapshot path. Liveness only verifies that the API process is responsive.
