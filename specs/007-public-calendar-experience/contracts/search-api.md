# Contract: Subject Search

## Purpose

Resolve a human query to the calendar subjects it can mean — a commune, a department or an
action group — each carrying the exact filter parameters that produce its calendar. The read
is public, read-only, and knows nothing about the visitor.

## Request

```http
GET /search/subjects?q=lyon&kind=commune,department&limit=18
```

| Parameter | Required | Repeatable      | Meaning                                                                                                       | Example                           |
| --------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `q`       | yes      | no              | Free-text query, 2 to 64 characters after trimming                                                            | `lyon`, `69`, `rhone`, `GA Strabourg Sud` |
| `kind`    | no       | comma-separated | Restricts the kinds searched. Accepted values: `commune`, `department`, `group`. An unknown value is an error | `commune,group`                   |
| `limit`   | no       | no              | Total entries returned, 1 to 30. Default 18                                                                   | `12`                              |

### Validation

| Condition                                               | Answer                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| `q` missing or shorter than 2 characters after trimming | `400` with `code: "query_too_short"`                |
| `q` longer than 64 characters                           | `400` with `code: "query_too_long"`                 |
| `kind` contains a value outside the accepted set        | `400` with `code: "kind_unknown"`, naming the value |
| `limit` outside 1..30 or not an integer                 | `400` with `code: "limit_invalid"`                  |

The accepted `kind` set is a server-side catalogue: adding a kind is a server change, and the
browser renders any kind it receives without a code change.

## Semantics

- Matching is accent-insensitive, case-insensitive and punctuation-insensitive, using the same
  normalization the ingestion path uses to decide that two names are the same name.
- Ranking inside one kind is: exact match, then name starts with the query, then name contains
  the query. Inside a tier, communes are ordered by department code then INSEE code, departments
  by code, groups by name length then name.
- A commune whose normalized name exists in several departments is returned once per department,
  each entry carrying the department name in `qualifier`. The read never merges them.
- At most 6 entries per kind are returned, and never more than `limit` in total.
- `total` and `kindCounts` describe the matches before the limit, so the browser can state how
  many results exist without a second request. The server computes them with a counting query
  bounded by the same predicates, and caps a reported count at 100 (any larger count is reported
  as `100`).
- A query with no match returns `200` with `subjects: []` and `total: 0`.
- The read never invents a subject: a commune present in the active geographic reference version
  only, a department present in the same version only, a group whose scope is of kind `group`
  and whose retrieval status is active only.

### Response fields

| Field       | Rule                                                                                                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`      | One of the accepted kinds, or a kind added server-side later                                                                                                                                                                     |
| `id`        | Non-empty and stable within its kind                                                                                                                                                                                             |
| `label`     | Non-empty, as published upstream                                                                                                                                                                                                 |
| `qualifier` | Disambiguating context: the department name of a homonymous commune; absent otherwise                                                                                                                                            |
| `parent`    | Broader territory the entry belongs to. For a commune: the department name. For a group: the department name when the group's location is known. No region entity exists in the reference data, so a region MUST NOT be returned |
| `calendar`  | `path` plus `params`, complete for that subject; used verbatim by the client                                                                                                                                                     |

Terminology: the machine value is `group` (kind, parameter, identifier). "Groupe d'action" is a
display label only and MUST NOT appear in a payload.

## Responses

### `200 OK`

```http
Content-Type: application/json; charset=utf-8
Cache-Control: public, max-age=300
Access-Control-Allow-Origin: <allowed origin>
```

```json
{
  "query": "lyon",
  "subjects": [
    {
      "kind": "commune",
      "id": "69123",
      "label": "Lyon",
      "qualifier": "Rhône",
      "parent": "Rhône",
      "calendar": { "path": "/calendar.ics", "params": { "insee_commune": "69123" } }
    },
    {
      "kind": "department",
      "id": "69",
      "label": "Rhône",
      "calendar": { "path": "/calendar.ics", "params": { "department": "69" } }
    },
    {
      "kind": "group",
      "id": "npa-lyon",
      "label": "GA Strabourg Sud",
      "parent": "Rhône",
      "calendar": { "path": "/calendar.ics", "params": { "group": "npa-lyon" } }
    }
  ],
  "total": 3,
  "kindCounts": { "commune": 1, "department": 1, "group": 1 }
}
```

An entry is never returned without `kind`, `id` and `label`. `qualifier`, `parent` and additional
presentation fields are optional; a client that does not know them ignores them.

### Error answers

```json
{
  "error": "invalid search request",
  "diagnostics": [
    { "code": "query_too_short", "field": "q", "message": "q must be at least 2 characters" }
  ]
}
```

| Status | When                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| `400`  | Request validation failed (see the table above)                                            |
| `503`  | The data source is unavailable; the browser shows its unavailable state and offers a retry |

## Cross-origin access

The read is served with CORS enabled for a configured allow-list (`API_CORS_ORIGINS`, comma
separated). Requests from an origin outside the list receive no `Access-Control-Allow-Origin`
header. `GET`, `HEAD` and `OPTIONS` are the only methods allowed. No credential is accepted.

## Compatibility

This is a new route; no existing route changes. Adding a kind, a presentation field, or a new
`calendar.params` key is backward compatible. Removing or renaming `kind`, `id`, `label`,
`calendar.path` or `calendar.params` is a breaking change and requires a contract version note.
