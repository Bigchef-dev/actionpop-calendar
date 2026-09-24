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

## Synchronization rules

The catalogue endpoint is the source of truth for dispatcher scope discovery. The
catalogue sync validates every object, upserts active and inactive groups, and records
the retrieval as complete only after the entire response is valid. A failed or partial
catalogue must not replace the last complete catalogue or dispatch an incomplete list.

The worker dispatches only groups where `is_active` is `true`. Deactivation stops new
jobs but preserves the last complete dataset and event history.
