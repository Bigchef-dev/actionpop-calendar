# Feature Specification: Release Hardening and Observability

**Feature Branch**: `009-release-hardening-observability`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Avant de publier, je souhaite mettre en place — Check sécurité / exploit — Avoir des metrics prometheus + grafana (compatible avec un compose extérieur, qui contient le grafana de mon serveur avec d'autres services). Pouvoir suivre assez facilement le parcours des utilisateurs, les abonnements calendriers et les metrics d'usage de manière fine. Explorer les pistes, me laisser décider, pose-moi des questions jusqu'à ce que ce soit satisfaisant."

## Why This Feature Exists

The calendar is about to be published to real visitors, but two things stand between a
working prototype and a service that can be operated safely:

1. **Nobody has looked for ways to abuse it.** The service answers public, unauthenticated,
   database-backed reads. Before publication the team needs evidence that the exposed surface
   was deliberately attacked and that every finding is either fixed or knowingly accepted.
2. **Nobody can tell what happens after publication.** The service already counts a few
   technical events, but there is no way to answer the questions a launch review asks: how many
   people came, what did they search for, did they find a territory, did they select filters,
   did they export or subscribe, and did subscriptions keep renewing?

This feature delivers the pre-publication security verdict and the operational visibility that
makes the launch reviewable, without changing what the calendar itself shows to a visitor.

## Scope

In scope, as decided during specification:

- A reproducible pre-publication security review covering the public read surface, the
  deployment configuration, and the dependency supply chain.
- Automated exploitation testing against a running deployment, plus a mandatory manual
  pre-publication checklist, because automation alone cannot confirm every control.
- Runtime hardening of the published surface: explicit closed-by-default route exposure and a
  set of browser security headers served by the application's own edge.
- Delivery of usage metrics through the monitor already running on the server, which owns the
  dashboarding and alerting tools, and access to those metrics over a shared private network
  rather than the public internet.
- Instrumentation of the visitor journey, calendar subscriptions, and service usage in enough
  detail to answer launch-review questions with data.
- A ready-to-mount dashboard and alerting package for the existing monitor, with installation
  documentation.

Out of scope, as decided during specification:

- Applying request-rate limits to published traffic. Abusive traffic is measured this release;
  enforcement is a separate decision once real volumes are known.
- Visitor identification beyond an anonymous, browser-local session marker, plus the transient
  in-memory request-volume band described in FR-012. No stored visitor records, no personal data
  retention, no consent banner.
- Changing the calendar's content, filtering semantics, or public contract.
- Building or hosting the dashboarding and alerting tools themselves; they already exist.
- Redesigning ingestion, provenance, or geographic resolution.

## Clarifications

### Session 2026-11-02

- Q: Comment concilier « mesurer le volume de requêtes par client » (FR-012) avec l'interdiction de singulariser un visiteur (FR-016/FR-017) ? → A: Palier de volume par client, dérivé d'une empreinte hachée avec un sel à rotation quotidienne, gardée uniquement en mémoire et jamais conservée.
- Q: Qu'appelle-t-on exactement une « visite atteignant un calendrier utilisable » dans SC-005 ? → A: Une visite qui affiche un calendrier contenant au moins un événement pour le territoire choisi.
- Q: Combien de temps une visite reste-t-elle la même quand le visiteur ne fait plus rien ? → A: La visite se termine après 30 minutes sans activité.
- Q: Comment classer un client dont la nature est indéterminée (agenda, navigateur ou automatisé) ? → A: Une quatrième classe « indéterminé », visible au tableau de bord.
- Q: Sur quelle échelle une faille de sécurité est-elle jugée « grave » au point de bloquer la publication ? → A: L'échelle de gravité du scanner automatique décide du blocage, et un avis humain est consigné en complément.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish with a security verdict (Priority: P1)

As the person accountable for publication, I need a review that attacks the service the way an
outsider would, so that I publish knowing what was tested, what was found, and what was
deliberately accepted.

**Why this priority**: Publishing an unauthenticated, database-backed public service without
adversarial testing is the highest-consequence gap. Every other story makes the service easier
to operate; this one makes publication defensible.

**Independent Test**: A reviewer who did not write the review can read the report, reproduce
each finding against a locally started deployment, and confirm that each finding is fixed,
mitigated, or explicitly accepted with a reason.

**Acceptance Scenarios**:

1. **Given** a fully configured deployment and the published attack surface, **When** the
   automated exploitation scan runs, **Then** it produces a machine-readable report and the run
   fails when a high-severity finding is present.
2. **Given** the same deployment, **When** an operator follows the pre-publication checklist,
   **Then** every checklist item has an explicit outcome and no item is left unverified.
3. **Given** a finding is accepted rather than fixed, **When** the report is read, **Then** the
   finding states why it is accepted and what would trigger a revisit.

---

### User Story 2 - See the visitor journey (Priority: P1)

As a product owner, I need to know how visitors move from arrival to a usable calendar, so I
can see where they give up and which territories people actually want.

**Why this priority**: Without journey data the launch is unmeasurable. It shares first place
with the security verdict because both answer "was publishing worthwhile".

**Independent Test**: Driven by a handful of scripted visits that each reach a different stage,
the exported usage data shows each stage with a count, and no stage can be incremented without a
corresponding visit.

**Acceptance Scenarios**:

1. **Given** a visitor lands and performs no action, **When** usage data is read, **Then** the
   arrival is counted exactly once for that visit.
2. **Given** a visitor searches, selects a suggested territory, applies a type filter, opens an
   event, and exports the calendar, **When** usage data is read, **Then** each of those five
   stages is counted and the stages remain individually distinguishable.
3. **Given** a search returns no result, **When** usage data is read, **Then** that search is
   counted as unfruitful and remains distinguishable from a fruitful search for the same terms.
4. **Given** a visitor uses a browser that blocks the site's scripts from reporting usage,
   **When** the visitor uses the calendar, **Then** the calendar still works and the loss of
   telemetry is visible in the data rather than silently absent.
5. **Given** a visitor returns the next day, **When** usage data is read, **Then** the new visit
   is counted as a new arrival and is not merged with the previous visit's stages.

---

### User Story 3 - Count calendar subscriptions and their renewal (Priority: P2)

As an operator, I need to know how many calendars were subscribed to and whether subscribers
keep refreshing them, so I can tell a calendar that was tried from a calendar that is used.

**Why this priority**: Subscription renewal is the strongest signal that the product earns a
lasting place in someone's agenda, but it depends on traffic that only exists once published.

**Independent Test**: Against a scripted mix of a first subscription fetch, a recurring agenda
sync, an expired-cache revalidation, and a direct browser download, the exported usage data
separates those four kinds of request and attributes each to the right territory type.

**Acceptance Scenarios**:

1. **Given** a calendar is fetched for the first time by an agenda application, **When** usage
   data is read, **Then** the fetch is counted as a new subscription for that territory type.
2. **Given** an agenda application revalidates an unchanged calendar, **When** usage data is
   read, **Then** the revalidation is counted and is distinguishable from a full delivery.
3. **Given** the same calendar is fetched by a visitor clicking a download, **When** usage data
   is read, **Then** it is counted as an export and is not counted as a subscription.
4. **Given** an explicit subscribe action on the site, **When** usage data is read, **Then** the
   intent is counted and separated from the later delivery of the calendar.
5. **Given** a territory family has no subscription for a day, **When** usage data is read, **Then**
   the absence is reported as a zero rather than a gap.

---

### User Story 4 - Consume usage data from the existing server monitor (Priority: P2)

As the person running the server, I need the application's usage data to appear in the monitor I
already operate next to my other services, so I keep one place to look and reuse my existing
retention and alerting.

**Why this priority**: The monitor exists and holds the other services' data. Bridging to it is
what turns raw counters into something the team can review, but it delivers nothing until the
instrumentation above exists.

**Independent Test**: With the application stack started alongside the existing monitor, the
monitor shows the application as a reachable target and its dashboards display current values,
without exposing the application's metrics on the public internet.

**Acceptance Scenarios**:

1. **Given** both stacks run on the same host, **When** the monitor is inspected, **Then** the
   application's usage data is available there and none of it is reachable from the internet.
2. **Given** the monitor cannot reach the application, **When** the operator consults the launch
   dashboard, **Then** the absence is reported explicitly rather than shown as zero usage.
3. **Given** the documented installation steps, **When** a fresh operator applies them, **Then**
   the dashboards and alerts appear without hand-editing any file.
4. **Given** restarting the application stack, **When** the monitor is inspected again, **Then**
   usage data resumes without reconfiguring the monitor.

---

### User Story 5 - Keep the published surface closed by default (Priority: P3)

As the person accountable for publication, I need the internet to reach only the routes the
calendar experience genuinely needs, so an exploratory surface cannot become a permanent hole.

**Why this priority**: It is a direct consequence of the security review and cheap to hold, but
it protects nothing until the review has established which routes are truly needed.

**Independent Test**: Requesting each documented public route from outside succeeds, requesting
each internal or exploratory route from outside is refused, and the visitor-facing experience is
unaffected.

**Acceptance Scenarios**:

1. **Given** the list of routes needed by the calendar experience, **When** a request arrives for
   any other route, **Then** it is refused without revealing whether the route exists.
2. **Given** an internal diagnostic or usage-data route, **When** a request for it originates
   from the internet, **Then** it is refused, while the server's own monitoring can still read it.
3. **Given** a hostile page tries to embed or script the calendar, **When** the browser loads it,
   **Then** the site's declared browser security rules refuse that behaviour.
4. **Given** an abusive client, **When** it requests at a rate far above a normal visitor,
   **Then** the abuse is recorded as usage data and the request is still served.

---

### Edge Cases

- A visitor disables or blocks the scripts that report journey steps, or their network silently
  drops those reports: the calendar must keep working, and the missing data must be evident as a
  shortfall rather than mistaken for zero engagement.
- A visitor opens several tabs of the same site: each tab must not inflate the visit count, and
  closing one tab must not end the visit for the others; a visit left idle for thirty minutes
  ends even when a tab remains open.
- An abusive client sends a volume burst that spans the daily rotation of the request-volume
  salt: the two days' bands must not be combined into a single apparent client, and the rotation
  must not create a record that survives it.
- A monitored period has no traffic for a territory family, a route, or a filter: the absence is
  reported as zero, never as a gap or a missing series.
- An agenda client polls a calendar in a tight loop after a firewall change: the loop is visible
  as subscription traffic but is not mistaken for new subscribers.
- A client presents no client signature, or presents a signature that claims to be an agenda
  application while behaving like an automated client: it is counted as `indeterminate` or as its
  claimed class, and the dashboards show the indeterminate share rather than hiding it.
- The monitor's shared network is renamed, removed, or recreated during a server upgrade: the
  application keeps serving visitors and the lost measurement is visible in the monitor's own
  health, not silent.
- An automated scan discovers a medium-severity finding late in the release: publication proceeds
  only with a recorded decision, never by ignoring the report.
- A human reviewer judges a scanner-high finding to be a false positive: the disagreement is
  recorded with its justification, and the finding is never silently reclassified to unblock the
  release.
- The pre-publication checklist is run against a configuration that differs from production: the
  checklist must record which configuration was tested so the verdict is not overstated.
- Two deployments of the application run simultaneously during a cutover: their usage data must
  remain distinguishable so a comparison does not read as doubled traffic.

## Requirements *(mandatory)*

### Automation Guarantees

- **FR-001**: The security review MUST be reproducible by anyone with repository access, without
  undocumented local setup, and MUST state the exact configuration it tested.
- **FR-002**: The automated exploitation testing MUST run against a real, started deployment, not
  against mocks or a static analysis of source code.
- **FR-003**: The automated exploitation testing MUST fail the build when it reports a
  high-severity finding, and MUST publish its full report as a retrievable artifact on success as
  well as on failure. Severity MUST be taken from the scanner's own severity scale, and the manual
  review MUST record a human judgement on every finding alongside that automatic severity.
- **FR-004**: Every accepted security finding MUST be recorded in-repository with its rationale
  and the condition that would require revisiting it.
- **FR-005**: The manual pre-publication checklist MUST be recorded as a repeatable procedure that
  captures the tested configuration and the outcome of every item.
- **FR-006**: The dependency supply-chain checks MUST remain in place, and MUST cover the newly
  added runtime dependencies of this feature.

### Published Surface

- **FR-007**: The internet MUST reach only the routes the calendar experience requires; any other
  route MUST be refused without disclosing whether it exists.
- **FR-008**: Diagnostic, health, and usage-data routes MUST remain reachable by the server's own
  monitoring and health probes, and MUST NOT be reachable from the internet.
- **FR-009**: The visitor-facing site MUST be served behind the application's own edge so that
  browser security rules and transport protections are enforced by the application, not by the
  hosting platform.
- **FR-010**: The visitor-facing site MUST declare browser security rules that prevent the site
  from being framed by another origin, restrict the origins it may load code or data from, and
  forbid unneeded browser capabilities.
- **FR-011**: Requests over insecure transport MUST be redirected, and the site MUST instruct
  browsers to require secure transport on subsequent visits.
- **FR-012**: Request volume per client MUST be observed as a volume band derived from a
  client-derived value hashed with a salt that rotates daily, held only in memory and never
  written to storage or logs, so that an abusive client is distinguishable within a day without
  any durable or cross-day record. No rejection limit MUST be applied to published traffic.
- **FR-013**: The set of publicly exposed routes MUST be readable as an explicit declaration in
  the repository, so that adding a route is a visible decision rather than an accident.

### Journey and Usage Measurement

- **FR-014**: Each visitor visit MUST be counted once on arrival, regardless of how many pages,
  tabs, or journeys the visitor performs within it, and a visit MUST end after thirty minutes
  without visitor activity so that a return after a long pause is counted as a new arrival.
- **FR-015**: The following journey steps MUST be counted separately and attributed to the visit
  that produced them: arrival, search performed, search yielding no territory, territory selected,
  start-territory suggestion accepted, calendar displayed with at least one event, event-type
  filter applied, action-group filter applied, event detail opened, calendar exported, calendar
  subscription initiated.
- **FR-016**: Journey steps MUST be recorded with the broad kind of territory involved (for
  example municipality, intercommunal authority, department, action group) and MUST NOT record
  the specific territory searched for, the visitor's address, or any other personal data.
- **FR-017**: Journey steps MUST NOT be recorded with any value that could single out an
  individual visitor beyond the anonymous visit marker, and the marker MUST NOT be stored outside
  the visitor's browser. The in-memory request-volume band of FR-012 is outside this prohibition
  and MUST NOT be emitted as a metric label or persisted.
- **FR-018**: The calendar MUST keep working when journey reporting is blocked, unavailable, or
  slow, and MUST NOT delay the visitor's interaction to report usage.
- **FR-019**: Calendar requests MUST be counted by territory family and MUST be separated into:
  first delivery to a client, revalidated delivery of unchanged content, rejected invalid request,
  and unavailable scope.
- **FR-020**: Calendar requests MUST be counted separately from an explicit subscribe action taken
  on the site, so that intent and later delivery are never conflated.
- **FR-021**: Calendar requests MUST be attributable to the kind of client, distinguishing agenda
  applications, browsers, and automated clients, without identifying any client. A request whose
  kind cannot be determined MUST be counted as a separate `indeterminate` class that remains
  visible on the dashboards, so that the classes always sum to the total and classification
  uncertainty is never disguised as a guess.
- **FR-022**: Calendar requests MUST be attributable to the territory family without recording the
  specific territory identifier, so that cardinals stay bounded and no person is reconstructed.
- **FR-023**: The applied filters MUST be countable by event type and by action group cardinality
  classes, without recording the identity of the group beyond what is already public in the feed.
- **FR-024**: Calendar results cut by a ceiling MUST be counted and MUST be distinguishable from
  results that were naturally small.
- **FR-025**: Events that could not be attributed to a territory MUST be countable, by resolution
  status, so that data gaps are visible as a first-class signal.
- **FR-026**: Request duration MUST be observable as a distribution, not only as an average, so
  that slow visitors can be told apart from a slow service.
- **FR-027**: Failed responses MUST be countable by route and by failure kind, distinguishing a
  rejected request from an unavailable dependency.
- **FR-028**: Ingestion freshness MUST remain observable per source (calendar ingestion and map
  discovery), with the time of the last successful ingestion kept separately for each source.
- **FR-029**: All usage data MUST carry a marker identifying which deployment instance produced
  it, so two instances running at once remain distinguishable.

### Consumption by the Existing Monitor

- **FR-030**: Usage data MUST be reachable by the server's existing monitor over a shared private
  network, and MUST NOT require the monitor to be reconfigured beyond the documented additions.
- **FR-031**: Usage data MUST NOT be reachable from the internet.
- **FR-032**: The repository MUST contain a mount-ready package for the existing monitor,
  comprising the dashboards, the alerting rules, and the connection definition, such that applying
  it requires no hand-editing of the shipped files.
- **FR-033**: The package MUST include installation documentation covering how the shared network
  is joined and how to verify that the application appears in the monitor.
- **FR-034**: The package MUST include at least one alert per launch-relevant failure condition:
  unreachable application, absence of any usage data, stale ingestion, unavailable dependency, and
  sustained rejected-request bursts.
- **FR-035**: When a metric disappears, the dashboards and alerts MUST report the disappearance
  explicitly instead of presenting it as zero.

### Key Entities *(include if feature involves data)*

- **Visit**: One anonymous, browser-local usage session, ending after thirty minutes without
  activity. Holds only an anonymous marker, a start instant, the last-activity instant, and the
  journey steps produced. Never holds identity, address, or the specific territory visited.
- **Journey Step**: One countable visitor action (arrival, search, unfruitful search, territory
  selected, suggestion accepted, calendar shown with results, filter applied, detail opened,
  export, subscription initiated). Attributes only the step kind and the broad territory kind.
- **Calendar Delivery**: One request for a calendar. Attributes territory family, delivery kind
  (first delivery, revalidated, rejected, unavailable), client kind (agenda application, browser,
  automated client, or indeterminate), and whether a ceiling cut the result.
- **Security Finding**: One discovered weakness, with its scanner-assigned severity, the evidence
  that reproduces it, the human reviewer's own judgement, its disposition (fixed, mitigated,
  accepted), and, when accepted, the reason and the revisit trigger.
