# Contract: Search Subjects with EPCI

## Endpoint

`GET /search/subjects?q={query}&kind=epci&limit={1..30}`

The default search without `kind` includes `epci` in addition to `commune`, `department`, and
`group`.

## Response

```json
{
  "query": "grand paris",
  "total": 1,
  "kindCounts": { "epci": 1 },
  "subjects": [
    {
      "kind": "epci",
      "id": "200054781",
      "label": "Métropole du Grand Paris",
      "qualifier": "Métropole · Île-de-France",
      "parent": "Île-de-France",
      "calendar": {
        "path": "/calendar.ics",
        "params": { "epci": "200054781" }
      }
    }
  ]
}
```

## Rules

- `kind=epci` is accepted by request parsing and `kindCounts`.
- Search matching is normalized for case and accents and supports partial names.
- Only active territories from the active reference version are returned.
- Equal matches use deterministic ID/name ordering.
- The subject label/context must distinguish `CC`, `CA`, `CU`, and `METRO`.
- Existing response fields and subject kinds remain compatible.
- Invalid kind or malformed query keeps the existing `400` diagnostics contract.

## Error and availability behavior

If no active EPCI reference is available, the endpoint returns a valid empty result with
`epci: 0` rather than exposing stale or partial rows. Refresh failures are operational
diagnostics, not a reason to return unrelated subjects.
