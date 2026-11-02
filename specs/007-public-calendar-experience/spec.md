# Feature Specification: Public Calendar Discovery and Composition Experience

**Feature Branch**: `007-public-calendar-experience`

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "L'objectif est de partir de apps/web pour la connecter à actionpop-calendar. Fonctionnalités: Filtres; Reprendre thème campagne tortue @design.md; Barre de recherche centrale, pouvoir rechercher sa ville, département, groupe d'action (index, destiné à être étendu); Disposer d'un placeholder sur la barre de recherche, avec quelques exemples qui se tapent puis s'effacent. Faire plusieurs propositions sur l'UI; Sélectionner et créer son lien de calendrier pour l'importer dans son app de calendrier. Une fois le calendrier cherché: pouvoir filtrer par type d'action (front uniquement); afficher les informations supplémentaires X-ACTIONPOP; utiliser un emoji selon le type d'action; disposer de l'ensemble des fonctionnalités disponibles dans le calendrier : météo, maps, contact de la personne responsable; pour le script d'autocomplétion tampermonkey, archiver; concernant la partie sondage, dans un second temps. Découpe-moi en thèmes, et propose-moi des sondages pour les choix à prendre. Je souhaite avoir une réflexion approfondie sur l'UX, quels possibilités pour mettre l'utilisateur dans le bain et utiliser l'outil. Une fois un calendrier affiché, pouvoir cumuler plusieurs communes ou critères de recherche avec un bouton + qui ouvre la recherche; le lien final doit correspondre strictement à ce qui est affiché, notamment pour les groupes, plusieurs calendriers et types d'action; le changement de sujet devient la suppression d'un calendrier; le bouton de copie doit être explicitement limité au lien de la ville; si la liste est vide, retourner à l'accueil avec la grande barre."

## Why This Feature Exists

The repository already publishes filtered calendars and enriched event data, but the only
public calendar surface is a single-place, pre-configured agenda with no discovery step:
a visitor cannot start from where they live or from the action group they care about.
This feature turns the existing public calendar application into a self-service discovery
experience: a visitor states who they are looking for, immediately sees the matching
events, and leaves with a calendar link they can import into the calendar application they
already use.

## Scope Themes

The feature is deliberately split into six themes. Each theme can be validated, polled and
delivered on its own; the numbering below is reused throughout the requirements.

| Theme | Name                          | Outcome for the visitor                                                                                      |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **A** | Finding oneself               | The visitor is recognized from a city, a department or an action group, without knowing internal identifiers |
| **B** | Making the calendar one's own | The visitor filters what is shown and obtains a personal calendar link to import                             |
| **C** | Understanding an event        | The visitor sees what kind of action it is, and what the calendar does not show at first glance              |
| **D** | Feeling the campaign          | The experience carries the campaign identity and its visual language                                         |
| **E** | Being accompanied             | The visitor is guided from the first screen to the imported calendar, in a few seconds                       |
| **F** | Cleaning up what exists       | Legacy artefacts that this experience replaces are archived, and deferred work stays out of scope            |

## Clarifications

### Session 2026-11-01

- Q: Where does the responsible-person contact come from? → A: It is not carried by this experience: the contact lives on Action Populaire, so the event detail links out to the Action Populaire page of the event instead of displaying a contact.
- Q: What does "archive the Tampermonkey autocompletion script" mean concretely? → A: Move the script source to a documented archive location and stop serving it from the public application.
- Q: Must the deferred survey area stay reachable in the new experience? → A: It stays on standby: not reachable from the experience and not linked, but its code and tests are kept intact for its own later feature.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Find a city, department or action group item (Priority: P1)

A visitor arrives on the home page. A single search field sits at the center of the screen and
suggests examples of what can be searched, one after another, without interaction. The visitor
types the beginning of a city name, a department number or the name of an action group; a list
of matching search items appears, each labeled with its kind and its broader territory. The
visitor picks one item and is taken to the matching events.

**Why this priority**: Without this step nothing else can be reached; the whole feature is
the ability to translate a human description of "my place" or "my group" into a scope the
calendar already understands.

