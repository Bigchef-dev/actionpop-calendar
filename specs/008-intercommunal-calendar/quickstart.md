# Quickstart: Validate Intercommunal Calendar Discovery

## Prerequisites

- Node.js >= 26 and pnpm 12.8.1
- Dependencies installed with `pnpm install:workspace`
- PostgreSQL and Redis available through the documented Docker development stack
- An active geographic reference fixture containing at least:
  - one `CC`, one `CA`, one `CU`, and one `METRO`;
  - two communes in one territory;
  - one event matching two membership paths;
  - one incomplete and one retired territory

## Static validation

From the repository root:

```bash
pnpm typecheck
pnpm test                  # unit, contract and component suites of every package
pnpm test:integration      # PostgreSQL, migrations and real repositories
pnpm test:e2e              # browser acceptance (Playwright + Chromium)
pnpm --filter @actionpop/web typecheck
pnpm lint
```

Expected: all commands pass, including new EPCI, search, calendar, and compatibility tests.

The Playwright suite starts the web app itself and intercepts the API responses it needs, so
`pnpm exec playwright install chromium` is the only prerequisite beyond `pnpm install`.
The browser binary download is the only environment-specific step: it needs network access.

## Operator journey (real data, real API)

```bash
# 1. Import the commune reference and the official groupements list together.
GEOGRAPHIC_COMMUNES_PATH=data/communes-france-2026.csv \
GEOGRAPHIC_EPCI_GROUPEMENTS_PATH=data/liste-des-groupements.csv \
GEOGRAPHIC_PUBLICATION_DATE=2026-11-02 \
pnpm geo:refresh

# 2. Search a territory.
curl 'http://127.0.0.1:3000/search/subjects?q=metropole&kind=epci'

# 3. Read its calendar.
curl -i 'http://127.0.0.1:3000/calendar.ics?epci=200054781'
```

Three sources are supported, in this order of preference:

1. `GEOGRAPHIC_EPCI_GROUPEMENTS_PATH` — the official "liste des groupements" export at
   `data/liste-des-groupements.csv`. It is the authority for identity and legal nature
   (`CC`, `CA`, `CU`, `METRO`, `MET69`); membership is joined from the commune dataset on the
   SIREN. This is the recommended source, and the one used for the 1 255 published territories.
2. `GEOGRAPHIC_EPCI_PATH` — a dedicated `CODGEO,EPCI,LIBEPCI,NATURE_EPCI` export, or an
   already-normalized JSON snapshot.
3. Neither — the territories are derived from the `epci_code`/`epci_nom` columns already
   published in the commune dataset.

Groupings outside the public EPCI categories (SIVU, SIVOM, SMF, SMO, PETR, POLEM, EPT…) are
reported as `epci_nature_unsupported` warnings and skipped. The `ZZZZZZZZZ` placeholder that
marks a commune without any territory is ignored silently.

Re-running the refresh is required after a dataset change: the reference version identity
covers both the communes and the territories, so an existing version is never reused for a
different snapshot.

## Search scenarios

1. Start the API with the test reference active.
2. Request `GET /search/subjects?q=grand&kind=epci`.
3. Verify the response contains an `epci` subject with category context and
   `calendar.params.epci`.
4. Request the same query without `kind`; verify existing commune, department, and group
   behavior remains present and counts are deterministic.
5. Search an accented and unaccented form; verify the same subject is returned.
6. Search a retired ID; verify it is absent.

Expected: see [search-subjects.md](contracts/search-subjects.md).

## Calendar scenarios

1. Request `/calendar.ics?epci={fixture-id}`.
2. Verify events from both member communes are present.
3. Verify an event outside the territory is absent.
4. Verify an event matching two member paths appears once.
5. Add `event_type` and `group` filters, then reopen the generated link.
6. Compare selected subject, active filters, and event IDs before and after reopening.
7. Request a valid territory with no events and verify a valid empty feed.
8. Request an incomplete or retired territory and verify the explicit availability/recovery
   behavior, with no unrelated events.

Expected: see [calendar-ics.md](contracts/calendar-ics.md).

## Refresh scenarios

1. Load a valid staged source snapshot and activate it.
2. Attempt to load a snapshot with an unknown commune membership and verify quarantine.
3. Force activation failure and verify the previous active version remains served.
4. Load a membership-change snapshot and verify the next calendar request uses the new
   membership only after activation.

Expected: see [reference-refresh.md](contracts/reference-refresh.md).

## Browser acceptance scenarios

1. Search for each EPCI category in the public discovery page.
2. Verify each result is labeled distinctly from a city with the same name.
3. Open the territory calendar, apply event-type and group filters, and reload the URL.
4. Verify the empty, inactive, ambiguous, and incomplete states offer a recovery action.
5. Verify existing city, department, and group links still load their previous calendars.