- **Monitor Package**: The dashboards, alerting rules, and connection definition that the existing
  monitor mounts, plus their installation procedure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The pre-publication security review completes with zero unresolved findings that the
  scanner classifies as high severity, and every remaining finding carries a recorded disposition
  and a human reviewer judgement.
- **SC-002**: A release candidate can be blocked automatically by the exploitation scan, proven at
  least once by an intentionally introduced high-severity condition.
- **SC-003**: A second operator, given only the repository, reproduces the whole review and
  checklist in under one hour without asking the original author for help, with the elapsed time
  recorded in the pre-publication checklist.
- **SC-004**: Exactly the documented calendar routes answer successfully from the internet; every
  other route is refused, verified for every route present in the service.
- **SC-005**: The launch dashboard answers all of these from data alone: number of visits, share of
  visits reaching a usable calendar, most-wanted territory families, calendar subscriptions,
  subscription renewals, and events missing a territory. A usable calendar means a calendar
  displaying at least one event for the selected territory.
- **SC-006**: A visitor who blocks usage reporting still gets a working calendar, verified in an
  automated check.
- **SC-007**: Reporting usage adds no perceptible delay to any visitor interaction: the added p95
  interaction delay stays under 5 ms, verified by comparing interaction timing with reporting
  enabled and disabled over at least 30 interactions per condition.
