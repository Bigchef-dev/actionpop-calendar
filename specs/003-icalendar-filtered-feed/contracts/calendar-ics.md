# Contract: Filtered iCalendar Feed

## Purpose

Return, as one RFC 5545 calendar document, every published event that satisfies all supplied criteria and whose period overlaps the calendar window, each event exactly once.

## Request

```http
GET /calendar.ics?department=69&insee_commune=69123,69124&event_type=tractage
```

| Parameter | Required | Repeatable | Meaning | Example |
|-----------|----------|------------|---------|---------|
| `country` | no | no | Stated or deduced ISO 3166-1 alpha-2 code | `FR` |
| `department` | no | no | Department code, leading zeroes and `2A`/`2B` preserved | `69` |
| `commune_name` | no | comma-separated | Commune name, matched exactly after normalization, or its pronoun-free alias | `Lyon,Villeurbanne` |
| `insee_commune` | no | comma-separated | INSEE code of a commune | `69123,69124` |
| `event_type` | no | comma-separated | Event-type label published by the source | `tractage,boitage` |

`region`, `epci`, `constituency`, `lat`, `lon` and `coordinates` are not part of this version and are rejected.

## Semantics

- Values inside one parameter combine with OR; distinct parameters combine with AND, so every supplied criterion must be satisfied.
- `commune_name` and `insee_commune` form one commune dimension: their values union, and an event satisfies the dimension when it belongs to any selected commune.
- An event is included when `endTime >= windowStart` and `startTime <= windowEnd`.
- An event appears at most once, regardless of how many groups reference it.
- A missing parameter imposes no constraint; a request with no parameter returns every event inside the window.
- Unknown but well-formed codes and names produce an empty calendar with status `200`, never a broad query.
- An ambiguous `commune_name` without `department` is a `400`.

## Responses

### `200 OK`

```http
Content-Type: text/calendar; charset=utf-8
Content-Disposition: inline; filename="actionpop-calendar.ics"
Cache-Control: public, max-age=900
ETag: "b8f1c0d2e3a4"
```

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//ActionPop Calendar//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@actionpop-calendar
DTSTAMP:20261028T210000Z
LAST-MODIFIED:20261028T210000Z
DTSTART:20261103T090000Z
DTEND:20261103T110000Z
SUMMARY:Tractage Lyon 3e
CATEGORIES:tractage
URL:https://actionpopulaire.example/events/event-1
LOCATION:12 rue de la République\, 69003 Lyon
GEO:45.760000;4.850000
SEQUENCE:2
X-ACTIONPOP-EVENT-ID:event-1
X-ACTIONPOP-UPDATED-AT:20261028T210000Z
X-ACTIONPOP-PERIOD:2026-10-28T21:00Z
X-ACTIONPOP-EVENT-TYPE:tractage
X-ACTIONPOP-SOURCE-URL:https://actionpopulaire.example/events/event-1
X-ACTIONPOP-GROUP:group-1
END:VEVENT
END:VCALENDAR
```

`Cache-Control: max-age` reflects the configured revalidation period.

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

Diagnostic codes: `filter_parameter_unknown`, `filter_parameter_unsupported`, `filter_value_invalid`, `commune_name_ambiguous`.

### `405 Method Not Allowed`

Any write method on the route returns `{ "error": "read-only calendar" }`.

### `503 Service Unavailable`

Event storage is unreachable: `{ "error": "event storage unavailable" }`.

### Route disabled

When `calendar.enabled` is `false`, the route answers `404` with `{ "error": "calendar disabled" }`, while `/feed/{scopeId}` and `/events` keep working.

## Acceptance examples

| Request | Expected |
|---------|----------|
| `department=69` | Every event of department 69 inside the window, once each |
| `department=69&insee_commune=69123,69124` | Only events of those two communes |
| `department=69&insee_commune=69123,69124&event_type=tractage` | Only tractage events in those two communes |
| `commune_name=Lyon&department=69` | Events of INSEE `69123` |
| `commune_name=Sainte-Colombe` | `400` with `commune_name_ambiguous` |
| `department=99` | `200` with a valid calendar containing zero entries |
| no parameter | Every event inside the window |
| `region=84` | `400` with `filter_parameter_unsupported` |
| `event_type=tractage,` | `400` with `filter_value_invalid` |
