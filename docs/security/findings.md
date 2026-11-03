# Security findings register

Every weakness found while preparing the publication, with the scanner's severity, the reviewer's
own judgement, the evidence that reproduces it, and its disposition.

A finding is never deleted. When it is fixed, the entry stays and records what closed it, so a
regression is recognisable.

| Field | Meaning |
|---|---|
| Scanner severity | Verbatim from the scan report (`0` informational to `3` high). `n/a` for findings made by review before any scan ran. |
| Reviewer judgement | One line, and it may disagree with the scanner. A disagreement must say why. |
| Disposition | `fixed`, `mitigated` or `accepted`. |
| Revisit trigger | Required for `accepted`: the condition that reopens the decision. |

A release is blocked while any finding is `open`, and while any finding is high severity according
to the scanner (see `scripts/zap-gate.mjs`).

## Register

### SEC-001 — Exploratory console and raw schema reachable in production

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: High. `/reference` and `/openapi.json` were served unless
  `API_REFERENCE=false` was set, so the default deployment exposed an interactive console and the
  full route schema to the internet.
- **Evidence**: `apps/api/src/main.ts` previously read `process.env.API_REFERENCE !== 'false'`.
- **Disposition**: fixed. Both surfaces are now registered only when `API_REFERENCE === 'true'`,
  which means an unconfigured deployment has no such route at all. Asserted by
  `apps/api/src/server.test.ts`.

### SEC-002 — No browser security headers on the published site

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: High. Without CSP and `frame-ancestors`, any injected markup could load
  third-party script, and the calendar could be framed by another origin.
