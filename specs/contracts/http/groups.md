# Contract: Geographic Action Group Listing

**Owner:** [010 — Geographic Action Group Listing](../../010-geographic-group-listing/spec.md)
**Amendments:** none
**Status:** Implemented · 2026-11-18
**Implementation:** [`groups.controller.ts`](../../../apps/api/src/controllers/groups.controller.ts), [`postgres-group-listing.ts`](../../../packages/core/src/persistence/postgres-group-listing.ts)
**Upstream reference:** [`GET /api/groupes/{groupId}/`](../../001-technical-foundation/contracts/action-populaire-groups.md#group-detail) — the `location` object the attachment is resolved from

## Purpose

Return every action group located in the territory described by the supplied geographic
criteria, each group once, with the identity, published name, location context and calendar
reference a consumer needs to present it. The read is a catalogue read: it never describes or
infers the events a group organizes.

## Request

```http
GET /groups?department=69&insee_commune=69123&limit=50&offset=0
```

| Parameter       | Required | Repeatable      | Meaning                                                               | Example             |
| --------------- | -------- | --------------- | --------------------------------------------------------------------- | ------------------- |
| `country`       | no       | no              | ISO 3166-1 alpha-2 code stated by the catalogue                       | `FR`                |
| `department`    | no       | no              | Department code, leading zeroes and `2A`/`2B` preserved               | `69`                |
| `insee_commune` | no       | comma-separated | INSEE code of a commune                                               | `69123,69124`       |
| `commune`       | no       | comma-separated | Alias of `insee_commune`; both are unioned into one commune dimension | `69123`             |
| `commune_name`  | no       | comma-separated | Commune name, exact after normalization, or its pronoun-free alias    | `Lyon,Villeurbanne` |
| `epci`          | no       | comma-separated | EPCI identifier, resolved to its active commune membership            | `200054781`         |
| `limit`         | no       | no              | Page size, 1..200. Default 50                                         | `100`               |
| `offset`        | no       | no              | Number of matching groups skipped, ≥ 0. Default 0                     | `50`                |

`event_type`, `group`, `region`, `constituency`, `lat`, `lon` and `coordinates` are not part of
this contract and are rejected.

### Validation

| Condition                                                     | Answer                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unknown or unsupported parameter                              | `400` `filter_parameter_unknown` / `filter_parameter_unsupported` |
| No area criterion supplied (only `limit`/`offset`)            | `400` `area_missing`                                              |
| Empty or malformed value                                      | `400` `filter_value_invalid`                                      |
| `commune_name` ambiguous and no `department` narrows it       | `400` `commune_name_ambiguous`, listing the candidate codes       |
| `insee_commune`/`commune` code absent from the active version | `400` `commune_invalid`, naming the code                          |
| `department` absent from the active version                   | `400` `department_invalid`, naming the code                       |
| `epci` unknown or inactive                                    | `400` `epci_invalid`                                              |
| `limit` outside 1..200 or not an integer                      | `400` `limit_invalid`                                             |
| `offset` negative or not an integer                           | `400` `offset_invalid`                                            |

Successful identification of an area that holds no group is **not** a validation error; it is a
`200` with an empty list.

## Semantics

- Values inside one parameter combine with OR; distinct parameters combine with AND.
- `insee_commune` and `commune` are one dimension: their values union.
- `commune_name` resolves to INSEE codes against the active geographic reference version with
  the same normalization as the event and calendar reads; resolved codes join the commune
  dimension.
- `epci` resolves to the current active commune membership of the territory. Several EPCI ids
  combine with OR inside the dimension.
- A group matches a commune criterion when its own resolved `commune_id` is in the dimension.
  A group matches `department` when its own resolved `department_code` equals the value.
  A group matches `country` when its stated country equals the value.
- A group is attached from the address its own upstream detail resource states, resolved with the
  same rules and reference version as an event. A group whose address does not resolve to a
  commune matches only the criteria its remaining context satisfies — typically only its stated
  `country` — and is never placed by guesswork.
- Only groups with `map_status = listed`, `retrieval_status = active` and a non-empty name are
  eligible. Unlisted, inactive and removed groups are excluded, and the exclusion is counted.
- A group appears at most once, even when it matches several values of a dimension.
- Ordering is the published name ascending under the database collation, then the group identifier ascending, so
  two reads of an unchanged area are identical.
- `total` is the number of matching groups **before** `limit`/`offset`.
- The whole answer is computed against one active reference version; an unchanged area returns
  the same `referenceVersion` on every read.

## Response

### `200 OK`

```http
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=300
Access-Control-Allow-Origin: <allowed origin>
```

```json
{
  "items": [
    {
      "id": "c335381e-fd02-430e-8cc0-fcfb07fbc4af",
      "name": "GA Saint-Roch",
      "countryCode": "FR",
      "departmentCode": "42",
      "departmentName": "Loire",
      "communeId": "42218",
      "communeName": "Saint-Étienne",
      "latitude": 45.43393,
      "longitude": 4.388326,
      "calendar": {
        "path": "/calendar.ics",
        "params": { "group": "c335381e-fd02-430e-8cc0-fcfb07fbc4af" }
      }
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0,
  "referenceVersion": "communes-20261028-b81cad794b9c"
}
```

### Response fields

| Field              | Rule                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `id`               | Stable group identity, non-empty; the value to pass as the `group` calendar parameter |
| `name`             | Non-empty published name, as the map advertises it                                    |
| `countryCode`      | Stated ISO code, or `null` when the catalogue states none                             |
| `departmentCode`   | Department of the resolved commune, string, or `null`                                 |
| `departmentName`   | Department name in the reference version, or `null`                                   |
| `communeId`        | INSEE code of the resolved commune, or `null`                                         |
| `communeName`      | Commune name in the reference version, or `null`                                      |
| `latitude`         | Published latitude, or `null` when the source states no usable point                  |
| `longitude`        | Published longitude, or `null`                                                        |
| `calendar`         | `path` plus `params`, complete for that group, consumed verbatim by the client        |
| `total`            | Matching groups before paging                                                         |
| `limit`/`offset`   | Effective paging values, so a consumer can page deterministically                     |
| `referenceVersion` | Active geographic reference version the whole answer was computed against             |

No internal field is exposed: no retrieval status, no geometry, no diagnostics, no source token.

### Error answers

```json
{
  "error": "invalid group area filter",
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

| Status | When                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | Request validation failed (table above)                                                                          |
| `503`  | No active geographic reference version, EPCI reference/membership unavailable, or the data source is unavailable |

## Compatibility

The route is additive: no existing route changes. Adding a criterion or a presentation field is
backward compatible. Removing or renaming `id`, `name`, `calendar.path`, `calendar.params`,
`total`, `limit`, `offset` or `referenceVersion` is a breaking change and requires a contract
version note.

## Amendment history

| Date       | Feature | Change                         |
| ---------- | ------- | ------------------------------ |
| 2026-11-18 | 010     | Initial proposed group listing |
