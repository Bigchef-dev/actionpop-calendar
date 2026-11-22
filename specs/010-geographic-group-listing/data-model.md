# Phase 1 — Data Model: Geographic Action Group Listing

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Date**: 2026-11-18

This feature adds a read model and one enrichment result. Existing event, attribution and
snapshot tables are untouched, and every change is additive and nullable, so a deployment that
never enriches a group keeps working with an empty attachment.

## 1. Model overview

```text
group detail resource (upstream, see specs/001-technical-foundation/contracts/action-populaire-groups.md#group-detail)
  └── location { country, departement, city, zip, commune.name, coordinates }
          │  enrichEventGeography — the SAME enricher and reference as events
          ▼
geographic_reference_version (existing)
  ├── department_reference (existing)
  ├── commune_reference (existing)
  └── epci_reference / epci_membership (existing)
          │
          ▼
ingestion_scope (existing) ── 0..1 ──> location_record (existing) ── 0..1 ──> geo_point (existing)
  │  NEW: country_code, department_code, commune_id, commune_name, department_name,
  │       reference_version, geographic_status, geographic_diagnostics, enriched_at
  ▼
GET /groups  (read model, no new table)
```

No new table and no new dataset: the group address goes through the same reference the event
address already uses.

## 2. `ingestion_scope` — group administrative attachment (NEW columns)

| Column                   | Type        | Nullable | Rule                                                                                        |
| ------------------------ | ----------- | -------- | ------------------------------------------------------------------------------------------- |
| `country_code`           | `String?`   | yes      | ISO 3166-1 alpha-2 code stated by the address, upper-case; never deduced                    |
| `department_code`        | `String?`   | yes      | Department of the resolved commune, or the validated stated code; string, zeroes kept       |
| `commune_id`             | `String?`   | yes      | INSEE code of the commune the stated address resolves to; string                            |
| `commune_name`           | `String?`   | yes      | Display name of that commune in the reference version used                                  |
| `department_name`        | `String?`   | yes      | Display name of that department in the reference version used                               |
| `reference_version`      | `String?`   | yes      | Version the attachment was computed against; **must** equal the active version to be listed |
| `geographic_status`      | `String?`   | yes      | `resolved` · `incomplete` · `international` · `invalid`                                     |
| `geographic_diagnostics` | `Json?`     | yes      | `Array<{ code, field, message, severity }>`, the enricher's diagnostics unchanged           |
| `enriched_at`            | `DateTime?` | yes      | Last attempt, successful or not; drives the incremental and staleness rules                 |

Indexes added:

```prisma
@@index([scopeKind, mapStatus, retrievalStatus, communeId])
@@index([scopeKind, mapStatus, retrievalStatus, departmentCode])
@@index([scopeKind, mapStatus, retrievalStatus, countryCode])
```

The existing `@@index([scopeKind, retrievalStatus])` and `@@index([mapStatus])` stay.

**Attachment states** (`geographic_status`), mapped one-to-one from the enricher's
`geographicStatus`:

| Value           | Enricher status          | Meaning                                             | Listed?                           |
| --------------- | ------------------------ | --------------------------------------------------- | --------------------------------- |
| `resolved`      | `resolved`               | Commune and department both resolved                | matches commune and department    |
| `incomplete`    | `incomplete`, `national` | Commune or department missing                       | matches only what was resolved    |
| `international` | `international`          | Stated country outside France                       | matches `country` only            |
| `invalid`       | `invalid`                | Address unusable                                    | matches `country` only, if stated |
| `NULL`          | `unavailable`            | No active reference at read time, or never enriched | not listed until the next cycle   |

`country_code` is kept whenever the address states one, in every state.

## 3. Group location (existing tables, new rows)

`location_record` / `geo_point` gain one row per enriched group:

| Field                | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| `location_id`        | `group:<scopeId>`                                         |
| `owner_type`         | `GROUP` (the value the shared model already documents)    |
| `zip`, `city`        | as stated by the detail document, when stated             |
| `geo_point`          | the detail's coordinates in `[longitude, latitude]` order |
| other address fields | `NULL`: the source states no street for a group           |

`ingestion_scope.location_id` points at it. A group whose detail states no coordinates has no
`geo_point`; a stale point is removed rather than kept.

## 4. Derived read model (not persisted)

```ts
interface GroupAreaCriteria {
  country?: string; // 'FR'
  department?: string; // '69'
  communeIds?: readonly string[]; // insee_commune ∪ commune ∪ resolved commune_name ∪ epci members
  referenceVersion: string; // active version
}

interface GroupListingItem {
  id: string; // scope_id
  name: string; // display_name
  countryCode: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  communeId: string | null;
  communeName: string | null;
  latitude: number | null; // from geo_point
  longitude: number | null;
  calendar: { path: '/calendar.ics'; params: { group: string } };
}
```

Predicate set, all `AND`:

```text
scope_kind = 'group'
map_status = 'listed'
retrieval_status = 'active'
display_name IS NOT NULL
reference_version = <active version>
country_code = <country>              -- when supplied
department_code = <department>        -- when supplied
commune_id IN (<commune ids>)         -- when the commune dimension is non-empty
```

Order: `display_name` ascending under the database collation, then `scope_id` ascending. `total`
runs the same `where` through `count`. `limit ∈ [1,200]` (default 50), `offset ≥ 0`.

A `commune_name` resolving to zero communes yields an empty commune dimension and therefore
`items: []`, matching the calendar rule. An `epci` with no usable membership is a `503`. An
`insee_commune`, `commune` or `department` identifier absent from the active version is a `400`.

## 5. Lifecycle and enrichment triggers

| Trigger                                 | Work                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Catalogue synchronization (every cycle) | Registry only: identity, name, listing status, stated country                                            |
| Enrichment step (every cycle)           | Listed active groups with no attachment, another `reference_version`, or `enriched_at` older than 7 days |
| Reference activation (operator)         | Nothing at activation; the next cycle re-enriches the stale groups                                       |
| Detail read failure                     | Previous attachment kept, `failed` counted, retried next cycle                                           |
| Group leaves the listing                | Excluded by the eligibility predicates, attachment untouched                                             |

## 6. Migration

One migration, `0009_geographic_group_listing`:

1. `ALTER TABLE ingestion_scope ADD COLUMN` for the nine attachment columns (all nullable).
2. `CREATE INDEX` for the three listing predicates.
3. No data backfill: existing groups remain unattached until the next enrichment run, which is
   the honest default and is counted.

Rollback: drop the indexes and columns; no existing column is altered, so a rollback cannot
corrupt event data.

## 7. Observability counters

| Counter                               | Labels                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `actionpop_group_attachment_total`    | `outcome=resolved\|incomplete\|international\|invalid\|skipped\|failed` |
| `actionpop_groups_unattached` (gauge) | none; listed active groups whose status is not `resolved`               |
