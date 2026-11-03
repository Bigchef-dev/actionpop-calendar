# Contract: Published Edge Surface

**Principle**: closed by default. A route is public only because it is listed here, and adding a
route is a visible change to `infra/edge/https.conf` (FR-013).

## Allowlist

| Path | Match | Target | Notes |
|---|---|---|---|
| `/` | exact | `web` | SPA index |
| `/assets/` | prefix | `web` | Hashed build assets |
| `^/[^/]+\.(png|ico|svg|webp|txt)$` | regex | `web` | Root-level files copied from `apps/web/public/` (currently `tortue-hourra.png`) |
| `/calendar.ics` | exact | `api` | Filtered iCalendar feed |
| `/search/` | prefix | `api` | Subject search |
| `/events` | prefix | `api` | Geographic JSON event list |
| `/feed/` | prefix | `api` | Dataset-scoped calendar |
| `/telemetry/journey` | exact, `POST` | `api` | Journey batches; any other method answers `405` with an `Allow: POST` header |
| `^/[^/]+\.(png\|ico\|svg\|webp\|txt)$` | regex | `web` | Root-level files from `apps/web/public/`, including `robots.txt` |

Everything else, including `/internal/*`, `/reference`, `/openapi.json` and any unknown path,
answers `404` at the edge.

## Redirects and transport

- Port 80 answers `301` to the same host and path on `https`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` on HTTPS responses.

## Response headers

Applied to every proxied and static response by a single shared snippet,
`infra/edge/security-headers.conf`, included by both the HTTPS server and the plain-HTTP scan
server so the scan validates exactly what production serves.

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `require-corp` |
| `Cross-Origin-Resource-Policy` | `same-origin` |

`style-src 'unsafe-inline'` is required by Tailwind/Vue runtime style injection and
`font-src data:` by the FullCalendar icon font; scripts are never allowed inline, so a markup
injection cannot become script execution. Both allowances are asserted by the edge smoke test
(`apps/web/tests/edge-smoke.spec.ts`): a violation there fails the build.

## Private surfaces (must NOT be routed)

| Surface | Why |
|---|---|
| `/internal/live`, `/internal/ready` | Health probes, read by Docker on the private network |
| `/internal/metrics` | Usage data; read by Prometheus over `monitoring` |
| `/openapi.json`, `/reference` | Exploratory; off by default in production (FR-007) |

## Verification

- `tests/integration/edge-surface.test.ts` — parses `https.conf` and asserts the location table
  matches this contract, that no `location` matches `/internal`, that both servers include the
  shared header snippet, and that the write surface caps its body at 2 KB.
- The ZAP baseline job (see [monitor-package.md](./monitor-package.md) and
  `.github/workflows/security.yml`) asserts the header set and that unterminated paths 404.
- A Playwright smoke test loads `/` through a running edge and asserts the SPA renders and that
  `document.querySelector` can reach the app without CSP violations reported in the console.
