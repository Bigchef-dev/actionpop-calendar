# Feature Specification: Minimal Update Progress View

**Feature Branch**: `011-update-progress-view`

**Created**: 2026-11-23

**Status**: Implemented · 2026-11-23

**Input**: User description: "Réfléchir à une petite interface permettant de voir l'avancée des mises à jour (minimaliste)"

## Why This Feature Exists

The calendar keeps itself current by running periodic ingestion cycles: the dispatcher schedules
refresh work for active groups, for events that name no group, and for map discovery. What a
visitor sees is therefore a snapshot that changes on a schedule the visitor cannot see.

Today that schedule is invisible. A visitor cannot tell whether the events shown are fresh,
whether a refresh is in progress, or whether the last refresh failed. Someone who notices an
event that seems out of date has no way to know whether the calendar is lagging or the organizer
changed it. That uncertainty costs trust in a product whose value depends on being current.

This feature adds one deliberately small, public, read-only page that answers three
questions at a glance: **Is data being refreshed right now? When was it last updated
successfully? Has the refresh been working recently?** It exposes only aggregate freshness and
progress, never the operational detail that belongs to the monitoring stack.

## Scope

In scope, as decided during specification:

- A dedicated public update page, linked from the existing calendar experience, showing
  the current refresh state, live aggregate progress during a run, and the last successful
  update.
- A short history of the most recent refresh cycles, with outcome and completion time, so a
  visitor can see whether updates have been reliable lately.
- Automatic refresh while visible, plus a manual refresh, without reloading the experience.
- Clear "unknown" states when the underlying data cannot be read, so missing data is never
  presented as fresh.
- Public-safe wording and aggregate-only figures.

Out of scope, as decided during specification:

- Any operator or diagnostic surface: no failure reasons, internal identifiers, queue state,
  per-group or per-event detail, or infrastructure health.
- Historical charts, trend analysis, retention or long-term reporting. The monitoring stack
  keeps that responsibility.
- Alerting, paging or notification rules.
- Any action that changes system state: no triggering a cycle, no retrying a job, no pausing
  ingestion, no editing configuration.
- Redesigning ingestion, scheduling, attribution or the existing calendar experience.
- Tracking the progress of application deployments or releases.

## Clarifications

### Session 2026-11-23

- Q: Quelles « mises à jour » cette interface doit-elle montrer ? → A: Le rafraîchissement périodique des données du calendrier (ingestion des groupes, des événements et de la carte), pas les déploiements de l'application.
- Q: À qui l'interface est-elle destinée et comment y accède-t-on ? → A: À tout visiteur : c'est un indicateur public de fraîcheur, accessible sans authentification depuis l'expérience publique du calendrier.
- Q: Quel niveau de détail sur une mise à jour en cours ? → A: Progression en direct (traité, restant, échecs agrégés) accompagnée d'un petit historique des derniers cycles.

### Convergence amendment 2026-11-23

- The public surface moved from a footer-only indicator to a dedicated page at `/etat` with a
  small visualization of the current run and the five recent cycles. The aggregate-only privacy
  boundary, the five states and the refresh cadence are unchanged; the calendar experience keeps
  a compact footer link to the page.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Know whether the calendar is current (Priority: P1)

As a visitor, I can see when the calendar was last updated successfully and whether a refresh is
happening now, so I can trust that the events I am reading reflect the organizers' latest
information.

**Why this priority**: Transparency about freshness is the entire value of the feature. Without
it the page has no reason to exist; every other story enriches the same glance.

**Independent Test**: With known operational data, loading the public experience shows the
current refresh state, the last successful completion time and the data age. Against a system
that has never completed a refresh, the page says so explicitly instead of showing a
healthy-looking value.

**Acceptance Scenarios**:

1. **Given** a completed refresh and none in progress, **When** a visitor opens the calendar,
   **Then** the page states that data is up to date, when it was last updated and how old
   it is.
2. **Given** a refresh is currently running, **When** a visitor opens the calendar, **Then** the
   page states that an update is in progress and distinguishes it from an idle state.
3. **Given** no refresh has ever completed, **When** a visitor opens the calendar, **Then** the
   page says that no update is known yet and does not present zero as if data were current.

---

### User Story 2 - Never learn more than freshness (Priority: P1)

As the person responsible for the service, I know the public page reveals only aggregate
freshness and progress and never operational detail that could be used to probe the system.

**Why this priority**: Making the page public raises its stakes. It is only acceptable if
it can be published to anonymous visitors without exposing internals, so this constraint ranks
with the freshness story itself.

