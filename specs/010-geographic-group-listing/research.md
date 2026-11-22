# Phase 0 — Research: Geographic Action Group Listing

**Feature**: [spec.md](spec.md) · **Date**: 2026-11-18

Each decision below records what was chosen, why, and what was rejected. The plan and the
contracts depend on these choices; changing one invalidates part of `data-model.md`.

## R1 — Reuse the existing geographic criterion vocabulary

**Decision**: The listing accepts `country`, `department`, `insee_commune`, `commune_name` and
`epci`, plus `commune` as an alias of `insee_commune`. Parsing, normalization and resolution
reuse the modules already used by `/calendar.ics`:
`calendar-filter-parameters.ts` (`readSingle`, `readList`), `geographic-identity.ts`
(`normalizeCountryCode`, `normalizeDepartmentCode`), `CommuneNameResolver` and
`resolveEpcis` on `PostgresGeographicReferenceRepository`.

Semantics are those of the existing reads: values inside one parameter combine with OR,
distinct parameters combine with AND, an ambiguous `commune_name` without `department` is a
`400`, and an `epci` without an active membership is an availability failure.

**Rationale**: The spec's first clarification explicitly requires the existing rules. Reusing
the resolver keeps one normalization authority, so a group and an event can never disagree
about what `Lyon` or `2A` means. A dedicated parser (rather than reusing
`parseGeographicFilter`, which rejects `epci` and does not know `commune_name`) is needed, but
it composes the existing primitives instead of re-implementing them.

**Alternatives considered**:

