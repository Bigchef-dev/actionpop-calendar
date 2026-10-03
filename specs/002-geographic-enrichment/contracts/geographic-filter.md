# Contract: Geographic Event Filtering

## Purpose

Return each event once when it satisfies every supplied geographic and event-type criterion. The API or query service must consume published link records and must not perform postal lookup or polygon math during a read.

## Request

Conceptual query shape:

```http
GET /events?country=FR&commune=69123&constituency=6901&department=69&region=84&epci=200046977&event_type=tractage
```

Each parameter is optional and repeatable only when the implementation explicitly supports a set. A missing parameter imposes no criterion. Values are stable reference identifiers or the validated event-type enum.

## Semantics

- All supplied criteria use `AND` semantics.
- A matching link is sufficient for its criterion; multiple links do not duplicate an event.
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
      "communeId": "69123",
      "constituencyIds": ["6901"],
      "referenceVersion": "communes-2026-circo-p20-<checksum>"
    }
  ],
  "total": 1,
  "referenceVersion": "communes-2026-circo-p20-<checksum>"
}
```

The existing public iCalendar feed remains read-only. A future HTTP adapter may map this contract to an endpoint, but filtering logic belongs in a core/query service and is independently tested with prepared records.

## Acceptance examples

- Constituency `6901` plus commune `69123` returns only the intersection.
- A non-matching second criterion returns `items: []`.
- Two matching constituency links for one event return one item.
- `event_type=tractage` and `country=FR` filter independently and together.