**Independent Test**: Can be fully tested by typing three different kinds of query (city,
department, group), selecting a result, and verifying the same events appear as when the
matching scope is requested directly.

**Acceptance Scenarios**:

1. **Given** an empty search field, **When** the page has been visible for a few seconds, **Then** the field placeholder has displayed at least two example queries that were typed and then erased, and the visitor has not lost any typed input.
2. **Given** the visitor types "ly", **When** suggestions appear, **Then** each suggestion states its kind (city, department or action group) and the territory it belongs to.
3. **Given** several suggestions match, **When** the visitor uses the keyboard only, **Then** they can move through suggestions, choose one, and reach the events without using a pointing device.
4. **Given** the visitor selects a suggestion, **When** the events screen opens, **Then** the chosen subject is named on screen and the page address records the choice so the page can be shared or reloaded.
5. **Given** the visitor types something that matches nothing, **When** suggestions are empty, **Then** the screen explains that nothing was found, offers at least two alternative spellings or nearby subjects, and suggests another kind of search.

---

### User Story 2 - See and filter the events of my choice (Priority: P1)

Once a subject is chosen, the visitor sees its events. They can narrow the display by type of
action (for example only leaflet distribution, only stalls, only meetings), narrow it by one or
more action groups, and can switch between month, day, week and chronological list layouts. The
filters apply to what is displayed and never change the subject itself.

**Why this priority**: A visitor who cannot recognize their own actions among dozens gives up
before importing anything; filtering is what turns a feed into a personal agenda.

**Independent Test**: Can be tested by choosing one subject, applying one type of action, and
verifying the displayed events are exactly the subset of that type for that subject, then
clearing the filter and recovering the full set.

**Acceptance Scenarios**:

1. **Given** a chosen subject with events of several types, **When** the visitor selects one type of action, **Then** only events of that type remain displayed and the count of displayed events updates.
2. **Given** a type of action filter is active, **When** the visitor reloads or shares the page, **Then** the same filtered display is restored.
3. **Given** a filtered display, **When** the visitor clears all filters, **Then** every event of the subject is displayed again.
4. **Given** a subject with no event at all, **When** the visitor opens it, **Then** an explanatory message names the subject, states that no event is currently scheduled, and offers to subscribe anyway so future events arrive automatically.
5. **Given** a small screen, **When** the visitor scrolls the events, **Then** all events remain reachable and the type of action remains readable without horizontal scrolling.
6. **Given** a city or department with several action groups, **When** the visitor selects two
   groups in "Par GA", **Then** events belonging to either selected group remain displayed and
   both selections are visibly active.
7. **Given** more action groups than fit in the available width, **When** the visitor moves
   through the "Par GA" row, **Then** the row stays on one line, exposes left and right scroll
   controls when content is hidden in that direction, and keeps every group reachable by touch
   or keyboard.
8. **Given** the visitor changes from month to day, week or list, **When** the new layout opens,
   **Then** it displays the selected layout from its initial position rather than preserving the
   previous layout's calendar viewport.
9. **Given** timed events with a start and an end, **When** the visitor opens the day or week
   layout, **Then** each event occupies its full start-to-end interval and visibly includes both
   times; its title and time remain bold and readable against the group color.
10. **Given** timed events only between 10:00 and 16:00, **When** the day or week layout opens,
    **Then** the visible time window is reduced to the events' useful hours rather than showing
    an empty 00:00-06:00 area. An event before 06:00, after the last event, or crossing midnight
    expands the window as needed.

---

### User Story 3 - Leave with my own calendar link (Priority: P1)

From the events screen, the visitor chooses how they want to follow the subject: subscribe to
a live calendar, download a copy, or open it directly in their calendar service. The proposed
link reflects exactly the calendars and filters currently displayed. A separate, explicitly
labelled city-only copy action remains available when the visitor wants only the selected city's
link. The screen explains in one plain sentence what will happen after the subscription.

**Why this priority**: The calendar link is the actual deliverable of the product; an event
list that cannot be followed is only a poster.