- Reuse `parseCalendarFilter` verbatim and ignore `event_type`/`group`: rejected because the
  listing would accept parameters it cannot apply, which contradicts FR-002 ("reject any
  criterion it does not support").
- Invent a new vocabulary (`bbox`, `lat`, `lon`, `radius`): rejected — the spec and the
  constitution point at the existing territorial identifiers, and coordinate areas have no
  reference geometry to resolve to a commune/department.

## R2 — How a group's administrative attachment is established

**Decision**: Enrich the group's own stated address with the **existing** event enricher
(`enrichEventGeography`) and the **existing** geographic reference. Nothing new decides where a
place is.

The group detail resource ([`GET /api/groupes/{groupId}/`](../../001-technical-foundation/contracts/action-populaire-groups.md#group-detail)) states exactly the event `location` shape:

```json
{
  "zip": "42000",
  "city": "Saint-Étienne",
  "departement": "42",
  "country": "FR",
  "commune": { "name": "Saint-Étienne", "nameOf": "de Saint-Étienne" },
  "coordinates": { "type": "Point", "coordinates": [4.388326, 45.43393] },
  "staticMapUrl": "https://media.actionpopulaire.fr/...png"
}
```

The group catalogue listing states no address — only `coordinates` and `location_country` — so
the address is read from the detail resource and kept with the group.

**Rationale**: One resolution rule for the whole project. A group and an event can never
disagree about what "Saint-Étienne, 42" means, a commune reference change re-enriches both the
same way, and there is no second geographic model to maintain. It also removes the need for any
territory geometry, so no dataset, table or dependency is added.

**Alternatives considered**:

- **Point-in-polygon against commune contours**: exact, but it adds a second spatial model (a
  contour table, a parser, a point-in-polygon test) that duplicates a question the address rule
  already answers, and it requires an operator to supply a geometry file. Rejected: it is
  duplication, and it makes groups behave differently from events.
- **Reverse geocoding through `geo.api.gouv.fr`**: a second third-party service with its own
  failure modes, and a result that can drift from the locally activated reference. Rejected.
- **Nearest commune centre from the commune CSV**: attributes a group near a limit to its
  neighbour, which is guessing. Rejected.
- **Derive the attachment from the group's events**: the spec forbids it (FR-003). Rejected.

## R3 — Reading the address without duplicating a client

**Decision**: Add one method to the existing upstream client, `fetchGroupDetail(groupId)`,
reusing its request helper, retry policy, timeout and error types. Validation uses a new
`validateGroupDetail` built on the **existing** `locationSchema`, so the location contract is
declared once.

**Rationale**: The client already owns base URL, token, rate-limit handling and payload
validation. A separate client for groups would duplicate all of it.

**Alternatives considered**: fetching the detail through the worker's ingestion processor:
rejected, it would create event scopes for groups. Reusing `validateActionPopulaireEvent`:
rejected, an event requires `startTime`/`endTime` a group does not have.

## R5 — When attachment is computed, and how failures are contained

**Decision**: Directory synchronization only maintains the group registry (identity, name,
listing status, stated country). A separate, best-effort enrichment step then runs in the same
cycle and:

- selects the listed active groups whose attachment is absent, whose `reference_version` is not
  the active version, or whose `enriched_at` is older than a staleness window (7 days);
- reads each one's detail document and enriches its `location` with `enrichEventGeography`;
- writes `country_code`, `department_code`, `commune_id`, `commune_name`, `department_name`,
  `reference_version`, `geographic_status`, `geographic_diagnostics` and `enriched_at` on
  `ingestion_scope`, in the same transaction as the group's `location_record` and point;
- logs and counts every outcome (`resolved`, `incomplete`, `international`, `invalid`,
  `skipped`, `failed`), never throwing into the catalogue step.

**Rationale**: The catalogue must never be lost because an enrichment read failed. Incremental
selection keeps a 15-minute cycle cheap in steady state: the first run reads every listed group
once, then only new, moved or stale ones. Counting outcomes satisfies FR-011 and SC-006.

**Alternatives considered**: enriching inside the directory transaction — an upstream read
failure would roll back the catalogue, which the existing contract forbids. Rejected. Enriching
at API read time — a per-request upstream call. Rejected.

**Alternatives considered**:

- Enrich inside the directory transaction: a failed or slow spatial step would roll back the
  directory, which the existing contract forbids. Rejected.
- Enrich at API read time: turns a cheap indexed read into a per-request spatial computation
  and makes latency depend on polygon size. Rejected.

## R6 — Endpoint shape, paging and caching

**Decision**: `GET /groups` returns JSON:

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "GA Saint-Roch",
      "countryCode": "FR",
      "departmentCode": "42",
      "departmentName": "Loire",
      "communeId": "42218",
      "communeName": "Saint-Étienne",
      "latitude": 45.43393,
      "longitude": 4.388326,
      "calendar": { "path": "/calendar.ics", "params": { "group": "uuid" } }
    }
  ],
  "total": 12,
  "limit": 50,
  "offset": 0,
  "referenceVersion": "communes-20261028-b81cad794b9c"
}
```

`limit` defaults to 50, is bounded to 1..200; `offset` is a non-negative integer. Ordering is
`display_name` ascending (accent-insensitive normalized name), then `scope_id` ascending. The
response is `Cache-Control: public, max-age=300`, like `/search/subjects`.

**Rationale**: Offset paging with a stable total fits a catalogue that changes rarely and
whose consumer wants "all groups near me" rather than an infinite scroll. The `calendar`
reference mirrors `GET /search/subjects`, so a consumer already knows how to build a group
calendar link. Names come from the active reference so the client never needs a second lookup.

**Alternatives considered**: cursor paging — more robust under concurrent writes, but the
catalogue is a small, rarely published dataset and the spec asks for a total. Rejected for
this version. `next` links — not a pattern used elsewhere in this API. Rejected.

## R7 — Error and availability mapping

**Decision**:

| Situation                                      | Answer                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Malformed, unsupported or unknown criterion    | `400` with `code` per diagnostic                                                       |
| Ambiguous `commune_name` without `department`  | `400` (existing `commune_name_ambiguous`)                                              |
| `epci` unknown/inactive                        | `400` (`epci_invalid`)                                                                 |
| EPCI reference absent or membership incomplete | `503` (`epci_unavailable` / `epci_membership_incomplete`)                              |
| No active geographic reference version         | `503` (`reference_unavailable`)                                                        |
| Database unreachable                           | `503` (`event storage unavailable` wording is replaced by `group storage unavailable`) |
| Valid area containing no group                 | `200` with `items: []`, `total: 0`                                                     |

**Rationale**: Mirrors `calendar-ics.controller.ts`, which already maps EPCI availability to
`503` and validation to `400`. The spec requires an explicit unavailable answer (FR-014) and an
empty valid answer for an existing area with no group (FR-009).

**Alternatives considered**: return `200 []` for unknown identifiers (the `/calendar.ics`
rule). Rejected: the closest sibling is the JSON item list `/events`, whose contract rejects
unknown identifiers, and the spec's edge cases require rejection.

## R8 — Eligibility rule

**Decision**: A group is eligible when `scope_kind = 'group'`, `map_status = 'listed'`,
`retrieval_status = 'active'` and `display_name IS NOT NULL`. Removed, inactive and unlisted
groups never appear, even when their attachment matches.

**Rationale**: The spec's second clarification and the existing directory vocabulary map
exactly onto these columns. `display_name IS NOT NULL` enforces FR-004 (non-empty name) instead
of inventing a fallback label.

**Alternatives considered**: include inactive groups with a status field — rejected by the
clarification; include only groups with upcoming events — rejected, the read is a catalogue
read.

## R9 — Ambiguity at a boundary

**Decision**: If a point falls inside more than one commune polygon (shared boundary), the
group is left **unattached** with the diagnostic `commune_boundary_ambiguous`, and counted.

**Rationale**: Any tie-break (lowest INSEE, largest population) would assert a membership the
data does not support, contradicting FR-011. The case is rare (catalogue coordinates come from
address-level geocoding, not boundaries), and the gap is observable.

**Alternatives considered**: deterministic lowest-INSEE tie-break — silently arbitrary.
Rejected.

## R11 — Reference consistency during activation

**Decision**: The listing reads rows whose `reference_version` equals the active version. An
attachment computed against a previous version is therefore absent from the answer rather than
mixed with current rows. The next cycle re-enriches every stale group (`reference_version`
differs from the active one), so the gap is bounded by one cycle and counted by
`actionpop_groups_unattached`.

**Rationale**: It keeps one version per answer without a snapshot table, without a blocking
read, and without coupling the operator's reference refresh to upstream availability. The
enrichment needs the upstream detail resource, so running it inside the refresh would make a
reference activation depend on the source being reachable.

**Alternatives considered**: re-enriching before activation inside the refresh — couples an
administrative operation to a third party, and makes the refresh slow and failure-prone.
Rejected. Serving each item with its own version — the answer would no longer state one version,
which the contract requires. Rejected.

## R12 — Test surfaces

**Decision**: Pure rules are tested in `packages/core` with Vitest; the HTTP contract in
`apps/api/tests`; the catalogue/attachment write path in `apps/worker` and in
`tests/integration` through the existing `startIntegrationPostgres` harness
(`TEST_DATABASE_URL`), which applies migrations to a disposable schema.

**Rationale**: Matches the repository's existing split and the constitution's independent
feature rule. The spatial resolver is pure and needs no database; the SQL read and the
enrichment write path are integration-tested.
