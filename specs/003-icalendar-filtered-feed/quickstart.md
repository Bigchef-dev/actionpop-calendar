# Quickstart: Filtered iCalendar Feed

Validation scenarios that prove the feature works end to end. Run them from the repository root.

## Prerequisites

```bash
corepack enable
pnpm install --frozen-lockfile
cp config/actionpop.example.yaml config/actionpop.yaml   # runtime copy, git-ignored
pnpm db:setup                                            # Redis + Postgres, then migrations
pnpm geo:refresh                                         # active commune reference
```

The API reads the same YAML document as the worker; see [contracts/configuration-file.md](./contracts/configuration-file.md).

## 1. Unit and contract checks (no database)

```bash
pnpm --filter @actionpop/core test
pnpm --filter @actionpop/api test
```

Expected:

- `ical-writer` folds a 200-character description at 75 octets and escapes `,`, `;`, `\` and line breaks.
- `calendar-filter` accepts comma-separated values, rejects empty items and unsupported parameters, and reports `commune_name_ambiguous` without `department`.
- `calendar-window` yields `requestInstant - 30 days` and `requestInstant + 90 days`, and includes an event straddling either boundary.
- `ical-metadata` emits exactly the documented property set for each level, and nothing at `off`.
- The OpenAPI document still declares the five parameters of `/calendar.ics` with string schemas and examples; a renamed or missing parameter fails the test.

## 2. Empty and malformed requests (no seed data)

```bash
pnpm dev   # in a second terminal
```

| Command | Expected |
|---------|----------|
| `curl -s "http://127.0.0.1:3000/calendar.ics?department=99"` | `BEGIN:VCALENDAR`, no `BEGIN:VEVENT`, `END:VCALENDAR` |
| `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/calendar.ics?region=84"` | `400` |
| `curl -s "http://127.0.0.1:3000/calendar.ics?event_type=tractage,"` | `400` with `filter_value_invalid` on `event_type` |
| `curl -s -X POST "http://127.0.0.1:3000/calendar.ics"` | `405` with `read-only calendar` |

## 3. Seeded calendar (database)

Seed events across two communes of department 69 plus one event outside the window, then request the documented example.

| Command | Expected |
|---------|----------|
| `curl -s "http://127.0.0.1:3000/calendar.ics?department=69&insee_commune=69123,69124&event_type=tractage"` | Only the tractage events of `69123` and `69124`, each once |
| Same request with `commune_name=Lyon,Villeurbanne` instead of `insee_commune` | The same entries, proving OR inside the commune dimension |
| `commune_name=Sainte-Colombe` without `department` | `400` with `commune_name_ambiguous` and the candidate codes |
| The event dated outside the window | Absent |
| An event linked to three groups | One entry with three `X-ACTIONPOP-GROUP` lines |

## 4. Metadata levels

Edit `config/actionpop.yaml`, restart the API, and inspect one entry.

| `metadataLevel` | Expected on the entry |
|-----------------|-----------------------|
| `off` | `LOCATION`, `URL`, `CATEGORIES`, `GEO` only; no `X-ACTIONPOP-` line |
| `identity` | `EVENT-ID`, `UPDATED-AT`, `PERIOD` |
| `standard` (default) | Adds `EVENT-TYPE`, `SOURCE-URL`, `GROUP` |
| `full` | Adds `GEO-STATUS`, `COUNTRY`, `DEPARTMENT`, `INSEE-COMMUNE`, `GEO-REFERENCE`, `GEO-DIAGNOSTIC-COUNT`, `GEO-DIAGNOSTIC`, `RAW-DEPARTMENT`, `RAW-COMMUNE` |

Then set `disabledFamilies: [geography]` at level `full` and verify no `GEO-` property appears.

## 5. Window and configuration precedence

```bash
CALENDAR_LOOKBACK_DAYS=0 pnpm dev
curl -s "http://127.0.0.1:3000/calendar.ics" | grep -c BEGIN:VEVENT   # no past event
CALENDAR_LOOKAHEAD_DAYS=0 pnpm dev                                    # expected: startup error naming the key
```

Verify the error message names `calendar.lookaheadDays`, its value and its origin (environment).

## 6. Revalidation

```bash
ETAG=$(curl -s -D - -o /dev/null "http://127.0.0.1:3000/calendar.ics" | grep -i '^etag' | tr -d '\r' | cut -d' ' -f2)
curl -s -o /dev/null -w '%{http_code}' -H "If-None-Match: $ETAG" "http://127.0.0.1:3000/calendar.ics"
```

Expected `304`. After updating one seeded event, the same request returns `200` with a different `ETag`.

## 7. Client compatibility and the generated reference

- Import the URL into two calendar clients; entries appear at the correct instant, with the address, the source link and the category visible.
- Open `http://127.0.0.1:3000/reference` and confirm the `/calendar.ics` operation lists the five parameters, the `AND` semantics, the commune-dimension union, the example request and the calendar response type.
- Confirm `/events` and `/feed/{scopeId}` still respond as before.

## Related documents

- [spec.md](./spec.md) — requirements and success criteria
- [data-model.md](./data-model.md) — types, projections and configuration schema
- [contracts/calendar-ics.md](./contracts/calendar-ics.md) — HTTP contract
- [contracts/calendar-metadata.md](./contracts/calendar-metadata.md) — metadata properties
- [contracts/configuration-file.md](./contracts/configuration-file.md) — YAML schema and precedence
