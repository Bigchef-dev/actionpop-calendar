# Feature Specification: Reliable Event–Group Attribution During Ingestion

**Feature Branch**: `004-event-group-attribution`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Je souhaite refactor la mise à jour des événements action populaire. J'ai remarqué que : des groupes n'étant pas sur la carte, peuvent faire des événements (groupe non répertorié) ; des événements sont sans groupes d'action, rare mais ça arrive. Faire un ensemble de propositions, et me poser les questions pour les choix d'implémentation."

## Why This Feature Exists

The calendar updates events by asking the source, one group at a time, for the upcoming events of groups listed on the public map. Every retrieved event is then attributed to the group that was queried, and the group identifiers the source states for the event are discarded.

Two observed situations break that assumption:

1. **Groups that are not on the map still organize events.** Since discovery only covers map-listed groups, such a group is invisible as an organizer, its events reach the calendar only by accident of another group's listing, and it is attributed to the wrong group when it is fetched.
2. **Some events state no organizing group at all.** They are rare, but they have no correct attribution and no explicit "no group" signal, so consumers cannot tell a genuinely unattributed event from a mis-attributed one.

The purpose of this refactor is to make the attribution of an event to its groups reproduce what the source states, to keep events visible whatever their group situation, and to make both gaps observable to operators instead of silent.

## Proposals

Each proposal below records a decision taken with the requester on 2026-10-29. The rejected options stay documented so the trade-off remains visible during planning.

### P-ATTRIBUTION — Where does an event's group membership come from?

**Decision: A — the source-stated group set, unioned across complete observations.**

| Option | Proposal | Consequence |
| ------ | -------- | ----------- |
| A | Membership is the set of groups the source states for the event, unioned across every complete observation of that event; the group listing that returned the event is kept only as retrieval provenance. | Attribution matches reality, is independent of the query path, and stays stable when the same event is seen through several groups. |
| B | Membership is the union of the stated groups and the group listing that returned the event. | Nothing is lost when the source omits groups, but a group that merely displays another's event becomes an organizer. |
| C | Membership remains the group listing that returned the event, and unlisted groups are only reported for repair. | Smallest change, but the reported defect is not fixed and attribution stays query-dependent. |

### P-DISCOVERY — What happens to a group discovered outside the map?

**Decision: B — the unlisted group becomes an ingestion scope from the next dispatch cycle.**

| Option | Proposal | Consequence |
| ------ | -------- | ----------- |
| A | The group is registered as an unlisted group with the name the source states, kept distinct from listed and from inactive groups, and never ingested on its own until an operator opts in. | Events reach the calendar only through listings already ingested; the organizer is named correctly; the ingestion workload stays bounded and predictable. |
| B | The group is registered as an unlisted group, with the name the source states and the moments it was first and last observed, and becomes an ingestion scope from the next dispatch cycle onward, with the same eligibility rules as a listed active group. | Coverage widens automatically, including for events no other listing exposes. The run cost now grows with discovery, and a discovered listing can itself reveal further groups, so cascading discovery and groups the source rejects must be bounded explicitly. |
| C | The group is registered, and is ingested only if it organizes events that no ingested listing already exposes. | Best coverage per unit of work, at the price of a more complex eligibility rule and a lag before new events appear. |

### P-NOGROUP — What happens to an event that states no group?

**Decision: A — publish with no attribution and an explicit "no group stated" marker.**

| Option | Proposal | Consequence |
| ------ | -------- | ----------- |
| A | The event is published, carries no group attribution, and is explicitly marked as "no group stated" in provenance, with an operator-visible data-quality signal. | The event stays visible, consumers can distinguish it from a mis-attributed event, and the gap is measurable. |
| B | The event is attributed to the group listing that returned it as a fallback. | No visible gap, but the calendar asserts something the source never said. |
| C | The event is published under a dedicated "no organizing group" pseudo-group that appears in consumer metadata. | The gap is explicit and filterable, at the price of publishing a non-existent group to consumers. |

### P-RECONCILIATION — How are obsolete attributions removed?

**Decision: A — complete observations only.**

| Option | Proposal | Consequence |
| ------ | -------- | ----------- |
| A | Attribution is recalculated from complete observations only; when a complete observation no longer states a group for an event, the obsolete attribution disappears. Incomplete or failed retrievals change nothing. | Memberships do not accumulate forever, and a partial failure never erases a correct attribution. |
| B | The most recent complete observation of an event wins, whatever listing produced it. | Simple to state, but the same event seen through two listings can flip between group sets. |
| C | Attributions are only ever added, as today. | No risk of loss, but the calendar keeps announcing organizers that the source has removed. |

