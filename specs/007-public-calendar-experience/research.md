# Research: Public Calendar Discovery Experience

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-11-01

Every unknown raised while filling the Technical Context is resolved below. Each entry records
the decision, why it was made in this repository, and what else was considered.

---

## R1 — How the new front end reaches the data

**Decision**: Keep `apps/web` as a statically built single-page application and let it read two
public endpoints of the existing API: `GET /search/subjects` for the search index and
`GET /calendar.ics` for the events of the chosen subject. Enable CORS on the API with an
environment-driven allow-list (`API_CORS_ORIGINS`).

**Rationale**: The site is already published as static files (`pages.yml` uploads
`apps/web/dist`) and already talks to an external origin from the browser. Adding a server-side
rendering layer or a back-end-for-front-end would introduce a new deployable that the
constitution's Principle V would then have to cover. The API is already public, already serves
the calendar, and is the only component that owns the data.

**Alternatives considered**: (a) server-side rendering next to the API — rejected: new runtime,
new deployment target, no benefit for a page whose content is already fetched asynchronously;
(b) reading Nextcloud CalDAV through a third-party CORS proxy as the current app does — rejected:
that dependency disappears entirely once the project's own feed is used, which is the stated
goal of the feature; (c) bundling a static index in the site — see R2.

---

## R2 — Source of truth for the searchable subjects

**Decision**: Build the subject index on the server from what PostgreSQL already holds:
`commune_reference` and `department_reference` of the active geographic reference version, and
`ingestion_scope` rows whose kind is `group` and whose retrieval status is active. Expose it as
one read-only endpoint whose result entries already carry the exact filter parameters to use.

**Rationale**: Communes and departments are stable and versioned; groups change with every
ingestion cycle, so any pre-built bundle would be stale the day after it is published. Returning
the filter parameters inside each entry keeps the front end free of knowledge about how a
subject maps to a calendar request, which is what makes FR-002 (extensible kinds) cheap.

**Alternatives considered**: (a) static JSON bundle of communes + departments, groups fetched
live — rejected: two mechanisms, two failure modes, and ~35k commune rows to ship; (b) embedding
the commune CSV in the browser and searching it locally — rejected: ~2 MB payload competing with
SC-004, and no way to answer a group query; (c) querying the upstream Action Populaire search API
— rejected: out of contract, requires a token, and would put visitor queries on a third party.

---

## R3 — Matching, ranking and disambiguation rules

**Decision**: Normalize both sides with the existing `normalizeGeographicName` (accent folding,
case folding, punctuation collapsing) plus a scope-specific normalization for group names.
Rank in three tiers inside one kind: exact match, name starts with the query, name contains the
query; order inside a tier by population-ish specificity (department code asc, then INSEE code
asc) for communes, and by name length then name for groups. Return at most 6 entries per kind,
18 in total. A commune whose normalized name exists in more than one department is returned once
per department, each entry carrying its department as qualifier, and the front end asks the
visitor to choose (FR-008) instead of merging.

**Rationale**: Prefix-first ranking is what makes a type-ahead feel correct, and the existing
normalization is already the project's single definition of "same name". Duplicating the
normalization would let the search disagree with ingestion. Returning homonyms individually keeps
the choice with the visitor and avoids inventing a rule for which department wins.

**Alternatives considered**: (a) trigram/fuzzy similarity — rejected: adds an extension
requirement on PostgreSQL and makes the order unpredictable for short queries; (b) a dedicated
search engine — rejected: contradicts the scale in the Technical Context and Principle V;
(c) merging homonyms into one entry — rejected: silently mixes departments (spec edge case).

---

## R4 — Searching action groups without a dedicated search column

**Decision**: Match groups with a case-insensitive `ILIKE '%query%'` on
`ingestion_scope.display_name`, restricted to `scope_kind = 'group'` and
`retrieval_status = 'active'`, ordered by name length then name, with a hard `LIMIT`.

**Rationale**: The group population is in the order of thousands, so a sequential scan filtered
by kind and status answers within the suggestion budget. Adding a normalized column would mean a
migration plus a writer change in the ingestion path — real risk for a feature that only reads.
The existing indexes on `scopeKind` and `retrievalStatus` already narrow the scan.

**Follow-up trigger**: if the group table exceeds ~50k rows or the endpoint p95 exceeds 300 ms,
add a generated normalized column with an index; the use case's reader interface keeps that change
invisible to the front end.

