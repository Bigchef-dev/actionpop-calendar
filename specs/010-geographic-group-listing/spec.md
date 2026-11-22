# Feature Specification: Geographic Action Group Listing

**Feature Branch**: `010-geographic-group-listing`

**Created**: 2026-11-18

**Status**: Draft

**Input**: User description: "Ajouter un endpoint API, pour avoir les données des groupes d'action dans une zone géographique.

id, nom..."

## Why This Feature Exists

The public API can already return events for a territory and resolve a human query to a
commune, a department, an action group or an intercommunal authority. It cannot answer the
simpler upstream question those journeys depend on: **which action groups exist in this
territory?**

Today a consumer who knows a territory must either search by name, which only returns groups
whose name happens to match the query, or read a calendar of events and infer organizers from
it. There is no way to enumerate the groups present in an area, so a map-style or
"groups near me" experience has no public read to build on, and a group with no upcoming event
is invisible even though it exists.

This feature adds one public read: given a geographic area, return the action groups located
in it, each identified by its stable identity and published name. The read is a catalogue
read, not an event read: it describes which groups are there, never what they organize.

## Clarifications

### Session 2026-11-18

- Q: How is a geographic area expressed, and how does a group belong to it? → A: The existing geographic rules apply unchanged (see [002](../002-geographic-enrichment/spec.md), [003](../003-icalendar-filtered-feed/spec.md), [008](../008-intercommunal-calendar/spec.md)): the area is expressed with `country`, `department`, commune (`insee_commune` / `commune_name`) and `epci` criteria, with the same identifier formats, AND across dimensions, OR within one parameter, and the same validation. A group belongs to the area through its own resolved administrative attachment (country, department, commune), established from its own stated location with the same reference rules used for events, and resolved against the active territory data version. Membership is never inferred from the events a group organizes.
- Q: Which action groups are eligible for the listing? → A: Only groups the system publicly lists on the map and whose retrieval is active. Unlisted, inactive and removed groups are excluded, and their exclusion is counted.
- Q: What does each returned group carry besides `id` and `nom`? → A: Identity, published name, location context (country, department and commune when resolved, plus published coordinates when present) and the group's own calendar reference, so a consumer can present the group and link to its calendar without another lookup.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - List the action groups of a territory (Priority: P1)

A consumer asks the API for the action groups of a geographic area and receives each group
once, with its stable identity, its published name and the location context that explains why
it belongs to that area, so it can present the groups of that area without knowing any of them
beforehand.

**Why this priority**: Enumerating the groups of an area is the whole feature. Without it the
endpoint has no reason to exist, and every other story only refines this result.

**Independent Test**: Prepare groups with known attachments inside and outside one area, request
that area, and verify that exactly the inside groups are returned, each once, with a
non-empty identity, name and location context.

**Acceptance Scenarios**:

1. **Given** several groups located inside a requested area, **When** a consumer requests that
   area, **Then** each of those groups is returned once with its stable identity, its published
   name and the location context that placed it inside the area.
2. **Given** groups located outside the requested area, **When** the same area is requested,
   **Then** none of those groups is returned.
3. **Given** an area that contains no group, **When** it is requested, **Then** the answer is a
   valid empty listing, not an error and not a neighboring area.
4. **Given** a group whose published name changes, **When** the area is requested again,
   **Then** the new name is returned and the identity is unchanged.

---

### User Story 2 - Trust the area boundary (Priority: P2)

A consumer relies on the listing to decide which groups to show for a territory, so a group
must be returned only when its own resolved attachment satisfies every requested criterion, and
the answer must say which territory and data version it was computed against.

**Why this priority**: A listing that silently includes distant or unlocated groups is worse
than no listing, because it presents wrong suggestions with the authority of an empty
alternative. Boundary honesty is what makes the read usable.

**Independent Test**: Seed groups attached just inside and just outside an area, a group with no
usable attachment, and a group in the neighboring area; request the area and verify each case is
handled as specified and that the answer names the territory and data version it used.

**Acceptance Scenarios**:

1. **Given** a group whose administrative attachment is missing or unusable, **When** its area
   is requested, **Then** the group is not returned and the omission is recorded as a
   data-quality gap.