**Independent Test**: Can be tested by choosing multiple subjects and filters, taking the
proposed subscription link, importing it into a calendar application, and checking that the
imported calendar contains exactly the same events as the screen.

**Acceptance Scenarios**:

1. **Given** a chosen search item, **When** the visitor opens the subscription panel, **Then** the proposed link states which search items, groups, action types and other criteria it covers, and matches the displayed result exactly.
2. **Given** multiple calendars or active filters, **When** the visitor requests the final link, **Then** the imported calendar contains exactly the displayed union and restrictions, with no unselected calendar or criterion included.
3. **Given** the visitor asks to copy the city link, **When** the explicitly labelled city-only copy action is used, **Then** a confirmation is displayed and the clipboard contains a complete usable address for that city only.
4. **Given** the visitor prefers their calendar service to open directly, **When** they use that action, **Then** the service is opened pre-filled with the exact displayed calendar and no account on this site is required.
5. **Given** a subject whose calendar is not available, **When** the visitor opens the subscription panel, **Then** the panel states the problem in plain language and gives an alternative way to reach the events.

---

### User Story 4 - Understand one event at a glance (Priority: P2)

The visitor opens an event. They see when and where it happens, an emoji and a name for the
kind of action, the weather expected at that place and time, a link to open the place on a map,
the extra information attached to the event by the publisher, and how to reach the person
responsible.

**Why this priority**: Deciding to attend depends on practical details; this is what makes the
difference between reading a title and going there.

**Independent Test**: Can be tested by opening an event of a known type and verifying that the
kind, the place, the weather, the map link, the published extra information and the contact
information each appear when available, and are each absent — without leaving a gap — when not.

**Acceptance Scenarios**:

1. **Given** an event of a known type, **When** the visitor opens it, **Then** the kind is shown with its emoji and its readable name, and two events of different kinds show different emojis.
2. **Given** an event with a place and a scheduled time, **When** the visitor opens it, **Then** the expected weather for that place and time is shown, and no weather is shown when the event is too far in the future to be forecast reliably.
3. **Given** an event with a place, **When** the visitor asks to see the place, **Then** a map view of that place opens in the visitor's map service.
4. **Given** an event carrying published extra information, **When** the visitor opens it, **Then** every published extra field is displayed with a human-readable label, and fields that are absent are not displayed at all.
5. **Given** an event opened from the experience, **When** the visitor wants to reach the responsible person, **Then** a single action opens the event's Action Populaire page where the contact is published, and no contact field is invented by the experience.
6. **Given** an event with no published extra information, **When** the visitor opens it, **Then** the event still displays completely without empty sections.

---

### User Story 5 - Feel at home and be guided (Priority: P2)

The whole experience uses the campaign's visual language: its colors, its typefaces, its turtle
illustrations, and a tone of voice that is direct and welcoming. A first-time visitor
understands in one screen what the tool does, what it is not, and what to do next; a returning
visitor lands directly on their last choice.

**Why this priority**: This is what turns a utility into something people share; it also
determines whether the campaign identity is recognizable in the first three seconds.

**Independent Test**: Can be tested by showing the home page to someone unfamiliar with the
project and asking them, without help, what the tool does and what their first action should
be.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** the home page is displayed, **Then** the purpose of the tool and the single first action are both readable without scrolling on a phone.
2. **Given** the campaign visual identity, **When** any screen is displayed, **Then** only the campaign colors, typefaces and illustrations are used, and text keeps a readable contrast against its background.
3. **Given** a visitor who previously chose a subject, **When** they return, **Then** their previous choice is proposed without preventing them from searching something else.
4. **Given** a visitor who prefers reduced animation, **When** the home page is displayed, **Then** the animated examples stop or become static and no content depends on the animation.
5. **Given** a visitor using a screen reader, **When** they go through the home page, **Then** every image that carries meaning has a description and decorative illustrations are ignored.

---

### User Story 6 - Share a discovery (Priority: P3)

A visitor who found relevant events sends the page address to someone else. The recipient
arrives on the same subjects and the same filters.