**Alternatives considered**: (a) `pg_trgm` index — rejected: extension availability and an
operator-class migration for a read-only feature; (b) reusing the discovery directory instead of
ingestion scopes — rejected: the directory is not persisted with names in the same way and would
add a second notion of "known group".

---

## R5 — Making a group search produce a calendar

**Decision**: Add one optional, repeatable `group` parameter to `/calendar.ics`, mapped to a new
`groupIds` criterion and translated into a `groupLinks.some({ scopeId: { in: [...] } })` predicate
in the existing query. Values are the scope identifiers already used by attribution.

**Rationale**: Without it, the spec's "search my action group, then take my calendar link"
(FR-017) cannot be satisfied: the published feed filters by country, department, commune and
event type only. The attribution link table is already selected by the calendar query, so the
predicate is a focused addition. The parameter is new and optional, so existing subscriptions keep
working byte for byte (FR-042).

**Alternatives considered**: (a) approximating a group by its commune — rejected: wrong events,
and a group usually spans several communes; (b) publishing one feed per group — rejected: unbounded
number of snapshots; (c) letting the front end filter by `X-ACTIONPOP-GROUP` — rejected: metadata
is a display aid whose level is configurable, so a subscription could silently lose events.

---

## R6 — Emoji and readable name per action type

**Decision**: Promote the existing upstream catalogue snapshot `docs/evenements-type.json` to
`data/event-types.json` as the canonical action-type catalogue (id, `label` = slug, `emoji`,
`color`, `description`), and have the web build a typed lookup keyed by the slug that the feed
emits in `CATEGORIES`. Unknown slugs fall back to a neutral emoji and the de-slugified label.

**Rationale**: The feed already emits the normalized slug; the database only stores the slug, and
the emoji/color/description live upstream in the catalogue the project already snapshots. Shipping
the catalogue with the site keeps the detail screen useful even when the metadata level is `off`.
Fallback keeps new upstream types from rendering blank.

**Alternatives considered**: (a) storing emoji in `event_type_reference` — rejected: it would
require a schema change and an ingestion change for presentation data; (b) reading the emoji from
`X-ACTIONPOP-*` — rejected: metadata families are configurable and the level can be `off`.

---

## R7 — Reading the feed and parsing it in the browser

