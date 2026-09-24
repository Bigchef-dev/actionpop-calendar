# Data Model: Locations

## LocationRecord

A normalized address stored separately from the event or group owner.

**Redis key**: `location:{ownerType}:{ownerId}`

| Field | Type | Rule |
|---|---|---|
| `locationId` | string | Stable owner-based key |
| `ownerType` | `EVENT` or `GROUP` | Identifies the owning resource |
| `name` | string | Source location name; optional for groups |
| `address1` | string | Primary address line |
| `address2` | string | Optional; may be empty |
| `zip` | string | Postal code; preserve leading zeroes |
| `city` | string | City or commune |
| `department` | string | Source department code/name |
| `country` | string | ISO-like source country code |
| `fullAddress` | string | Normalized multiline address |
| `shortAddress` | string | Calendar-friendly address |
| `shortLocation` | string | Calendar-friendly display label |
| `staticMapUrl` | string | Optional source map URL |

`EVENT_RECORD.locationId` and `GROUP_SCOPE.locationId` reference this record. The
location is not used as the identity of an event or group.

## GeoPoint

Optional coordinates associated with a `LocationRecord`.

**Redis key**: `location-point:{ownerType}:{ownerId}`

| Field | Type | Rule |
|---|---|---|
| `locationId` | string | Foreign key to `LocationRecord` |
| `type` | literal `Point` | GeoJSON-compatible type |
| `longitude` | decimal | Finite value from `-180` through `180` |
| `latitude` | decimal | Finite value from `-90` through `90` |

Source arrays are received in `[longitude, latitude]` order and must be validated
before persistence. Missing coordinates are valid and do not invalidate the location.

## Persistence rules

Location records are written in the same staged publication as their owning event or
group snapshot. A location update does not change the stable event UID or group ID.
Event content hashing includes normalized calendar-visible location fields so a
location change increments the event `sequence` when appropriate.