**Why this priority**: Sharing is the cheapest growth channel for a campaign tool, but it only
works if the state is fully contained in the address.

**Independent Test**: Can be tested by copying the address of a filtered view, opening it in a
fresh session, and comparing the displayed events with the original.

**Acceptance Scenarios**:

1. **Given** a filtered view, **When** its address is opened in a new session, **Then** the same subjects and the same filters are displayed.
2. **Given** an address that refers to an unknown subject or an invalid filter, **When** it is opened, **Then** the visitor is informed and can search again instead of seeing a broken screen.

---

### User Story 7 - Combine several calendars and criteria (Priority: P1)

Once a calendar is displayed, the visitor can add another city or department, or refine the
display with additional search criteria, without losing the calendars already selected. A small
plus button opens the same search experience used on the home page. Each selected calendar is
shown as a removable item, and the visitor can remove one calendar without resetting the others.
The final calendar link represents exactly the currently displayed combination, including all
selected search items, groups, action types and other active criteria.

**Why this priority**: Combining nearby places and criteria is the core use case for visitors who
follow a territory rather than one administrative subject; an incomplete link would undermine
trust in the subscription.

**Independent Test**: Can be tested by selecting a city, adding a department through the plus
button, applying two groups and one action type, removing one city, and verifying that the
display and generated link contain exactly the remaining selections.

**Acceptance Scenarios**:

1. **Given** a displayed calendar, **When** the visitor activates the small plus button,
   **Then** a search bar opens and allows them to add a second city or department without
   leaving the current calendar screen.
2. **Given** several selected cities or departments, **When** the visitor views the calendar,
   **Then** events from all selected search items are displayed as one combined result and each
   selected subject is named in the current selection.
3. **Given** a selected calendar, **When** the visitor chooses to remove it, **Then** only that
   calendar is removed and the remaining calendars and criteria stay active.
4. **Given** no selected calendar remains after removal or filtering, **When** the result list is
   empty, **Then** the experience returns the visitor to the home page with its large central
   search bar ready for a new search.
5. **Given** a combined and filtered display, **When** the visitor requests the final calendar
   link,    **Then** the link reproduces exactly the displayed search items, groups, action types,
   multiple-calendar selection and other active criteria.
6. **Given** a visitor wants to copy a city link, **When** they use the copy action, **Then**
   the control is explicitly labelled as copying the city-only link and does not imply that it
   copies the complete combined display link.

---

### Edge Cases

- A commune name that several departments share: the visitor must be invited to choose a
  department rather than receiving an arbitrary set of events.
- A department number typed as a word, or a word typed as a number ("Rhône" / "69"): both forms
  must lead to the same subject.
- Accents, apostrophes, hyphens, casing and common misspellings in a city or group name.
- A subject whose events are all in the past: the screen must not look empty; it must state
  the situation and offer the upcoming calendar.
- A subject with a very large number of events: the display must stay usable and indicate the
  period covered.
- Very long group names, including acronyms and parenthesised qualifiers, on a narrow screen.
- A group row whose content is wider than the viewport, including when the row is already scrolled
  to its left or right edge.
- A subject containing only all-day events, no timed events, or events before 06:00 or crossing
  midnight.
- Switching layouts repeatedly, including while a calendar is scrolled or navigated away from
  its initial period.
- No network, slow network, or an unavailable events service.
- A visitor who refuses or ignores a location permission prompt: the experience must never
  depend on it.
- A visitor who lands on an event detail address and then reloads it.
- A visitor with an out-of-date link after a subject is renamed or merged with another.
- Events with no place, with a place but no coordinates, or with an all-day duration.
- Adding a subject that is already selected: the visitor must see that it is already present
  rather than silently creating a duplicate calendar.
- Removing the final selected calendar or applying criteria that match no events: the visitor must
  return to the home page with the large central search bar ready.
- A combined selection containing both a city item and a department item: the final result must preserve
  both scopes without replacing one with the other.
- A visitor choosing the city-only copy action from a combined display: only the designated city
  scope may be copied.

## Requirements _(mandatory)_

