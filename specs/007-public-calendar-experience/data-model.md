# Data Model: Public Calendar Discovery Experience

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

The model has two halves. The **read model** is what the API returns and the browser consumes; it
introduces no new persisted table. The **view state** is what the visitor's address carries. The
legacy entities named in earlier specs (event record, calendar snapshot, geographic reference,
ingestion scope) are reused as-is and are not redefined here.

---

## Read model (server → browser)

### SearchSubject

One thing a visitor can search for, with everything needed to display it and to build its calendar.

| Field       | Type                                   | Rule                                                                                                                                                              |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`      | `'commune' \| 'department' \| 'group'` | Extensible: an unknown kind is possible in a response, and the browser must render it with its `label` rather than rejecting it                                   |
| `id`        | string                                 | Non-empty, stable within its kind. `commune` → INSEE code ("01001", leading zeroes kept); `department` → department code ("01", "2A"); `group` → scope identifier |
| `label`     | string                                 | Human-readable name as published upstream, never empty                                                                                                            |
| `qualifier` | string \| absent                       | Disambiguating context: the department name for a commune, absent when the name is unique or the kind has no parent                                               |
| `parent`    | string \| absent                       | Broader territory name when one exists ("Rhône" for "Lyon")                                                                                                       |
| `calendar`  | `SubjectCalendar`                      | Filter parameters to request, always complete for that subject                                                                                                    |

**Validation**: an entry missing `kind`, `id` or `label` is dropped by the server and counted; the
rest of the answer still returns. Duplicate `(kind, id)` pairs collapse to one entry.

### SubjectCalendar

| Field    | Type                     | Rule                                                                                                            |
| -------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `path`   | string                   | Relative path of the feed request, always starting with `/calendar.ics`                                         |
| `params` | `Record<string, string>` | Exact query parameters. `commune` → `{ insee_commune }`; `department` → `{ department }`; `group` → `{ group }` |

**Rule**: the browser never derives parameters from `kind`; it uses `params` verbatim. This is what
keeps a new subject kind free of front-end changes.

### SearchAnswer

| Field        | Type                     | Rule                                                                                                                                                          |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query`      | string                   | The normalized query the answer corresponds to                                                                                                                |
| `subjects`   | `SearchSubject[]`        | Ordered: by kind (commune, department, group, then unknown kinds), then by rank tier, then by the kind's own ordering. At most 18 entries, at most 6 per kind |
| `total`      | number                   | Number of matching subjects before the limit, for "N résultats" messaging                                                                                     |
| `kindCounts` | `Record<string, number>` | Per-kind counts, so the browser can show grouped headers without a second request                                                                             |

**State transitions**: none — the read is pure. An empty `subjects` with `total = 0` is the
"no result" state; a `total` greater than the returned count is the "truncated" state.

### CalendarEvent (client, parsed from the feed)

| Field           | Source                               | Rule                                                                                         |
| --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `id`            | `UID`                                | Required; an event without `UID` is dropped                                                  |
| `summary`       | `SUMMARY`                            | Falls back to a neutral placeholder when empty                                               |
| `description`   | `DESCRIPTION`                        | Optional, empty string when absent                                                           |
| `start` / `end` | `DTSTART` / `DTEND`                  | Absolute instants; all-day events keep date-only semantics and a null `end` when absent      |
| `status`        | `STATUS`                             | `CONFIRMED` (default) \| `TENTATIVE` \| `CANCELLED`; unknown values fall back to `CONFIRMED` |
| `eventType`     | `CATEGORIES`                         | Slug of the action type, or `null`                                                           |
| `sourceUrl`     | `X-ACTIONPOP-SOURCE-URL`, else `URL` | Absolute URL, or `null`                                                                      |
| `location`      | `LOCATION`                           | Display string, or `null`                                                                    |
| `coordinates`   | `GEO`                                | `{ latitude, longitude }` or `null`; invalid pairs are dropped, not guessed                  |
| `metadata`      | every `X-ACTIONPOP-*`                | Ordered list of `{ name, value, parameters }`, parameters kept as parsed                     |

**Validation**: a malformed `DTSTART` drops the event and counts it; a malformed `GEO` only drops
the coordinates. Recurrence exceptions (`RECURRENCE-ID`) keep the existing handling: a cancelled
exception removes that occurrence instead of being displayed.

### ActionType

| Field         | Type   | Rule                                                                                  |
| ------------- | ------ | ------------------------------------------------------------------------------------- |
| `slug`        | string | Matches `CATEGORIES` values; key of the lookup                                        |
| `label`       | string | Upstream label (already a slug in the catalogue source)                               |
| `emoji`       | string | Single grapheme; the neutral fallback `📅` is used when the slug is unknown or absent |
| `color`       | string | CSS color used for the type chip                                                      |
| `description` | string | Human sentence shown in the type filter tooltip                                       |

