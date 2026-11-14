# Contract: Filtered iCalendar Feed

**Owner:** [003 — Filtered iCalendar Feed](../../003-icalendar-filtered-feed/spec.md)
**Amendments:** [`group` criterion](../../007-public-calendar-experience/contracts/calendar-ics-group-filter.md) (007), [EPCI criterion](../../008-intercommunal-calendar/contracts/calendar-ics.md) (008)
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`apps/api/src/controllers/calendar-ics.controller.ts`](../../../apps/api/src/controllers/calendar-ics.controller.ts)

## Purpose

Return, as one RFC 5545 calendar document, every published event that satisfies all supplied
criteria and whose period overlaps the calendar window, each event exactly once.

## Request

```http
GET /calendar.ics?department=69&insee_commune=69123,69124&event_type=tractage&group=npa-lyon
```

| Parameter        | Required | Repeatable      | Meaning                                                                          | Example            |
| ---------------- | -------- | --------------- | -------------------------------------------------------------------------------- | ------------------ |
| `country`        | no       | no              | Stated or deduced ISO 3166-1 alpha-2 code                                        | `FR`               |
| `department`     | no       | no              | Department code, leading zeroes and `2A`/`2B` preserved                          | `69`               |
| `commune_name`   | no       | comma-separated | Commune name, matched exactly after normalization, or its pronoun-free alias     | `Lyon,Villeurbanne` |
| `insee_commune`  | no       | comma-separated | INSEE code of a commune                                                          | `69123,69124`      |
| `event_type`     | no       | comma-separated | Event-type label published by the source                                         | `tractage,boitage` |
| `group`          | no       | comma-separated | Identifier of an action group that contributed to the event (amendment 007)      | `npa-lyon`         |
| `epci`           | no       | comma-separated | EPCI identifier, resolved to its active commune membership (amendment 008)       | `200054781`        |

`region`, `constituency`, `lat`, `lon` and `coordinates` are not part of this contract and are
rejected with `filter_parameter_unknown`/`filter_parameter_unsupported`.

## Semantics

- Values inside one parameter combine with OR; distinct parameters combine with AND, so every
  supplied criterion must be satisfied.
- `commune_name` and `insee_commune` form one commune dimension: their values union, and an
  event satisfies the dimension when it belongs to any selected commune.
- `group` matches through the stored attribution link. No normalization beyond trimming: an
  unknown identifier produces an empty calendar, never a broad query.
- `epci` resolves to the current active commune membership of the territory. An EPCI criterion
  combines with event-type and group criteria with AND; several EPCI ids combine with OR.
- An event is included when `endTime >= windowStart` and `startTime <= windowEnd`. The window is
  `calendar.lookbackDays` before and `calendar.lookaheadDays` after the request instant.
- An event appears at most once, regardless of how many groups, communes or EPCIs reference it.
- A missing parameter imposes no constraint; a request with no parameter returns every event
  inside the window.
- Unknown but well-formed codes and names produce an empty calendar with status `200`, never a
  broad query.
- An ambiguous `commune_name` without `department` is a `400`.

## Entry metadata

Experimental properties use the RFC 5545 `X-` namespace. A client that does not know them ignores
them.

| Level               | Emits                                                          |
| ------------------- | -------------------------------------------------------------- |
| `off`               | No experimental property                                       |
| `identity`          | Identity family                                                |
| `standard` (default) | Identity, classification and provenance families              |
| `full`              | Everything, including geography, diagnostics and raw values    |

A family disabled in configuration emits nothing, at any level.

| Property                            | Family         | Level    | Value                                                          |
| ----------------------------------- | -------------- | -------- | -------------------------------------------------------------- |
| `X-ACTIONPOP-EVENT-ID`              | identity       | identity | Source event identifier, identical to the `UID` local part     |
| `X-ACTIONPOP-UPDATED-AT`            | identity       | identity | Last update instant, UTC basic format                          |
| `X-ACTIONPOP-PERIOD`                | identity       | identity | Last processing period token                                   |
| `X-ACTIONPOP-EVENT-TYPE`            | classification | standard | Event-type label                                               |
| `X-ACTIONPOP-SOURCE-URL`            | provenance     | standard | Canonical source page                                          |
| `X-ACTIONPOP-GROUP`                 | provenance     | standard | Group identifier, repeated, at most `maxGroupsPerEvent`        |
| `X-ACTIONPOP-GEO-STATUS`            | geography      | full     | `resolved`, `national`, `international`, `incomplete`, `invalid`, `unavailable` |
| `X-ACTIONPOP-COUNTRY`               | geography      | full     | Two-letter country code                                        |
| `X-ACTIONPOP-DEPARTMENT`            | geography      | full     | Department code as text, including leading zeroes and `2A`/`2B` |
| `X-ACTIONPOP-INSEE-COMMUNE`         | geography      | full     | INSEE code as text                                             |
| `X-ACTIONPOP-GEO-REFERENCE`         | geography      | full     | Reference version identifier                                   |
| `X-ACTIONPOP-GEO-DIAGNOSTIC-COUNT`  | diagnostics    | full     | Number of enrichment diagnostics                               |
| `X-ACTIONPOP-GEO-DIAGNOSTIC`        | diagnostics    | full     | One diagnostic, repeated                                       |
| `X-ACTIONPOP-RAW-DEPARTMENT`        | raw source     | full     | Department code exactly as stated by the source                |
| `X-ACTIONPOP-RAW-COMMUNE`           | raw source     | full     | Commune name exactly as stated by the source                   |

