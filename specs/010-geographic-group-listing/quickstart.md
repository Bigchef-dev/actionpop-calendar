# Quickstart: Geographic Action Group Listing

**Spec**: [spec.md](spec.md) · **Contract**: [contracts/group-listing.md](contracts/group-listing.md) ·
**Data model**: [data-model.md](data-model.md)

This guide proves the feature end-to-end: the catalogue is synchronized, each listed group's
stated address is enriched with the same rules as an event, and `GET /groups` answers a territory
query.

## Prerequisites

- Node.js ≥ 26 and pnpm 12.8.1, dependencies installed with `pnpm install --frozen-lockfile`
- PostgreSQL reachable through `DATABASE_URL` (`pnpm dev:infra` starts Redis and Postgres)
- Redis only if you run the real worker cycle; the API read needs PostgreSQL alone
- `TEST_DATABASE_URL` for the PostgreSQL integration tests
- The existing commune reference file `data/communes-france-2026.csv`
- Network access to the upstream group detail resource (`GET /api/groupes/{id}/`), which states
  the address a group is attached from. Without it, groups stay unattached, are counted as
  `failed`, and are retried on the next cycle.

## 1. Schema

```bash
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:migrate
```

Expected: migration `0009_geographic_group_listing` applied.

```bash
psql "$DATABASE_URL" -c "\d ingestion_scope"
```

Expected: `ingestion_scope` shows `country_code`, `department_code`, `commune_id`,
`commune_name`, `department_name`, `reference_version`, `geographic_status`,
`geographic_diagnostics` and `enriched_at`, all nullable, plus the three group listing indexes.
No new table is expected: the reference tables are reused unchanged.

## 2. Geographic reference

The refresh contract is unchanged — this feature adds nothing to it. Make sure an active version
exists, because an address is only resolved against an active reference:

```bash
pnpm geo:refresh
```

Expected: a `geographic_reference_version` row is `active`. When no version is active, the
listing answers `503` and the enrichment step counts `skipped`, never attaching a guess.

## 3. Attach groups during catalogue synchronization

Run the worker (real upstream) or apply a fixture through the same repository:

```bash
pnpm dev:worker     # or: pnpm start:worker
```

Expected in the worker logs, per cycle:

- `group-attachment` summary with `resolved`, `incomplete`, `international`, `invalid`,
  `skipped`, `failed`;
- directory failures are unchanged: an unavailable catalogue changes nothing;
- an unreachable detail resource counts `failed` and keeps the previous attachment.

Verify one group:

```bash
psql "$DATABASE_URL" -c "
  SELECT s.scope_id, s.display_name, s.country_code, s.department_code, s.commune_id,
         s.commune_name, s.reference_version, s.geographic_status,
         l.zip, l.city, g.longitude, g.latitude
  FROM ingestion_scope s
  LEFT JOIN location_record l ON l.location_id = s.location_id
  LEFT JOIN geo_point g ON g.location_id = l.location_id
  WHERE s.scope_kind = 'group' AND s.map_status = 'listed' AND s.retrieval_status = 'active'
  LIMIT 10;"
```

Expected: `commune_id` and `department_code` filled when the stated address resolves;
`geographic_status = international` for a non-French country; `incomplete` with the enricher's
diagnostics when no commune can be established; never a fabricated commune. `zip` and `city`
mirror the address the detail document states.

## 4. Serve the API

```bash
pnpm dev:api
```

Then:

```bash
# Groups of a department
curl -sS "http://127.0.0.1:3000/groups?department=42&limit=3" | jq .

# Groups of a commune by INSEE code
curl -sS "http://127.0.0.1:3000/groups?insee_commune=42218" | jq '.total, .items[0] | {id, name, communeId, calendar}'

# Groups of a commune by name, narrowed by department
curl -sS "http://127.0.0.1:3000/groups?commune_name=Saint-%C3%89tienne&department=42" | jq .

# Groups of an intercommunal territory
curl -sS "http://127.0.0.1:3000/groups?epci=200054781" | jq '.total'

# Paging
curl -sS "http://127.0.0.1:3000/groups?department=69&limit=2&offset=2" | jq '{total, limit, offset, ids: [.items[].id]}'
```

Expected: every item carries a non-empty `id` and `name`, the location context that placed it
in the area, and a `calendar` object usable verbatim; `referenceVersion` matches the active
version; two identical requests return the same order.

## 5. Failure paths

```bash
# Unsupported criterion
curl -sS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3000/groups?lat=45.4"     # 400, filter_parameter_unsupported

# Malformed paging
curl -sS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3000/groups?limit=0"       # 400, limit_invalid
curl -sS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3000/groups?offset=-1"     # 400, offset_invalid

# Unknown commune
curl -sS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3000/groups?insee_commune=99999" # 400, commune_invalid

# Ambiguous name without department
curl -sS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:3000/groups?commune_name=Sainte-Colombe" # 400, commune_name_ambiguous
```

Empty but valid area:

```bash
curl -sS "http://127.0.0.1:3000/groups?insee_commune=69123&country=BE" | jq '{total, items}'
```

Expected: `200`, `total: 0`, `items: []` — never a neighbouring commune.

Unavailability: stop PostgreSQL, repeat a request → `503`. Deactivate every reference version

```bash
psql "$DATABASE_URL" -c "UPDATE geographic_reference_version SET status = 'superseded' WHERE status = 'active';"
```

→ `503`, never a stale or partial list.

## 6. Automated validation

```bash
# Pure rules: area parsing and resolution, attachment mapping
pnpm --filter @actionpop/core test

# Catalogue/attachment write path and reference refresh
pnpm --filter @actionpop/worker test

# HTTP contract: status codes, paging, ordering, payload
pnpm --filter @actionpop/api test

# SQL read and enrichment persistence against a disposable schema
pnpm test:integration

# Quality gates
pnpm typecheck
pnpm lint
pnpm check:dead
pnpm check:cycles
```

Expected: all green. The integration suite proves that only `listed`/`active` groups with a
current `reference_version` are returned, that paging neither duplicates nor omits a group, and
that an address without a resolvable commune is excluded from commune criteria rather than
approximated.
