# Data Model: Events and Calendar Snapshots

## EventRecord

Represents a source event and its calendar revision.

**Redis key**: `event:{sourceEventId}`

| Field | Rule |
|---|---|
| `sourceEventId` | Stable Action Populaire event ID |
| `contentHash` | Hash of normalized calendar-relevant content |
| `sequence` | Starts at zero; increments only when normalized content changes |
| `status` | `ACTIVE` or `CANCELLED` |
| `scopeMembership` | Scope identifiers containing the event |
| `startTime` / `endTime` | Timezone-aware; project zone is `Europe/Paris` |
| `summary`, `description`, `locationId`, `sourceUrl` | Validated calendar fields |
| `lastSeenPeriod` | Successful complete ingestion period |
| `updatedAt` | Last persisted change timestamp |

Source fields such as `illustration`, `groupsAttendees`, `subtype`, `eventSpeakers`,
and `calendars` are validated at the adapter boundary. They are persisted only when
needed by the calendar contract or a later domain feature.

A partial or failed fetch must not cancel events absent from the response.

The event location is stored as a typed `LocationRecord`, with an optional linked
`GeoPoint` for coordinates. See [data-model-location.md](data-model-location.md).

## CalendarSnapshot

Represents an atomically published dataset for one scope.

**Redis keys**: `dataset:{scopeToken}:staging:{snapshotId}`,
`dataset:{scopeToken}:snapshot:{snapshotId}`, and `dataset:{scopeToken}:current`

| Field | Rule |
|---|---|
| `snapshotId` | Unique publication identifier |
| `scopeId` | Snapshot scope |
| `status` | `staging` or `complete`; only complete snapshots publish |
| `eventIds` | Complete event set for the source snapshot |
| `generatedAt` | Generation timestamp |
| `revision` | Monotonic feed revision |
| `currentPointer` | Atomically switched API pointer |

Publication order: write staging data, validate completeness, mark complete, then
atomically replace the current pointer. The API reads only the current complete
snapshot.