### Theme A — Finding oneself

- **FR-001**: The home screen MUST present a single central search field as the primary action, with no other action competing for the same attention.
- **FR-002**: The search MUST resolve one query to subjects of at least three kinds: city (commune), department, and action group; the set of kinds MUST be defined as an extensible catalogue so that a further kind can be added without redesigning the screen.
- **FR-003**: Each suggested subject MUST display its readable name, its kind, and the broader territory it belongs to when one exists.
- **FR-004**: Suggestions MUST appear while typing, tolerate accents, apostrophes, hyphens, casing and number-or-word department forms, and MUST rank subjects whose name starts with the query before those that merely contain it; within one rank tier, city suggestions MUST be ordered by decreasing population so that the largest place comes first.
- **FR-005**: The search field MUST display, without any visitor interaction, a rotating set of example queries that are typed then erased; the rotation MUST stop on focus, stop when the visitor has typed something, and MUST be suppressed when the visitor has asked for reduced animation.
- **FR-006**: The search MUST be fully operable with a keyboard alone (open suggestions, move, choose, dismiss) and MUST announce the number of available suggestions to assistive technologies.
- **FR-007**: When a query matches nothing, the screen MUST explain the result, propose at least two nearby alternatives and invite another kind of search.
- **FR-008**: When a query matches a commune name shared by several departments, the screen MUST ask the visitor to disambiguate rather than combining those departments silently.
- **FR-009**: Selecting one or more search items MUST record the complete selection in the page address so that the view can be reloaded, shared and restored.
- **FR-010**: The experience MUST present several distinct interface proposals for Theme A — at minimum three, differing in the placement and prominence of the search field, the shape of the suggestion list and the accompanying illustration — so that one can be chosen before implementation is finalized.

### Theme B — Making and combining the calendar

- **FR-011**: The events screen MUST display the events of the chosen search item over the calendar's published coverage, and MUST state that coverage on screen without making it an additional visitor-selected criterion.
- **FR-011a**: The events screen MUST allow the visitor to maintain a set of one or more selected city and department search items, and MUST display each selected item as a distinct removable selection; selecting an additional item MUST combine its events with the existing result rather than replacing it.
- **FR-011b**: A small plus control MUST open the search bar from the events screen so the visitor can add a city or department without losing the current selection, filters or calendar position.
- **FR-011c**: The experience MUST prevent duplicate selected subjects and MUST make the removal action explicit; the former "change subject" action MUST be labelled as removing a calendar (for example, "Enlever le calendrier") and MUST remove only the selected calendar.
- **FR-012**: The visitor MUST be able to filter displayed events by type of action, with several types selectable at once, and each type identified by its emoji and readable name.
- **FR-012a**: For a city or a department, the events screen MUST offer a compact group filter labelled "Par GA" above the type-of-action filter, built from the group published with each event; it MUST stay on one line, use little vertical space, and offer a "Tous" option plus multiple selectable groups. "Tous" MUST mean that no group restriction is applied; when several groups are selected, events belonging to at least one selected group MUST be shown. Each group MUST have a stable color and a distinct non-color marker, and the same full group color MUST be used on its event cards in the calendar.
- **FR-012b**: When the group filter contains more groups than fit in its available width, it MUST remain a single horizontal row with touch and keyboard scrolling. A visible left control MUST appear when content is hidden to the left, and a visible right control MUST appear when content is hidden to the right; each control MUST scroll only the group row and MUST expose an accessible label.
- **FR-013**: The type-of-action and other search-criteria filters MUST act only on what is displayed and MUST NOT modify the selected subjects.
- **FR-014**: The visitor MUST be able to switch between month, day, week and list layouts, and the chosen layout MUST survive a reload. On a narrow mobile viewport, the day layout MUST be the initial layout when the address does not specify one. In day and week layouts, an event's displayed block MUST use its full start-to-end duration, and its content MUST be allowed to wrap within that block instead of being forced onto one line.
- **FR-014a**: Changing the layout MUST reset the calendar view to the selected layout's initial viewport, rather than retaining stale navigation or scroll state from the previously displayed layout.
- **FR-014b**: In day and week layouts, the visible time window MUST be derived from the displayed timed events. It MUST omit unused hours before the first useful event (with 06:00 as the default lower bound), extend earlier for events before 06:00, extend later through the latest end, and cover midnight-crossing events. All-day events MUST NOT create an artificial timed interval.
- **FR-014c**: In every calendar layout that renders event cards, the event title and displayed start/end times MUST be bold and meet the experience's contrast requirement; day and week cards MUST allow the title to wrap inside the event duration.
- **FR-015**: The active filters MUST be reflected in the page address and restored when the address is reopened; an address carrying an unknown filter value MUST be reported and recovered from.
- **FR-016**: The events screen MUST expose the number of displayed events relative to the total number of events of the selected search items.
- **FR-017**: The visitor MUST be able to obtain a personal calendar link for the selected calendars, presented in the forms the visitor's calendar application can consume (direct subscription address, downloadable file, and an action that opens a well-known calendar service pre-filled).
- **FR-018**: The final calendar link MUST reflect exactly the displayed selection: every selected city or department search item, every selected action group, every selected action type and every other active search criterion; it MUST include no unselected calendar or criterion.
- **FR-019**: The subscription panel MUST make the coverage of the final link plain — all search items, retained groups, action types and other criteria are readable in the panel — and MUST state what happens after subscription (updates arrive automatically, no account needed).
- **FR-020**: The subscription panel MUST show the complete final subscription address itself, without a human summary that hides it, and MUST provide a separate action explicitly labelled as copying the city-only link; each copy action MUST show a visible confirmation and copy a complete directly usable address for its stated scope.
- **FR-021**: When the selected search items' calendar cannot be produced, the screen MUST state the problem plainly and offer an alternative way to reach the events; it MUST NOT present a broken or empty link as valid.
- **FR-022**: A subject with no upcoming event MUST still offer subscription, so that future events are received automatically.
- **FR-022a**: When no selected calendar remains, or when active criteria produce no displayed events, the experience MUST return to the home page and show the large central search bar ready for a new search rather than leaving an empty calendar screen.

