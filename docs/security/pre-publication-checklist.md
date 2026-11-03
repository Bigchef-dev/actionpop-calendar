# Pre-publication checklist

Repeatable procedure, run once per release candidate. Copy the block below into the review record
and fill the outcome column. An item is never left blank: `pass`, `fail` (with the finding id that
records it) or `n/a` (with the reason).

## Configuration under test

Record these before starting, so the verdict is never overstated:

| Field | Value |
|---|---|
| Commit under test | |
| Date and operator | |
| Configuration file | (`config/actionpop.yaml`? defaults?) |
| `API_REFERENCE` | |
| `OBSERVABILITY_DEPLOYMENT` | |
| `TELEMETRY_ENABLED` | |
| `MONITORING_NETWORK` | |
| Reverse proxy / edge present | |

## Procedure

Every command runs against a stack started with the scan overlay:

```bash
docker network create monitoring 2>/dev/null || true
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.security.yml up -d --build
```

| # | Item | Command or check | Expected | Outcome |
|---|---|---|---|---|
| 1 | Only the documented routes answer | `for p in / /calendar.ics /search/subjects /events /feed/x /telemetry/journey /internal/metrics /reference /openapi.json /nope; do curl -s -o /dev/null -w "$p %{http_code}\n" http://127.0.0.1:8080$p; done` | `200`/`405` for allowlisted paths, `404` for `/internal/metrics`, `/reference`, `/openapi.json`, `/nope` | |
| 2 | Security headers present | `curl -sI http://127.0.0.1:8080/ \| grep -Ei 'content-security-policy\|x-frame-options\|referrer-policy\|permissions-policy\|x-content-type-options'` | all six present | |
| 3 | Secure transport enforced | `curl -sI http:///<host>/` against the HTTPS edge | `301` to `https`, and `Strict-Transport-Security` on the HTTPS response | |
| 4 | Private surfaces reachable by the monitor only | From the `monitoring` network: `curl -s api:3000/internal/metrics \| head -1` | `200` with `# HELP` lines | |
| 5 | Metrics carry types | `curl -s http://127.0.0.1:8080/... ` is not applicable; read the same body as item 4 | every family has `# TYPE`; `actionpop_http_request_duration_seconds` is a `histogram` | |
| 6 | No personal data in a series | `curl -s api:3000/internal/metrics \| grep -Ei 'insee\|commune=\|q=\|user_agent'` | no output | |
| 7 | Journey reporting works and is bounded | `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/telemetry/journey -H 'content-type: application/json' -d '{"v":1,"visit":"abcdefgh","steps":[{"s":"arrival"}]}'` | `204`; a body above 2 KB answers `413` | |
| 8 | Exploratory surfaces are absent by default | items 1 and the API log at startup | no `/reference` or `/openapi.json` registration | |
| 9 | Automated exploitation scan | `pnpm exec vitest run tests/integration/zap-gate.test.ts` then the `exploitation` CI job | gate blocks a high severity report; the CI job is green | |
| 10 | Dependency audit and secret scan | `pnpm audit:high` and the `secrets` CI job | no high or critical vulnerability; no leaked secret | |
| 11 | Containers run as non-root | `docker compose exec api id -u`, the same for `worker` and `web` | not `0` | |
| 12 | Images build reproducibly | `docker build -f infra/docker/Dockerfile.api .` and the same for `worker` and `web` | all three succeed from a clean tree | |
| 13 | Findings all dispositioned | `docs/security/findings.md` | no `open` entry; no unresolved high severity | |
| 14 | Reproduction timing | start this checklist on a clean machine; record elapsed time | under one hour without help from the original author | |

## Verdict

| Question | Answer |
|---|---|
| Any finding `open`? | |
| Any high severity finding from the scan? | |
| Every item `pass` or justified `n/a`? | |
| Publication approved by | |

Anything other than four clean answers blocks the publication. A `fail` is recorded as a finding
with its disposition, and the checklist re-runs from the top afterwards.


## Recorded run — 2026-11-03

Configuration under test: `config/actionpop.example.yaml` defaults, `API_REFERENCE` unset,
`OBSERVABILITY_DEPLOYMENT` unset, `TELEMETRY_ENABLED` default, `MONITORING_NETWORK=monitoring`,
stack started with `infra/compose/docker-compose.security.yml`.

| # | Observed | Outcome |
|---|---|---|
| 1 | `/` 200, `/tortue-hourra.png` 200, `/calendar.ics` 200, `/search/subjects` 400 without `q`, `/events` 200, `/feed/x` 404, `/telemetry/journey` GET 405 / POST 204, `/internal/*` 404, `/reference` 404, `/openapi.json` 404, `/nope` 404 | pass |
| 2 | all six headers present | pass |
| 3 | `301` on port 80 and `Strict-Transport-Security` on HTTPS — verified by configuration only; the local stack runs the plain-HTTP twin | n/a locally, to re-verify on the host |
| 4 | `api:3000/internal/metrics` answered `200` from inside the private network and `404` from the edge | pass |
| 5 | every family carries `# TYPE`; duration is a `histogram` | pass |
| 6 | no `insee`, `q=`, `commune=` or `user_agent` in the exposition | pass |
| 7 | `204` on a valid batch, `413` above 2 KB, `415` on a wrong content type, `405` on `GET` | pass |
| 8 | `/reference` and `/openapi.json` answer `404` with `API_REFERENCE` unset | pass |
| 9 | ZAP baseline: 0 fail, 0 warn, 65 pass; the gate exits `0` | pass |
| 10 | `pnpm audit --prod --audit-level=high` found no high or critical advisory (4 low, 4 moderate, all dev-transitive) | pass, with the note below |
| 11 | `web` runs as uid 100; `api` and `worker` already run as `actionpop` | pass |
| 12 | API, worker and web images all build from a clean tree | pass |
| 13 | 12 findings, none `open`; SEC-006 and SEC-011/012 accepted with a revisit trigger | pass |
| 14 | reproduction timing not measured: this run was executed by the implementing engineer, so SC-003 still needs a second operator | outstanding |

Note on item 10: the 8 advisories are all in the development chain (build tooling) and none is
high or critical, which is the gate the project enforces. Recording them keeps the number visible
rather than implying a clean audit.
