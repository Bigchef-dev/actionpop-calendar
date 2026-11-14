# Contract: Geographic Event List

**Owner:** [002 — Geographic Enrichment and Event Filtering](../../002-geographic-enrichment/spec.md)
**Amendments:** none
**Status:** Living contract · consolidated 2026-11-14
**Implementation:** [`apps/api/src/controllers/events.controller.ts`](../../../apps/api/src/controllers/events.controller.ts)

## Purpose

Return each event once when it satisfies every supplied geographic and event-type criterion. The
query reads the geographic columns already published on the event row and performs no reference
lookup during a read.

## Request

```http
GET /events?country=FR&department=69&commune=69123&event_type=tractage
```

Each parameter is optional and repeatable only where the implementation explicitly supports a
set. A missing parameter imposes no criterion. Values are stable reference identifiers or the
validated event-type enum:

| Parameter    | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `country`    | Stated ISO 3166-1 alpha-2 code                             |
| `department` | Department code, leading zeroes and `2A`/`2B` preserved    |
| `commune`    | INSEE code of a commune                                    |
| `event_type` | Validated event-type label                                 |

`region`, `epci`, `constituency` and coordinate parameters are not part of this version.

## Semantics

- All supplied criteria use `AND` semantics.
- Each criterion maps to an equality predicate on a published column (`country_code`,
  `department_code`, `commune_id`) or on `event_type`, so one event row is returned at most once.
- No match returns an empty result, not neighboring areas or a relaxed query.
- Unknown or malformed identifiers return a validation error rather than a broad query.
- Results preserve stable event identity and expose geographic diagnostics.
- An event whose commune is unresolved but whose department is stated still matches
  `department`; it never matches a commune criterion.
- A national event has no `country_code`, `department_code` or `commune_id`, so it matches no
  geographic criterion.
- Filtering is served by indexes on the published columns; no reference-table join is required
  for a geographic read.

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

## Acceptance examples

- Department `69` plus commune `69123` returns only the intersection.
- A non-matching second criterion returns `items: []`.
- `event_type=tractage` and `country=FR` filter independently and together.
- An event stating country `BE` never matches `department=69`.
- An event whose commune is unresolved but whose department is stated still matches `department=69`.

## Compatibility

The public iCalendar feed remains read-only. Filtering logic belongs in a core/query service and
is independently tested with prepared records.