### Theme C — Understanding an event

- **FR-023**: Every event MUST display the kind of action it represents, always through the emoji associated with that kind and with a neutral fallback when the kind is unknown: the month layout MUST show that emoji in place of the default event marker, and the list MUST show the emoji alone, its readable name being carried by the accessible label rather than by a visible chip.
- **FR-024**: The event detail MUST give direct access to the responsible person by opening the Action Populaire page of the event in a new tab, through a yellow button labelled "Action Populaire" carrying the campaign mark, since the contact itself is not carried by the published calendar; it MUST NOT display a contact field it does not own.
- **FR-025**: The event detail MUST display the practical information already available to the calendar: dates and times in the visitor's language, place with an action to open it in a map service, expected weather for the place and time when a forecast is meaningful, and an action to add the event to the visitor's own calendar.
- **FR-026**: The event detail MUST display every extra field published with the event, each with a human-readable label, and MUST omit absent fields entirely rather than displaying empty sections.
- **FR-027**: The event detail MUST keep the event status visible (confirmed, provisional, cancelled) so a cancelled or provisional action cannot be mistaken for a confirmed one.
- **FR-028**: The event detail MUST remain reachable from a direct address and MUST be usable on a narrow screen without horizontal scrolling.

### Theme D — Feeling the campaign

- **FR-029**: The experience MUST use only the campaign's defined colors, typefaces and illustration assets; any other visual value used by the starting application MUST be replaced or explicitly retained with a recorded reason.
- **FR-030**: The experience MUST remain legible: text and interactive elements MUST meet WCAG 2.1 level AA contrast (4.5:1 for body text, 3:1 for large text and interactive boundaries) in both the light and the dark display preference, each defined by its own set of campaign-compliant tokens.
- **FR-031**: The experience MUST remain usable on a phone held in one hand, in a moving vehicle tolerance of imprecision: primary actions reachable with the thumb, no hover-only affordance, and no information conveyed by color alone.
- **FR-032**: The experience MUST present several distinct visual proposals for the home screen and for the detail screen before implementation is finalized, so that the campaign's visual direction can be chosen rather than assumed. The proposal format, count and minimum differences are those of FR-010; the two requirements differ only by the screens they cover.

