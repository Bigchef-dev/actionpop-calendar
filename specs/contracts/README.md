# Canonical Contracts

This directory holds the **living, normative contracts** of ActionPop Calendar. Each file owns
one external surface: it states the current contract as the code implements it, and records
which feature specification defined it and which later specs amended it.

Feature folders under `specs/NNN-*` remain the **historical record** of what was decided and
when. When a historical contract file and a file here disagree, **this directory wins**.

## Rules

1. One surface, one file. Never create a second owner for the same surface.
2. Every file starts with `Owner` and `Amendments` links.
3. A new feature that extends a surface **appends an amendment section here** and, if needed,
   updates the owner file to the union. The feature keeps its own historical contract file with
   a pointer to this directory.
4. The data model is derived from [`prisma/schema.prisma`](../../prisma/schema.prisma); see
   [`data/model.md`](data/model.md).
5. Record every change in the amendment history at the bottom of the affected file.

## Index

| Surface | Canonical file | Owner | Amendments |
| --- | --- | --- | --- |
| `GET /calendar.ics` | [`http/calendar-ics.md`](http/calendar-ics.md) | [003](../003-icalendar-filtered-feed/spec.md) | [007](../007-public-calendar-experience/contracts/calendar-ics-group-filter.md), [008](../008-intercommunal-calendar/contracts/calendar-ics.md) |
| `GET /search/subjects` | [`http/search-subjects.md`](http/search-subjects.md) | [007](../007-public-calendar-experience/spec.md) | [008](../008-intercommunal-calendar/contracts/search-subjects.md) |
| `GET /events` | [`http/events.md`](http/events.md) | [002](../002-geographic-enrichment/spec.md) | — |
| `GET /feed/{scopeId}` | [`http/feed.md`](http/feed.md) | [001](../001-technical-foundation/spec.md) | — |
| Published edge, internal routes, telemetry | [`http/observability.md`](http/observability.md) | [009](../009-release-hardening-observability/spec.md) | — |
| Ingestion scope lifecycle | [`ingestion/scopes.md`](ingestion/scopes.md) | [004](../004-event-group-attribution/spec.md) | [005](../005-event-ingestion-scopes/spec.md), [006](../006-map-event-discovery/spec.md) |
| Attribution and publication | [`ingestion/attribution.md`](ingestion/attribution.md) | [004](../004-event-group-attribution/spec.md) | [005](../005-event-ingestion-scopes/spec.md) |
| Map discovery | [`ingestion/map-discovery.md`](ingestion/map-discovery.md) | [006](../006-map-event-discovery/spec.md) | — |
| Metrics, telemetry, monitoring, operator reporting | [`operations/metrics.md`](operations/metrics.md) | [009](../009-release-hardening-observability/spec.md) | [004](../004-event-group-attribution/contracts/operator-reporting.md), [005](../005-event-ingestion-scopes/contracts/operator-reporting.md) |
| Data model | [`data/model.md`](data/model.md) | [schema](../../prisma/schema.prisma) | all |

Not yet consolidated (owner + amendment still live in feature folders):

| Surface | Owner | Amendment |
| --- | --- | --- |
| Geographic reference refresh | [002](../002-geographic-enrichment/contracts/geographic-refresh.md) | [008](../008-intercommunal-calendar/contracts/reference-refresh.md) |
| Upstream Action Populaire payloads | [001](../001-technical-foundation/contracts/action-populaire.md) | [006](../006-map-event-discovery/contracts/map-listing.md) |
| YAML configuration file | [003](../003-icalendar-filtered-feed/contracts/configuration-file.md) | — |
| Web experience | [007](../007-public-calendar-experience/contracts/web-experience.md) | [008](../008-intercommunal-calendar/spec.md) |

See the top-level [specification index](../root.md) for the inventory and reading order.