2. **Given** a group whose resolved attachment is just outside the area, **When** the area is
   requested, **Then** the group is not returned.
3. **Given** an area identifier that is unknown in the active territory data, **When** it is
   requested, **Then** the request is rejected as invalid rather than answered with a broad or
   empty listing.
4. **Given** an `epci` criterion and an active EPCI reference, **When** it is requested,
   **Then** only groups whose resolved commune is a current member of that territory are
   returned, once each.
5. **Given** the active territory data is unavailable, **When** an area is requested,
   **Then** the answer is an explicit unavailable response and never a stale or partial listing.
6. **Given** any successful answer, **When** it is read, **Then** it states the territory and
   the data version the result was computed against.

---

### User Story 3 - Consume large areas predictably (Priority: P3)

A consumer lists a dense territory, pages through the result, and must never see a group twice
or miss one between pages, while operators can see how many groups exist in that area.

**Why this priority**: Dense areas are the realistic case for cities. Instability across pages
silently duplicates or hides groups, and only appears at the worst moment.

**Independent Test**: Seed more groups than one page in a single area, read every page, and
verify the union equals the expected set exactly once, that the reported total matches, and
that repeated reads of an unchanged area are stable.

**Acceptance Scenarios**:

1. **Given** an area holding more groups than one page, **When** a consumer reads successive
   pages, **Then** every group appears exactly once across the pages and the reported total is
   the number before paging.
2. **Given** two reads of the same unchanged area, **When** they are compared, **Then** the
   order is identical.
3. **Given** a requested page size outside the supported range, **When** it is requested,
   **Then** the request is rejected with a diagnosable validation answer.

---

### Edge Cases

- A commune name exists in several departments and no department criterion narrows it: the
  existing ambiguity rule applies unchanged.
- A group states a country that the requested French area cannot contain: it is never returned
  for that area.
- A group is known but has stopped being publicly listed or active: it is excluded from the
  listing and counted, with no silent inclusion.
- An area identifier is malformed or unknown in the active territory data: rejected as invalid,
  never answered as "no group".
- Several area identifiers are supplied in one request: values inside one parameter combine
  with OR and distinct parameters combine with AND, exactly as in the existing geographic reads,
  so the result is never widened unexpectedly.
- The same group would match several selected communes of one parameter: it is returned once.
- The same group would match both a commune and its department: it is returned once.
- A group's stated coordinates are malformed or outside valid ranges: treated as unusable,
  never guessed, and never used to place the group.
- The territory data is refreshed between two pages: the consumer is never given a page computed
  against a different data version without being told.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST expose a public, read-only listing of action groups for a
  geographic area, with no visitor identity or credential required.
- **FR-002**: The listing MUST accept the project's existing geographic area criteria —
  `country`, `department`, commune by INSEE code and by name, and `epci` — with the same
  identifier formats, the same value combination rules (OR inside one parameter, AND across
  distinct parameters), and the same validation as the existing geographic reads, and MUST
  reject any criterion it does not support.
- **FR-003**: A group MUST be returned only when its own resolved administrative attachment
  matches every supplied area criterion; that attachment MUST be established from the group's
  own stated location with the same reference rules and active territory data version used for
  events, and MUST NOT be inferred from the events the group organizes or from another group.
- **FR-004**: Each returned group MUST carry a stable identity and the display name the system
  publishes for it; neither may be empty.
- **FR-005**: Each returned group MUST carry the location context that placed it in the area
  (country, department and commune when resolved, published coordinates when present) and the
  group's own calendar reference, and no internal operational field.
- **FR-006**: The listing MUST return a group at most once, whatever the number of area criteria
  it matches.
- **FR-007**: The listing MUST order groups deterministically and expose a total computed before
  paging, so that paging never duplicates or omits a group.
- **FR-008**: The listing MUST bound the number of groups returned per answer and MUST reject an
  unsupported page size or offset with a diagnosable validation answer.
- **FR-009**: An area with no matching group MUST answer with a valid empty listing, never a
  neighboring area, a relaxed criterion, or an error.
