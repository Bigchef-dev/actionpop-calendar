# Feature Specification: Filtered iCalendar Feed

**Feature Branch**: `003-icalendar-filtered-feed`

**Created**: 2026-10-28

**Revised**: 2026-10-28 (experimental metadata properties added)

**Status**: Draft

**Input**: User description: "Tu dois fournir une api qui : à partir d'une url GET - Peut prendre en paramètre get, nom de commune, - Le format de données en sortie : iCalendar (RFC 5545) `department=69&insee_commune=69123,69124&event_type=tractage.... (regarder les autres specs si besoin d'informations) - Documenter dans le scalar (regarder le readme) - Si il y a des choix d'implémentation, me référer"

## Clarifications

### Session 2026-10-28

- Q: How do users select communes by name versus by INSEE code? → A: `commune_name` accepts one or more commune names matched exactly after normalization; `insee_commune` accepts a comma-separated list of INSEE codes. Values inside one criterion combine with OR, and different criteria combine with AND.
- Q: What happens when a supplied commune name matches several communes? → A: The request is rejected with an actionable diagnostic asking for a `department` or `insee_commune` selection instead of returning an arbitrary commune.
- Q: Which events belong to the calendar? → A: Every published event matching the criteria whose period overlaps a bounded window of one month in the past and three months in the future, without a pagination parameter.
- Q: What is the public URL shape of this calendar? → A: A dedicated read-only route `GET /calendar.ics`, separate from the existing group feed and JSON event list.
- Q: How are multiple event types selected? → A: `event_type` accepts a comma-separated list and values combine with OR inside that criterion.
- Q: Should the country remain filterable? → A: Yes, the optional `country` criterion is supported for symmetry with the existing geographic filter contract.
- Q: Do `commune_name` and `insee_commune` combine with AND or OR? → A: OR, because both express the same "commune" dimension: an event matches when it belongs to a selected commune by name or by INSEE code. Criteria of different dimensions still combine with AND.
- Q: Which operational settings must be adjustable, and how? → A: Every calendar setting (window offsets, entry ceiling, group ceiling, revalidation period, route exposure, metadata level) MUST be adjustable through deployment configuration with documented defaults and a fail-fast message naming an invalid value, without a code change or rebuild; existing hard-coded values MUST be moved into that configuration when necessary.
- Q: Which metadata families are exposed by default? → A: Identity, event type, source URL and contributing groups. Geography, enrichment diagnostics and raw source values are only exposed at the full level, so the default calendar stays reconciliation-oriented without publishing enrichment internals.
- Q: What is the property prefix? → A: `X-ACTIONPOP-`, uppercase, followed by the concern (`EVENT-ID`, `GEO-STATUS`, …).
- Q: How are multi-valued metadata expressed? → A: As repeated properties, one occurrence per value, rather than a single escaped list.
- Q: How many group properties may one entry carry? → A: At most five by default, selected deterministically, with the limit adjustable through configuration.
- Q: Where does calendar configuration live? → A: In one human-editable YAML file supplied with the deployment, holding the whole application configuration (calendar, storage, queue, upstream), not only the calendar settings; secrets, tokens and credential-bearing endpoints remain in environment variables.
- Q: Which source wins when the file and the environment both set the same value? → A: The environment wins, so a deployment can override a file value without editing it, and the merged result is validated before the service starts.
- Q: Is geography metadata part of the standard level? → A: No. The standard level carries identity, event type, source page and groups only; geography, diagnostics and raw source values stay at the full level.
- Q: How is an event's revision exposed when its content hash is unavailable? → A: Through the event's last update timestamp together with its stable identifier and its last processing period token, so the identity family needs no hash.
- Q: Should standard calendar properties also be emitted? → A: Yes: `LOCATION`, `URL`, `CATEGORIES` and `GEO` are emitted from the event's own data, so calendar clients display entries natively while the `X-` properties carry the machine-readable metadata.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Subscribe to a filtered calendar (Priority: P1)