### P-VISIBILITY — Who sees the data-quality gaps?

**Decision: A — operators only; the public calendar contract is unchanged.**

| Option | Proposal | Consequence |
| ------ | -------- | ----------- |
| A | Only operators: existing operational reporting exposes, per cycle, how many unlisted groups were discovered, how many events state no group, and how many attributions changed. | The public calendar contract does not change; maintainers can act on the gaps. |
| B | Operators plus a new marker on public calendar entries that flags unlisted and unattributed cases. | Consumers can filter on the gap, at the price of a public contract change and consumer education. |
| C | Operators plus a documented read-only listing of unlisted groups. | Makes repair work easier, and widens the public surface with a new endpoint. |

### P-HISTORY — What happens to attributions already stored?

**Decision: A — no historical repair; convergence from the next complete cycle.**

| Option | Proposal | Consequence |
| ------ | -------- | ----------- |
| A | No historical repair: attributions converge to the new rules from the next complete cycle, which already re-observes every upcoming event. | No one-off maintenance, and the correction is visible within one cycle for everything the source still lists. |
| B | A one-off repair re-reads the currently stored events from the source to rebuild their attribution. | Past events are corrected too, at the price of a maintenance operation and extra source traffic. |

## Clarifications

### Session 2026-10-29

- Q: Where does an event's group membership come from? → A: From the group set the source states for the event, unioned across its complete observations. The group listing that returned the event is kept only as retrieval provenance.
- Q: What happens to a group discovered outside the map? → A: It is registered as an unlisted group with its stated name and observation dates, and becomes an ingestion scope from the next dispatch cycle, with the same eligibility as a listed active group.
- Q: What happens to an event that states no group? → A: It is published with no attribution and an explicit "no group stated" marker, reported to operators.
- Q: How are obsolete attributions removed? → A: Only by complete observations; an incomplete or failed retrieval changes nothing.
- Q: Who sees the data-quality gaps? → A: Operators only, through the existing operational reporting. The public calendar contract is unchanged.
- Q: Are already-stored attributions repaired? → A: No. Attributions converge from the next complete cycle, which re-observes every upcoming event.
- Q: When the map marks a group inactive but payloads still name it as an organizer, which rule wins? → A: The map wins: the group stops being retrieved, while its attribution, its published events and its history are preserved.
- Q: How is a definitive "unknown group" answer distinguished from a temporary failure? → A: Only an explicit source answer that the group is unknown stops scheduling; timeouts, unreadable pages, throttling and server errors keep the group scheduled and retried.
- Q: Can a stopped discovered group be scheduled again? → A: Yes, on evidence: as soon as a complete observation names it as an organizer again, or the map directory lists it. Never on a timer and never requiring an operator.
- Q: Should ingestion stop for a discovered group that is no longer named anywhere? → A: No. It keeps being retrieved like a listed active group, with its registration and history preserved.
- Q: Should there be a ceiling on newly discovered groups starting retrieval in one cycle? → A: Yes. A configurable per-cycle ceiling applies, the excess is kept in discovery order and scheduled in later cycles, and none is dropped.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Events stay visible whatever their group situation (Priority: P1)

As a calendar subscriber, I want every upcoming event that the source publishes for the groups the calendar follows to appear in the calendar, including events organized by groups that are not on the map, so that I never miss an event because of a gap in the map directory.

**Why this priority**: Silent loss of events is the most damaging failure for a calendar: the user cannot notice what was never published. Keeping coverage is the minimum value of this refactor.

**Independent Test**: Seed a group listing that returns events whose stated groups include an identifier absent from the map directory, run one ingestion cycle, and verify that every event of the listing is reachable in the calendar.

**Acceptance Scenarios**:

1. **Given** a map directory that does not contain group G, **When** an ingested listing returns an event stating G as an organizer, **Then** the event is published and reachable in the calendar.
2. **Given** an event returned by two different group listings, **When** a cycle completes, **Then** the event appears exactly once in the calendar.
3. **Given** a group listing that fails during a cycle, **When** another listing succeeds with the same event, **Then** that event is still published.

---

### User Story 2 - Attribution reproduces what the source states (Priority: P1)

As a calendar subscriber or maintainer, I want each event to carry the groups the source actually states as organizers, so that filtering, display and reconciliation reflect reality rather than the path used to retrieve the event.