- **FR-010**: A malformed, unsupported or unknown area criterion MUST be rejected with a
  diagnosable validation answer rather than answered broadly.
- **FR-011**: A group whose administrative attachment cannot be established MUST be excluded
  from every area listing and counted as a data-quality gap, never placed by guesswork.
- **FR-012**: Only groups that the system publicly lists on the map and whose retrieval is active
  MUST be eligible; unlisted, inactive and removed groups MUST be excluded and their exclusion
  MUST be observable.
- **FR-013**: Each successful answer MUST state the area criteria and the territory data version
  it was computed against, as the existing geographic reads do.
- **FR-014**: When the territory data or the EPCI membership needed to resolve an area is
  unavailable, the system MUST answer with an explicit unavailable response and MUST NOT serve a
  stale, partial or unrelated listing.
- **FR-015**: The listing MUST be additive: existing public reads keep their current behaviour
  and contract.
- **FR-016**: The listing MUST preserve the canonical terminology of the project: the machine
  value is `group`, and no human-readable French label appears as a machine value.

### Key Entities

- **Action Group**: A group the calendar tracks, holding a stable identity, a published display
  name and a public listing state. It is the item this feature enumerates.
- **Group Administrative Attachment**: The country, department and commune a group's own stated
  location resolves to, with the same reference rules and data version used for events, plus the
  coordinates the source publishes, if any. It is the only input that decides whether the group
  belongs to an area.
- **Geographic Area**: The territory a consumer asks for, expressed with the project's existing
  geographic criteria (country, department, commune, EPCI), resolved against the active territory
  data. It carries no other meaning and is never inferred from the consumer's location.
- **Territory Data Version**: The active version of the geographic reference used to resolve an
  area and a group's attachment. It gives the answer its identity and makes two answers
  comparable.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A consumer can obtain the complete list of action groups of a territory in a
  single request, identifying every group by identity and name, with no additional lookup.
- **SC-002**: Across a sample of at least 200 returned groups spread over several territories,
  100% have an administrative attachment that satisfies every supplied criterion, and none
  belongs to a neighboring one.
- **SC-003**: A territory with no group answers with an empty, valid listing in 100% of cases,
  with no error and no unrelated group.
- **SC-004**: A consumer receives the listing of a territory holding up to 500 groups in under
  one second.
- **SC-005**: Paging through a territory never duplicates or omits a group across pages, verified
  on at least one territory larger than one page.
- **SC-006**: Every group excluded for lack of a resolvable attachment is accounted for in
  operator reporting, so the difference between "no group here" and "unknown attachment" is
  always explainable.
- **SC-007**: Two consecutive answers for the same unchanged territory are identical in content
  and order.

## Assumptions

- The public read is unauthenticated, returns JSON, and is pageable with a default page size of
  50 and a maximum of 200; the exact path, paging mechanism and caching header belong to
  planning and to the contract file, and follow the other public reads of the project.
- Only map-listed active groups are eligible; the directory already records both facts per group,
  so eligibility needs no new source.
- **Group attachment comes from the stated address**, exactly as for an event. The upstream group
  detail resource states the same `location` object as an event (`country`, `departement`,
  `city`, `zip`, `commune.name`, `coordinates`), so a group is enriched by the same rules, the
  same reference data and the same code. No second geographic model exists, and no coordinate
  geometry is introduced. A group whose address resolves to nothing usable stays unattached and
  is counted; this specification forbids guessing.
- The group catalogue listing states no address, only coordinates and a country, so the address
  is read from the group detail resource during enrichment and kept with the group.
- Group coordinates, when the source publishes them, are kept only as presentation context; an
  invalid pair is dropped, never repaired.
- The geographic criteria and their validation are reused as-is from the existing geographic
  reads; the feature adds no criterion and no separate territory dataset. Where those reads
  differ, the event list read wins for rejection: a malformed, unsupported or unknown criterion
  is an error, while an area known to the reference but holding no group answers with an empty
  listing.
- An area request supplies at least one supported criterion; a request with none is invalid
  rather than "every group everywhere".
- The listing is additive and does not alter the calendar feed, the event list, the subject
  search, or the meaning of their criteria.
- A cached answer never outlives the territory data version it was computed against.