As a calendar user, I want to open a single URL that contains only the events taking place in a given department, commune or event type, so that I can subscribe to it from my usual calendar application and see relevant events without any manual selection.

**Why this priority**: Delivering a ready-to-subscribe, geographically filtered calendar is the whole purpose of the feature and the smallest slice that provides value.

**Independent Test**: Seed events across several departments, communes and event types, request the calendar URL with `department=69&event_type=tractage`, and verify that every returned event matches both criteria once and that the payload is accepted by a standard calendar client.

**Acceptance Scenarios**:

1. **Given** events in several departments, **When** the user requests the calendar with one department, **Then** only events attached to that department are present.
2. **Given** events of several types, **When** the user requests the calendar with one event type, **Then** only events of that type are present.
3. **Given** several criteria, **When** the user requests the calendar, **Then** each returned event satisfies every supplied criterion.
4. **Given** an event linked to several groups, **When** it matches the criteria, **Then** it appears exactly once in the calendar.
5. **Given** a request with no criterion, **When** the calendar is produced, **Then** it contains every event eligible for the calendar inside the time window, each once.

---

### User Story 2 - Select communes by name or by INSEE list (Priority: P1)

As a calendar user, I want to filter by commune name or by a list of INSEE codes, so that I can follow a specific town by its familiar name or subscribe to several towns at once.

**Why this priority**: Commune selection is the most precise expression of the use case and the reason the requested example combines a department, several INSEE codes and an event type.

**Independent Test**: Seed events in communes `69123` and `69124` plus another commune in department 69, request `insee_commune=69123,69124`, and verify that only the two requested communes are returned, once each.

**Acceptance Scenarios**:

1. **Given** events in several communes, **When** the user requests `insee_commune=69123,69124`, **Then** only events of communes `69123` and `69124` are returned.
2. **Given** a commune name that matches exactly one commune of the supplied department, **When** the user requests that name and department, **Then** that commune's events are returned.
3. **Given** a commune name that matches several communes and no department or INSEE selection, **When** the user requests that name, **Then** the request is rejected with a diagnostic naming the ambiguity.
4. **Given** a department and a list of INSEE codes belonging to it, **When** the user requests both, **Then** only events matching both criteria are returned.
5. **Given** a commune name and an INSEE code that designate different communes, **When** the user requests both, **Then** events of either selected commune are returned, because the two criteria express the same dimension.
6. **Given** INSEE codes and department codes with leading zeroes or letters, **When** the user requests them, **Then** the codes are interpreted exactly as supplied, without numeric conversion.

---

### User Story 3 - Understand and try the calendar endpoint from the reference (Priority: P2)

As a developer or integrator, I want the filtered calendar endpoint, its parameters and the shape of its response to be described in the interactive API reference, so that I can build and verify a request without reading source code.

**Why this priority**: The endpoint is only usable at scale when its contract is discoverable and cannot drift from the implementation.

**Independent Test**: Open the interactive reference and confirm that the calendar route, every filter parameter, their string nature with examples, their combination rules and the calendar response type are documented and executable.

**Acceptance Scenarios**:

1. **Given** the reference page is opened, **When** the user looks for the calendar route, **Then** the route, its parameters and its response are described.
2. **Given** the documented example request, **When** the user executes it from the reference, **Then** a calendar payload is returned.
3. **Given** a parameter removed from or renamed in the contract, **When** the documentation is checked, **Then** the contract check fails.

---

### User Story 4 - Receive a valid calendar even when nothing matches (Priority: P2)

As a calendar user, I want an empty but valid calendar when no event matches, so that my calendar subscription stays healthy and a typo in a code is not mistaken for a broken service.

**Why this priority**: Calendar clients must be able to parse every response; a syntactically valid empty calendar is the difference between a silent empty subscription and a client-side error.

