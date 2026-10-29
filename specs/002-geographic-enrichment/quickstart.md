# Quickstart: Geographic Enrichment

## Prerequisites

- Node.js >=20 and pnpm 12.8.1
- Workspace dependencies installed with `pnpm install --frozen-lockfile`
- PostgreSQL reachable through `DATABASE_URL` (local Docker compose or a disposable test
  database); Redis is needed only for the BullMQ queue and not for geographic validation
- PostgreSQL integration tests read `TEST_DATABASE_URL`; the existing `tests/integration`
  harness only provisions Redis, so this feature adds a PostgreSQL harness that applies the
  migrations and cleans the reference and event tables between tests
- Local fixture present: `data/communes-france-2026.csv`

The constituency GeoJSON file in `data/` is not used by this version.

## Static fixture checks

Confirm the supplied reference is readable and has the expected shape:

```bash
head -1 data/communes-france-2026.csv | tr ',' '\n' | grep -nE '^(code_insee|nom_standard|nom_sans_pronom|code_postal|codes_postaux|dep_code|dep_nom)$'
wc -l < data/communes-france-2026.csv
```

Expected: all required columns present and 34,869 lines including the header.

## Schema and migration checks

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
```

Operator commands:

```bash
pnpm geo:refresh                                            # parse, validate, stage, activate (date = today)
GEOGRAPHIC_PUBLICATION_DATE=2026-01-01 pnpm geo:refresh      # explicit publication date
EVENT_TYPES="tractage,boitage,diffusion-tracts" pnpm geo:event-types
pnpm dev:worker                                              # watch mode
pnpm start:worker                                            # built output
```

Expected: the new `geographic_reference_version`, `department_reference` and
`commune_reference` tables exist, `event_record` exposes the geographic columns, and the
partial unique index `geographic_reference_version_one_active` is present:

```bash
psql "$DATABASE_URL" -c "\d geographic_reference_version" -c "\d commune_reference"
```

## Unit and contract validation

Run the pure rules first — no database required:

```bash
pnpm --filter @actionpop/core typecheck
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/core lint
```

The tests must cover quoted CSV fields, duplicate identifiers, department extraction, exact
normalized name matching (case, accents, articles, hyphens), pronoun-free aliases, homonyms
disambiguated by department code, ambiguity diagnostics, postal plus city fallback and its
non-uniqueness, unknown department codes, department/commune discrepancy diagnostics,
country classification, and diagnostic preservation.

## Repository and worker validation

Run against a disposable PostgreSQL database:

```bash
pnpm prisma:migrate
pnpm --filter @actionpop/worker typecheck
pnpm --filter @actionpop/worker test
pnpm --filter @actionpop/worker lint
```

Repository tests must verify staged inserts are invisible to readers, activation inside one
transaction, the unique-violation behaviour on concurrent activation, previous-version
retention, and enriched publication committed together with the snapshot.

## API reference checks

The service serves its own OpenAPI document and an interactive Scalar page, so the filter
contract is explored rather than retyped:

```bash
pnpm --filter @actionpop/api build && pnpm --filter @actionpop/api start
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/openapi.json   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/reference      # expect 200
```

Expected (verified 2026-10-28):

- `/reference` renders the document with the title `ActionPop Calendar API`.
- `/openapi.json` lists `GET /events` with `country` (`FR`), `department` (`01`), `commune`
  (`01001`) and `event_type` (`tractage`) typed as `string`, and states the `AND` semantics.
- `GET /events?country=FR` returns resolved events; `GET /events?region=84` returns `400`
  with `filter_parameter_unsupported` and `GET /events?country=France` returns `400` with
  `filter_value_invalid`.
- Set `API_REFERENCE=false` to stop serving `/reference` when a deployment must not expose it.

## End-to-end checks

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm lint
pnpm quality
```

Expected outcomes:

- `location.commune.name = "Lyon"` with `location.departement = "69"` and `location.country = "FR"` resolves the commune `69123`, department `69`, and country `FR`.
- A commune name shared by several communes resolves only through a valid stated department code; without one it stays unresolved with an ambiguity diagnostic.
- Without a commune name, an exact `location.city` match resolves the commune, even when the postal code is an arrondissement value absent from the reference (`75005 Paris`, `69003 Lyon`, `13008 Marseille`).
- An unknown department code with a resolved commune links the commune's reference department and emits `department_code_unknown`.
- A stated department that disagrees with the resolved commune emits `department_commune_mismatch` and keeps both raw values.
- A stated country outside France produces an international classification and no French commune or department.
- An event with no country, department, or commune is published in `national events`.
- A department code such as `"01"` stays `"01"` from CSV parsing through publication and query output, and an empty `location.departement` produces no department link and no error diagnostic.
- `Paris 1er` stays unresolved with `commune_unknown` until municipal arrondissements are modelled, while `Paris` resolves to `75056`.
- A well-formed event-type label published by the source is accepted and registered on first sight, so `meeting-presidentielle-2027` or `porte-a-porte` never break ingestion; only a malformed label fails the job as a non-retryable `event_type_invalid` naming `subtype.label`.
- With no active reference version, an event is still published with its stated `country_code` and `geographic_status = unavailable`, and `pnpm geo:refresh` restores full enrichment.
- Raw values (`raw_department_code`, `raw_commune_name`) match the payload exactly while derived keys are used only for lookup.
- A failed refresh leaves the previous active reference and event snapshot readable.
- A successful refresh changes `reference_version` and geographic links without changing `source_event_id`, raw location, dates, or event type.
- Combined queries return only the intersection and never duplicate an event.