**Why this priority**: The reported defect is precisely a wrong or missing organizer. Without correct attribution the remaining work has no observable value.

**Independent Test**: Replay a stored source payload in which an event retrieved through group A states groups B and C, and verify that the published event carries B and C and not A.

**Acceptance Scenarios**:

1. **Given** an event retrieved through listing A whose payload states groups B and C, **When** it is published, **Then** its attribution contains B and C and does not contain A.
2. **Given** an event seen through two listings with the same stated groups, **When** both cycles complete, **Then** the attribution is identical and the event is not duplicated.
3. **Given** an event whose payload states an empty group list, **When** it is published, **Then** it carries no group attribution and is marked as having no stated group.
4. **Given** an event whose payload repeats the same group identifier, **When** it is published, **Then** the identifier appears once.

---

### User Story 3 - Unlisted groups are covered automatically (Priority: P2)

As a maintainer, I want every group identifier encountered in an event payload but absent from the map directory to be registered as an unlisted group and ingested from the next cycle, so that the calendar stops depending on another group’s listing to expose that organizer’s events, without any manual action.

**Why this priority**: Correct attribution of already-retrieved events is useful on its own, but coverage of organizers the map omits is what makes the calendar complete. It builds on the attribution work rather than replacing it.

**Independent Test**: Ingest one event stating a group absent from the directory, complete two cycles, and verify that the group is registered as unlisted with its stated name, that no job was created for it during the discovering cycle, and that exactly one job per cycle was created for it afterwards, unless the per-cycle ceiling delayed it.

**Acceptance Scenarios**:

1. **Given** a group identifier absent from the map directory, **When** it is seen in the payload of a complete observation, **Then** it is registered as unlisted with its stated name and the moments it was first and last observed, and it is scheduled for ingestion from the next dispatch cycle, not the current one.
2. **Given** the same unlisted group seen in several payloads of the same cycle, **When** the cycle completes, **Then** the group has one registration and one scheduled retrieval.
3. **Given** a discovered group whose own listing reveals a further unknown group, **When** both cycles complete, **Then** the further group is registered and ingested from the following cycle, so discovery expands by one step per cycle instead of within a cycle.
4. **Given** a discovered group whose listing the source rejects as unknown or nonexistent, **When** the rejection is observed, **Then** the group stops being scheduled, its registration and history are preserved, and its state is reported to operators.
5. **Given** an unlisted group that later appears in the map directory, **When** the directory is synchronized, **Then** it is reported as listed, keeps its history, and still has exactly one ingestion scope.
6. **Given** a group that leaves the map directory while it still organizes events, **When** a cycle completes, **Then** its events remain published, its status reflects that it is no longer listed, and its ingestion continues.
7. **Given** a group the map directory marks inactive while payloads still name it as an organizer, **When** a cycle completes, **Then** it stops being retrieved, its events and attributions remain published, and its status shows that it is inactive.

---

### User Story 4 - Gaps and repairs are observable (Priority: P3)

As a maintainer, I want each ingestion cycle to report how many unlisted groups were discovered, how many groups are newly scheduled, waiting, stopped or re-enabled, how many events state no group, and how many attributions were added or removed, so that I can judge whether the situation improves and detect a regression early.

**Why this priority**: The feature is a refactor of trust in the data: without measurement, the maintainer cannot tell whether the reported defects are being fixed.

**Independent Test**: Run a cycle over a payload containing one unlisted group, one event without group and one event whose stated groups change, and verify that the reported counts match the payload and that a failed listing produces no attribution change.

**Acceptance Scenarios**:

1. **Given** a completed cycle, **When** the maintainer reads operational reporting, **Then** the cycle reports unlisted groups discovered, groups newly scheduled, waiting, stopped or re-enabled, events without stated group, and attributions added and removed.
2. **Given** an incomplete retrieval of one listing, **When** the cycle ends, **Then** the reported removals for that listing are zero.
3. **Given** the same cycle replayed with unchanged source data, **When** it completes, **Then** the reported attribution changes are zero.

---

### Edge Cases