**Independent Test**: Request a well-formed filter that matches no event and verify a successful, importable calendar with zero entries; then request a malformed filter and verify an actionable rejection.

**Acceptance Scenarios**:

1. **Given** a well-formed filter that matches no event, **When** the calendar is requested, **Then** a successful empty calendar is returned.
2. **Given** an unknown but well-formed department or INSEE code, **When** the calendar is requested, **Then** a successful empty calendar is returned.
3. **Given** a malformed or unsupported parameter, **When** the calendar is requested, **Then** the request is rejected with a diagnostic naming the field and the cause.
4. **Given** a write method is attempted on the calendar route, **When** it is sent, **Then** the request is rejected as read-only.

---

### User Story 5 - Tune the calendar from the shared configuration file without a code change (Priority: P2)

As an operator, I want to adjust how far the calendar looks back and ahead, how many entries or groups it may carry, how long clients may reuse a calendar, whether the route is exposed and which metadata it carries, from the same YAML file that configures the rest of the application, so that I can adapt the service without rebuilding or redeploying code and without hunting for environment variables.

**Why this priority**: A fixed window and a fixed exposure policy turn an operational tuning question into a release, which slows every adjustment and risks an unbounded or unusable calendar.

**Independent Test**: Change the lookback and lookahead settings in the YAML file, restart the service, request the calendar, and verify that the returned window follows the new values without any code modification; then override one of them with an environment variable and verify the environment value wins; finally set an invalid value and verify that startup fails with a message naming the setting.

**Acceptance Scenarios**:

1. **Given** the documented defaults, **When** the calendar is requested, **Then** it covers one month in the past and three months in the future.
2. **Given** a deployment that sets different lookback and lookahead values in the file, **When** the calendar is requested, **Then** the returned window uses those values.
3. **Given** an environment variable and a file entry set the same setting, **When** the service starts, **Then** the environment value is applied and the file is left unchanged.
4. **Given** the metadata level is configured in the file, **When** the calendar is requested, **Then** entries follow that level.
5. **Given** an entry ceiling is configured and more events match, **When** the calendar is requested, **Then** at most that many entries are returned and the truncation is observable to the operator.
6. **Given** a deployment that disables the calendar route, **When** the route is requested, **Then** it is reported as unavailable while the group feed and JSON event list keep working.
7. **Given** an invalid setting such as a negative offset or a non-numeric ceiling, **When** the service starts, **Then** startup fails with a message naming the setting, its source and the reason.

---

### User Story 6 - Reconcile and triage events through metadata (Priority: P3)

As an integrator or operator, I want each calendar entry to carry the event's stable identity, its type, its source page and its contributing groups as experimental properties, so that I can deduplicate and reconcile entries without calling another interface, and to reach the richer geographic and diagnostic metadata only when I ask for it.

**Why this priority**: The calendar is already usable without it, but reconciliation and support work become manual and error-prone when entries expose no machine-readable provenance.

**Independent Test**: Fetch the same calendar twice across two ingestion periods and verify that the identity property is unchanged, that the observation properties reflect the latest processing period and update timestamp, that the full level adds the geographic and diagnostic properties, and that a third-party calendar client still imports the calendar without error.

**Acceptance Scenarios**:

1. **Given** the default metadata level, **When** the calendar is requested, **Then** each entry carries its identity, its observation timestamp and period, its event type, its source page and one property per contributing group, up to the configured maximum.
2. **Given** the full metadata level, **When** the calendar is requested, **Then** each entry additionally carries its geographic status, country, department, INSEE commune, reference version, diagnostic summary and diagnostics.
3. **Given** the metadata exposure level is set to identity only, **When** the calendar is requested, **Then** entries carry only the identity properties and no type, source, group, geographic or diagnostic properties.
4. **Given** the metadata level is disabled, **When** the calendar is requested, **Then** entries carry no experimental properties while remaining valid calendars.
5. **Given** a value containing commas, semicolons, colons, backslashes or line breaks, **When** the calendar is requested, **Then** the entry stays parseable by a standard calendar client.
6. **Given** an event with an address and coordinates, **When** the calendar is requested, **Then** the entry carries standard location, source, category and coordinate properties that the client can display natively.

