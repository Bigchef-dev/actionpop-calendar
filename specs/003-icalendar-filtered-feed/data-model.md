# Data Model: Filtered iCalendar Feed

Persistence is unchanged: this feature reads existing tables and adds no migration. The models below are the in-memory contracts of the read path and the configuration surface.

## CalendarCriteria

The user's selection after parsing, before resolution.

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `country` | `string` | no | Two uppercase letters, from `normalizeCountryCode` |
| `department` | `string` | no | Non-empty code, case-folded to uppercase, leading zeroes preserved |
| `communeNames` | `string[]` | no | One or more normalized names; empty items rejected |
| `inseeCommunes` | `string[]` | no | One or more INSEE codes, leading zeroes preserved; duplicates collapsed |
| `eventTypes` | `string[]` | no | One or more event-type labels; duplicates collapsed |

**Validation rules**

- Every criterion is optional; an absent criterion imposes no restriction (FR-002).
- A comma-separated parameter is split, each item trimmed, and an empty item is rejected with `filter_value_invalid` naming the parameter (FR-004, FR-014).
- Unknown parameters are rejected with `filter_parameter_unknown`; `region`, `epci`, `constituency`, `lat`, `lon`, `coordinates` are rejected with `filter_parameter_unsupported` (FR-014).
- Values inside one criterion combine with OR; distinct criteria combine with AND (FR-003).
- `communeNames` and `inseeCommunes` form one dimension: their union defines the acceptable communes, and an event satisfies the dimension when it matches any of them (FR-022).

## CommuneResolution

Outcome of turning `communeNames` into codes.

| Field | Type | Meaning |
|-------|------|---------|
| `inseeCodes` | `string[]` | Union of resolved names and explicitly supplied codes |
| `diagnostics` | `Diagnostic[]` | Ambiguity or unknown-name diagnostics |

**Rules**

- A name that matches exactly one reference commune resolves without further input (FR-005).
- A name that matches several communes is disambiguated by `department` when supplied; without it the request is rejected with `commune_name_ambiguous`, and the message names the candidate INSEE codes (FR-006).
- A name matching no commune produces an empty code set for that name and a `commune_name_unknown` diagnostic; the request still succeeds and returns an empty calendar when nothing else matches.

## CalendarWindow

| Field | Type | Meaning |
|-------|------|---------|
| `startUtc` | instant | Lookback boundary, `requestInstant - lookbackDays` |
| `endUtc` | instant | Lookahead boundary, `requestInstant + lookaheadDays` |

**Rules**

- Boundaries are computed from the request instant interpreted in `Europe/Paris`, then compared as instants (FR-011, FR-023).
- An event is included when `endTime >= startUtc && startTime <= endUtc`, so an event overlapping either boundary stays visible.

## CalendarEvent

Projection returned by the read model, one row per event.

| Field | Source column | Notes |
|-------|---------------|-------|
| `sourceEventId` | `event_record.source_event_id` | Stable identity; becomes the `UID` and `X-ACTIONPOP-EVENT-ID` |
| `summary` | `event_record.summary` | Required by the schema; becomes `SUMMARY` |
| `description` | `event_record.description` | Optional; becomes `DESCRIPTION` |
| `startTime` / `endTime` | `event_record.start_time` / `end_time` | Serialized as UTC instants |
| `sequence` | `event_record.sequence` | Becomes `SEQUENCE` |
| `updatedAt` | `event_record.updated_at` | Becomes `X-ACTIONPOP-UPDATED-AT` |
| `lastSeenPeriod` | `event_record.last_seen_period` | Becomes `X-ACTIONPOP-PERIOD`; absent when null |
| `eventType` | `event_record.event_type` | Becomes `CATEGORIES` and `X-ACTIONPOP-EVENT-TYPE` |
| `sourceUrl` | `event_record.source_url` | Becomes `URL` and `X-ACTIONPOP-SOURCE-URL` |
| `geography` | `geographic_status`, `country_code`, `department_code`, `commune_id`, `reference_version`, `geographic_diagnostics`, `raw_department_code`, `raw_commune_name` | Feeds the `full` level only |
| `location` | `location_record.name`, `address1`, `address2`, `zip`, `city`, `full_address`, `short_address` | Feeds `LOCATION` as one line: the place name, then `address1` and `address2` with the postal code and city when the street line does not already state them; the short address, the flattened full address and the place name alone are fallbacks |
| `coordinates` | `geo_point.latitude` / `longitude` | Feeds `GEO`, formatted as `latitude;longitude` with six decimals |

**Persistence**: the ingestion path writes the event address to `location_record` under the stable key `event:<sourceEventId>`, with `owner_type = EVENT`, `full_address` holding the source `location.address`, `short_address` holding `location.shortAddress` or `location.shortLocation`, and the source coordinates in `geo_point`. Re-ingesting the same event updates that row; an event whose source stops stating an address has its row removed rather than orphaned. The calendar-visible address participates in the event content hash, so an address change increments `SEQUENCE` and updates subscribers in place.
| `groupIds` | `event_group_link.scope_id` | Feeds `X-ACTIONPOP-GROUP`, truncated to the configured ceiling |

**Invariants**

- One row per `source_event_id`, even when several group links match, so the calendar carries no duplicate (FR-008).
- Every identifier stays a string, including leading zeroes and `2A`/`2B` (FR-007).
- An absent column omits the corresponding property rather than emitting an empty value (FR-035).

## MetadataProperty

| Field | Type | Meaning |
|-------|------|---------|
| `name` | `string` | Full property name, including the `X-ACTIONPOP-` prefix, uppercase |
| `level` | `'identity' \| 'standard' \| 'full'` | Minimum level required for emission |
| `parameters` | `Record<string, string>` | Optional RFC 5545 parameters, used by diagnostics |
| `value` | `string` | Escaped text value |

**Emission rules**

- `off` emits no experimental property. `identity` emits the identity family. `standard` adds classification and provenance. `full` adds geography, diagnostics and raw source values (FR-032).
- A family disabled in configuration emits nothing regardless of the level (FR-033).
- Repeated families emit one property per value, in deterministic order (FR-034).

## CalendarSettings

| Key | Type | Default | Validation |
|-----|------|---------|------------|
| `enabled` | boolean | `true` | — |
| `lookbackDays` | integer | `30` | `>= 0` |
| `lookaheadDays` | integer | `90` | `>= 1` |
| `maxEntries` | integer | `1000` | `>= 1` |
| `maxGroupsPerEvent` | integer | `5` | `>= 1` |
| `revalidationSeconds` | integer | `900` | `>= 0` |
| `metadataLevel` | enum | `standard` | One of `off`, `identity`, `standard`, `full` |
| `disabledFamilies` | string[] | `[]` | Known family names only |

**State transitions**: none. Settings are read once at startup; changing a value requires a restart (FR-026).

## Configuration document

```text
app        → environment, logLevel, timezone, port
calendar   → CalendarSettings
queue      → attempts, backoffMs, dispatcherIntervalMs
upstream   → baseUrl
```

Credentials (`DATABASE_URL`, `REDIS_URL`, `UPSTREAM_TOKEN`) are never read from the file; they stay environment-only and keep their current validation.
