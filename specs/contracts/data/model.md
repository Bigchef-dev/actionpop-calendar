# Contract: Data Model

**Owner:** [`prisma/schema.prisma`](../../../prisma/schema.prisma) — the schema and its migrations are the source of truth
**Specification owners:** [001](../../001-technical-foundation/spec.md) (initial persistence, scopes, observations, ledger, snapshots), [002](../../002-geographic-enrichment/spec.md) (geographic references, enrichment columns, event types), [004](../../004-event-group-attribution/spec.md) (attribution, group lifecycle), [005](../../005-event-ingestion-scopes/spec.md) (scope kinds, event end time), [006](../../006-map-event-discovery/spec.md) (`MapEventObservation`), [007](../../007-public-calendar-experience/spec.md) (commune population), [008](../../008-intercommunal-calendar/spec.md) (EPCI reference and membership)
**Amendments:** every schema migration
**Status:** Living contract · consolidated 2026-11-14

This file explains **why** each table exists and which invariants the code relies on. It does not
duplicate column definitions: read the schema for those.

## Storage boundaries

- **PostgreSQL is the single source of truth** for events, scopes, references, observations,
  ledger, snapshots and subscriptions.
- **Redis carries BullMQ only.** It stores no durable business data, no event content, no
  geographic data and no snapshot. A Redis restart may drop queue jobs; the dispatcher re-enqueues
  them, and no durable data is lost.
- Application time is `Europe/Paris`; instants are stored/emitted in UTC where the contract says so.

## Tables by concern

### Ingestion registry and scheduling

| Model            | Purpose                                                                                                                        | Owner |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| `IngestionScope` | Every ingestion target; identity `(scope_kind, scope_key)`; kinds `group`, `event`, `map`. Carries `map_status`, `retrieval_status`, `stopped_reason`, `event_ends_at`, discovery provenance. | 001, 004, 005, 006 |
| `IngestionLedger` | One row per `(scope, period)` run; records `scheduled`/`running`/`succeeded`/`retrying`/`failed`/`stopped` and the last error. | 001 |
| `ProcessingPeriod` | Processing-period token and UTC bounds; parents event last-seen periods, ledgers and cycle metrics. | 001 |
| `IngestionCycleMetric` | Per-period ingestion counters (`groups.*`, `events.*`, `attributions.*`, `event_scopes.*`). | 001, 004, 005 |
| `CalendarSnapshot` | Published revision per scope with its event ids and status; the API reads the current complete state. | 001 |

### Events and attribution

| Model              | Purpose                                                                                                                       | Owner |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----- |
| `EventRecord`      | Canonical published event: content hash, sequence, status, times, summary/description, geographic columns, `event_type`, `group_attribution`. | 001, 002, 004 |
| `EventGroupLink`   | Attribution link `(event, group, observed_via_scope)`; `observed_via_scope` is provenance, never an organizer.                | 004 |
| `EventObservation` | One row per `(event, observing scope)` with `stated_group_count` and first/last seen period. Used by map gap selection.       | 001, 004, 006 |
| `LocationRecord`   | Address fields for events and groups.                                                                                         | 001 |
| `GeoPoint`         | Longitude/latitude of a location.                                                                                             | 001 |
| `Subscription`     | Subscription provenance per scope/event.                                                                                      | 001 |

### Geographic references

| Model                        | Purpose                                                                                                     | Owner |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----- |
| `GeographicReferenceVersion` | Versioned reference snapshot: `staged`/`active`/`superseded`/`rejected`, provenance, counts, checksum. Partial unique index guarantees a single `active` version. | 002 |
| `DepartmentReference`        | Department code/name per version.                                                                           | 002 |
| `CommuneReference`           | Commune per version with normalized and pronoun-free names, postal codes, department, population.            | 002, 007 |
| `EventTypeReference`         | Observed event-type labels.                                                                                  | 002 |
| `EpciReference`              | EPCI identity, name, category (`CC`/`CA`/`CU`/`METRO`), departments, active flag per version.                | 008 |
| `EpciMembership`             | EPCI → commune membership with a `quality` marker (`complete`/…), used to detect incomplete coverage.        | 008 |

### Discovery

| Model                 | Purpose                                                                                                            | Owner |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| `MapEventObservation` | One fingerprint row per listed map identity: summary fingerprint, display hints, first/last seen, last outcome and `next_reconcile_at`. | 006 |

## Invariants

1. `(scope_kind, scope_key)` is unique; every organizer query filters `scope_kind = 'group'`.
2. A new scope is `pending`; discovery never adds work to the cycle that discovered it.
3. An event scope is never written to `EventGroupLink` as an organizer and never appears in
   calendar group properties.
4. `EventGroupLink` rows are reconciled **per observing scope**: a listing only removes links it
   contributed; attribution is the union across complete observations.
5. Publication is atomic: event content, links, observations, scope retirement and the snapshot
   commit in one transaction.
6. Geographic reads use the denormalized columns on `EventRecord`; no reference-table join is
   required on the read path.
7. Only one `GeographicReferenceVersion` may be `active`.
8. `MapEventObservation` never produces canonical content; it is a change hint only.

## Non-persisted measurement vocabulary

The metric families, label enumerations, band thresholds and journey step/subject-kind
vocabularies of 009 are **not** stored. They are registered in code and described in
[`../operations/metrics.md`](../operations/metrics.md) and
[`../../009-release-hardening-observability/data-model.md`](../../009-release-hardening-observability/data-model.md).

## Migration history

| Migration                            | Introduced by | Main models |
| ------------------------------------ | ------------- | ----------- |
| `0001_initial_postgres_persistence`  | 001 | scopes, events, links, observations, locations, geo points, subscriptions, periods, cycle metrics, ledger, snapshots |
| `0002_geographic_reference`          | 002 | reference versions, departments, communes |
| `0003_event_type`                    | 002 | event-type reference |
| `0004_event_group_attribution`       | 004 | attribution columns and group lifecycle state |
| `0005_event_ingestion_scopes`        | 005 | `scope_kind`, `event_ends_at`, `(scope_kind, scope_key)` identity |
| `0006_map_event_discovery`           | 006 | `MapEventObservation` |
| `0007_commune_population`            | 007 | commune population for search ranking |
| `0008_epci_reference`                | 008 | `EpciReference`, `EpciMembership` |