---

### Edge Cases

- An event has an end time equal to or earlier than its start time; the calendar entry must remain valid.
- An event title, description or location contains commas, semicolons, backslashes, line breaks or non-ASCII characters.
- A single event description is longer than the line length allowed by RFC 5545.
- An event has no description, no usable location, or no event type.
- Two events share the same title and the same start time.
- `insee_commune` contains an empty item, whitespace, duplicates, or a code absent from the reference.
- `commune_name` contains accents, articles, punctuation, mixed case or extra whitespace.
- A commune is selected both by name and by INSEE list.
- An event starts before the lookback boundary but ends inside the window, or starts inside the window and ends after the lookahead boundary.
- The matching set exceeds the configured entry ceiling.
- The window settings are changed while clients are already subscribed.
- A metadata value contains a comma, semicolon, colon, backslash or line break.
- An event carries several diagnostics, or several contributing groups.
- An event has no event type, no source URL or no geographic attachment; the corresponding properties are absent.
- A calendar client rewrites entry identities but keeps experimental properties.
- The metadata exposure level is lowered while clients are already subscribed.
- A future enrichment status or diagnostic code appears before the contract documents it.
- An event is updated upstream between two calendar requests.
- The geographic reference version changes between two calendar requests.
- The calendar is requested with an unsupported parameter such as `region`, `epci` or coordinates.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST expose a read-only GET endpoint that returns matching events as an iCalendar document.
- **FR-002**: The endpoint MUST accept the optional filter criteria `country`, `department`, `commune_name`, `insee_commune` and `event_type`.
- **FR-003**: The system MUST combine different supplied criteria with AND semantics, so an event is returned only when it satisfies every criterion.
- **FR-004**: The system MUST accept comma-separated lists for `insee_commune` and `event_type`, ignore surrounding whitespace, and combine the values of a single criterion with OR semantics.
- **FR-005**: The system MUST accept one or more commune names in `commune_name`, comma-separated, and match each name exactly after normalization of case, accents, punctuation and whitespace against the active commune reference or its pronoun-free alias, without fuzzy or approximate matching.
- **FR-006**: The system MUST use `department` to disambiguate a commune name, and MUST reject an ambiguous name with a diagnostic that suggests supplying `department` or `insee_commune`, instead of choosing arbitrarily or skipping the criterion.
- **FR-007**: The system MUST treat geographic and event-type identifiers as strings, preserving leading zeroes and alphanumeric department codes such as `2A` and `2B`, and MUST NOT coerce them to numbers.
- **FR-008**: The system MUST include in the calendar every published event matching the criteria whose period overlaps the calendar window, each event exactly once even when several link records match.
- **FR-009**: The system MUST produce an RFC 5545 compliant calendar document with one entry per matching event and a stable event identity that remains the same across requests and reference changes.
- **FR-010**: Each calendar entry MUST carry a title, a start, an end, a modification timestamp and a sequence value.
- **FR-043**: Each calendar entry MUST carry the event venue as one line in the standard location property, formatted as the place name followed by the postal address, MUST NOT repeat a locality the street line already states, MUST fall back to the short address, then to the flattened full address, then to the place name alone, and MUST omit the property when the source states no location.
- **FR-044**: The system MUST persist the event location stated by the source, including its coordinates, under a stable event-scoped key, MUST update that record when the address changes, and MUST remove it when the source stops stating a location.
- **FR-045**: The calendar read path MUST serve the latest complete published event state matching the criteria even when the ingestion worker is stopped, delayed or has no currently successful cycle. A worker state, queue state or freshness timeout MUST NOT turn already-published matching events into an empty calendar.
- **FR-046**: An event marked cancelled MUST remain available to the read path while it overlaps the configured calendar window, and MUST be emitted with an explicit cancelled status. Once outside the window it MUST remain queryable in historical storage without being emitted by the public calendar.
- **FR-047**: A failed or incomplete ingestion observation MUST leave the latest complete published state unchanged; it MUST NOT remove an event or replace it with an empty snapshot.
- **FR-011**: The system MUST represent event times in the canonical project timezone and MUST serialize them in UTC so that calendar clients in any timezone see the same instant.
- **FR-012**: The system MUST escape text values and fold long lines as required by RFC 5545, and MUST use CRLF line endings, so that entries with punctuation, line breaks or non-ASCII content remain importable.
- **FR-013**: The system MUST emit a valid calendar with zero entries, and a successful response, when a well-formed filter matches no event.
- **FR-014**: The system MUST reject malformed values, empty list items and unsupported parameters with a diagnostic naming the field and the cause, and MUST reject region, EPCI, constituency and coordinate parameters.
- **FR-015**: The system MUST serve the calendar with the calendar media type and UTF-8 character encoding and MUST identify the resource as an inline downloadable calendar.
- **FR-016**: The system MUST reject write, update and delete methods on the calendar route.
- **FR-017**: The system MUST allow calendar clients to revalidate a previously retrieved calendar without downloading it again when it has not changed.
- **FR-018**: The system MUST document the route, all filter parameters, their string representation, their combination rules, the example `department=69&insee_commune=69123,69124&event_type=tractage` and the calendar response in the interactive API reference generated from the running service, and a contract check MUST fail when the document no longer matches.
- **FR-019**: The system MUST keep calendar generation independent from the group-scoped feed so that a failure of one does not make the other unavailable.
- **FR-020**: The system MUST expose the calendar publicly and read-only, consistent with the existing public read-only surface.
- **FR-021**: The system MUST serve the filtered calendar at `GET /calendar.ics`, independent of the group-scoped feed and of the JSON event list.
- **FR-022**: The system MUST treat `commune_name` and `insee_commune` as one commune dimension whose supplied values combine with OR, while criteria of different dimensions combine with AND.
- **FR-023**: The system MUST bound the calendar to a window of one month in the past and three months in the future by default, and MUST include an event when it overlaps that window, that is when its end is not before the lookback boundary and its start is not after the lookahead boundary.
- **FR-024**: The system MUST read every calendar setting, including the lookback offset, the lookahead offset, the maximum number of entries, the group ceiling, the client revalidation period, the route exposure and the metadata level, from one human-editable YAML configuration file that also holds the rest of the application configuration, each with a documented default.
- **FR-025**: The system MUST validate the merged configuration at startup and MUST fail fast with a message naming the offending setting, whether it came from the file or the environment, and the reason, instead of serving a calendar with an unintended window.
- **FR-026**: The system MUST apply a changed setting after a restart without requiring a code change, a rebuild or a new release, and MUST ship a complete commented example of the YAML file that lists every setting and its default.
- **FR-027**: The system MUST enforce the configured maximum number of entries when more events match, and MUST make the truncation observable to the operator rather than silently shortening the calendar.
- **FR-028**: The system MUST keep the calendar, the group-scoped feed and the JSON event list available independently, so that disabling or failing one of them leaves the others operational.
- **FR-029**: The system MUST centralize every calendar setting in that single YAML file, moving hard-coded calendar values into it when necessary, so that a new tunable does not require touching request handling code, and MUST keep credentials, tokens and credential-bearing endpoints out of the file.
- **FR-041**: The system MUST let an environment variable override the corresponding file setting, with the environment taking precedence, and MUST leave the file unchanged when it does.
- **FR-042**: The system MUST keep the API and the worker reading the same YAML file and the same override rules, so a single configuration file governs both runtimes.
- **FR-030**: The system MUST attach experimental metadata to each calendar entry using properties whose names begin with `X-ACTIONPOP-` in uppercase, and MUST NOT repurpose, rename or overload standard calendar properties to carry that metadata.
- **FR-031**: The system MUST organize metadata into families: identity (source event identifier, last update timestamp and last processing period token), classification (event type), provenance (source page and contributing groups), geography (geographic status, country, department, INSEE commune and reference version), diagnostics (summary plus individual diagnostics) and raw source values.
- **FR-032**: The system MUST expose metadata through four levels: disabled, identity, standard and full, where identity carries only identity, standard adds classification and provenance, and full adds geography, diagnostics and raw source values; the default level MUST be standard.
- **FR-033**: The system MUST let an operator change the metadata level, and enable or disable an individual metadata family independently of the level, through the same configuration file as the other calendar settings.
- **FR-034**: The system MUST write every metadata value as escaped calendar text and MUST emit a repeated property for each value of a multi-valued family, so that a value containing a comma, semicolon, colon, backslash or line break cannot break the entry.
- **FR-035**: The system MUST omit a metadata property whose value is unknown, rather than emitting an empty or placeholder value.
- **FR-036**: The system MUST keep the event identifier property unchanged across updates, geographic reference changes and repeated ingestion, and MUST expose the last update timestamp and last processing period token as observation metadata that reflects the latest successful ingestion rather than content equality.
- **FR-037**: The system MUST emit the standard properties `LOCATION`, `URL`, `CATEGORIES` and `GEO` from the event's own published data, MUST omit each of them when the event does not provide the corresponding data, and MUST keep them independent of the metadata level.
- **FR-038**: The system MUST NOT expose credentials, tokens, personal data or internal storage identifiers beyond the identifiers already published by the event and its group.
- **FR-039**: The system MUST bound the number of group properties emitted for one entry to a configurable maximum, defaulting to five, MUST select the retained groups deterministically, and MUST make the truncation observable to the operator.
- **FR-040**: The system MUST document the metadata property names, their permitted values, their level and their stability guarantees, together with the emitted standard properties, in the interactive API reference, and a contract check MUST fail when the emitted properties no longer match the document.

