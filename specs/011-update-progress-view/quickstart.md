# Quickstart: Minimal Update Progress View

**Feature**: [spec.md](spec.md) · **Contract**: [contracts/update-status.md](contracts/update-status.md) ·
**Data model**: [data-model.md](data-model.md)

This guide proves the feature end to end: the derived rules, the SQL aggregate, the public
response, the published edge entry and the visible web indicator. It assumes the repository
requirements from the root [README](../../README.md).

## Prerequisites

```bash
pnpm install --frozen-lockfile
pnpm dev:infra        # Redis + PostgreSQL through Docker
pnpm db:setup         # generate the Prisma client and apply migrations
```

The migration `0010_update_progress_index` is applied by `pnpm db:setup` (or
`pnpm prisma:migrate`). It only adds an index.

## 1. Prove the classification rules

```bash
pnpm --filter @actionpop/core test -- update-status
```

Expected: the pure suite passes. It covers `updating`, `up_to_date`, `stale`, `partial`,
`unknown`, never-updated, abandoned periods, the `processed + failed + remaining = total`
invariant, the five-entry history bound and the zero-clamped duration.

## 2. Prove the PostgreSQL aggregate

```bash
TEST_DATABASE_URL=postgresql://actionpop:actionpop@127.0.0.1:5432/actionpop_test \
  pnpm exec vitest run tests/integration/update-status.test.ts
```

Expected: the test seeds `processing_period` and `ingestion_ledger` rows for a current and
several settled periods, then asserts:

- the current run reports `processed`, `failed`, `remaining` and `total` that add up;
- the most recent settled run is `lastCompleted`, with a non-negative duration;
- the history is newest first and holds at most five runs;
- no `scope_id`, `job_id`, `period_token` or error text appears in the answer.

When `TEST_DATABASE_URL` is not set, the integration suite skips and reports it, as the existing
integration tests do.

## 3. Inspect the public response

Run the API against the local database:

```bash
pnpm --filter @actionpop/api dev
curl -s http://127.0.0.1:3000/updates | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s),null,2)))"
```

Expected:

- HTTP `200` and `Cache-Control: public, max-age=15`;
- the key set is exactly `checkedAt`, `refreshIntervalSeconds`, `state`, `current`,
  `lastCompleted`, `history`, `available`, and every run carries `groups` and `events`;
- `state` is one of the five contract values;
- the counts satisfy the sum invariant, `groups` reads `n/total` group scopes and `events`
  reads `n/total` distinct events observed in the period;
- no identifier, name, error or queue field is present.

To see a live shape, let the worker run one cycle:

```bash
pnpm dev:worker
```

Then re-run the `curl` while a cycle is in progress. `state` should become `updating` and
`current` should fill with aggregate counts. Stop the worker and wait for the cycle to settle:
`lastCompleted` and `history` should populate.

## 4. Prove graceful degradation

With the API still running, stop PostgreSQL:

```bash
pnpm dev:down
curl -i http://127.0.0.1:3000/updates
```

Expected: HTTP `200`, `state: "unknown"`, both sections `null`, every `available` flag `false`,
and `Cache-Control: no-store`. No `5xx`, no stack trace, no error text. Restart the dependencies
with `pnpm dev:infra` when finished.

## 5. Prove the web experience

```bash
pnpm dev            # API + web, with /updates proxied by Vite
```

Open `http://127.0.0.1:5173/` and check the footer:

- a fresh cycle shows a green/neutral line such as "Données à jour · il y a 3 min";
- a live cycle shows "Mise à jour en cours" with processed/remaining figures;
- "Derniers cycles" is collapsed by default and lists at most five runs;
- the link "Voir l’état détaillé" points at `/etat`;
- a manual refresh updates the line without reloading the page;
- switching tabs away and back refreshes the line immediately;
- times are shown in `Europe/Paris` (compare with the server's clock around a DST boundary).

Open `http://127.0.0.1:5173/etat` (or `/#/etat` on a static host) and check the dedicated page:

- the heading "État des données" and the current state are visible on one screen;
- explicit lines "Groupes n/total" and "Événements n/total" are visible;
- each line has an accessible progress bar (`role="progressbar"`) whose
  `aria-valuenow`/`aria-valuemax` match processed+failed and total for that kind;
- the five-cycle strip shows at most five bars, and the list below repeats each cycle in text;
- unknown and never-updated states say so instead of showing zero;
- the header logo links back to the calendar, and the page remains readable at 360px width.

With PostgreSQL stopped, the last known information remains readable and the page still works;
the freshness age keeps growing rather than freezing silently.

## 6. Prove the tests and the published edge

```bash
pnpm --filter @actionpop/api test -- update-status
pnpm --filter @actionpop/web test -- updates
pnpm exec playwright test apps/web/tests/update-status.spec.ts
TEST_DATABASE_URL=postgresql://actionpop:actionpop@127.0.0.1:5432/actionpop_test \
  pnpm exec vitest run tests/integration/edge-surface.test.ts
pnpm check:spell
```

Expected: every command passes. The edge test asserts that `/updates` is in the exact allowlist
with `GET`/`HEAD` only, and that `/internal/*`, `/reference` and `/openapi.json` remain absent.
The Playwright scenario intercepts `/updates` and asserts the visible freshness line, the
collapsed five-entry history and the manual refresh.

## 7. Full quality gate

```bash
pnpm check:static
pnpm --filter @actionpop/api test
pnpm --filter @actionpop/web test
pnpm build
```

Expected: strict type checking, lint, dead-code, cycle, spelling, toolchain and license checks
pass, and the API and web builds succeed. No existing route, contract or page changes behavior.