### Theme E — Being accompanied

- **FR-033**: The home screen MUST state in one sentence what the tool does and one sentence what it is not, in the campaign's tone of voice.
- **FR-034**: The visitor MUST be able to complete the whole journey — arrive, search, choose, filter, obtain a link — without creating an account and without any explanation external to the screen.
- **FR-035**: The experience MUST provide an explicit state for each of: loading, no result, no event for the subject, unavailable service, and unknown or outdated address; each state MUST offer a way forward.
- **FR-036**: The experience MUST propose the visitor's previous choice on return, without blocking a new search.
- **FR-037**: The subscription step MUST be reachable from every events screen in at most one action, and the journey from arrival to a usable link MUST NOT require more than four deliberate actions by the visitor.
- **FR-038**: The experience MUST NOT require a location permission to function, and MUST NOT collect personal data beyond what the visitor explicitly types.

### Theme F — Cleaning up what exists

- **FR-039**: The legacy single-place configuration (fixed agendas, fixed place, pre-set coordinates) MUST NOT constrain the new experience; the experience MUST work for any supported subject.
- **FR-040**: The autocompletion browser script currently distributed with the public application MUST be archived: moved to a documented archive location kept out of the served files, removed from what a visitor can download, with its history preserved and the archival location documented.
- **FR-041**: The survey area present in the starting application MUST stay on standby: it MUST NOT be reachable or linked from the new experience, while its existing code and tests are kept intact for its own later feature.
- **FR-042**: The feature MUST NOT change the content or format of the published calendars and their extra fields; it is a reading experience over what already exists.
- **FR-043**: The events screen and its calendar link MUST use the latest complete published event state matching every selected city item, department item or group, regardless of whether the ingestion worker is currently running or when its last cycle completed.
- **FR-044**: A cancelled event MUST remain visible while it belongs to the displayed calendar period, with an explicit textual cancelled status; it MUST be retained in history indefinitely but MUST not be shown publicly after it leaves the calendar window.
- **FR-045**: The ingestion process MUST use a single detail request as authoritative evidence for an event cancellation only when the source returns an explicit `404 Not Found`; transient, malformed, incomplete or ambiguous responses MUST preserve the last known event.

### Key Entities

