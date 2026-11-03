# Research: Intercommunal Calendar Discovery

## Decision 1: Use an official, versioned EPCI reference

**Decision**: Import EPCI identities, category, labels, status, and commune membership from
an official French administrative reference dataset, retaining the source version and import
timestamp with every active snapshot.

**Rationale**: EPCI membership is administrative data and changes over time. A versioned
snapshot makes a calendar reproducible, supports diagnostics, and prevents a partial refresh
from mixing old and new memberships. The serving path can use the same active-reference
pattern already used for commune and department data.

**Alternatives considered**:

- Maintain a hand-edited list: rejected because it is error-prone and cannot scale to all
  EPCI categories.
- Infer membership from event locations: rejected because absence of events is not evidence
  of absence from an EPCI.
- Query a live external service on every search: rejected because public search and calendar
  feeds need deterministic availability and should not depend on third-party latency.

## Decision 2: Support all public EPCI categories selected in the specification

**Decision**: Support communautés de communes, communautés d’agglomération, communautés
urbaines, and métropoles as one `epci` subject kind, with a category field rendered in the
label/context.

**Rationale**: The user selected all public categories. One subject kind keeps the search and
calendar contracts stable while the category distinguishes the administrative type.

**Alternatives considered**:

- One subject kind per category: rejected for the first release because it multiplies API,
  URL, UI, and test branches without adding a different calendar behavior.
- Communities de communes only: rejected by the resolved scope decision.

## Decision 3: Resolve EPCI scopes to a normalized commune set

**Decision**: At calendar-query time, resolve the active EPCI membership to a sorted,
deduplicated set of commune identifiers, then pass that set through the existing commune
criteria path.

**Rationale**: Existing event records are geographically keyed by commune and the calendar
query already deduplicates event rows. Reusing this boundary avoids a second event-selection
algorithm and preserves city/department behavior.

**Alternatives considered**:

- Add an EPCI foreign key to every event: rejected because it duplicates time-varying
  administrative membership and requires historical rewrites.
- Build a separate EPCI event index: rejected because it would create divergent filtering
  and deduplication semantics.

## Decision 4: Fail closed for invalid or incomplete active snapshots

**Decision**: A reference snapshot becomes active only when identity, category, stable IDs,
and membership validation pass. A territory with known incomplete membership is not served as
complete; shared links return a specific data-availability state rather than unrelated events.

**Rationale**: The specification explicitly forbids claiming complete coverage and forbids
unrelated results. Serving a partial scope without a visible quality state would violate both.

**Alternatives considered**:

- Serve partial memberships silently: rejected as misleading.
- Drop the territory entirely: rejected because the UI should explain the availability issue
  and preserve a recovery path.

## Decision 5: Keep the public iCalendar endpoint backward compatible

**Decision**: Add an optional `epci` criterion to the existing calendar contract. Existing
parameters remain valid; within `epci`, values combine with OR and distinct criteria combine
with AND, following the established conventions.

**Rationale**: Existing links must remain unchanged, while search subjects already carry
calendar parameters. The new parameter allows shareable links without inventing a second feed.

**Alternatives considered**:

- Generate opaque saved-calendar IDs: rejected because the current product uses transparent,
  reproducible filter links and does not require user accounts.
- Replace commune criteria with EPCI criteria: rejected because it would break existing links.
