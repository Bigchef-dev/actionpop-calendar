# Data Model: Geographic Enrichment

All persistence is PostgreSQL through Prisma, alongside the existing snapshot, ledger and
catalogue models in `prisma/schema.prisma`.

## Stage Outputs

Each stage of the enrichment flow produces one named representation; these types are the
only way data crosses a boundary.

| Stage                | Type                                                                    | Key rule                                                                   |
| -------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Source retrieval     | `ActionPopulaireEventPayload` (existing adapter type, extended)         | Raw strings preserved exactly as received                                  |
| Payload validation   | `RawLocationFields`                                                     | `country`, `departement`, `communeName`, `city`, `zip`; empty means unset  |
| Geographic reference | `CommuneReference`, `DepartmentReference`, `GeographicReferenceVersion` | Codes are strings; one immutable version per release                       |
| Normalization        | `NormalizedKey`                                                         | Derived key only; never stored in place of a raw value                     |
| Enrichment           | `GeographicAttachment`                                                  | One country, at most one department, at most one commune, plus diagnostics |
| Publication          | `EnrichedEvent` (Prisma `EventRecord` row)                              | Geographic columns written in the same transaction as the snapshot         |
| Filtering            | `GeographicFilter`                                                      | String identifiers; every supplied criterion must match                    |
| Diagnostics          | `Diagnostic`                                                            | `{ code, field, message, severity }`, persisted as JSON on the event row   |

## GeographicReferenceVersion

Version metadata for one validated local reference release. New Prisma model mapped to
`geographic_reference_version`.

| Field              | Type                                               | Rule                                                                       |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `version`          | string, primary key                                | Immutable identifier derived from source version/date and content checksum |
| `status`           | `staged` \| `active` \| `superseded` \| `rejected` | Exactly one row may be `active`; enforced by a partial unique index        |
| `source`           | string                                             | Local dataset/source identifier                                            |
| `publicationDate`  | string                                             | Source publication date, kept as a date string for provenance              |
| `ingestedAt`       | DateTime                                           | Local ingestion timestamp                                                  |
| `license`          | string                                             | Required provenance/license metadata                                       |
| `communeCount`     | int                                                | Number of accepted commune rows                                            |
| `departmentCount`  | int                                                | Number of accepted department rows                                         |
| `checksum`         | string                                             | Content checksum for reproducibility                                       |
| `validationErrors` | JSON, nullable                                     | Diagnostics; must be empty for an activatable version                      |

Migration SQL requirement (not expressible in Prisma's schema language):

```sql
CREATE UNIQUE INDEX geographic_reference_version_one_active
  ON geographic_reference_version (status)
  WHERE status = 'active';
```

## DepartmentReference

French department derived from the commune CSV. New Prisma model mapped to
`department_reference`.

| Field          | Type   | Rule                                                                 |
| -------------- | ------ | -------------------------------------------------------------------- |
| `versionId`    | string | Part of the composite key; references `geographic_reference_version` |
| `code`         | string | Part of the composite key; `"69"`, `"2A"`, `"2B"`; never numeric     |
| `name`         | string | Department display name from `dep_nom`                               |
| `communeCount` | int    | Coverage indicator used during validation                            |

Composite primary key: `(versionId, code)`. Index: `(versionId)` for coverage queries.
On delete cascade from the version row.

## CommuneReference

A French commune and its department relationship. New Prisma model mapped to
`commune_reference`.

| Field                       | Type     | Rule                                                                 |
| --------------------------- | -------- | -------------------------------------------------------------------- |
| `versionId`                 | string   | Part of the composite key; references `geographic_reference_version` |
| `inseeCode`                 | string   | Part of the composite key; leading zeroes preserved                  |
| `name`                      | string   | Canonical display name (`nom_standard`), stored verbatim             |
| `normalizedName`            | string   | NFC, case-folded, accent- and punctuation-insensitive lookup key     |
| `pronounFreeNormalizedName` | string   | Normalized `nom_sans_pronom` alias used for exact matching           |
| `postalCodes`               | string[] | Expanded from `code_postal` and `codes_postaux`; strings             |
| `departmentCode`            | string   | Required; matches a `department_reference` row of the same version   |

Composite primary key: `(versionId, inseeCode)`.

Lookup indexes:

- `(versionId, normalizedName)`
- `(versionId, pronounFreeNormalizedName)`
- `(versionId, departmentCode)`
- `(versionId)` plus a GIN index on `postalCodes` for the postal fallback candidate set
  (`@@index([postalCodes], type: Gin)`; the active version filter stays on the same table,
  so no `btree_gin` extension is required)

Homonyms are expected: a normalized name may match several rows and stays distinguishable
by `inseeCode` and `departmentCode`. The postal fallback requires exactly one candidate
after exact city comparison.

Uniqueness: one `inseeCode` per version, guaranteed by the composite primary key.

## LocationRecord (unchanged)

The existing `LocationRecord` model and its optional `GeoPoint` relation are not dropped,
altered or migrated by this feature. Coordinates stay available as raw source data and are
never read by enrichment or filtering; only the raw textual fields `country`, `departement`,
`zip`, `city` and the commune name feed the rules.

## EventRecord (extended)

The existing published aggregate in `event_record` gains the geographic attachment. No
foreign key points to the reference tables, so old versions can be retained or pruned
without blocking event reads.

| New field               | Type                            | Rule                                                                            |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| `referenceVersion`      | string?, `reference_version`    | Version used for the last enrichment                                            |
| `geographicStatus`      | string?, `geographic_status`    | `resolved`, `national`, `international`, `incomplete`, `invalid`, `unavailable` |
| `countryCode`           | string?, `country_code`         | Stated ISO 3166-1 alpha-2 code, uppercased; never deduced                       |
| `departmentCode`        | string?, `department_code`      | Department linked to the event                                                  |
| `departmentSource`      | string?, `department_source`    | `stated` or `reference`                                                         |
| `rawDepartmentCode`     | string?, `raw_department_code`  | Department code exactly as stated by the source                                 |
| `rawCommuneName`        | string?, `raw_commune_name`     | `location.commune.name` exactly as stated by the source                         |
| `communeId`             | string?, `commune_id`           | INSEE code of the uniquely resolved commune                                     |
| `geographicDiagnostics` | JSON?, `geographic_diagnostics` | Array of `Diagnostic`                                                           |

Indexes supporting filtering: `(country_code)`, `(department_code)`, `(commune_id)`, and
`(reference_version)` for re-enrichment selection.

Stable identity: `sourceEventId`, dates, raw location and event type survive reference
updates; geographic columns and `referenceVersion` may change.

## Diagnostic

`{ code: string; field: string; message: string; severity: 'warning' | 'error' }`.

Examples: `country_missing`, `country_unsupported`, `commune_name_missing`,
`commune_unknown`, `commune_match_ambiguous`, `postal_city_missing`,
`postal_match_ambiguous`, `department_code_unknown`, `department_commune_mismatch`,
`reference_unavailable`, and `event_type_unknown`.

## Lifecycle

1. `staged`: CSV parsed and validated; version, department and commune rows inserted in one
   transaction, invisible to readers selecting the active version.
2. `active`: inside one transaction, the previous row becomes `superseded` and the validated
   row becomes `active`; the partial unique index guarantees a single active version.
3. `re-enriching`: a BullMQ job selects events by `reference_version` and recomputes them.
4. `published`: geographic columns and the snapshot are committed together, so readers see
   either the previous or the new complete event.
5. `superseded`: versions remain queryable for replay until explicit retention cleanup.
