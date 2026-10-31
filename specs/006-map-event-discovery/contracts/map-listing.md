# Contract: Public Map Event Listing

## Request

```http
GET /carte/liste_evenements/ HTTP/1.1
Accept: application/json
```

- No pagination parameters are sent. `page`, `page_size` and `limit` are ignored by the source and MUST NOT be used to infer paging.
- The configured upstream token is sent when present, but the resource is public and MUST work without it.
- The existing client timeout, throttle retry and error classification apply.

## Successful response

A bare JSON array. At specification time the source returned about 2,700 entries and roughly 1 MB, with `cache-control: public, max-age=300`.

```json
[
  {
    "id": "3f1b3c4d-c19b-4051-ae1f-d8d685026c84",
    "name": "Action contre les prix du carburant",
    "coordinates": { "type": "Point", "coordinates": [-0.699986, 49.270996] },
    "date": "le 23 octobre 2027 à 16:00 (Europe/Paris)",
    "link": "https://actionpopulaire.fr/evenements/carte/3f1b3c4d-c19b-4051-ae1f-d8d685026c84/",
    "start_time": "2027-10-23T16:00:00+02:00",
    "end_time": "2027-10-23T18:00:00+02:00",
    "subtype": 16
  }
]
```

## Field validation

| Field          | Accepted                                                                                                             | Invalid hint behaviour                   | Rejects the entry |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------- |
| `id`           | Non-empty string after trim                                                                                          | —                                        | Yes               |
| `name`         | Non-empty string after trim                                                                                          | Dropped, counted as `name`               | No                |
| `coordinates`  | `{ type: "Point", coordinates: [lon, lat] }` with finite lon `-180..180`, lat `-90..90`; `null` is treated as absent | Dropped, counted as `coordinates`        | No                |
| `date`         | String                                                                                                               | Dropped, counted as `date`; never parsed | No                |
| `link`         | Absolute URL string                                                                                                  | Dropped, counted as `link`               | No                |
| `start_time`   | ISO 8601 with explicit offset                                                                                        | Dropped, counted as `start_time`         | No                |
| `end_time`     | ISO 8601 with explicit offset, not before `start_time` when both are valid                                           | Dropped, counted as `end_time`           | No                |
| `subtype`      | Integer                                                                                                              | Dropped, counted as `subtype`            | No                |
| Unknown fields | Any                                                                                                                  | Ignored                                  | No                |

## Validation result

```ts
interface MapEventListingValidation {
  summaries: MapEventSummary[];
  rejected: number;
  duplicates: number;
  droppedHints: Record<MapEventHintField, number>;
}
```

- `summaries` is deduplicated by `id`; the first occurrence wins and later duplicates increment `duplicates`.
- `rejected` counts entries whose `id` is missing, blank after trim, or not a string.
- `droppedHints` counts each invalid optional field independently.
- A non-array body, invalid JSON or an HTTP failure is a `PayloadValidationError` or the existing `HttpError`/`NetworkError`/`TimeoutError`; it never yields an empty summary list.

## Failure classification

| Upstream outcome                       | Classification                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `2xx` with a JSON array                | Success; validate entries                                                                    |
| `2xx` with a non-array or invalid JSON | `PayloadValidationError`, non-retryable                                                      |
| `429`                                  | Retry in place after `Retry-After` or the existing backoff, bounded by `maxRateLimitRetries` |
| Timeout, connection failure            | `TimeoutError` / `NetworkError`, retryable                                                   |
| `5xx`                                  | `HttpError`, retryable                                                                       |
| Other `4xx`                            | `HttpError`, non-retryable                                                                   |

## Identity and change hints

- `id` is the only value that crosses into the canonical pipeline.
- `name`, `start_time`, `end_time`, `coordinates` and `subtype` feed only the summary fingerprint.
- `date` and `link` are never parsed and never persisted as truth.
- The listing has no timezone, address, description, organizer group or subtype label; those values can only come from the detail document.

## Compatibility

- The summary MUST NOT be parsed by `validateActionPopulaireEvent`.
- The existing `GET /api/evenements/{id}/details/` contract and its canonical validation remain unchanged.
- A listing entry never overwrites, cancels or removes an existing canonical event.
