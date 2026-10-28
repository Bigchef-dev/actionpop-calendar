# Contract: Geographic Event Filtering

## Purpose

Return each event once when it satisfies every supplied geographic and event-type criterion. The API or query service reads the geographic columns already published on the event row and must not perform reference lookup during a read.

## Request

Conceptual query shape:

```http
GET /events?country=FR&department=69&commune=69123&event_type=tractage
```

Each parameter is optional and repeatable only when the implementation explicitly supports a set. A missing parameter imposes no criterion. Values are stable reference identifiers (`country` is the stated ISO 3166-1 alpha-2 code, `department` is a department code, `commune` is an INSEE code) or the validated event-type enum. `region`, `epci`, `constituency`, and coordinate parameters are not part of this version.

## Semantics

- All supplied criteria use `AND` semantics.
- Each criterion maps to an equality predicate on a published column (`country_code`, `department_code`, `commune_id`) or on `event_type`, so one event row is returned at most once.
- No match returns an empty result, not neighboring areas or a relaxed query.
- Unknown or malformed identifiers return a validation error rather than a broad query.
- Results preserve stable event identity and expose geographic diagnostics when requested by the response contract.

## Response

```json
{
  "items": [
    {
      "sourceEventId": "event-1",
      "eventType": "tractage",
      "countryCode": "FR",
      "departmentCode": "69",
      "communeId": "69123",
      "geographicStatus": "resolved",
      "referenceVersion": "communes-2026-<checksum>"
    }
  ],
  "total": 1,
  "referenceVersion": "communes-2026-<checksum>"
}
```

The existing public iCalendar feed remains read-only. A future HTTP adapter may map this contract to an endpoint, but filtering logic belongs in a core/query service and is independently tested with prepared records.

## Acceptance examples

- Department `69` plus commune `69123` returns only the intersection.
- A non-matching second criterion returns `items: []`.
- `event_type=tractage` and `country=FR` filter independently and together.
- An event stating country `BE` never matches `department=69`, because no French department link exists for it.
- An event whose commune is unresolved but whose department is stated still matches `department=69` and never matches a commune criterion.
- An event published in `national events` has no `country_code`, `department_code` or `commune_id` and therefore matches no geographic criterion.
- Filtering is served by indexes on the published columns; no reference table join is required for a geographic read.
