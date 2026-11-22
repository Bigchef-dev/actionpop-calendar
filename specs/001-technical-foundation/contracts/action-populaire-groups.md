# Action Populaire Contract: Groups

## Group catalogue

```http
GET /carte/liste_groupes/ HTTP/1.1
Accept: application/json
```

The successful response is an array of group catalogue objects. `id` is the stable
group identity. `is_active` determines whether the dispatcher creates new ingestion
jobs. Inactive groups remain in the local catalogue so their previously published
datasets and event history are not deleted implicitly.

```json
{
  "id": "uuid",
  "name": "string",
  "coordinates": {
    "type": "Point",
    "coordinates": [1.328055, 48.070497]
  },
  "type": "L",
  "subtype": 1,
  "subtypes": [1],
  "is_active": true,
  "is_certified": false,
  "location_country": "FR",
  "link": "https://actionpopulaire.fr/groupes/carte/{id}/",
  "filter": "is_recent"
}
```

`coordinates` uses `[longitude, latitude]` order. `filter` may be empty and
`is_certified` is informational; neither changes active eligibility.

## Group detail

```http
GET /api/groupes/{groupId}/ HTTP/1.1
Accept: application/json
```

One group's detail resource. `id` is the stable group identity. The resource states the same
`location` object as an event, which is why a group's administrative attachment goes through the
event geographic rules unchanged (see feature [010](../../010-geographic-group-listing/spec.md)).

```json
{
  "id": "uuid",
  "name": "string",
  "location": {
    "zip": "42000",
    "city": "Saint-Étienne",
    "departement": "42",
    "country": "FR",
    "commune": { "name": "Saint-Étienne", "nameOf": "de Saint-Étienne" },
    "coordinates": { "type": "Point", "coordinates": [4.388326, 45.43393] },
    "staticMapUrl": "https://media.actionpopulaire.fr/carte/staticmapimage/<id>.png"
  }
}
```

`location` is nullable: a group that states no place simply cannot be attached to a commune.
`coordinates` uses `[longitude, latitude]` order, like the catalogue. Only the fields the
enricher reads are listed here; the document carries further presentation fields (description,
contact, routes, links, facts) that this project ignores.

A `404` is a definitive answer for an unknown group; every other status keeps the retry
behaviour of the client.

## Synchronization rules

The catalogue endpoint is the source of truth for dispatcher scope discovery. The
catalogue sync validates every object, upserts active and inactive groups, and records
the retrieval as complete only after the entire response is valid. A failed or partial
catalogue must not replace the last complete catalogue or dispatch an incomplete list.

The worker dispatches only groups where `is_active` is `true`. Deactivation stops new
jobs but preserves the last complete dataset and event history.