**Decision**: One `fetch` of `/calendar.ics` per subject view (with the subject's own parameters),
parsed once with `ical.js` into a typed `CalendarEvent[]` through a pure mapping module.
Recurring events are expanded by the calendar widget, as today; `RECURRENCE-ID` exceptions keep the
existing handling. No per-event HTTP call.

**Rationale**: The feed is the contract the project publishes and is already bounded
(`maxEntries`, default 1000). A single request keeps the visitor's network cost predictable, works
identically for every subject kind, and lets the type filter run entirely in memory (FR-013).

**Alternatives considered**: (a) a JSON events endpoint per subject — rejected: it would be a
second rendering of the same data, and the spec explicitly frames the feature as a reading
experience over the existing calendar; (b) incremental fetching per visible month — rejected:
the feed is already windowed by the server.

---

## R8 — Displaying the `X-ACTIONPOP-*` properties

**Decision**: Render every experimental property present in the feed, generically, from a
label dictionary keyed by property name (`X-ACTIONPOP-EVENT-ID` → "Identifiant", and so on), in a
collapsible "Informations publiées" section of the event detail. Absent properties are omitted
without leaving a gap. Unrecognized properties are still displayed, using the raw name as label.
Repeatable properties (`GROUP`, `GEO-DIAGNOSTIC`) are grouped. Multi-valued parameters on a
property (for example `GEO-DIAGNOSTIC;CODE=...;SEVERITY=...`) are shown as qualifiers.

**Rationale**: The emitted set depends on the configured metadata level (FR-042 forbids changing
it), so the display must be driven by what is actually present, not by an assumed level. A generic
renderer with a label dictionary survives every future level without a code change.

**Alternatives considered**: (a) hard-coding the `full` level layout — rejected: breaks as soon as
a deployment lowers the level; (b) hiding the section when the level is `off` — rejected: the
section disappears silently and looks like a bug; the generic renderer simply shows nothing.

---

## R9 — Weather per event instead of one fixed city

**Decision**: Keep the existing Open-Meteo integration but query it with each event's coordinates
taken from the feed's `GEO` property, cached per rounded coordinate pair and per day, and only for
events inside the provider's forecast horizon (16 days). Out of horizon, or without coordinates,
no weather is shown.

**Rationale**: The current implementation hard-codes Rennes' coordinates, which becomes wrong the
moment the experience serves any department. Open-Meteo needs no key, and rounding coordinates
keeps the number of distinct requests low for a department view.

**Alternatives considered**: (a) one request per event — rejected: a department view can hold
hundreds of events; (b) a single "centre of the subject" point — rejected: a department is not a
point; (c) dropping weather — rejected: FR-025 requires it where meaningful.

---

## R10 — Reaching the responsible person

**Decision**: The event detail offers a single outbound action to the Action Populaire page of the
event, using `X-ACTIONPOP-SOURCE-URL` when present and the standard `URL` property otherwise. No
contact field is displayed and no contact data is stored.

**Rationale**: The contact lives upstream and is not part of the published calendar contract;
duplicating it would require changing that contract, which FR-042 forbids. A labelled outbound
action satisfies the intent ("reach the person") without owning the data.

**Alternatives considered**: (a) scraping the contact from the description — rejected: fragile,
and could publish personal data the campaign did not intend to publish here; (b) adding an
organizer field to the feed — rejected: out of scope for this feature and a contract change.

---

## R11 — Client-side filtering and shareable state

**Decision**: Combine the parsed events from the selected search items, then filter by action type
and groups in memory. Keep all shareable view state in the query string of the page address
(`sujets`, `groups`, `types`, `vue`, `evenement`), written with
`history.replaceState`, and read once at startup. Replace the current hash-based state helper for
the new screens; the legacy helper stays only where the poll feature still uses it.

**Rationale**: A query string is what other tools and people expect to share, and it survives
being pasted into a chat application. The selected items and filters are the shareable state;
the feed's native coverage is not copied into a separate period parameter. `replaceState` avoids
polluting the back history on each keystroke-level change while still making the address copyable
at any moment (FR-015, US6).

**Alternatives considered**: (a) keeping the hash — rejected: it breaks the expectation of a
shareable link and collides with in-feed anchor links; (b) `pushState` on every filter change —
rejected: back button becomes unusable after a few clicks; (c) local storage only — rejected:
sharing is a stated P3 story.

---

## R12 — Test strategy for a browser application

**Decision**: Put every business rule in pure TypeScript modules and test them with Vitest in
`apps/web/tests/**`, which the root configuration already includes. Add a `test` script and a
`vitest` dev dependency to `apps/web` so the recursive `pnpm test` covers the package. No DOM
testing library and no browser runner are introduced.

**Rationale**: Principle III requires tests for business rules, not for rendering. Parsing the
feed, filtering, ranking display, URL round-trip and link building are all pure functions; testing
them needs no browser. Components stay thin enough that their behaviour is the composition of
tested functions.

**Alternatives considered**: (a) adding a component-test stack — rejected: new toolchain for
little value at this size; (b) end-to-end browser tests — rejected: infrastructure cost, and the
risky logic is exactly the pure part.

---

## R13 — Interface proposals and decision polls

**Decision**: Produce three documented home-screen proposals and two detail-screen proposals as
static, self-contained variants of the same components (selected by a query flag during review),
each with a short rationale and its UX consequences. Submit the open choices as a written poll
with a recommended default per question; the default is applied when no answer is received so the
work is never blocked.

**Rationale**: FR-010, FR-032 and SC-005 make the proposals a deliverable. Building them as
variants of the same components means the chosen direction costs a configuration change, not a
rewrite.

**Alternatives considered**: (a) a separate throwaway prototype repository — rejected: it drifts
from the real components; (b) deciding directly — rejected: the spec asks for proposal and
arbitration.

---

## R14 — Legacy cleanup

**Decision**: Move `Auto-fill Action Populaire depuis Adresse-1.0.user.js` from
`apps/web/public/` to `docs/archive/`, delete it from the built output, and document the move in
the web README. Keep the poll feature's source and tests untouched but remove its route and any
link to it. Remove the hard-coded `AGENDAS` list, the fixed `CITY_LAT`/`CITY_LON` and the
Nextcloud base URL from `config.ts`, which become dead once the feed is the project's own.

**Rationale**: FR-040 asks for archiving rather than deletion so the script's history stays
reachable; FR-041 asks for standby rather than removal. Deleting the constants is required by
FR-039: keeping a fixed single-place configuration would either be dead code or silently constrain
the new experience.

**Alternatives considered**: (a) leaving the script in `public/` but unlinked — rejected: it stays
downloadable, which is exactly what archival must stop; (b) deleting the poll code — rejected:
the user asked for standby, and its later feature would have to rebuild it.