**Independent Test**: An audit of everything the page displays shows only aggregate state,
counts, durations and times — no internal identifiers, failure reasons, group or event names,
queue or infrastructure state — while the rest of the public experience keeps its behaviour.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor, **When** they load everything the page exposes,
   **Then** no internal identifier, failure reason, per-group or per-event detail, queue metric
   or infrastructure status is present.
2. **Given** the page is published, **When** the public calendar, search and feed are used,
   **Then** their behaviour and performance are unchanged.

---

### User Story 3 - Follow a running refresh (Priority: P2)

As a visitor, while a refresh is running I can see how much work has been processed out of the
expected total and what remains, so I can tell that the calendar is actively catching up rather
than frozen.

**Why this priority**: A long or slow refresh is exactly when the page earns its place.
Knowing that work is advancing is more reassuring than merely knowing that a refresh started.

**Independent Test**: Against a simulated refresh with a known number of targets and known
completed work, the page reports processed, remaining and total consistently, and those
figures advance when more work completes.

**Acceptance Scenarios**:

1. **Given** a refresh with a known number of targets, **When** part of the work has completed,
   **Then** the page shows `n/total` for groups and `n/total` for events, plus figures that add
   up consistently.
2. **Given** a refresh still running after the expected duration has elapsed, **When** a visitor
   looks at the page, **Then** the run is visibly described as taking longer than usual
   rather than appearing normal.
3. **Given** some work fails during the run, **When** a visitor looks at the page, **Then**
   a neutral aggregate failure figure is visible next to the successful count, without any
   reason or target detail.

---

### User Story 4 - See recent update reliability (Priority: P2)

As a visitor, I can see a short history of recent refreshes with their outcome and completion
time, so a single bad moment does not look like a chronic problem and a recurring problem is
visible.

**Why this priority**: A single stale-looking snapshot is ambiguous. A compact recent history
turns the page from a momentary status into evidence of reliability, at almost no
additional space.

**Independent Test**: With a known sequence of completed, partial and failed refreshes, the
page lists the most recent cycles in order with time and outcome, bounded to the configured
number.

**Acceptance Scenarios**:

1. **Given** five or more recent refresh cycles, **When** a visitor opens the page,
   **Then** the most recent cycles are shown in reverse chronological order, up to the small
   configured limit.
2. **Given** a cycle in which only part of the work succeeded, **When** it appears in the
   history, **Then** it is distinguishable from a fully successful and a failed cycle.
3. **Given** fewer cycles than the limit, **When** the history is shown, **Then** only the cycles
   that exist are displayed, without empty placeholders presented as failures.

---

### Edge Cases

- The last completed refresh is older than the expected interval: the page shows data as
  stale and states how late it is, rather than presenting the last figures as current.
- The background service is reachable but its data source is not: the page labels the
  affected figure as unknown and does not render missing counts as zero.
- A refresh exceeds its expected duration several times in a row: the page describes the
  latest run as unusually long, not merely one failure among many.
- Two refresh rounds overlap in observation: the page makes clear which run it describes
  and does not merge their counts.
- The page is opened while a run is between states (finished but not yet recorded): it
  prefers the most recent confirmed state and tolerates slight lag instead of contradicting
  itself.
- The visitor's connection drops or the page stays open across midnight: times remain in the
  canonical project timezone, and a failed background refresh is visible rather than silently
  freezing the display.
- The system restarts and loses in-memory progress: the page recovers to the state it can
  verify and marks the unavailable part as unknown.
- A visitor accesses the calendar with scripts blocked: the last known status remains readable
  and the lack of live updates is not presented as a change in freshness.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The feature MUST report on the periodic refresh of calendar data (group listings,
  event details, map discovery), not on application deployments or releases.
- **FR-002**: The page MUST be publicly reachable at its own URL (`/etat`) and linked from the
  existing calendar experience without authentication.
- **FR-003**: The page MUST expose only aggregate information: state, counts, durations and
  times. It MUST NOT expose internal identifiers, failure reasons, group or event names,
  per-target detail, queue state or infrastructure health.
- **FR-004**: The page MUST classify the overall update state in a small, fixed set of
  visitor-friendly states: updating, up to date, stale, partially failing, and unknown.
- **FR-005**: The page MUST show, for the last completed refresh, when it finished, how long
  it took, how much work it processed and failed, and the same per-kind `n/total` figures.
- **FR-006**: The page MUST show live progress for a refresh in progress, broken down explicitly
  into groups refreshed (`n/total`) and events considered up to date (`n/total`), plus remaining
  and failed figures, with figures that add up consistently.
