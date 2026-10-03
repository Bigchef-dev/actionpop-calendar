# Quickstart: Geographic Enrichment

## Prerequisites

- Node.js >=20 and pnpm 12.8.1
- Workspace dependencies installed with `pnpm install --frozen-lockfile`
- Optional Redis integration environment using the repository Docker compose files
- Local fixtures present:
  - `data/communes-france-2026.csv`
  - `data/circonscriptions-legislatives-p20.geojson`

## Static fixture checks

Confirm the supplied references are readable and have the expected shape:

```bash
node --input-type=module -e "import fs from 'node:fs'; const g=JSON.parse(fs.readFileSync('data/circonscriptions-legislatives-p20.geojson','utf8')); if (g.type !== 'FeatureCollection' || g.features.length !== 559) process.exit(1); console.log(g.features.length)"
wc -l data/communes-france-2026.csv
```

Expected: a GeoJSON `FeatureCollection` with 559 features and a CSV with 34,868 lines including its header.

## Unit and contract validation

Run the pure rules first:

```bash
pnpm --filter @actionpop/core typecheck
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/core lint
```

The tests must cover quoted CSV fields, duplicate identifiers, exact postal + city lookup, postal-only unresolved state, postal/GPS conflict, Polygon and MultiPolygon geometry, holes, edge/vertex boundaries, multiple boundary matches, invalid GeoJSON, and diagnostic preservation.

## Worker refresh and publication validation

```bash
pnpm --filter @actionpop/worker typecheck
pnpm --filter @actionpop/worker test
pnpm --filter @actionpop/worker lint
```

Use a fake Redis store for unit tests to verify staging isolation and failed activation. Use the existing Redis integration setup for atomic pointer replacement, previous-version retention, replay, and re-enrichment publication.

## End-to-end checks

```bash
pnpm typecheck
pnpm test
pnpm test:integration
pnpm lint
pnpm quality
```

Expected outcomes:

- An exact postal-code + city match resolves a commune; postal-only and ambiguous matches remain unresolved.
- Postal data wins over conflicting GPS and emits a diagnostic.
- A point inside a constituency resolves it; a point on a shared boundary retains every matching constituency link.
- A multi-constituency commune without a precise point has no constituency link and exposes `constituency_unresolved`.
- A failed refresh leaves the previous active reference and event snapshot readable.
- A successful refresh changes `referenceVersion` and geographic links without changing `sourceEventId`, raw location, dates, or event type.
- Combined queries return only the intersection and never duplicate an event.