- **Evidence**: no `add_header` directive existed in `infra/edge/`.
- **Disposition**: fixed. A single shared snippet (`infra/edge/security-headers.conf`) is included
  by both the HTTPS server and the CI scan server: CSP with `script-src 'self'` and
  `frame-ancestors 'none'`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`.

### SEC-003 — The published surface was not actually routed

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: Medium, and it is a correctness defect as much as a security one: the
  edge proxied only `/feed/`, so the routes the site calls answered 404 at the edge while being
  served by the API container on the private network.
- **Evidence**: `infra/edge/https.conf` previously declared one `location /feed/`.
- **Disposition**: fixed. The edge is now a closed-by-default allowlist; anything not listed
  answers `404` without disclosing whether it exists.

### SEC-004 — Query strings recorded in access logs

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: Medium. The request logger wrote the full URL, so a visitor's search
  term and the territory they follow were written to logs, contradicting the privacy constraint of
  the specification.
- **Evidence**: `apps/api/src/server.ts` previously logged `` `${request.method} ${request.url}` ``.
- **Disposition**: fixed. Logs and metrics now use the bounded route template
  (`apps/api/src/observability/route-template.ts`); a test asserts the query string can never
  reach a label.

### SEC-005 — Usage metrics reachable if the API port were published

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: Medium. `/internal/metrics` carries usage volumes and territory families.
  It was reachable whenever the API container was published.
- **Evidence**: `apps/api/src/internal/internal.controller.ts` has no authentication, by design.
- **Disposition**: mitigated. The edge never routes `/internal/*`, and Prometheus reaches the port
  over a shared private Docker network instead of a host port. Revisit if a deployment ever
  publishes the API port directly.

### SEC-006 — No request rate limiting on published traffic

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: Accepted for this release. A calendar read costs one database query, so a
  trivial loop can consume the instance.
- **Evidence**: no throttling layer exists in `apps/api/src/`.
- **Disposition**: accepted, by explicit decision during specification. Abuse is measured instead:
  a salted, daily-rotated, in-memory volume band is exposed as
  `actionpop_client_request_band_total{band}`.
- **Revisit trigger**: the first observed `very_high` or `extreme` band in production, or any
  availability incident attributed to request volume. Enforcing a limit requires choosing a
  threshold from measured traffic, which is why it is not guessed now.

### SEC-007 — The static host cannot set response headers

- **Scanner severity**: n/a (found by review)
- **Reviewer judgement**: Medium. GitHub Pages serves no configurable headers, so the site could
  never satisfy SEC-002 while hosted there.
- **Evidence**: GitHub Pages documentation; `apps/web/vite.config.ts` previously hard-coded the
  Pages base path.
- **Disposition**: mitigated. The site is now served by the application edge. The Pages build is
  kept as an immediate fallback, with its base path and API URL supplied by the workflow, and it
  is explicitly the *degraded* deployment: no HSTS, no CSP, no frame protection.
- **Revisit trigger**: retiring the Pages fallback promotes this entry to `fixed`.

### SEC-008 — Server banner disclosed the nginx build

- **Scanner severity**: `1` low (rule 10036).
- **Reviewer judgement**: Low on its own; free to remove, and version disclosure is exactly the
  reconnaissance step before a targeted attempt.
- **Evidence**: `curl -sI http://<edge>/` returned `Server: nginx/1.27.5`.
- **Disposition**: fixed. `server_tokens off;` in both edge servers; the header now reads `nginx`.

### SEC-009 — Cross-origin embed/opener protections missing

- **Scanner severity**: `1` low (rule 90004).
- **Reviewer judgement**: Low, because the site loads no third-party resource. Still worth
  closing: without COEP a future cross-origin include could leak state silently.
- **Evidence**: rule 90004 on the document and on the two build assets.
- **Disposition**: fixed. `Cross-Origin-Embedder-Policy: require-corp` and
  `Cross-Origin-Resource-Policy: same-origin` are set in the shared header snippet.

### SEC-010 — A missing `font-src` allowance broke the calendar icons

- **Scanner severity**: n/a — found by the edge smoke test, not by the scanner.
- **Reviewer judgement**: This is the one control that only an end-to-end check could find: the
  page rendered but FullCalendar's embedded icon font was blocked, so arrows and view icons were
  missing for a visitor.
- **Evidence**: `apps/web/tests/edge-smoke.spec.ts` reported a CSP violation on
  `font-src 'self'` for a `data:application/x-font-ttf` source.
- **Disposition**: fixed, narrowly: `font-src` now allows `data:` and nothing else. Scripts remain
  `'self'`-only, and the smoke test fails the build if a new violation appears.

### SEC-011 — CSP allows inline styles

- **Scanner severity**: `2` medium (rule 10055).
- **Reviewer judgement**: Accepted. Tailwind and Vue inject styles at runtime, so removing
  `'unsafe-inline'` from `style-src` would break the published layout. Script execution stays
  `'self'`-only, which is the control that actually stops an injection from becoming code
  execution; a style injection alone cannot exfiltrate data under `connect-src 'self'` and
  `img-src 'self' data:`.
- **Evidence**: rule 10055 on the document and on the 404 responses.
- **Disposition**: accepted, tuned in `.zap/rules.tsv`.
- **Revisit trigger**: a CSP level allowing per-element style hashes is adopted, or a build step
  extracts the injected styles to a hashed stylesheet.

### SEC-012 — Static assets are storable and cacheable

- **Scanner severity**: `0` informational (rule 10049).
- **Reviewer judgement**: Accepted, and intended: the build assets carry content hashes in their
  names, so a long cache is correct and re-fetching them would cost every visitor bandwidth for
  no benefit.
- **Evidence**: rule 10049 on `index.html` and the two hashed assets.
- **Disposition**: accepted, tuned in `.zap/rules.tsv`.

## Scan results

**Run: 2026-11-03**, OWASP ZAP baseline against the plain-HTTP edge of the full stack.

| Outcome | Count |
|---|---|
| Fail (high severity) | 0 |
| Warn | 0 |
| Pass | 65 |
| Tuned in `.zap/rules.tsv` | 3 rules (10049, 10055, 90004 are reported as `IGNORE` when they still apply) |

Alerts after the fixes above, all dispositioned:

| Rule | Name | Severity | Disposition |
|---|---|---|---|
| 10055 | CSP: `style-src unsafe-inline` | medium | SEC-011, accepted |
| 10049 | Storable and Cacheable Content | informational | SEC-012, accepted |
| 10109 | Modern Web Application | informational | informational only, no action possible |

`node scripts/zap-gate.mjs zap-report/zap-report.json` exits `0` on this report; the CI job
uploads `zap-report/` as an artifact on every outcome.

**How the blocking path is proven (SC-002).** A passive baseline scan cannot produce a
high-severity finding on this surface: the rules that reach high severity (SQL injection,
reflected XSS, command injection) require active scanning against inputs the calendar routes do
not accept. Rather than manufacture a vulnerability to satisfy the letter of the criterion, the
gate's failure path is proven mechanically by `tests/integration/zap-gate.test.ts`, which feeds
the gate a report containing a `riskcode` of `3` and asserts a non-zero exit, and by the same
test asserting that an unreadable report also fails. Escalating the scan to active mode is
recorded as the revisit trigger below. When a new scan introduces an alert, it is
added to this register before the release proceeds — an untriaged alert keeps the release blocked.