- **FR-007**: The page MUST show a compact history of the most recent refresh cycles
  (default 5), each with completion time and outcome (complete, partial or failed), and MUST NOT
  show more than the configured limit.
- **FR-008**: The page MUST show data freshness: how long ago the last successful refresh
  completed and whether that age exceeds the expected refresh interval.
- **FR-009**: The page MUST NOT present missing or unreadable data as a healthy value or as
  zero; every unavailable figure MUST be labelled as unknown.
- **FR-010**: The page MUST refresh automatically while visible (default interval 30
  seconds) and offer a manual refresh, without requiring a page reload.
- **FR-011**: The page MUST be strictly read-only: it MUST NOT expose any control that
  triggers, retries, pauses or reconfigures update work.
- **FR-012**: The page MUST present its essential information on a single dedicated screen at a
  standard desktop resolution, including a small visualization of the current run and of the five
  most recent cycles, and MUST remain readable on a narrow mobile viewport. The calendar
  experience keeps a compact entry point linking to that page.
- **FR-013**: The page MUST display all times in `Europe/Paris` with both relative age and
  absolute time.
- **FR-014**: The page MUST NOT display personal data about calendar visitors and MUST limit
  itself to aggregate operational counts.
- **FR-015**: The page MUST remain useful when it cannot reach every underlying source,
  identifying which information is unavailable instead of failing as a whole, and MUST NOT
  degrade the rest of the public experience.
- **FR-016**: The page MUST use plain, visitor-understandable wording and avoid internal
  technical vocabulary.
- **FR-017**: The page MUST reflect a change in update state within one refresh interval.

### Key Entities _(include if feature involves data)_

- **Update run**: one occurrence of the periodic refresh, with a period identifier, a state
  (in progress, complete, partial, failed), start and end times, duration, and processed, failed
  and remaining aggregate counts. The identifier is internal and never displayed.
- **Recent run summary**: the publicly displayable part of a past run — completion time, duration
  and outcome — used for the compact history.
- **Freshness reading**: the time of the last successful data publication and its age relative
  to the expected refresh interval, expressed in visitor-facing terms.
- **Public availability status**: whether each underlying source needed by the page could be
  read at the last refresh, displayed only as "unknown" when it could not.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In a usability check with at least five visitors unfamiliar with the project, at
  least four can correctly state whether data is being refreshed and when it was last updated
  within 5 seconds of the page appearing.
- **SC-002**: The dedicated page fits on one screen at 1280×720 without horizontal scrolling, keeps
  at most three primary figures above the fold, shows one progress visualization, and remains
  readable at 360px width.
- **SC-003**: A change in update state becomes visible on an open page within 30 seconds of
  the change occurring.
- **SC-004**: 100% of displayed counts — aggregate and per-kind groups/events — match the
  underlying operational data at the moment of a refresh; discrepancies are limited to targets
  that changed during that refresh.
- **SC-005**: In every simulated failure of an underlying source, the affected figures are shown
  as unknown in 100% of cases and never as zero.
- **SC-006**: A display audit finds 0 internal identifiers, failure reasons, group or event
  names, queue metrics or infrastructure details exposed by the page.
- **SC-007**: The first useful status appears in under 2 seconds on a standard broadband
  connection.
- **SC-008**: Using the page produces 0 state-changing actions and does not alter the
  refresh schedule or queue.
- **SC-009**: The public calendar, search and feed keep their current availability and latency
  after the page is published.

## Assumptions

- The page serves anonymous visitors; operators keep using the existing monitoring stack for
  diagnosis. The public view is a summary, not a replacement dashboard.
- "Mises à jour" means the periodic refresh of calendar data (group listings, event details, map
  discovery), not application deployments or releases.
- "Minimaliste" is taken literally: one dedicated page, plain text and numbers, one small CSS
  progress visualization and a five-cycle strip; no long-term charts, no filters and no
  configuration controls.
- The aggregate operational data already collected for monitoring and the ingestion ledger is
  sufficient; the feature does not add new tracking of visitors or events.
- A failure figure may be shown publicly in aggregate because it carries no actionable internal
  detail; any reason, target or source description remains private.
- Long-term history, alerting and drill-down remain in the existing monitoring stack.
- A single production deployment and canonical timezone (`Europe/Paris`) are assumed, consistent
  with the rest of the project.
- A refresh interval of 30 seconds and a history length of 5 are reasonable defaults; they may be
  adjusted during planning without changing the feature's intent.
- Where operational data is missing, showing "unknown" is preferable to showing a reassuring
  default, even if the page looks less tidy.
