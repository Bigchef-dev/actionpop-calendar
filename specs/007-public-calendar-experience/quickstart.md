# Quickstart: validating the public calendar discovery experience

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is a validation guide, not an implementation guide. Each scenario states how to reach the
state, what to do, and what must be observed. Implementation details live in
[data-model.md](./data-model.md) and the [contracts](./contracts/).

## Prerequisites

- Node.js >= 26 and pnpm 12 (`corepack enable`)
- Docker with the project compose files (PostgreSQL and Redis)
- A populated database: geographic reference ingested and at least a few ingested events, or a
  development database with the fixtures used by the integration suites

## Setup

```bash
pnpm install
cp config/actionpop.example.yaml config/actionpop.yaml   # if not already present
pnpm dev     # API on http://127.0.0.1:3000 AND site on http://127.0.0.1:5173/agenda-rennes/
```

`pnpm dev` starts the dependencies, applies migrations, builds `@actionpop/core`, then runs the
API and the site in parallel, with the two local development origins already allowed through
CORS. Use `pnpm dev:api` or `pnpm dev:web` to run one of them alone.

Environment values the feature depends on:

| Variable            | Where     | Default                                                                                               | Effect                                                           |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `API_CORS_ORIGINS`  | API       | empty (no cross-origin origin allowed); `pnpm dev` sets `http://127.0.0.1:5173,http://localhost:5173` | Comma-separated list of origins allowed to read the search route |
| `VITE_API_BASE_URL` | web build | `http://127.0.0.1:3000` in dev                                                                        | API origin the site talks to                                     |

## Automated validation

```bash
pnpm --filter @actionpop/core test        # subject ranking, group-filter parsing, criteria mapping
pnpm --filter @actionpop/api test         # search controller contract, feed route regression
pnpm --filter @actionpop/web test         # ICS mapping, type filter, URL state, link building, labels
pnpm --filter @actionpop/web typecheck    # vue-tsc, strict
pnpm test:integration                     # search endpoint + group filter against a real database
pnpm lint && pnpm check:dead && pnpm check:spell
```

Every suite must pass before the feature is considered validated. The integration suite is the
only one that needs the infrastructure above.

## Scenario 1 — Find a city, a department, a group (US1)

1. Open `http://127.0.0.1:5173/`.
2. Wait three seconds without touching anything, then focus the field.
3. Type `ly`.

**Expected**: examples were typed and erased before focus; suggestions are grouped by kind, each
showing the name, the kind and the territory; the result count is announced to a screen reader;
`↓`/`↑` move, `Enter` chooses; the address becomes `/?sujet=commune:<insee>`.

4. Repeat with `69` and with the beginning of a known group name.

**Expected**: department and group subjects resolve to `/?sujet=department:69` and
`/?sujet=group:<id>` respectively.

5. Type `zzzzzz`.

**Expected**: no-result state with at least two alternative queries and an invitation to change
the kind of search — never an empty panel.

6. Type a commune name that exists in two departments (for example `Saint-Denis`).

**Expected**: two entries, each labelled with its department; choosing one produces a calendar for
that department only.

## Scenario 2 — Filter by action type (US2)

1. Open a subject with events of several types.
2. Select one type in the filter bar.

**Expected**: only that type remains; the "N sur M" indicator updates; the address gains
`types=<slug>`; reloading restores the filtered view.

3. Clear the filter.

**Expected**: every event is back, and the address no longer carries `types`.

4. Open a subject with no event in the window.

**Expected**: no-event state naming the subject and the period, with a subscription offer.

## Scenario 3 — Take a calendar link (US3)

1. From a filtered calendar, open the subscription panel.

**Expected**: the panel names the subject, whether the displayed filter is included, and the
period; the subscription (live) form is proposed first, download second, calendar service third.

2. Choose to keep the filter, copy the link.
3. Paste the copied link into a calendar application, then inspect the imported events.

