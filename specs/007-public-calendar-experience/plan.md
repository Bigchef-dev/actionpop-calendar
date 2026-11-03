# Implementation Plan: Public Calendar Discovery and Composition Experience

**Branch**: `007-public-calendar-experience` | **Date**: 2026-11-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-public-calendar-experience/spec.md`

## Summary

Rebuild the public web application (`apps/web`) as a discovery and composition experience on top
of `actionpop-calendar`: a single central search resolves a human query to a selectable search
item (city, department or action group), the visitor can add multiple city or department items
from the calendar screen, and the events from the selected scopes are combined and filtered by
action type in the browser. The final calendar link mirrors exactly the displayed selection;
the separate city-only copy action is explicit. Two contained backend capabilities are required
by the spec: an extensible subject-search read (`GET /search/subjects`) so that city, department
and group searches share one contract, and a `group` criterion on `/calendar.ics` so that a group
search can produce a calendar at all. Everything else is front-end work: parsing the feed
(including `X-ACTIONPOP-*`), per-event weather from the event coordinates, map and contact links,
campaign identity from [docs/design.md](../../docs/design.md), and archival of the legacy
autocompletion script.

## Technical Context

**Language/Version**: TypeScript 5.9+ (web declares `typescript` ^5.3, root uses 6.0.3 — both compile under `strict`), Node.js >= 26

**Primary Dependencies**: Web: Vue 3.4, Vite 5, Tailwind CSS 4 (PostCSS), `@fullcalendar/*` 6 (vue3), `ical.js` 1.5. API: NestJS 12 + Fastify 5 + Swagger, Prisma 7, `@actionpop/core` workspace package

**Storage**: PostgreSQL (geographic reference, ingestion scopes, event records) and Redis (calendar snapshots) — both read-only for this feature; no new table required, one optional index

**Testing**: Vitest 5 (root `vitest.config.ts` already includes `apps/*/tests/**/*.test.ts`), ESLint, `vue-tsc --noEmit`, `knip`, `cspell`

**Target Platform**: Static site published on GitHub Pages (base path `/agenda-rennes/` today) talking to the existing public API over HTTPS

**Project Type**: Web application (frontend) plus a contained web-service extension

**Performance Goals**: suggestions under 1 s p95 on a public mobile connection; first screen actionable under 3 s; an ICS payload of 1000 events parsed and rendered under 500 ms; no layout shift when suggestions open

**Constraints**: no new runtime service; no new authentication; the `/calendar.ics` contract stays backward compatible (one new optional parameter only); calendar coverage is supplied by the existing feed and is not a visitor-selected link criterion; canonical timezone `Europe/Paris`; WCAG AA contrast; `prefers-reduced-motion` honoured; no visitor data stored

**Scale/Scope**: ~35k communes, 101 departments, O(10³) action groups; one feed read per selected scope; ≤ 1000 events per feed; ~12 new front-end modules, 2 backend modules, 1 filter extension

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                 | Gate                                                                                                                                                                                                                                                                | Status                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| I. Independent Features                   | Search business rules live in `@actionpop/core` behind a reader interface; front-end rules (type filtering, ICS mapping, link building, metadata labelling) live in pure modules with no DOM or network dependency                                                  | PASS                                                    |
| II. TypeScript and Verified Types         | `strict` in both workspaces; DTO, ICS and catalogue boundaries get explicit types; no `any`; the existing `import.meta` cast in `apps/web/src/config.ts` is replaced by typed environment access in a touched file                                                  | PASS                                                    |
| III. Test-First Quality                   | Every new business rule gets a Vitest suite before implementation: subject ranking and disambiguation, group-filter parsing, criteria mapping, ICS event mapping, type filtering, URL-state round-trip, calendar-link building, metadata labelling, weather horizon | PASS                                                    |
| IV. Small and Maintainable Business Logic | New modules target ≤ 150 lines. `EventModal.vue` (288 lines) and `CalendarView.vue` (253 lines) are split where this feature touches them; no module grows past the limit                                                                                           | PASS with action (split is part of the structure below) |
| V. Deployable by Default                  | No new container and no new secret; the only new configuration is a CORS allow-list and the API base URL, both environment-driven with documented defaults; the existing Pages workflow keeps building the static site                                              | PASS                                                    |

**Post-design re-check (after Phase 1)**: unchanged — the design introduces no new service, no
new secret and no module above the size limit. The one deliberate compromise is that action
groups are searched with a `display_name ILIKE` scan instead of a dedicated normalized column;
its rationale and follow-up trigger are recorded in [research.md](./research.md) (R4).

## Project Structure

### Documentation (this feature)

```text
specs/007-public-calendar-experience/
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/
│   ├── search-api.md        # GET /search/subjects contract
│   ├── calendar-ics-group-filter.md  # `group` criterion on /calendar.ics
│   └── web-experience.md    # Routes, URL state, states and accessibility invariants
├── checklists/
│   └── requirements.md      # /speckit-specify output
└── tasks.md                 # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── main.ts
│   ├── App.vue                        # route switch only (discovery | calendar)
│   ├── config.ts                      # typed env: API base URL, feed URL
│   ├── types.ts
│   ├── features/
│   │   ├── discovery/                 # Theme A — search
│   │   │   ├── components/            # SearchHero, SearchField, SuggestionList, TypedPlaceholder
│   │   │   ├── composables/           # useSearchSuggestions, useTypedPlaceholder, useRecentSubject
│   │   │   └── utils/                 # query-min-length, suggestion-shape, query-encoding
│   │   ├── calendar/                  # Themes B & C — display, filter, detail
│   │   │   ├── components/            # CalendarView, FilterBar, EventList, EventDetail, WeatherBadge, StatusBadge
│   │   │   ├── composables/           # useCalendarFeed, useEventTypes, useWeather
│   │   │   └── utils/                 # ical-mapping, type-filter, weather-window, metadata-labels
│   │   ├── subscription/              # Theme B — calendar link
│   │   │   ├── components/            # SubscriptionPanel, LinkFormatChoice
│   │   │   └── utils/                 # calendar-link-builder
│   │   └── poll/                      # kept on standby (unchanged, not routed)
│   ├── shared/
│   │   ├── components/                # AppShell, AppHeader, StateMessage
│   │   ├── composables/               # useUrlState, useDarkMode (retained)
│   │   └── styles/                    # campaign tokens derived from docs/design.md
│   └── assets/
├── tests/
│   ├── discovery/                     # ranking display, placeholder script, selection encoding
│   ├── calendar/                      # ical mapping, type filter, metadata labels, weather window
│   ├── subscription/                  # link building per subject kind
│   └── shared/                        # URL-state round-trip
├── public/                            # legacy autocompletion script removed
└── vite.config.ts                     # base path and optional dev proxy to the API

