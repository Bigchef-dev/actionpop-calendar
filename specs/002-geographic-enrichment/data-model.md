# Data Model: Geographic Enrichment

## GeographicReferenceManifest

Version metadata for one validated local reference release.

| Field | Type | Rule |
|---|---|---|
| `version` | string | Immutable identifier, derived from source version/date and content hash |
| `status` | `staged` or `active` | Only a fully validated version may become active |
| `source` | string | Local dataset/source identifier |
| `publicationDate` | string | Source publication date |
| `ingestedAt` | string | ISO timestamp for local ingestion |
| `license` | string | Required provenance/license metadata |
| `communeCount` | number | Number of accepted commune records |
| `constituencyCount` | number | Number of accepted constituency records |
| `checksum` | string | Content checksum for reproducibility |
| `validationErrors` | Diagnostic[] | Empty for activatable versions |

Redis keys: `actionpop:geo:reference:{version}:manifest`, `:communes`, `:constituencies`, and `actionpop:geo:reference:active`.

## CommuneReference

A French commune and its administrative parent references.

| Field | Type | Rule |
|---|---|---|
| `inseeCode` | string | Stable identifier; leading zeroes preserved |
| `name` | string | Canonical display name |
| `postalCodes` | string[] | Expanded from `code_postal` and `codes_postaux` |
| `departmentCode` / `departmentName` | string | Required parent |
| `regionCode` / `regionName` | string | Required parent |
| `epciCode` / `epciName` | string | Optional relationship |
| `normalizedName` | string | NFC/case-folded lookup key |

Uniqueness: one `inseeCode` per active version. Postal index key is `postalCode + normalizedName`; one unique result is required for automatic resolution.

## ConstituencyReference

A legislative constituency derived from the supplied GeoJSON.

| Field | Type | Rule |
|---|---|---|
| `id` | string | `codeCirconscription`, unique within the active version |
| `departmentCode` | string | Required GeoJSON property |
| `name` | string | Required GeoJSON property |
| `geometry` | normalized polygon set | Polygon or MultiPolygon, finite coordinates, closed rings |
| `bounds` | bounding box | Used to reject impossible point checks early |

Boundary semantics: a point on an edge or vertex is inside; a point matching multiple polygons produces multiple links. Holes exclude points unless the point is also on the hole boundary according to the same boundary rule.

## LocationRecord and GeoPoint

Reuse the existing typed location model. `zip`, `city`, and all administrative codes remain strings. Missing coordinates are valid; invalid coordinates are rejected at the adapter boundary.

## EnrichedEvent

The published event aggregate retains the existing `EventRecord` identity and adds geographic state.

| Field | Type | Rule |
|---|---|---|
| `referenceVersion` | string | Version used for enrichment |
| `geographicStatus` | `resolved`, `national`, `international`, `incomplete`, `invalid`, `unavailable` | Explains enrichment outcome |
| `diagnostics` | Diagnostic[] | Field/cause/actionable state; no secrets |
| `countryCode` | string? | Required for stated international events |
| `communeId` | string? | `inseeCode` when uniquely resolved |
| `eventConstituencyLinks` | link[] | Zero or more stable constituency IDs |
| `administrativeLinks` | link[] | Department, region, EPCI relationships as applicable |

Stable identity: `sourceEventId`, dates, raw location, and event type survive reference updates. Geographic links and `referenceVersion` may change.

## Diagnostic

`{ code: string; field: string; message: string; severity: 'warning' | 'error' }`.

Examples: `postal_city_missing`, `postal_match_ambiguous`, `postal_gps_conflict`, `constituency_unresolved`, `constituency_boundary_multiple`, `reference_unavailable`, and `invalid_coordinates`.

## Lifecycle

1. `staged`: source files parsed and validated into immutable reference records.
2. `active`: manifest pointer switched atomically; readers use this version.
3. `re-enriching`: events are queued against the new version.
4. `published`: enriched event snapshot and links are atomically visible.
5. Previous reference versions remain readable for replay until explicit retention cleanup.