### Metadata Model

Experimental properties are additive: a client that does not know them ignores them, so they never change how an entry is displayed. Every value is escaped calendar text; absent values are omitted. Multi-valued families repeat the property once per value.

| Property                           | Level    | Meaning                                                                                                                                                                  | Permitted values                                                                |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `X-ACTIONPOP-EVENT-ID`             | identity | Stable source identity of the event, identical to the entry identity                                                                                                     | Opaque source identifier                                                        |
| `X-ACTIONPOP-UPDATED-AT`           | identity | Last update timestamp of the event, in UTC                                                                                                                               | Calendar UTC timestamp                                                          |
| `X-ACTIONPOP-PERIOD`               | identity | Last processing period in which the event was observed                                                                                                                   | Period token                                                                    |
| `X-ACTIONPOP-EVENT-TYPE`           | standard | Event type label published by the source                                                                                                                                 | Event type label                                                                |
| `X-ACTIONPOP-SOURCE-URL`           | standard | Canonical source page of the event                                                                                                                                       | Absolute URL                                                                    |
| `X-ACTIONPOP-GROUP`                | standard | Group contributing the event, repeated once per group                                                                                                                    | Group identifier                                                                |
| `X-ACTIONPOP-GEO-STATUS`           | full     | Outcome of geographic enrichment                                                                                                                                         | `resolved`, `national`, `international`, `incomplete`, `invalid`, `unavailable` |
| `X-ACTIONPOP-COUNTRY`              | full     | Country retained or deduced by enrichment                                                                                                                                | Two-letter country code                                                         |
| `X-ACTIONPOP-DEPARTMENT`           | full     | Department linked to the event                                                                                                                                           | Department code as text, including leading zeroes and `2A`/`2B`                 |
| `X-ACTIONPOP-INSEE-COMMUNE`        | full     | Commune linked to the event                                                                                                                                              | INSEE code as text                                                              |
| `X-ACTIONPOP-GEO-REFERENCE`        | full     | Reference version used for the attachment                                                                                                                                | Reference version identifier                                                    |
| `X-ACTIONPOP-GEO-DIAGNOSTIC-COUNT` | full     | Number of enrichment diagnostics for the event                                                                                                                           | Non-negative integer                                                            |
| `X-ACTIONPOP-GEO-DIAGNOSTIC`       | full     | One enrichment diagnostic, repeated once per diagnostic; the code, field and severity travel as property parameters and the human-readable message as the property value | Diagnostic code, field, severity and message                                    |
| `X-ACTIONPOP-RAW-DEPARTMENT`       | full     | Department code exactly as stated by the source                                                                                                                          | Raw source value                                                                |
| `X-ACTIONPOP-RAW-COMMUNE`          | full     | Commune name exactly as stated by the source                                                                                                                             | Raw source value                                                                |