- The same event is returned by several group listings that state different group sets.
- An event payload states a group identifier that trims to nothing, or repeats the same identifier.
- An event is moved by the source from one organizer group to another between two complete cycles.
- An event’s organizer group is removed from the map directory while the event is still upcoming.
- A group is marked inactive by the map directory while its events are still upcoming and still name it as organizer.
- A listing fails, times out or returns an unreadable page while another listing succeeds.
- The map directory itself is unavailable during a cycle, while event listings succeed.
- A discovered group’s own listing reveals further unknown groups, so discovery could cascade.
- A discovered group stops being named anywhere but keeps publishing, or stops publishing altogether.
- A discovered group’s listing is empty, unknown to the source, or served from a stale cache.
- A discovered group’s listing times out or is throttled for several cycles in a row.
- A group identifier is discovered in a payload whose listing turns out to be incomplete later in the same cycle.
- A single payload names a very large number of previously unknown groups, far above the per-cycle ceiling.
- An event states a group whose identifier differs only by letter case from an already registered group.
- An event belongs to no group and to no listing, yet appears in the calendar through historical data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every event returned by a successfully retrieved group listing MUST be published in the calendar regardless of whether the groups it states are present in the map directory.
- **FR-002**: An event's group attribution MUST be the group set the source states for that event, unioned across its complete observations, and MUST NOT be inferred from the group listing that returned it.
- **FR-003**: The group listing that returned an event MUST be retained as retrieval provenance, distinct from the event's group attribution, so that coverage and traceability remain explainable.
- **FR-004**: A group identifier observed in the payload of a complete observation but absent from the map directory MUST be registered as an unlisted group, carrying the name the source states, the moments it was first and last observed, and its distinction from listed and inactive groups.
- **FR-005**: A registered unlisted group MUST become an ingestion scope from the next dispatch cycle onward, with the same eligibility as a listed active group, scheduled at most once per cycle. Discovery MUST NOT add work to the cycle that discovered it, so a listing that reveals further groups expands coverage one step per cycle.
- **FR-006**: A discovered group MUST stop being scheduled only when the source explicitly answers that the group is unknown or nonexistent; timeouts, unreadable pages, throttling and server errors MUST leave it scheduled and retryable. Stopping preserves its registration, its observations and the events already published under it, and its state is reported to operators.
- **FR-007**: A group that later appears in the map directory MUST be recorded as listed without creating a second ingestion scope or duplicate retrievals.
- **FR-008**: An event that states no group MUST still be published exactly once and MUST be explicitly identifiable as having no stated group, rather than being attributed to an arbitrary group or being dropped.
- **FR-009**: Group attribution MUST be recalculated only from complete observations: an incomplete or failed retrieval MUST NOT add, change or remove any attribution.
- **FR-010**: When a complete observation of an event no longer states a group that was previously attributed, the obsolete attribution MUST disappear on the next publication of that event.
- **FR-011**: Duplicate or blank group identifiers within a payload MUST be resolved without failing the whole listing: duplicates collapse to one, and a blank identifier is reported as a data-quality diagnostic while the event is still published.
- **FR-012**: A group that disappears from the map directory, or from every payload, MUST NOT cause deletion of its registration, its event history or the attributions that reference it, and MUST keep its scheduled retrieval unless it is marked inactive or reported unknown.
- **FR-013**: Each ingestion cycle MUST report, through operational reporting, the number of unlisted groups discovered, the number of groups newly scheduled, waiting for scheduling, stopped and re-enabled, the number of published events stating no group, and the number of attributions added and removed.
- **FR-014**: The public calendar contract MUST remain unchanged: an event matching the selection criteria appears exactly once with the same standard and metadata properties as before this refactor.
- **FR-015**: A failed or unavailable map directory MUST NOT remove or demote groups already known, and MUST NOT interrupt the ingestion of listings that can still be retrieved.
- **FR-016**: A group the map directory marks inactive MUST stop being retrieved even when payloads still name it as an organizer, while its registration, its attribution, the events already published under it and its history are preserved.
- **FR-017**: A group absent from a complete map directory but still tracked MUST keep its ingestion and MUST be reported as no longer listed; absence MUST NOT be treated as a deactivation.
- **FR-018**: A group stopped for an unknown-group answer MUST return to the schedule as soon as a complete observation names it as an organizer again, or as soon as the map directory lists it; no timer and no operator action may be required, and the return MUST be reported to operators.
- **FR-019**: The number of newly scheduled groups per cycle MUST be bounded by an adjustable ceiling. Groups beyond the ceiling MUST be retained in discovery order and scheduled in later cycles, never discarded, and the number still waiting MUST be reported to operators.

### Key Entities *(include if feature involves data)*