packages/core/src/
├── search/
│   ├── subject-search.ts              # use case: query → ranked subjects (business rules)
│   ├── subject-search-types.ts        # SearchSubject, SubjectKind, ranking contract
│   ├── subject-ranking.ts             # normalization, prefix-then-contains ordering, limits
│   └── postgres-subject-search.ts     # adapter over commune, department and scope readers
├── calendar-filters/
│   ├── calendar-filter.ts             # + `group` parameter parsing
│   ├── calendar-criteria.ts           # + groupIds resolution
│   └── calendar-event.ts              # + groupIds on CalendarEventCriteria
└── persistence/
    └── postgres-calendar-event-query.ts  # + groupLinks.some(...) predicate

apps/api/src/
├── controllers/search.controller.ts   # GET /search/subjects (+ DTO + Swagger)
├── server.ts                          # + enableCors with configured origins
└── config.ts                          # + API_CORS_ORIGINS

data/
└── event-types.json                   # canonical action-type catalogue (moved from docs/)

docs/archive/
└── Auto-fill Action Populaire depuis Adresse-1.0.user.js

tests/integration/                     # search endpoint and group-filter integration cases
```

**Structure Decision**: The repository is a pnpm monorepo whose public front end already lives in
`apps/web`. This feature keeps that package as the delivered site and reuses its proven pieces
(FullCalendar wiring, `ical.js` parsing, weather badge, status badge) while reorganizing them into
three feature folders — `discovery`, `calendar`, `subscription` — mirroring the spec themes.
Business rules that can be reasoned about without a browser stay in `utils/` and `composables/`
modules covered by Vitest; Vue components stay presentational. On the backend only the read paths
required by the spec are extended: a `search/` module in `@actionpop/core` (use case + adapter,
mirroring the existing `geography/` layout) exposed as one read-only controller, and a `group`
criterion threaded through the existing calendar-filter pipeline.

## Complexity Tracking

No constitution violations. The two sizing decisions below are recorded for traceability:

| Item                                                                           | Why                                                                                                                                              | Simpler alternative rejected because                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Split `EventModal.vue` (288 lines) into `EventDetail.vue` + section components | The feature adds published-metadata, weather, map and contact sections to it; the module-size gate requires ≤ 150 lines                          | Keeping one component would push it past 300 lines and mix three concerns (presentation, links, data shaping)          |
| Add `GET /search/subjects` instead of bundling a static index                  | The group catalogue changes with every ingestion cycle; a bundled index would be stale between deploys and would create a second source of truth | A static index cannot answer "mon groupe d'action" with fresh names, and would ship ~35k commune rows to every visitor |
