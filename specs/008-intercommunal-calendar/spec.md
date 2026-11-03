# Feature Specification: Intercommunal Calendar Discovery

**Feature Branch**: `008-intercommunal-calendar`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Ajouter les intercommunalités : agir comme un item, « communauté de communes », dans la recherche ; permettre de faire un calendrier pour une communauté de communes, comme pour les villes et groupes d'action ; étudier toutes les étapes nécessaires à l'intégration ; demander les choix nécessaires."

## Why This Feature Exists

People often organize or look for actions at the level of an intercommunal authority rather
than a single municipality. The public calendar experience already lets a visitor discover
municipalities and action groups, but it does not offer the same entry point for an
intercommunal territory. This feature makes an intercommunal territory a first-class,
searchable calendar subject and preserves the same discovery, filtering, sharing, and
subscription experience.

## Scope

The feature covers the path from an intercommunal territory becoming searchable to its events
being displayed and its filtered calendar link being subscribed to:

1. Establish the authoritative identity, type, and member municipalities of each supported
   territory.
2. Make supported territories available as search suggestions and clearly label their type.
3. Resolve a selected territory into events associated with its member municipalities and
   eligible action groups, without duplicating events.
4. Apply existing event-type and action-group filters to the territory calendar.
5. Preserve the selected territory and filters in page state and generated calendar links.
6. Handle missing, ambiguous, inactive, or changed territory data without exposing a broken
   or unrelated calendar.

The first release does not create an editing workflow for intercommunal authorities and does
not change how municipalities or action groups are maintained.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find an intercommunal territory (Priority: P1)

A visitor searches by the name of an intercommunal territory and can distinguish it from a
city, department, or action group before selecting it.

**Why this priority**: Discoverability is required before an intercommunal calendar can
provide value.

**Independent Test**: Search for a known territory, select its suggestion, and verify that
the resulting page identifies the territory and loads its events.

**Acceptance Scenarios**:

1. **Given** a territory is active and searchable, **When** a visitor enters part of its name,
   **Then** the suggestion includes its name, intercommunal type, and geographic context.
2. **Given** a city and territory have similar names, **When** both match, **Then** each result
   is labeled by type and opens the corresponding scope when selected.
3. **Given** no territory matches, **When** the visitor submits the query, **Then** the
   experience explains that none was found and offers existing alternative searches.

### User Story 2 - View the territory calendar (Priority: P1)

A visitor selects a territory and sees one calendar containing events associated with its
member municipalities and eligible groups.

**Why this priority**: The territory must behave as a useful calendar subject, not merely a
search label.

**Independent Test**: Select a territory with events in two member municipalities and verify
that both appear while an event outside the territory does not.

**Acceptance Scenarios**:

1. **Given** a territory has events in multiple member municipalities, **When** it is selected,
   **Then** all matching events appear in one calendar named for that territory.
2. **Given** an event matches through more than one municipality or group, **When** displayed,
   **Then** it appears once with complete attribution.
3. **Given** a territory has no current events, **When** selected, **Then** an explanatory
   empty state is shown and the visitor can still subscribe for future events.

### User Story 3 - Filter and subscribe to the territory calendar (Priority: P1)

A visitor narrows a territory calendar by action type and/or action group, then obtains a link
that reproduces exactly what is displayed.

**Why this priority**: A broad territory becomes practical when a visitor can create a focused,
reusable agenda.

**Independent Test**: Select a territory, activate one action-type filter and one group filter,
reload the resulting link, and verify the same events and filters are restored.

**Acceptance Scenarios**:

1. **Given** several action types are present, **When** one is selected, **Then** only matching
   events remain visible and the active filter is explicit.
2. **Given** several action groups are present, **When** one or more are selected, **Then**
   only attributable events remain visible.
3. **Given** filters are active, **When** the visitor copies the territory link, **Then**
   opening it restores the same territory, groups, action types, and event set.
4. **Given** the visitor removes a territory or filter, **When** the page updates, **Then**
   the removed criterion is absent from both the display and generated link.

### User Story 4 - Survive territory-data changes (Priority: P2)

A visitor receives a clear result when a territory's name, membership, or availability changes
between discovery and use.

**Why this priority**: Administrative data changes must not silently produce an incorrect
calendar.

**Independent Test**: Use a renamed, inactive, ambiguous, or partially mapped territory and
verify the prescribed message and fallback behavior.

**Acceptance Scenarios**:

1. **Given** a territory is inactive, **When** a visitor searches, **Then** it is not offered
   as a new selectable result.