- **Group**: an organizer known to the calendar, identified by its source identifier, with its stated name, its directory status (listed, unlisted, no longer listed, or marked inactive), whether it is eligible for retrieval, and the moments it was first and last observed.
- **Event**: a published calendar entry identified by its source identifier, carrying its content revision, timing, location and the groups it is attributed to.
- **Observation**: the record of one complete retrieval of a group listing in a cycle, which establishes coverage and provides the evidence that an event exists and which groups it states.
- **Attribution**: the link between an event and a group, established because a complete observation states it and last confirmed by a named observation; it disappears when a complete observation stops stating it.
- **Retrieval provenance**: the record of which group listing returned an event, kept for coverage and traceability but never used as the event’s attribution.
- **Data-quality diagnostic**: a reported fact about a gap — an unlisted group, an event without stated group, a blank identifier, a stopped discovered group, or an attribution removed by reconciliation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying a recorded source sample in which at least 10% of events state a group absent from the map directory, 100% of those events remain reachable in the calendar.
- **SC-002**: For 100% of replayed events whose payload states at least one group, the published attribution equals the stated group set and contains no group that only retrieved the event.
- **SC-003**: 100% of events whose payload states no group appear exactly once in the calendar and are reported as having no stated group, with zero such events attributed to an arbitrary group.
- **SC-004**: An unlisted group first seen in a payload is visible in the group registry and scheduled for ingestion exactly once in the next cycle the ceiling allows, with zero duplicate scopes and zero retrievals added to the discovering cycle.
- **SC-005**: After a complete observation that drops a group from an event, the obsolete attribution is gone within one cycle for 100% of affected events, while a failed or partial retrieval changes zero attributions.
- **SC-006**: Replaying the same source data twice in a row reports zero attribution changes on the second cycle, demonstrating that reconciliation is stable and idempotent.
- **SC-007**: A maintainer can obtain, for the last completed cycle, the counts of unlisted groups, groups newly scheduled, waiting, stopped and re-enabled, events without stated group and attributions added or removed without reading raw event data, in under one minute.
- **SC-008**: Calendar consumers see no change in the set of properties per entry, and 100% of entries with an unchanged source payload keep the same revision sequence.
- **SC-009**: Events of a group removed from the map directory remain published for at least the following complete cycle, with zero loss of history.
- **SC-010**: A discovered group the source explicitly reports as unknown stops being scheduled with zero further retrievals and its history still available, while a group whose retrievals fail for any other reason keeps exactly one retrieval per cycle and is never deactivated.
- **SC-011**: Discovery converges: once no group is waiting for scheduling, two consecutive cycles over unchanged source data schedule an identical set of scopes and no group is scheduled twice in the same cycle.
- **SC-012**: A group stopped for an unknown-group answer is scheduled again within one cycle after it is named by a complete observation or listed by the map directory, with zero operator action.
- **SC-013**: When a cycle discovers more groups than the ceiling allows, exactly the ceiling number starts retrieval, every remaining group keeps its discovery rank, and 100% of them are scheduled within a number of cycles equal to their rank divided by the ceiling, rounded up.

## Assumptions

- The map directory remains the authority for which groups are advertised on the public map, and it is known to be incomplete rather than wrong: encountering a group outside it is normal, not an error.
- Group identity is the source identifier; a name change on the same identifier is an update, not a new group, and a case-only difference is not a new group.
- The event payload’s stated groups are the source of truth for organizers when they are present, because the calendar must not assert an organizer the source never named.
- Attribution is a set: order carries no meaning, and an event matching a selection appears exactly once whatever its number of groups.
- Upcoming retentions and past events already stored are out of scope: the feature governs how attributions are established and reconciled, not how long events are kept.
- No historical repair is performed: the correction applies from the next complete cycle, which already re-observes every upcoming event.
- Data-quality gaps are reported to operators only, through the existing observability channels; the public calendar contract is unchanged.
- Inactivity stated by the map directory is authoritative for retrieval and overrides discovery, whereas absence from the directory is not a deactivation: an absent group keeps being retrieved and is reported as no longer listed.
- Coverage now grows with discovery, and the requester accepted that ingestion cost increases accordingly: every known group is retrieved at most once per cycle, whether or not it is currently named in any payload.
- The per-cycle ceiling on newly scheduled groups is adjustable through deployment configuration and defaults to 200, which is one tenth of the 2,000 active groups the planning baseline expects; raising it accelerates discovery and its cost.
- A group’s stated name may be absent or unreadable; the identifier then remains the display fallback.
- Geographic enrichment and event-type validation are unchanged by this feature.
- Subscriptions and per-user views are out of scope; they consume attributions established here but are not modified.