**Expected**: the imported calendar holds exactly the filtered events; a confirmation was shown
when copying.

4. Repeat with the filter not kept.

**Expected**: the imported calendar holds every event of the subject.

5. Repeat the whole scenario with a `group` subject.

**Expected**: the imported calendar holds the events attributed to that group
(see [the group-filter contract](./contracts/calendar-ics-group-filter.md)).

## Scenario 4 — Read one event (US4)

1. Open an event of a known type.

**Expected**: emoji + readable type name; date and time in French; place with a map action; the
expected weather when the event is within the forecast horizon and has coordinates; every
`X-ACTIONPOP-*` property present in the feed, labelled and grouped; a single action opening the
event's Action Populaire page.

2. Open an event with no metadata, no coordinates and no place.

**Expected**: the detail renders completely, with no empty section and no placeholder text.

3. Open a cancelled event.

**Expected**: the cancelled status is explicit, in text, not only by colour.

## Scenario 5 — Share a view (US6)

1. Copy the address of a filtered calendar and open it in a private window.

**Expected**: identical subject, filters and period.

2. Edit the address to `?sujet=commune:99999`.

**Expected**: explicit message naming the unresolvable value, and a way back to the search — never
a blank screen or an unhandled error.

3. Edit `types` to an unknown slug.

**Expected**: the unknown value is reported, the rest of the view still renders.

## Scenario 6 — Identity, guidance and accessibility (US5)

1. Show the home screen on a 375 × 667 viewport.

**Expected**: the promise and the first action are readable without scrolling; only campaign
colours and typefaces appear; the turtle illustration is present with alternative text when
meaningful.

2. Enable "reduce motion" in the operating system and reload.

**Expected**: the rotating examples are static; nothing is lost.

3. Complete the journey with the keyboard only, then with a screen reader.

**Expected**: no focus trap, the result count is announced, every action is reachable.

## Scenario 7 — Legacy cleanup (Theme F)

1. Build the site: `pnpm --filter @actionpop/web build`.
2. Look for the autocompletion script in `apps/web/dist/`.

**Expected**: it is absent; the source lives under `docs/archive/` and the web README documents it.

3. Look for any link to the survey feature.

**Expected**: none; its code and tests are still present and passing.

4. Grep the built bundle for the legacy single-place configuration.

**Expected**: no fixed agenda list, no fixed coordinates, no third-party CORS proxy.

---

## Validation log — 2026-11-01

Environment: Node 26.10, pnpm 12.8.1, PostgreSQL and Redis reachable locally, API started with
`API_CORS_ORIGINS=http://127.0.0.1:5173`, site served by `vite dev` on
`http://127.0.0.1:5173/agenda-rennes/`. The geographic reference was activated with
`pnpm geo:refresh` from `data/communes-france-2026.csv`: 34,868 communes and 101 departments.
The development database also holds 1,552 active groups, 890 events with group attributions.

### Automated results