Standard properties are emitted in addition to the experimental ones, independently of the metadata level:

| Property     | Meaning                                                                                                              | Omitted when                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `LOCATION`   | Postal address of the event, preferring the full address, then the short address, then the city with its postal code | The event states no address     |
| `URL`        | Canonical source page of the event                                                                                   | The event states no source page |
| `CATEGORIES` | Event type label                                                                                                     | The event states no event type  |
| `GEO`        | Latitude and longitude of the event                                                                                  | The event states no coordinates |

A diagnostic therefore looks like `X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous;FIELD=location.commune.name;SEVERITY=warning:several communes match "Sainte-Colombe"`. Only the message is free text, so any message content stays safely escaped.

Properties are additive and optional; the calendar payload is valid at every level, including when no metadata is exposed.

### Key Entities _(include if data involved)_

- **Calendar Event**: A published event eligible for subscription, identified by its stable source identity, with title, description, start and end instants, sequence, timezone, event type, geographic attachment and optional source address.
- **Calendar Feed**: The RFC 5545 document produced for one request, with the selected events and the metadata needed by calendar clients to revalidate or update it.
- **Filter Criteria**: The set of optional criteria supplied by the user (country, department, commune names, INSEE codes, event types), their per-criterion OR semantics and their cross-criterion AND semantics.
- **Commune Reference Entry**: The official commune name, its pronoun-free alias and its INSEE code, used to resolve names and disambiguate homonyms.
- **Geographic Attachment**: The country, department and commune linked to an event by the geographic enrichment feature.
- **Calendar Settings**: The operator-controlled values that shape the calendar: lookback offset, lookahead offset, maximum entries, group ceiling, client revalidation period, route exposure and metadata exposure level, held in one configuration file, each with a documented default.
- **Configuration File**: The single YAML document that holds the application settings, including every calendar setting, together with the environment overrides applied on top of it and the validation outcome for the merged result.
- **Metadata Property**: An experimental entry property, prefixed for the project, that carries one piece of reconciliation, classification, provenance or diagnostic information, with a defined value domain, metadata level and stability guarantee.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A user can subscribe to a filtered calendar by pasting one URL into a standard calendar application, and the calendar imports without error.
- **SC-002**: For every filter combination exercised by the contract checks, 100% of returned events satisfy all supplied criteria and each event appears exactly once.
- **SC-003**: An event updated at the source is updated in place in the subscriber's calendar rather than duplicated, on the next refresh.
- **SC-004**: Users recover from a rejected request within one attempt by following the diagnostic that names the offending field.
- **SC-005**: The example request documented in the reference returns a calendar containing only the expected commune and event-type subset.
- **SC-006**: 95% of filtered calendar requests for up to 500 events complete within 2 seconds.
- **SC-007**: Calendars containing accented text, punctuation and long descriptions are parsed successfully by at least three widely used calendar clients.
- **SC-008**: The documented contract is verified automatically, so any drift between the reference and the running service is detected before release.
- **SC-009**: Changing the calendar window, entry ceiling, group ceiling, revalidation period or route exposure requires only a YAML edit or an environment override, plus a restart, with no code modification, and takes effect on the next request.
- **SC-010**: 100% of tested window boundaries behave as specified: an event overlapping the window is included, an event entirely outside it is excluded.
- **SC-011**: 100% of entries carry the identity metadata, and two fetches return identical identity values for every event while the observation properties follow the latest ingestion period.
- **SC-012**: Calendars exposing the full metadata set still import without error in at least three widely used calendar clients.
- **SC-013**: Switching the metadata exposure level requires only a configuration change and a restart, and each level returns exactly the documented properties.
- **SC-015**: A deployment that sets one setting in the file and the same setting in the environment observes the environment value, and an invalid value is reported with its origin before the service serves any request.
- **SC-014**: 100% of entries whose event states an address, a source page, an event type and coordinates expose the corresponding standard property, and entries missing that data expose none of them.

