# Action Populaire Contract: Events

## Event detail

```http
GET /api/evenements/{eventId}/ HTTP/1.1
Accept: application/json
```

The successful response is one event object.

## Group events

```http
GET /api/groupes/{groupId}/evenements/a-venir/?page=1&page_size=1000 HTTP/1.1
Accept: application/json
```

Historical events use the same pagination convention:

```http
GET /api/groupes/{groupId}/evenements/passes/?page=1&page_size=1000 HTTP/1.1
Accept: application/json
```

Pages are one-based. The worker uses a configurable `page_size` capped at `1000` and
increments `page` until a successful response contains fewer items than `page_size`
or an empty array. A failed request or invalid body makes the retrieval incomplete.

## Event object

The source response is an array item with the following shape:

```json
{
  "id": "uuid",
  "name": "string",
  "illustration": { "thumbnail": "https-url", "banner": "https-url" },
  "startTime": "2026-09-26T10:00:00+02:00",
  "endTime": "2026-09-26T11:00:00+02:00",
  "timezone": "Europe/Paris",
  "location": {
    "name": "string",
    "address1": "string",
    "address2": "string",
    "zip": "string",
    "city": "string",
    "departement": "string",
    "country": "FR",
    "address": "string",
    "commune": { "name": "string", "nameOf": "string" },
    "shortAddress": "string",
    "shortLocation": "string",
    "coordinates": { "type": "Point", "coordinates": [0.0, 0.0] },
    "staticMapUrl": "https-url"
  },
  "groups": [{ "id": "uuid", "name": "string" }],
  "groupsAttendees": [{ "id": "uuid", "name": "string" }],
  "distance": null,
  "subtype": {
    "id": 6,
    "label": "diffusion-tracts",
    "description": "Diffusion de tracts",
    "color": "#FF693D",
    "emoji": "string",
    "icon": null,
    "iconName": "scroll",
    "type": "A",
    "needsDocuments": false,
    "isVisible": true,
    "isPrivate": false,
    "forGroupType": null,
    "forGroups": []
  },
  "eventSpeakers": [],
  "calendars": []
}
```

## Validation and mapping

Required: `id`, `name`, `startTime`, `endTime`, `timezone`, and a usable location
or city. `groups`, `groupsAttendees`, `eventSpeakers`, `calendars`, and
`subtype.forGroups` may be empty arrays. `distance`, `location.coordinates`,
`subtype.icon`, and `subtype.forGroupType` may be null; `location.address2` may be
empty.

Coordinates are GeoJSON-like `[longitude, latitude]` values with finite numbers in
longitude `-180..180` and latitude `-90..90`.

| Source field | Internal use |
|---|---|
| `id` | Stable `EventRecord.sourceEventId` and calendar UID source |
| `name` | Summary |
| `startTime`, `endTime`, `timezone` | Timezone-aware event times |
| `location.shortLocation` / `shortAddress` | Calendar location |
| `groups[].id` | Scope membership |
| `subtype.label`, `description`, `emoji` | Optional calendar metadata |
| normalized content | Content hash and sequence change detection |

A failed or partial retrieval must not cancel missing events. Cancellation requires a
complete successful source snapshot.

## Failure classification

- `2xx` with a valid body: successful response or page.
- `429`, timeout, connection failure, and `5xx`: retryable failure.
- Other `4xx`, invalid JSON, or schema failure: non-retryable unless explicitly
  mapped by deployment configuration.