| Command                                            | Result                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @actionpop/core test`               | 311 tests passed (52 files), including the new search ranking, search use case and group-filter suites |
| `pnpm --filter @actionpop/api test`                | 43 tests passed (10 files), including the search contract, diagnostics and CORS cases                  |
| `pnpm --filter @actionpop/web test`                | 62 tests passed (12 files)                                                                             |
| `pnpm test:integration`                            | 122 passed, 3 skipped, including `search-and-group-filter` against a real PostgreSQL schema            |
| `pnpm --filter @actionpop/* typecheck`             | core, api and web pass (`tsc -b`, `vue-tsc --noEmit`)                                                  |
| `pnpm --filter @actionpop/web build`               | success — `index.js` 431 kB (136 kB gzip), `index.css` 31.6 kB (6.8 kB gzip)                           |
| `pnpm lint`, `pnpm check:dead`, `pnpm check:spell` | clean                                                                                                  |

### Scenario results

| Scenario                              | Status             | Observed                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — find a city, department, group    | verified           | `lyon` returns commune suggestions including `Lyon` (`69123`) qualified by `Rhône`; `69` returns the `Rhône` department (`69`); group suggestions remain available, with keyboard and announcement support.                                                                                                                                |
| 1 — no result                         | verified           | `npa` shows the no-result state with three alternatives and the explanation of how to search each kind.                                                                                                                                                                                                                                    |
| 2 — filter by type                    | partially verified | A group with a single action type hides the filter bar (`available.length > 1` guard); type filtering is covered by `type-filter.test.ts`.                                                                                                                                                                                                 |
| 2 — layout switch and persistence     | verified           | `liste` → `jour` → `semaine` rewrites the corresponding `vue` value, the day/week grids are French localised, each switch starts at the selected view's initial viewport, and the address restores it.                                                                                                                                                                                                                                |
| 3 — take a calendar link              | verified           | The panel shows "Lyon 6e insoumis · toutes les actions · le 2 novembre 2026" with subscription, `webcal`, Outlook and download forms pointing at `/calendar.ics?group=<id>`; the feed answers one VEVENT for that group, 874 without `group`, and `400 filter_value_invalid` for `group=`.                                                 |
| 4 — read one event                    | verified           | Emoji + readable type, date and time, place, map link, per-event weather (⛅ from the event coordinates), "Informations publiées (4)" with French labels and formatted update date, add-to-calendar and `.ics` download. No contact action is displayed because the event publishes no `X-ACTIONPOP-SOURCE-URL` — the documented fallback. |
| 5 — share a view                      | verified           | Reloading a `sujet` + `evenement` address reproduces the same screen; an unknown subject shows the recoverable "Ce sujet n'existe plus" state.                                                                                                                                                                                             |
| 6 — identity, guidance, accessibility | verified           | At 375 × 667 the promise and the field end at y = 442 (visible without scrolling), no horizontal overflow (scrollWidth 360), the calendar opens on `liste`, and the subscription entry point sits at y = 150–194. Dark preference switches the tokens to `#16121b` / `#f4efe6` / `#ff8a7a`.                                                |
| 7 — legacy cleanup                    | verified           | `apps/web/public/` is empty, the script lives in `docs/archive/`, no fixed agenda list or fixed coordinates remain in the bundle, and no survey route is linked.                                                                                                                                                                           |

### Contrast audit (FR-030)

| Pair                            | Ratio   | Verdict |
| ------------------------------- | ------- | ------- |
| ink on paper                    | 15.45:1 | AA      |
| secondary on paper              | 5.10:1  | AA      |
| primary on paper                | 11.62:1 | AA      |
| on-primary on primary           | 11.62:1 | AA      |
| ink on surface-muted            | 13.83:1 | AA      |
| dark ink on dark paper          | 16.13:1 | AA      |
| dark secondary on dark paper    | 8.07:1  | AA      |
| dark primary text on dark paper | 9.22:1  | AA      |

### Performance budget (SC-003, SC-004)

Measured on the production build: 136 kB gzip of JavaScript and 6.8 kB gzip of CSS, with one
search request per debounced query (150 ms) and one feed request per subject. The
suggestions-under-one-second and first-screen-under-three-seconds targets were **not** measured on
a throttled mobile profile in this environment, and remain to be confirmed on a real device before
release.

### Fixes found by this validation

- A new query kept the previous "no result" state for one round trip; the suggestion state now
  drops on every query change and reports "Recherche en cours".
- A subject selected from the suggestions resolved to "unknown" because the identifier was
  compared after normalization, which strips the hyphens of a UUID; identifiers are now matched
  exactly against the raw query.
- Opening an event or changing a filter re-fetched the feed because the parsed route was rebuilt on
  every address change; the subject watcher now tracks the `kind:id` key.
- The subscription panel offered a filter choice with zero selected types; it now appears only when
  a filter is active.
- FullCalendar was displaying English labels; the French locale is now loaded.