- **SC-008**: Usage data is visible in the existing monitor within one collection interval of the
  application starting, with no manual step after installation. This feature fixes the collection
  interval at 30 seconds.
- **SC-009**: Applying the monitor package to a clean monitor installation requires under fifteen
  minutes and no hand-edited file.
- **SC-010**: Every launch-relevant failure condition named in FR-034 raises a visible alert when
  artificially provoked.
- **SC-011**: A monitored period containing no traffic shows explicit zeros rather than missing
  series, verified over a full quiet period.
- **SC-012**: No usage record can be traced back to a named or addressable individual, verified by
  inspecting every recorded field and by confirming that no visitor address is stored anywhere;
  the request-volume bands of FR-012 are verified to exist only in memory and to be unusable
  after the daily rotation.

## Assumptions

- The monitor already running on the server uses the industry-standard open formats for metrics
  collection, dashboard definitions, and alerting rules, and can mount additional definition files
  without being rebuilt.
- The server operator can create a private network shared by the application stack and the monitor
  stack, and can add mount definitions to the monitor's configuration.
- The visitor-facing site will be served by the application's own edge instead of the current
  static hosting platform, as decided during specification; the current hosting remains usable as
  an immediate fallback during the transition.
- Anonymous, browser-local visit markers are treated as not requiring consent because they are not
  shared beyond the visitor's browser and store no personal data; the request-volume band of
  FR-012 lives only in memory, is re-keyed daily, and is never emitted as a metric label, so it
  identifies a client only for the duration of one day. A legal review remains the operator's
  responsibility.
- Rate limiting is deliberately deferred: this release measures abusive volume so that a future
  limit can be justified by observed traffic rather than guessed.
- Usage metrics are cardinality-bounded: no metric carries a specific territory identifier, a
  specific search term, or any unbounded value.
- The existing dependency and secret scanning checks stay in place and are extended only if this
  feature adds runtime dependencies.
- Publication happens once, after the review and the monitoring are in place; there is no staged
  or gradual rollout.