**Rule**: the catalogue is read-only data shipped with the site. An entry missing `emoji` falls
back to the neutral emoji; a missing slug never breaks rendering.

### CalendarLink

| Field                | Type                     | Rule                                                                                           |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `subject`            | `SearchSubject`          | The selected subject                                                                           |
| `params`             | `Record<string, string>` | `SubjectCalendar.params` plus `event_type` values when the visitor keeps the displayed filters |
| `keepsFilters`       | boolean                  | Whether the type filter is part of the link                                                    |
| `subscriptionUrl`    | string                   | Absolute `https` URL of the feed with `params`                                                 |
| `webcalUrl`          | string                   | Same URL with the `webcal://` scheme                                                           |
| `downloadUrl`        | string                   | Same URL as `subscriptionUrl`, used with a download intent                                     |
| `calendarServiceUrl` | string                   | A "add by URL" address of a well-known calendar service, pre-filled                            |
| `description`        | string                   | One sentence naming subject, filters and period                                                |

**Rule**: the period is the server's configured window; the link never carries a period the feed
does not honour. A link is only offered when `params` contains a value the feed accepts.

### InterfaceProposal

| Field          | Type                                    | Rule                                                      |
| -------------- | --------------------------------------- | --------------------------------------------------------- |
| `id`           | string                                  | Short identifier used by the review flag                  |
| `theme`        | `'discovery' \| 'calendar' \| 'detail'` | Which screen the proposal covers                          |
| `title`        | string                                  | Human name shown in the poll                              |
| `hypothesis`   | string                                  | The UX bet the proposal makes                             |
| `consequences` | string[]                                | What it costs and what it optimizes                       |
| `default`      | boolean                                 | Exactly one proposal per theme is the recommended default |

### DecisionPoll

| Field         | Type                           | Rule                                                       |
| ------------- | ------------------------------ | ---------------------------------------------------------- |
| `id`          | string                         | Stable identifier                                          |
| `theme`       | string                         | One of the six spec themes                                 |
| `question`    | string                         | One sentence                                               |
| `options`     | `{ id, label, consequence }[]` | At least two                                               |
| `recommended` | string                         | Option id applied when no answer arrives                   |
| `status`      | `'open' \| 'answered'`         | Once answered, the chosen option is recorded with its date |

---

## View state (browser address)

| Parameter   | Entity field                 | Rule                                                                                                                          |
| ----------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `sujet`     | `ScopeSelection.subject`     | `kind:id` (for example `commune:69123`). Absent → the discovery screen                                                        |
| `types`     | `ScopeSelection.types`       | Comma-separated action-type slugs; absent → all types. An unknown slug is reported and ignored                                |
| `vue`       | `ScopeSelection.view`        | `mois` \| `jour` \| `semaine` \| `liste`; default `jour` on a narrow screen, `mois` otherwise. Unknown value falls back to the default |
| `evenement` | `ScopeSelection.openEventId` | Event `UID`; opens the detail. An unknown id shows the calendar without the detail, not an error                              |

**Invariants**

- Reading the address is total: any invalid parameter is replaced by its default and reported to
  the visitor (FR-015, US6 edge case). The screen never fails to render because of a bad address.
- Writing the address uses `history.replaceState` and never adds an entry to the history.
- The selection is also remembered locally (FR-036) so a returning visitor can resume; the address
  always wins over the remembered value.

### ScopeSelection

| Field         | Type            | Rule                                                                    |
| ------------- | --------------- | ----------------------------------------------------------------------- |
| `subject`     | `SearchSubject` | Resolved from the address; unresolved → discovery screen with a message |
| `types`       | string[]        | Subset of the subject's action types; empty means all                   |
| `view`        | string          | Calendar layout                                                         |
| `openEventId` | string \| null  | Detail overlay                                                          |

**State transitions**: `discovery` → `selected` (a subject is chosen) → `filtered` (types
changed) → `subscribed` (a link is copied or opened). Returning to `discovery` clears `sujet`,
`types` and `evenement` but keeps `vue`.

---

## Relationships

```text
SearchAnswer 1 ── * SearchSubject 1 ── 1 SubjectCalendar 1 ── * CalendarLink
                          │
                          └─ 1 ScopeSelection * ── * ActionType
                                                   │
CalendarEvent * ── 1 ActionType (by slug, with neutral fallback)
CalendarEvent * ── 0..1 coordinates ──> weather lookup (provider, not stored)
CalendarEvent * ── * published metadata entries (display only)
```

## What this feature deliberately does not model

- No visitor account, no saved subscription table, no analytics entity (FR-038).
- No second copy of an event: the feed stays the only transport (FR-042).
- No server-side type filter for the display path (FR-013); the existing `event_type` feed
  parameter is reused only when the visitor asks for it in the subscription link.
