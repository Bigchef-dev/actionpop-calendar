# Contract: Subject Search

**Owner:** [007 — Public Calendar Discovery and Composition Experience](../../007-public-calendar-experience/spec.md)
**Amendments:** [`epci` kind](../../008-intercommunal-calendar/contracts/search-subjects.md) (008)
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`apps/api/src/controllers/search.controller.ts`](../../../apps/api/src/controllers/search.controller.ts)

## Purpose

Resolve a human query to the calendar subjects it can mean — a commune, a department, an action
group or an intercommunal authority (EPCI) — each carrying the exact filter parameters that
produce its calendar. The read is public, read-only, and knows nothing about the visitor.

## Request

```http
GET /search/subjects?q=lyon&kind=commune,department&limit=18
```

| Parameter | Required | Repeatable      | Meaning                                                                                                    | Example                 |
| --------- | -------- | --------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- |
| `q`       | yes      | no              | Free-text query, 2 to 64 characters after trimming                                                         | `lyon`, `69`, `rhone`   |
| `kind`    | no       | comma-separated | Restricts the kinds searched. Accepted values: `commune`, `department`, `group`, `epci`. An unknown value is an error | `commune,group`         |
| `limit`   | no       | no              | Total entries returned, 1 to 30. Default 18                                                                | `12`                    |

When `kind` is omitted, the search includes every kind in the server-side catalogue, `epci`
included.

### Validation

| Condition                                                | Answer                                              |
| -------------------------------------------------------- | --------------------------------------------------- |
| `q` missing or shorter than 2 characters after trimming  | `400` with `code: "query_too_short"`                |
| `q` longer than 64 characters                            | `400` with `code: "query_too_long"`                 |
| `kind` contains a value outside the accepted set         | `400` with `code: "kind_unknown"`, naming the value |
| `limit` outside 1..30 or not an integer                  | `400` with `code: "limit_invalid"`                  |

The accepted `kind` set is a server-side catalogue: adding a kind is a server change, and the
browser renders any kind it receives without a code change.

## Semantics

- Matching is accent-, case- and punctuation-insensitive, using the same normalization the
  ingestion path uses to decide that two names are the same name. Partial names are supported.
- Ranking inside one kind is: exact match, then name starts with the query, then name contains
  the query. Inside a tier, communes are ordered by decreasing population, then department code
  and INSEE code, departments by code, groups by name length then name. EPCI entries use a
  deterministic ID/name ordering.
- A commune whose normalized name exists in several departments is returned once per department,
  carrying the department name in `qualifier`. The read never merges them.
- At most 6 entries per kind are returned, and never more than `limit` in total.
- `total` and `kindCounts` describe the matches **before** the limit. The server computes them
  with a counting query bounded by the same predicates and caps a reported count at 100.
- A query with no match returns `200` with `subjects: []` and `total: 0`.
- The read never invents a subject: only communes and departments in the active geographic
  reference version, only groups whose scope kind is `group` with an active retrieval status, and
  only active EPCI territories from the active reference version.
- If no active EPCI reference is available, the endpoint returns a valid empty result with
  `epci: 0`; it never exposes stale or partial rows and never returns unrelated subjects.

## Response

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
    },
    {
      "kind": "epci",
      "id": "200054781",
      "label": "Métropole du Grand Paris",
      "qualifier": "Métropole · Île-de-France",
      "parent": "Île-de-France",
      "calendar": { "path": "/calendar.ics", "params": { "epci": "200054781" } }
    }
  ],
  "total": 4,
  "kindCounts": { "commune": 1, "department": 1, "group": 1, "epci": 1 }
}
```

### Response fields

| Field        | Rule                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | One of the accepted kinds, or a kind added server-side later                                                                                                                                        |
| `id`         | Non-empty and stable within its kind                                                                                                                                                                |
| `label`      | Non-empty, as published upstream                                                                                                                                                                    |
| `qualifier`  | Disambiguating context: a commune's department name; an EPCI's category and region. Absent otherwise                                                                                                |
| `parent`     | Broader territory: a commune's or group's department name; an EPCI's region. No region entity exists for communes, so it MUST NOT be returned for them                                              |
| `population` | Commune population in the active reference, used to order suggestions by decreasing size. Absent for other kinds or when unknown                                                                    |
| `calendar`   | `path` plus `params`, complete for that subject, used verbatim by the client                                                                                                                        |

An entry is never returned without `kind`, `id` and `label`. Unknown presentation fields are
ignored by a client that does not know them.

Terminology: the machine value is `group` (kind, parameter, identifier). "Groupe d'action" is a
display label only and MUST NOT appear in a payload. EPCI labels and qualifiers must distinguish
`CC`, `CA`, `CU` and `METRO`.

### Error answers

```json
{
  "error": "invalid search request",
  "diagnostics": [
    { "code": "query_too_short", "field": "q", "message": "q must be at least 2 characters" }
  ]
}
```

| Status | When                                                                    |
| ------ | ----------------------------------------------------------------------- |
| `400`  | Request validation failed (see the table above)                         |
| `503`  | The data source is unavailable; the browser shows unavailable and retries |

## Cross-origin access

CORS is enabled for a configured allow-list (`API_CORS_ORIGINS`, comma separated). Requests from
an origin outside the list receive no `Access-Control-Allow-Origin` header. `GET`, `HEAD` and
`OPTIONS` are the only methods allowed. No credential is accepted.

## Compatibility

This route is additive; no existing route changes. Adding a kind, a presentation field or a new
`calendar.params` key is backward compatible. Removing or renaming `kind`, `id`, `label`,
`calendar.path` or `calendar.params` is a breaking change and requires a contract version note.

## Amendment history

| Date       | Feature | Change                                |
| ---------- | ------- | ------------------------------------- |
| 2026-10-30 | 007     | Initial commune/department/group read |
| 2026-10-31 | 008     | Added `epci` kind and territory context |