Diagnostic encoding:

```text
X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous;FIELD=location.commune.name;SEVERITY=warning:several communes match "Sainte-Colombe"
```

`CODE`, `FIELD` and `SEVERITY` are property parameters; `SEVERITY` is `warning` or `error`. The
value is the escaped message. Diagnostics are ordered by `code`, then `field`.

Standard properties are emitted independently of the metadata level:

| Property     | Source                                                                                                                                                                             | Omitted when                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `LOCATION`   | Place name, then postal address (`address1`/`address2` plus postal code and city only when the street line omits them), then short address, then flattened full address, then place name. A stored map link is ignored; a place name that repeats the city is dropped. | No address field is populated        |
| `URL`        | Event source page                                                                                                                                                                  | `source_url` is null                 |
| `CATEGORIES` | Event-type label                                                                                                                                                                   | `event_type` is null                 |
| `GEO`        | Latitude and longitude, six decimals, `latitude;longitude`                                                                                                                         | The event states no coordinates      |

Emission rules: uppercase property names; escape backslash, comma, semicolon and line break;
omit unknown values rather than emitting them empty; fold content lines at 75 octets with a
leading space; end lines with CRLF; never emit credentials, tokens, personal data or internal
storage identifiers.

## Responses

### `200 OK`

```http
Content-Type: text/calendar; charset=utf-8
Content-Disposition: inline; filename="actionpop-calendar.ics"
Cache-Control: public, max-age=900
ETag: "b8f1c0d2e3a4"
```

`Cache-Control: max-age` reflects `calendar.revalidationSeconds`. `calendar.maxEntries` is a hard
ceiling of `VEVENT` entries.

### `304 Not Modified`

Returned when `If-None-Match` equals the current `ETag`. No body.

### `400 Bad Request`

```json
{
  "error": "invalid calendar filter",
  "diagnostics": [
    {
      "code": "commune_name_ambiguous",
      "field": "commune_name",
      "message": "\"Sainte-Colombe\" matches 69162, 69287; narrow the request with department or insee_commune",
      "severity": "error"
    }
  ]
}
```

Diagnostic codes: `filter_parameter_unknown`, `filter_parameter_unsupported`,
`filter_value_invalid`, `commune_name_ambiguous`.

### `405 Method Not Allowed`

Any write method returns `{ "error": "read-only calendar" }`.

### `503 Service Unavailable`

- Event storage unreachable: `{ "error": "event storage unavailable" }`.
- EPCI membership incomplete or unavailable: `503` with the existing `diagnostics` array. Never a
  successful, unrelated feed.

### Route disabled

When `calendar.enabled` is `false`, the route answers `404` with
`{ "error": "calendar disabled" }`, while `/feed/{scopeId}` and `/events` keep working.

## Availability states for `epci`

| State                               | Feed behaviour                            | UI expectation                                    |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------- |
| active and complete                 | `200 text/calendar`                       | Show calendar normally                            |
| active with incomplete membership    | `503` + `diagnostics`; no unrelated events | Explain incomplete coverage and recovery          |
| invalid or retired ID               | `400` in the existing invalid-filter shape | Return to search without fallback scope            |
| valid but no matching events        | `200 text/calendar` with zero entries     | Offer subscription for future events               |

## Acceptance examples

| Request                                                       | Expected                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `department=69`                                               | Every event of department 69 inside the window, once each      |
| `department=69&insee_commune=69123,69124`                     | Only events of those two communes                              |
| `department=69&insee_commune=69123,69124&event_type=tractage`  | Only tractage events in those two communes                     |
| `commune_name=Lyon&department=69`                             | Events of INSEE `69123`                                        |
| `commune_name=Sainte-Colombe`                                 | `400` with `commune_name_ambiguous`                            |
| `department=99`                                               | `200` with a valid calendar containing zero entries            |
| no parameter                                                  | Every event inside the window                                  |
| `region=84`                                                   | `400` with `filter_parameter_unsupported`                      |
| `event_type=tractage,`                                        | `400` with `filter_value_invalid`                              |
| `group=npa-lyon`                                              | Only events attributed to that group                           |
| `group=`                                                      | `400` with `filter_value_invalid`                              |
| `epci=200054781`                                              | Events of the active communes of the EPCI                      |

## Compatibility

- Adding an optional parameter is backward compatible: every existing subscription URL keeps
  returning what it returned before. Removing or renaming one is a breaking change and requires a
  deprecation window.
- Links without `epci` are byte-for-byte compatible apart from existing dynamic headers.
- The generated subject link must carry `epci`, active event types and active group IDs.
- The emitted property set, levels and value domains are asserted against the generated OpenAPI
  document.

## Amendment history

| Date       | Feature | Change                                                       |
| ---------- | ------- | ------------------------------------------------------------ |
| 2026-10-28 | 003     | Initial filtered feed, metadata levels, YAML configuration    |
| 2026-10-30 | 007     | Added `group` criterion                                       |
| 2026-10-31 | 008     | Added `epci` criterion and availability states                |