- **Search Subject**: a thing a visitor can search for and then follow. Attributes: a stable identifier, a readable name, a kind (city, department, action group, or a future kind), a broader territory, a display qualifier used to disambiguate homonyms, and the calendar scope it maps to.
- **Search Index Entry**: the searchable projection of a subject. Attributes: normalized text for matching, sort key for ranking, kind, and the reference to the subject.
- **Scope Selection**: the visitor's current choice. Attributes: an ordered set of selected city and department search items, the retained groups and action-type filters, other active criteria, the retained layout, and an address representation.
- **Action Type**: the kind of action an event represents. Attributes: identifier, readable name, emoji, and color, with a neutral fallback when unknown.
- **Event Summary**: what is needed to display an event without opening it. Attributes: title, start and end, place, action type, status.
- **Event Detail**: everything the published calendar offers for one event, including the extra published fields, the place coordinates, and the responsible person when available.
- **Calendar Link**: the personal subscription offer. Attributes: selected search items, retained groups and action types, other criteria, scope (exact display or city-only), the consumable addresses in the supported forms, and a human description of what it covers.
- **Interface Proposal**: a documented variant of the home or detail screen, used to choose the design direction before implementation.
- **UX Decision Poll**: a short question submitted to the campaign team to arbitrate an open design choice, with options and their consequences.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A visitor who has never seen the tool can obtain a usable calendar link in under 60 seconds, without any help or external instruction.
- **SC-002**: At least 90% of visitors who type a valid city, department or group name reach an events screen on their first attempt.
- **SC-003**: Suggestions appear in under one second, measured at the 95th percentile on a throttled mobile connection, for the complete searchable corpus (every commune and department of the active geographic reference plus every active action group).
- **SC-004**: The home screen becomes readable and actionable in under three seconds on a public mobile connection.
- **SC-005**: At least three distinct interface proposals are documented and arbitrated by poll before implementation starts.
- **SC-006**: A visitor using only a keyboard and a screen reader can complete the whole journey — search, choose, filter, obtain a link — without getting stuck.
- **SC-007**: No screen of the experience presents an empty or broken state without an explicit message and a way forward.
- **SC-008**: Every event displayed shows its action type with an emoji, and no event displays an empty extra-information section.
- **SC-009**: The proportion of visitors who open the subscription panel and leave with a link copied or opened is at least 50%.
- **SC-010**: The autocompletion browser script is no longer reachable from the public application, and its archival location is documented.
- **SC-011**: A shared address reproduces exactly the same selected calendars and filters for the recipient, for 100% of the tested cases.
- **SC-012**: With the worker stopped after a successful publication, 100% of tested commune, department and group requests continue to return the same matching published events rather than an empty result.
- **SC-013**: In 100% of tested explicit detail `404` cases, the event remains in history, is shown as cancelled while inside the calendar window, and is absent from the public feed after the window; no transient failure causes cancellation.
- **SC-014**: In 100% of tested group-filter cases, selecting multiple groups displays the union of
  their events, selecting "Tous" removes the restriction, and every group remains reachable in
  an intentionally overflowing row.
- **SC-015**: In 100% of tested layout-switch cases, changing layout displays the requested
  month, day, week or list view from its initial viewport without stale state from the prior view.
- **SC-016**: In 100% of tested timed-event cases, day and week layouts display the complete
  start-to-end interval, both times, and a useful time window without an unused 00:00-06:00
  block when no event occurs there.
- **SC-017**: At least 95% of participants in a mobile readability check can identify an event's
  title, start time and end time from the calendar card without zooming.
- **SC-018**: In 100% of tested combined-calendar cases, the final link reproduces exactly the
  displayed search items, groups, action types and other active criteria, while the explicitly
  city-only copy action contains only its designated city.
- **SC-019**: In 100% of tested removal and empty-result cases, removing the last calendar or
  filtering out every event returns the visitor to the home page with the large search bar ready.

## Assumptions

- The published calendars already support filtering by place and by type of action, and the
  experience reuses those capabilities instead of introducing a second source of truth.
- The list of action types, with their emoji and color, is already published upstream and can be
  reused as is; unknown or new types fall back to a neutral presentation.
- The existing public calendar application is the starting point: its event display, weather,
  map link and add-to-calendar behaviours are retained and reorganized rather than rebuilt.
- The responsible person's contact is published on Action Populaire and is not carried by the
  published calendars; the experience therefore links out to the source event page rather than
  duplicating or storing contact data.
- The visitor's interface language is French; no other language is required for this feature.
- The experience is public and read-only: no account, no personal data storage, no moderation.
- Search subjects come from data the project already holds (commune and department reference
  data, and known action groups); no new external data source is introduced by this feature.
- The calendar uses the published coverage supplied by the existing calendar source; that
  coverage is not a visitor-selected criterion and is not encoded as a separate link filter.
- Polls are produced as decision support for the campaign team and do not block the
  specification; each poll has a documented default so the work can proceed if no answer comes.
- The survey feature of the starting application is deferred to its own later feature and is not
  re-specified here.
- The public retention policy is history-only: cancellation is retained indefinitely in storage, while
  the public calendar continues to apply its normal time window.
- A combined calendar is the union of all selected city and department scopes, then narrowed by
  the active groups, action types and other criteria; duplicate events are shown once.
- The final subscription link is intended to reproduce the displayed result exactly, while the
  city-only copy action remains a deliberately separate convenience for one city.
- The authoritative single-request cancellation signal is an explicit `404` from the event detail
  resource; group disappearance alone is not sufficient unless a complete source listing proves it.
