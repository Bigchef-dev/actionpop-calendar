# Contract: Published Edge, Internal Routes and Telemetry

**Owner:** [009 — Release Hardening and Observability](../../009-release-hardening-observability/spec.md)
**Amendments:** none
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`infra/edge`](../../../infra/edge), [`apps/api/src/internal/internal.controller.ts`](../../../apps/api/src/internal/internal.controller.ts), [`apps/api/src/observability/telemetry.controller.ts`](../../../apps/api/src/observability/telemetry.controller.ts)
**Related:** metric families and monitoring assets live in [`../operations/metrics.md`](../operations/metrics.md)

## Principle: closed by default

A route is public only because it is listed here. Adding a route is a visible change to
`infra/edge/https.conf`. Everything else answers `404` at the edge.

## Public allowlist

| Path                                                       | Match                | Target | Notes                                                                            |
| ---------------------------------------------------------- | -------------------- | ------ | -------------------------------------------------------------------------------- |
| `/`                                                        | exact                | `web`  | SPA index                                                                        |
| `/assets/`                                                 | prefix               | `web`  | Hashed build assets                                                              |
| `^/[^/]+\.(png\|ico\|svg\|webp\|txt)$`                      | regex                | `web`  | Root-level files from `apps/web/public/`, including `robots.txt`                 |
| `/calendar.ics`                                            | exact                | `api`  | Filtered iCalendar feed                                                          |
| `/search/`                                                 | prefix               | `api`  | Subject search                                                                   |
| `/events`                                                  | prefix               | `api`  | Geographic JSON event list                                                       |
| `/feed/`                                                   | prefix               | `api`  | Dataset-scoped calendar                                                          |
| `/telemetry/journey`                                       | exact, `POST`        | `api`  | Journey batches; any other method answers `405` with an `Allow: POST` header     |

Everything else — including `/internal/*`, `/reference`, `/openapi.json` and any unknown path —
answers `404` at the edge.

## Redirects and transport

TLS terminates at the host-wide Caddy reverse proxy, which owns ports `80`/`443` and forwards the
virtual host to `edge:8080` over the `caddy_network`. The nginx edge speaks plain HTTP, is never
published and declares no certificate.

- Caddy answers port 80 with `301` to the same host and path on `https`.
- Caddy sets `X-Forwarded-For`/`X-Forwarded-Proto`; the edge forwards the chain unchanged.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses.

## Security headers

Applied to every proxied and static response by one shared snippet,
`infra/edge/security-headers.conf`, included by both the HTTPS server and the plain-HTTP scan
server so the scan validates exactly what production serves.

| Header                         | Value                                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`      | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`                                  |
| `X-Content-Type-Options`       | `nosniff`                                                                                                                                                                                                                        |
| `X-Frame-Options`              | `DENY`                                                                                                                                                                                                                           |
| `Referrer-Policy`              | `no-referrer`                                                                                                                                                                                                                    |
| `Permissions-Policy`           | `geolocation=(), microphone=(), camera=(), payment=(), usb=()`                                                                                                                                                                   |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                                                                                                                                    |
| `Cross-Origin-Embedder-Policy` | `require-corp`                                                                                                                                                                                                                   |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                                                                                                                                    |

`style-src 'unsafe-inline'` is required by Tailwind/Vue runtime style injection and
`font-src data:` by the FullCalendar icon font; scripts are never allowed inline, so a markup
injection cannot become script execution.

## Private routes (must not be routed at the edge)

| Surface                        | Why                                                      |
| ------------------------------ | -------------------------------------------------------- |
| `GET /internal/live`           | Liveness probe, read by Docker on the private network    |
| `GET /internal/ready`          | Readiness probe, verifies datastore access               |
| `GET /internal/metrics`        | Usage data, read by Prometheus over `monitoring`         |
| `GET /openapi.json`, `/reference` | Exploratory; off by default in production             |

The API still registers these routes; being absent from the allowlist is what makes them
private.

## `POST /telemetry/journey`

The only write surface added by 009. Public through the edge, same origin as the SPA, so no CORS
rule is involved.

| Part           | Rule                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Method         | `POST` only                                                                                                                |
| `Content-Type` | `application/json` (`; charset=utf-8` accepted)                                                                            |
| Body limit     | 2 000 bytes                                                                                                                |
| Body schema    | `{ "v": 1, "visit": "<1-64 chars, [A-Za-z0-9_-]>", "steps": [ { "s": "<JourneyStep>", "k"?: "<SubjectKind>" } ] }`         |
| `steps` length | 1 to 10                                                                                                                    |

`JourneyStep` and `SubjectKind` vocabularies are enumerated once in
[`../data/model.md`](../data/model.md).

| Status | When                                                                                                                              | Body  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `204`  | Batch accepted. Also returned when some steps are unknown: unknown steps are counted as `unknown_step` and dropped.                | empty |
| `405`  | Any method other than `POST`.                                                                                                     | empty |
| `413`  | Body exceeds 2 000 bytes.                                                                                                         | empty |
| `415`  | Content type is not JSON.                                                                                                         | empty |
| `400`  | Body is not parseable JSON, or a required field is missing or out of range.                                                       | empty |

No response echoes the payload and no error body explains what failed, to remove enumeration
value from a public write route.

**No persistence.** No database write, no file, no log line containing the payload. Only the
journey and rejection counters in [`../operations/metrics.md`](../operations/metrics.md) move.

Client obligations: queue steps in memory, flush on a timer or queue bound; use
`navigator.sendBeacon` when the page may unload, otherwise `fetch` with `keepalive: true`; drop
failures without retry; keep working when `localStorage` is unavailable.

## Verification

- `tests/integration/edge-surface.test.ts` — parses `https.conf`, asserts the location table
  matches this contract, that no `location` matches `/internal`, that both servers include the
  shared header snippet, and that the write surface caps its body at 2 KB.
- `apps/api/src/observability/telemetry.controller.test.ts` — status codes per row, and no step
  recorded for a rejected batch.
- The ZAP baseline job asserts the header set and that unterminated paths 404.