## Assumptions

- The calendar is a single-occurrence calendar: recurring events, reminders and alarms are out of scope and remain the responsibility of the calendar client.
- The calendar is not personalized: it does not depend on a user account, subscription record or group membership.
- The endpoint is cross-scope: it aggregates events from every group scope rather than restricting to one group.
- Geographic attachment and event-type validation reuse the rules defined by the geographic enrichment feature; this feature does not redefine enrichment semantics.
- Events outside France can be selected with the optional `country` criterion, which is included for symmetry with the existing geographic filter contract.
- Unknown but well-formed geographic codes produce an empty calendar rather than an error, consistently with the existing event filtering contract.
- Calendar entries are published, not scheduled: deleting an event from the source removes it from subsequent calendars but does not instruct clients to delete it retroactively.
- The active geographic reference is authoritative at request time; a reference change may change which events match a commune name criterion.
- The window defaults to one month in the past and three months in the future, and both offsets are expressed in whole days so that the boundary is unambiguous.
- The entry ceiling defaults to 1000 entries, which comfortably covers a departmental subscription while protecting the service from a global request.
- Client revalidation uses a configurable period whose default matches the existing calendar feed behaviour of fifteen minutes.
- Route exposure defaults to enabled, and disabling it affects only the filtered calendar.
- Settings are read from the YAML file and the environment at startup; a change requires a restart, which is acceptable because settings change rarely.
- The repository ships a commented YAML example with documented defaults, and the deployed copy may override any setting without a code change.
- Credentials, tokens and credential-bearing endpoints stay in environment variables, so the YAML file can be reviewed and versioned safely.
- The update timestamp and period token identify the last successful observation; they are not a content fingerprint, so consumers must compare event content rather than those values to detect a content change.
- Existing hard-coded calendar values (route exposure, revalidation period) and the current environment-only configuration may be refactored into the shared YAML file without changing observable behaviour, keeping environment overrides working.
- Experimental metadata is additive: clients that do not recognize it ignore it, so it never alters the displayed event.
- The `standard` level is the default because identity, type, source page and groups are enough to reconcile entries, while geography, diagnostics and raw source values stay opt-in at the full level.
- Geography remains reachable without a new endpoint, because the full level exposes it, so no calendar consumer is forced to widen the default public surface.
- Standard properties change how entries look in clients, which is intended: they display the real address, source link, type and position of the event instead of a bare title.
- The group property defaults to a maximum of five entries per event, sorted by group identifier, which keeps a heavily shared event readable while leaving the limit adjustable.
- Metadata values reuse the identifiers already published elsewhere, so exposing them does not widen the public data surface.
- Production traffic reaches the endpoint through HTTPS at the deployment edge, as for the existing public surface.
