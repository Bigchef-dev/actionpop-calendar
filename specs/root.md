# ActionPop Calendar — Specification Index

> **Purpose.** This file is the single entry point to `specs/`. It inventories every
> feature specification, groups them by capability, states what each one owns, and records
> a proposal for cleaning up the specification tree.
>
> **Last reviewed.** 2026-11-14 (against the working tree, not only the task checkboxes).
> **Scope.** Feature records under `specs/`; living design notes stay in [`../docs/`](../docs);
> project rules stay in [`.specify/memory/constitution.md`](../.specify/memory/constitution.md).

---

## 1. How to use this index

| If you want to…                                                     | Start here                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand the platform skeleton (API, worker, queue, deployment)   | [001 — Technical Foundation](001-technical-foundation/spec.md)                                                                                                                                              |
| Change how events are discovered, ingested, attributed or refreshed | [004](004-event-group-attribution/spec.md) → [005](005-event-ingestion-scopes/spec.md) → [006](006-map-event-discovery/spec.md)                                                                             |
| Change geography, communes, departments or geographic filtering     | [002 — Geographic Enrichment](002-geographic-enrichment/spec.md)                                                                                                                                            |
| Change the iCalendar feed (`GET /calendar.ics`)                     | [003](003-icalendar-filtered-feed/spec.md), then amendments in [007](007-public-calendar-experience/contracts/calendar-ics-group-filter.md) and [008](008-intercommunal-calendar/contracts/calendar-ics.md) |
| Change subject search (`GET /search/subjects`)                      | [007](007-public-calendar-experience/contracts/search-api.md), then [008](008-intercommunal-calendar/contracts/search-subjects.md)                                                                          |
| Change the web application                                          | [007 — Public Calendar Experience](007-public-calendar-experience/spec.md), then [008](008-intercommunal-calendar/spec.md) for EPCI                                                                         |
| Change security, metrics or telemetry                               | [009 — Release Hardening](009-release-hardening-observability/spec.md)                                                                                                                                      |
| Know which contract file is authoritative                           | [§6 Contract ownership](#6-contract-ownership-map)                                                                                                                                                          |

### Status legend

| Status                        | Meaning                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| **Implemented**               | Task checkboxes are complete **and** the code backing the spec exists in the tree.  |
| **Implemented · tasks stale** | The code exists, but the task list was not maintained. Trust the code + this index. |
| **In progress**               | Part of the behaviour is missing or deliberately deferred.                          |
| **Proposed**                  | Not started.                                                                        |

---

## 2. Repository at a glance

The specification tree describes a pnpm TypeScript monorepo. Each spec maps onto one or more
of these units.

| Unit                | Path                                      | Responsibility                                                                                                     | Main specs                   |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Core package        | [`packages/core`](../packages/core)       | Domain contracts, adapters, rules, persistence                                                                     | 001–009                      |
| API                 | [`apps/api`](../apps/api)                 | Public read-only HTTP surface (`/calendar.ics`, `/search/subjects`, `/events`, `/feed`, `/telemetry`, `/internal`) | 001, 002, 003, 007, 008, 009 |
| Worker              | [`apps/worker`](../apps/worker)           | Dispatcher, BullMQ ingestion, geographic refresh, map discovery                                                    | 001, 002, 004, 005, 006, 009 |
| Web                 | [`apps/web`](../apps/web)                 | Vue 3 discovery + calendar composition experience (GitHub Pages)                                                   | 007, 008, 009                |
| Database            | [`prisma/`](../prisma)                    | PostgreSQL schema and migrations                                                                                   | 001, 002, 004, 005, 006, 008 |
| Diagrams & notes    | [`docs/`](../docs)                        | Architecture diagrams and design notes                                                                             | all                          |
| Canonical contracts | [`specs/contracts/`](contracts/README.md) | Living, normative contracts (HTTP, ingestion, data, metrics)                                                       | all                          |
| Governance          | [`.specify/`](../.specify)                | Constitution, templates, workflow registry                                                                         | —                            |

Architecture diagrams worth reading before a spec:
[object-design](../docs/object-design.mmd), [data-oriented](../docs/data-oriented.mmd),
[job-oriented](../docs/job-oriented.mmd), [dispatcher](../docs/dispatcher.mmd),
[worker](../docs/worker.mmd), [api](../docs/api.mmd), [geography](../docs/geography.mmd),
[repo](../docs/repo.mmd), [data-domains](../docs/data-domains.mmd).

---

## 3. Specification model and conventions

This repository uses **spec-driven development** (speckit). Each feature lives in its own
numbered folder and mostly contains the same artifacts:

| Artifact                     | Role                                                   | Nature                   |
| ---------------------------- | ------------------------------------------------------ | ------------------------ |
| `spec.md`                    | User scenarios, requirements (FR-*), success criteria  | Record of intent         |
| `plan.md`                    | Technical approach, technical context                  | Record of decisions      |
| `tasks.md`                   | Dependency-ordered implementation checklist            | Record of execution      |
| `research.md`                | Options explored and rejected                          | Historical               |
| `data-model.md`              | Data shapes added/changed by the feature               | Historical (incremental) |
| `contracts/*.md`             | External and internal contracts touched by the feature | Historical (incremental) |
| `quickstart.md`              | How to validate the feature                            | Historical               |
| `checklists/requirements.md` | Quality checklist for the spec                         | Historical               |

**Key conventions.**

1. Folders are named `NNN-kebab-case`, numbers are sequential and allocation-only.
2. Specs are **historical feature records**, not living reference documents. Later specs
   amend earlier ones (for example 007 and 008 both amend the `/calendar.ics` contract).
3. Requirement identifiers (`FR-001`, `SC-001`, `US1`…) are local to their spec folder.
4. The constitution (`.specify/memory/constitution.md`) governs all specs; when it and a
   spec disagree, the constitution wins.
5. `.specify/feature.json` points at the feature a speckit command will act on. It is a
   working pointer, not a statement of project priority.

---

## 4. Spec inventory

### 4.1 By capability

#### A. Platform foundation

| ID                                      | Title                | Status                          | Owns                                                                                                                                                               | Depends on |
| --------------------------------------- | -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| [001](001-technical-foundation/spec.md) | Technical Foundation | Implemented · 9 follow-ups open | Monorepo, strict TS, Fastify/NestJS API, BullMQ worker + dispatcher, initial PostgreSQL schema, Docker/deploy baseline, deployment-scoped feed (`/feed/{scopeId}`) | —          |

> The 9 open tasks in [001/tasks.md](001-technical-foundation/tasks.md) are the tail of the
> Redis → PostgreSQL migration: repository wiring, migration tests, backup docs and the
> contracts/plan that still describe Redis as durable storage.

#### B. Ingestion, attribution and discovery

| ID                                         | Title                                                 | Status      | Owns                                                                                                                               | Depends on |
| ------------------------------------------ | ----------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [004](004-event-group-attribution/spec.md) | Reliable Event–Group Attribution During Ingestion     | Implemented | Source-stated group attribution, unlisted-group registration, group lifecycle (`pending → active → stopped_*`), operator reporting | 001, 002   |
| [005](005-event-ingestion-scopes/spec.md)  | Dedicated Ingestion for Events Without a Stated Group | Implemented | Second scope kind (`event`), `ingestion_scope` identity `(scope_kind, scope_key)`, event-detail ingestion                          | 004        |
| [006](006-map-event-discovery/spec.md)     | Map Event Discovery and Detail Resolution             | Implemented | `GET /carte/liste_evenements/` read, map scope, `map_event_observation` fingerprints, gap-filling selection                        | 002, 005   |

#### C. Geography and filtering

| ID                                       | Title                                     | Status      | Owns                                                                                                                                          | Depends on |
| ---------------------------------------- | ----------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [002](002-geographic-enrichment/spec.md) | Geographic Enrichment and Event Filtering | Implemented | Administrative model (country/department/commune), versioned reference tables, event enrichment, `GET /events` filtering, event-type registry | 001        |

#### D. Public read API

| ID                                            | Title                                                | Status                    | Owns                                                                                                                                                            | Depends on         |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| [003](003-icalendar-filtered-feed/spec.md)    | Filtered iCalendar Feed                              | Implemented               | `GET /calendar.ics` with `country`/`department`/`commune_name`/`insee_commune`/`event_type`, RFC 5545 writer, `X-ACTIONPOP-*` metadata, YAML configuration file | 001, 002           |
| [007](007-public-calendar-experience/spec.md) | Public Calendar Discovery and Composition Experience | Implemented · tasks stale | `GET /search/subjects` (commune/department/group), `group` criterion on `/calendar.ics`; web discovery + composition                                            | 002, 003, 004, 005 |
| [008](008-intercommunal-calendar/spec.md)     | Intercommunal Calendar Discovery                     | Implemented               | EPCI reference + membership, `epci` search kind, `epci` criterion on `/calendar.ics`, territory resolution                                                      | 002, 007           |
| [010](010-geographic-group-listing/spec.md)   | Geographic Action Group Listing                      | Implemented               | Public read of a territory's action groups by the existing geographic criteria: identity, name, location context, group calendar reference                      | 001, 002, 008      |

#### E. Web experience

| ID                                            | Title                                                | Status                    | Owns                                                                                                                                             | Depends on |
| --------------------------------------------- | ---------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| [007](007-public-calendar-experience/spec.md) | Public Calendar Discovery and Composition Experience | Implemented · tasks stale | Search hero, suggestions, multi-item composition, calendar layouts, filters, event detail, weather, subscription/sharing, campaign design tokens | 003, 004   |
| [008](008-intercommunal-calendar/spec.md)     | Intercommunal Calendar Discovery                     | Implemented               | EPCI as a search subject and calendar scope in the existing web UI                                                                               | 007        |

#### F. Operations and release

| ID                                                 | Title                               | Status      | Owns                                                                                                                                                                         | Depends on         |
| -------------------------------------------------- | ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| [009](009-release-hardening-observability/spec.md) | Release Hardening and Observability | Implemented | Pre-publication security verdict (ZAP + checklist), closed-by-default edge allowlist, security headers, Prometheus metrics exposition, journey telemetry, monitoring package | 001, 003, 007, 008 |

### 4.2 Artifact matrix

`✓` = present. Contract counts are the number of files under `contracts/`.

| Spec | spec | plan | tasks | research | data-model  | contracts | quickstart | checklist | Tasks done      |
| ---- | :--: | :--: | :---: | :------: | :---------: | :-------: | :--------: | :-------: | --------------- |
| 001  |  ✓   |  ✓   |   ✓   |    ✓     | ✓ (5 files) |     6     |     ✓      |     ✓     | 100 / 109       |
| 002  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     2     |     ✓      |     ✓     | 58 / 58         |
| 003  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     3     |     ✓      |     ✓     | 68 / 68         |
| 004  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     3     |     ✓      |     ✓     | 48 / 48         |
| 005  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     3     |     ✓      |     ✓     | 43 / 43         |
| 006  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     2     |     ✓      |     ✓     | 37 / 37         |
| 007  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     3     |     ✓      |     ✓     | 11 / 55 (stale) |
| 008  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     3     |     ✓      |     ✓     | 50 / 50         |
| 009  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     4     |     ✓      |     ✓     | 71 / 71         |
| 010  |  ✓   |  ✓   |   ✓   |    ✓     |      ✓      |     1     |     ✓      |     ✓     | 41 / 41         |

---

## 5. Capability architecture

The specs stack into one pipeline. Arrows show data flow; brackets show the spec that
introduced each layer.

```text
Action Populaire upstream
   │  group listings / group detail        [004]
   │  event detail document                [005]
   │  public map listing                   [006]
   ▼
Worker: discovery → dispatcher → BullMQ → processors      [001]
   │
   ├─ validate + enrich geography          [002]
   ├─ attribute to stated groups           [004]
   ├─ schedule event + map scopes          [005, 006]
   └─ publish snapshot (PostgreSQL)        [001]
   ▼
PostgreSQL  (events, scopes, references, observations, ledger, snapshots)
   ▼
API (read-only)
   ├─ GET /events                          [002]
   ├─ GET /feed/{scopeId}                  [001]
   ├─ GET /calendar.ics                    [003] + group [007] + epci [008]
   ├─ GET /search/subjects                 [007] + epci [008]
   ├─ POST /telemetry/journey              [009]
   └─ GET /internal/{live,ready,metrics}   [001, 009]
   ▼
Web SPA: discovery → composition → event detail → subscribe/export   [007, 008]
   ▼
Edge allowlist + security headers + metrics                        [009]
```

### Database evolution by migration

| Migration                           | Introduced by | Main models                                                                                                                                                                                            |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0001_initial_postgres_persistence` | 001           | `IngestionScope`, `EventRecord`, `EventGroupLink`, `EventObservation`, `LocationRecord`, `GeoPoint`, `Subscription`, `ProcessingPeriod`, `IngestionCycleMetric`, `IngestionLedger`, `CalendarSnapshot` |
| `0002_geographic_reference`         | 002           | `GeographicReferenceVersion`, `DepartmentReference`, `CommuneReference`                                                                                                                                |
| `0003_event_type`                   | 002           | `EventTypeReference`                                                                                                                                                                                   |
| `0004_event_group_attribution`      | 004           | attribution columns + group lifecycle state on scopes                                                                                                                                                  |
| `0005_event_ingestion_scopes`       | 005           | `IngestionScope.scope_kind`, `event_ends_at`, `(scope_kind, scope_key)` identity                                                                                                                       |
| `0006_map_event_discovery`          | 006           | `MapEventObservation`                                                                                                                                                                                  |
| `0007_commune_population`           | 007           | population used by search ranking                                                                                                                                                                      |
| `0008_epci_reference`               | 008           | `EpciReference`, `EpciMembership`                                                                                                                                                                      |

---

## 6. Contract ownership map

The same external surface was originally described in several folders because each feature
amended it. This table records the **provenance**: the owner (the spec that defined the surface)
and the amendments (specs that extended it).

The **living, normative text now lives in [`contracts/`](contracts/README.md)** (Option A in §9,
adopted on 2026-11-14). The legacy feature files remain as historical records and each starts
with a pointer to its canonical file. When the two disagree, `contracts/` wins.

### 6.1 HTTP surfaces

| Surface                              | Owner                                                                                                    | Amendments                                                                                                                                               | Live code                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /calendar.ics`                  | [003/contracts/calendar-ics.md](003-icalendar-filtered-feed/contracts/calendar-ics.md)                   | [007 `group`](007-public-calendar-experience/contracts/calendar-ics-group-filter.md), [008 `epci`](008-intercommunal-calendar/contracts/calendar-ics.md) | [`calendar-ics.controller.ts`](../apps/api/src/controllers/calendar-ics.controller.ts) |
| `GET /search/subjects`               | [007/contracts/search-api.md](007-public-calendar-experience/contracts/search-api.md)                    | [008 `epci` kind](008-intercommunal-calendar/contracts/search-subjects.md)                                                                               | [`search.controller.ts`](../apps/api/src/controllers/search.controller.ts)             |
| `GET /events`                        | [002/contracts/geographic-filter.md](002-geographic-enrichment/contracts/geographic-filter.md)           | —                                                                                                                                                        | [`events.controller.ts`](../apps/api/src/controllers/events.controller.ts)             |
| `GET /groups`                        | [010/contracts/group-listing.md](010-geographic-group-listing/contracts/group-listing.md)                | —                                                                                                                                                        | `groups.controller.ts`                                                                 |
| `GET/POST /feed/{scopeId}`           | [001/contracts/api.md](001-technical-foundation/contracts/api.md)                                        | — (**stale**: still says Redis snapshot; see §8)                                                                                                         | [`calendar.controller.ts`](../apps/api/src/controllers/calendar.controller.ts)         |
| `GET /internal/{live,ready,metrics}` | [001/contracts/operations.md](001-technical-foundation/contracts/operations.md)                          | [009/contracts/metrics-exposition.md](009-release-hardening-observability/contracts/metrics-exposition.md)                                               | [`internal.controller.ts`](../apps/api/src/internal/internal.controller.ts)            |
| `POST /telemetry/journey`            | [009/contracts/journey-telemetry.md](009-release-hardening-observability/contracts/journey-telemetry.md) | —                                                                                                                                                        | [`telemetry.controller.ts`](../apps/api/src/observability/telemetry.controller.ts)     |
| Published edge (allowlist, headers)  | [009/contracts/edge-surface.md](009-release-hardening-observability/contracts/edge-surface.md)           | —                                                                                                                                                        | [`infra/edge`](../infra/edge)                                                          |

### 6.2 Internal and ingestion contracts

| Contract                                  | Owner                                                                                                      | Amendments                                                                                                                                                                                | Related duplicates             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Action Populaire upstream (groups/events) | [001/contracts/action-populaire.md](001-technical-foundation/contracts/action-populaire.md)                | [006/contracts/map-listing.md](006-map-event-discovery/contracts/map-listing.md)                                                                                                          | —                              |
| Worker dispatcher and queue               | [001/contracts/worker.md](001-technical-foundation/contracts/worker.md)                                    | [004/contracts/group-lifecycle.md](004-event-group-attribution/contracts/group-lifecycle.md), [005/contracts/scope-lifecycle.md](005-event-ingestion-scopes/contracts/scope-lifecycle.md) | —                              |
| Ingestion + attribution                   | [004/contracts/ingestion-attribution.md](004-event-group-attribution/contracts/ingestion-attribution.md)   | [005/contracts/event-ingestion.md](005-event-ingestion-scopes/contracts/event-ingestion.md), [006/contracts/map-discovery.md](006-map-event-discovery/contracts/map-discovery.md)         | —                              |
| Operator reporting                        | [004/contracts/operator-reporting.md](004-event-group-attribution/contracts/operator-reporting.md)         | [005/contracts/operator-reporting.md](005-event-ingestion-scopes/contracts/operator-reporting.md)                                                                                         | **same filename, two folders** |
| Metrics exposition                        | [009/contracts/metrics-exposition.md](009-release-hardening-observability/contracts/metrics-exposition.md) | —                                                                                                                                                                                         | —                              |
| Monitoring package                        | [009/contracts/monitor-package.md](009-release-hardening-observability/contracts/monitor-package.md)       | —                                                                                                                                                                                         | —                              |
| Geographic reference refresh              | [002/contracts/geographic-refresh.md](002-geographic-enrichment/contracts/geographic-refresh.md)           | [008/contracts/reference-refresh.md](008-intercommunal-calendar/contracts/reference-refresh.md)                                                                                           | —                              |

### 6.3 Data model

Every folder carries a `data-model.md` that is **incremental relative to its feature**. There
is no single canonical data-model document. The authoritative source today is
[`prisma/schema.prisma`](../prisma/schema.prisma); the specs explain _why_ each table exists.

| Spec                                                     | Data-model emphasis                                              |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| [001](001-technical-foundation/data-model.md)            | Initial persistence, scopes, observations, ledger, snapshots     |
| [002](002-geographic-enrichment/data-model.md)           | Versioned geographic references, enrichment columns, event types |
| [003](003-icalendar-filtered-feed/data-model.md)         | Read model for the ICS feed                                      |
| [004](004-event-group-attribution/data-model.md)         | Attribution links, group lifecycle state                         |
| [005](005-event-ingestion-scopes/data-model.md)          | `ingestion_scope` kinds and identity                             |
| [006](006-map-event-discovery/data-model.md)             | Map observation fingerprints                                     |
| [007](007-public-calendar-experience/data-model.md)      | Search subject shapes, optional population index                 |
| [008](008-intercommunal-calendar/data-model.md)          | EPCI reference + membership                                      |
| [009](009-release-hardening-observability/data-model.md) | Metrics/telemetry shapes (no new table)                          |

---

## 7. Reading order and dependencies

Recommended reading order for a newcomer:

```text
001 Foundation
 ├─► 002 Geography
 │    ├─► 003 iCalendar feed
 │    │    └─► 007 Search + group filter + web
 │    │         └─► 008 Intercommunal (EPCI)
 │    └─► 004 Attribution
 │         └─► 005 Event scopes
 │              └─► 006 Map discovery
 └─► 009 Release hardening & observability  (reads all public surfaces)
```

Hard dependencies (a later spec assumes the earlier behaviour exists):

| Spec | Assumes                                                              |
| ---- | -------------------------------------------------------------------- |
| 002  | 001 persistence + worker                                             |
| 003  | 001 API skeleton, 002 geographic columns                             |
| 004  | 001 ingestion, 002 location/groups                                   |
| 005  | 004 attribution + group lifecycle                                    |
| 006  | 002 geography, 005 event scopes (pending scope requests)             |
| 007  | 002 geography, 003 ICS feed, 004/005 group scopes as search subjects |
| 008  | 002 commune reference, 007 subject-search contract                   |
| 009  | 001 infra, 003/007/008 published surface                             |

---

## 8. Status and known drift

These are documentation defects observed on 2026-11-14. They do not change runtime
behaviour, but they make the tree misleading. Items marked **fixed** were addressed by Option A
(§9); the rest remain open and are tracked here.

1. **001 contracts still described Redis as durable storage.** The historical
   `001/contracts/api.md` said the feed reads a snapshot from Redis. **Fixed**: the canonical
   [`contracts/http/feed.md`](contracts/http/feed.md) now states PostgreSQL as the source of truth
   and Redis as BullMQ-only. The nine open 001 tasks (T096–T100) still need their own
   documentation tail updated in the feature folder.
2. **007 task checkboxes are stale.** `tasks.md` shows 11/55 done, yet the discovery
   components, search composables, `GET /search/subjects` controller, calendar composition,
   telemetry wiring and the archival move of the Auto-fill `.user.js` script all exist in the tree.
   **Open** — not a documentation-structure issue.
3. **`.specify/feature.json` points at 009**, while 007 is the feature whose task list is
   incomplete. **Documented**: §3 states it is a working pointer, not a priority signal.
4. **Duplicated contract filenames** (`operator-reporting.md` in 004 and 005;
   `calendar-ics.md` in 003 and 008; `search` contracts in 007 and 008). **Fixed**: each surface
   now has one canonical file in [`contracts/`](contracts/README.md), and every legacy copy starts
   with a pointer.
5. **No index** existed before this file. **Fixed**: this is the entry point.
6. **Incremental data models** had no single living document. **Fixed**:
   [`contracts/data/model.md`](contracts/data/model.md) is the narrative over
   `prisma/schema.prisma`; feature `data-model.md` files point to it.

---

## 9. Refactor proposal (proposal only — not applied)

### 9.1 Diagnosis

The current split is **chronological** (one folder per delivery phase). That is a good
_history_ and a poor _map_. The concrete issues:

| Problem                    | Symptom                                                  | Impact                                   |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| Phase folders mix concerns | 001 owns infrastructure **and** the API/worker contracts | readers looking for the API start in 001 |
| Amendments are scattered   | one HTTP surface documented in 3 folders                 | hard to know the current contract        |
| History vs reference       | completed specs are read as if normative                 | stale text (Redis) survives              |
| Status drift               | checkboxes disagree with code                            | false "in progress" signal               |
| Duplicated filenames       | `operator-reporting.md` ×2, `calendar-ics.md` ×2         | ambiguity, no clear owner                |
| No entry point             | discovery via `find`                                     | onboarding cost                          |

The numbering and `NNN-kebab-case` naming are **fine** and should be kept: they make history
append-only and are what speckit expects.

### 9.2 Option A — Index + canonical contracts (recommended)

Keep every feature folder exactly as it is, and add two lightweight layers:

1. **`specs/root.md`** — this file, maintained as the map.
2. **`specs/contracts/`** — one living file per external surface, each with an owner header.
   Per-feature contract files stay as historical records but gain a one-line pointer to the
   canonical file.

Proposed canonical layout:

```text
specs/
  root.md
  contracts/
    http/calendar-ics.md          # owner 003, amended by 007, 008
    http/search-subjects.md       # owner 007, amended by 008
    http/events.md                # owner 002
    http/feed.md                  # owner 001 (rewritten for PostgreSQL)
    http/observability.md         # owner 009 (+ internal endpoints)
    ingestion/scopes.md           # owner 004, amended by 005, 006
    ingestion/attribution.md      # owner 004
    ingestion/map-discovery.md    # owner 006
    operations/metrics.md         # owner 009
    data/model.md                 # narrative over prisma/schema.prisma
  001-technical-foundation/       # unchanged history
  …
  009-release-hardening-observability/
```

Why recommended:

- **Non-destructive**: no speckit path changes, no broken `feature.json`, no git-history churn.
- **Fixes the real pain**: a reader gets one authoritative contract per surface.
- **Cheap to adopt incrementally**: start with the five HTTP files; ingestion/data model later.

### 9.3 Option B — Capability-first reorganisation (deferred)

Regroup folders by capability and freeze history:

```text
specs/
  root.md
  _archive/                 # 001–009 frozen feature records
  foundation/
  ingestion/
  geography/
  public-api/
  web-experience/
  operations/
  contracts/                # as in Option A
```

Trade-offs: clearest long-term tree, but it breaks speckit command paths (`.specify/feature.json`,
skill templates, README links) and rewrites history. Adopt only if the team decides the
historical feature record no longer matters.

### 9.4 Ownership decision (to adopt with Option A)

| Surface                   | Canonical owner                                          | Amendment rule                                                                 |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/calendar.ics`           | 003                                                      | new criteria append an amendment section; owner file is rewritten to the union |
| `/search/subjects`        | 007                                                      | new subject kinds append; the kind catalogue is stated once                    |
| `/events`                 | 002                                                      | —                                                                              |
| `/feed/{scopeId}`         | 001                                                      | must be rewritten to PostgreSQL before being declared canonical                |
| Internal + telemetry      | 009                                                      | —                                                                              |
| Ingestion scope lifecycle | 004                                                      | 005/006 amend states, never redefine identity                                  |
| Data model                | `prisma/schema.prisma` + `specs/contracts/data/model.md` | migrations are the source of truth                                             |

### 9.5 Migration checklist (when adopted)

- [ ] Create `specs/contracts/` with the five HTTP files first.
- [ ] Rewrite `http/feed.md` from the PostgreSQL reality (closes 001 T096–T100).
- [ ] Add a 3-line status header to every `spec.md`:
      `Status`, `Implemented at`, `Canonical contracts`.
- [ ] Add a "Superseded contract → see …" line at the top of each duplicated legacy file.
- [ ] Update [`../README.md`](../README.md) and [`../apps/web/README.md`](../apps/web/README.md)
      links to point at `specs/root.md` and the canonical contracts.
- [ ] Reconcile `.specify/feature.json` or document it as a scratch pointer.
- [ ] Only then consider Option B.

---

## 10. Maintenance rules for this index

1. **Adding a spec** — add its row to §4.1, its artifacts to §4.2, its dependencies to §7,
   and any new surface to §6.
2. **Completing a spec** — update the status in §4.1 and §4.2 from the code, not the
   checkboxes.
3. **Amending an existing surface** — record the amendment in §6.1/§6.2; do not create a
   second "owner" file.
4. **Renaming or moving specs** — update every relative link in this file in the same change.
5. **Reviewing this file** — re-verify status against the tree at each release milestone.
