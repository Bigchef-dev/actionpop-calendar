# Contract: Web experience

**Applies to**: the static site built from `apps/web`

This contract describes what the visitor sees and what the address contains. It is the agreement
between the experience and everyone who links to it, tests it, or reviews it.

## Screens

| Screen       | Address                               | Purpose                                                                         |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------- |
| Discovery    | `/`                                   | One central search field, the tool's promise in one sentence, rotating examples |
| Calendar     | `/?sujets=<kind>:<id>,...`                 | Events of the selected search items, filters, subscription entry point        |
| Event detail | `/?sujets=<kind>:<id>,...&evenement=<uid>` | Everything known about one event                                               |

There is no third route: the four spec states that are not screens (no result, no event,
unavailable service, outdated address) are **states of these two screens**.

## Address parameters

| Parameter   | Values                         | Default                            | Behaviour when invalid                                                    |
| ----------- | ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `sujets`    | comma-separated `<kind>:<id>`  | absent (discovery)                 | Unresolvable item → report it and offer removal or a new search            |
| `groups`    | comma-separated group IDs      | all groups                         | Unknown group ignored and reported                                          |
| `types`     | comma-separated slugs          | all types                          | Unknown slug ignored and reported; all slugs invalid → all types           |
| `vue`       | `mois` \| `jour` \| `semaine` \| `liste` | `jour` under 768 px, `mois` above | Falls back to the default                                                 |
| `evenement` | event `UID`                    | absent                             | Not displayed; the calendar still renders                                 |

**Rules**

- The address is written with `history.replaceState`; navigating within the experience never
  pushes a new history entry.
- Any address, however malformed, renders a usable screen (FR-015, FR-035).
- The calendar layout selector is ordered as list, day, week, month. Changing it starts the
  selected calendar view at its initial viewport; it does not reuse the previous layout's
  navigation or scroll position.
- Day and week views show the complete start-to-end duration of timed events, including both
  times. Their visible hours are bounded by the displayed timed events, defaulting to 06:00 as
  the earliest hour when no earlier event requires expansion. All-day events do not define the
  timed window.
- The "Par GA" row remains a single horizontal row. It supports multiple selected groups, a
  "Tous" state, and directional controls with accessible labels whenever content is hidden on
  the corresponding side.
- The address is the only source of truth for shareability (US6): what a second visitor sees is
  what the address says, not what the first visitor's browser remembered.
- A small plus control opens the search bar from the calendar screen. Adding an already selected
  search item is rejected visibly; each selected item has its own removal action.
- The final link mirrors every selected search item, group and action-type filter. The city-only
  copy action is explicitly labelled and includes only its designated city item.

## Required states

| State                      | Trigger                                                    | What the screen shows                                                              | Way forward                    |
| -------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| Loading                    | Request in flight                                          | Skeleton of the expected layout, no spinner-only screen                            | —                              |
| No result                  | Search answered with `total = 0`                           | Statement, two nearby alternative queries, invitation to change the kind of search | Pick an alternative            |
| No event                   | Search items resolved, feed answered, zero events in coverage | Selected item names, statement that nothing is scheduled                         | Subscribe anyway; search again |
| Unavailable                | Search, feed or weather request failed                     | Plain-language statement naming what is unavailable                                | Retry; link to the direct feed |
| Outdated / unknown subject | One `sujets` item does not resolve                         | Statement plus the searched value                                                  | Remove it or search again      |
| Reduced motion             | `prefers-reduced-motion: reduce`                           | Rotating examples static, no decorative animation                                  | —                              |

## Journey invariants

- **J1** — Discovery, selection and subscription require no account and no permission prompt.
- **J2** — At most four deliberate actions from arrival to a usable link (search → choose →
  filter (optional) → copy/open). Filtering is optional and never gates the subscription.
- **J3** — The subscription entry point is visible on every calendar screen without scrolling on
  a 375 × 667 viewport.
- **J4** — Every screen states the selected search-item names and never presents the feed coverage
  as a visitor-selected filter.
- **J5** — No screen depends on a hover, a drag, or a pointer-only gesture.

## Accessibility invariants

- **A1** — The search field follows the WAI-ARIA combobox pattern: `aria-expanded`,
  `aria-controls`, `aria-activedescendant`, and an `aria-live` region announcing the result count.
- **A2** — Arrow keys move through suggestions, `Enter` chooses, `Escape` closes, `Tab` leaves the
  combobox without losing the typed value.
- **A3** — Colour is never the only carrier of meaning: the action type is always emoji plus name,
  the event status always has a text label, the active filter is also marked by `aria-pressed`.
- **A4** — Text and interactive elements meet WCAG AA contrast against the campaign palette.
- **A5** — Meaningful illustrations have alternative text; decorative ones are `aria-hidden`.
- **A6** — The animated placeholder stops on focus, on typing, and under reduced motion; it is
  never the only way to learn what can be searched (examples are also reachable as a static list).
- **A7** — The placeholder types one example in 1.2 s to 1.8 s, holds it 1.5 s, erases it in
  400 ms and pauses 600 ms before the next one; the cycle covers at least three examples and
  restarts from the first.

## Campaign identity

- Only the colours, typefaces and illustrations named in [docs/design.md](../../../docs/design.md)
  are used: primary `#4C0297`, secondary `#D1271C`, paper `#FFFCF4`, ink `#212320`, with
  `Union Gothic` / `Stack Sans Text` typefaces and the turtle illustrations.
- The palette lives in one token file consumed by Tailwind; no component hard-codes a hex value.

## Interface proposals

Before implementation is finalized, the experience ships the proposals defined in
[data-model.md](../data-model.md#interfaceproposal) as variants selected by
`?proposition=<id>` (a review-only flag, ignored in production output unless explicitly enabled):

- Three discovery-screen proposals (FR-010).
- Two detail-screen proposals (FR-032).

Each proposal must keep every invariant above; a proposal that violates J1–J5 or A1–A7 is not
eligible. Exactly one proposal per screen is marked as the recommended default, and the chosen one
is recorded in the decision poll alongside its date.

## Out of scope for this contract

- The survey feature of the legacy application (kept on standby, not routed).
- Any language other than French.
- Any personal data storage, account or analytics collection.