2. **Given** a shared link refers to an inactive or invalid territory, **When** opened, **Then**
   the issue is explained and the visitor is returned to the main search without unrelated
   events.
3. **Given** membership data is incomplete, **When** the calendar is prepared, **Then** the
   page does not claim complete coverage and exposes an actionable availability message.

### Edge Cases

- Homonymous territories include geographic context and stable identity in search results.
- A municipality belonging to multiple territories is evaluated independently per selection.
- A territory with no available events remains useful and subscribable.
- An event matching multiple groups appears only once.
- Membership changes affect results after the next data refresh.
- Accents, capitalization, and common abbreviations do not prevent useful matching.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain a searchable identity for every active supported
  intercommunal territory, including display name, type, geographic context, stable identity,
  and member municipalities.
- **FR-002**: Search MUST present an intercommunal territory as a distinct item type alongside
  existing city, department, and action-group items.
- **FR-003**: Search MUST match case, accents, and partial names with deterministic ordering.
- **FR-004**: Selecting a territory MUST open a calendar scope identified as that territory and
  MUST NOT silently substitute a city or action group.
- **FR-005**: The territory calendar MUST include each eligible event from current member
  municipalities and supported group associations, with each event appearing at most once.
- **FR-006**: The territory calendar MUST expose existing event-type and action-group filters.
- **FR-007**: Page state and generated links MUST preserve the territory and all active filters
  needed to reproduce the displayed event set.
- **FR-008**: Removing a territory or filter MUST update the display and generated link.
- **FR-009**: Inactive territories MUST be excluded from new suggestions; invalid or inactive
  shared references MUST show a clear recovery path.
- **FR-010**: Incomplete or conflicting membership data MUST be reported without presenting the
  affected calendar as fully complete.
- **FR-011**: Existing city, department, action-group behavior and links MUST remain compatible.
- **FR-012**: Tests MUST cover matching, duplicate prevention, empty calendars, invalid
  references, membership changes, and link round-tripping independently.
- **FR-013**: The first release MUST support all public intercommunal cooperation structures
  relevant to the territory catalogue, including communautés de communes, communautés
  d'agglomération, communautés urbaines, and métropoles, with each category labeled distinctly
  in search results.

### Key Entities

- **Intercommunal Territory**: An active or inactive administrative territory with stable
  identity, public name, type, geographic qualifier, and municipality membership.
- **Territory Membership**: A time-varying relation stating that a municipality belongs to a
  territory, including validity and data-quality status.
- **Search Subject**: A selectable item identifying subject kind, label, context, and calendar
  scope.
- **Territory Calendar Scope**: The resolved events and attributions represented by a territory,
  including filters used for sharing and subscription.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of searches for a known active territory return it in the first
  five suggestions after a distinctive three-character prefix.
- **SC-002**: A visitor can go from an empty search field to a loaded territory calendar in
  under 60 seconds during usability testing, without an internal identifier.
- **SC-003**: 100% of tested territory links with filters reproduce the same subject, filters,
  and event set after reopening.
- **SC-004**: 100% of events matching through multiple membership paths appear only once in
  the calendar and subscription feed.
- **SC-005**: At least 90% of test users distinguish a territory suggestion from a similarly
  named city.
- **SC-006**: Existing city, department, and action-group links pass compatibility tests
  unchanged.
- **SC-007**: Every tested invalid, inactive, ambiguous, or incomplete case produces a clear
  explanation and recovery action, with no unrelated events displayed.

## Assumptions

- The first release reuses existing search, event display, filtering, sharing, and
  subscription concepts.
- Official administrative reference data is authoritative for territory identity and
  municipality membership; refresh timing and provenance are defined during planning.
- Calendars use the project's canonical `Europe/Paris` timezone.
- Territories are public discovery subjects; no private access control is added.
- Multiple-territory membership is evaluated independently for each selected territory.
- Existing event and action-group attribution rules remain authoritative.
- Surveys, authority contacts, and authority editing are out of scope.

## Dependencies and Integration Stages

Planning MUST assess and sequence:

1. Supported territory categories and authoritative data source.
2. Stable identities, labels, membership validity, refresh behavior, and diagnostics.
3. Search catalogue integration without changing existing subject types.
4. Territory-to-event resolution and duplicate handling at the calendar boundary.
5. Page-state, filtering, sharing, and subscription contracts.
6. Empty, stale, ambiguous, and incomplete-data user states.
7. Unit, contract, integration, and compatibility tests.
8. Rollout, monitoring, refresh, and recovery procedures.
