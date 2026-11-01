# Decision Polls

**Feature**: [spec.md](./spec.md) | **Satisfies**: SC-005, FR-010, FR-032

Each poll is a short question submitted to the campaign team to arbitrate one open UX choice. Every
question carries a **recommended default**: when no answer arrives, the default is applied so the
work is never blocked. Status values: `open`, `answered`, `defaulted`.

## Polls

| ID  | Theme | Question                                              | Options (consequence)                                                                                                                                                                                                                      | Recommended               | Status |
| --- | ----- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------ |
| S1  | A / D | Which home screen?                                    | **A** centered hero with the turtle (strong promise, one action) · **B** compact field above live results (faster on repeat visits, weaker identity) · **C** three-step framing with side illustration (most educational, longest to read) | A                         | open   |
| S2  | A / E | How should the examples behave in the field?          | Type and erase automatically (A7 cadence) · appear word by word · stay as a static list                                                                                                                                                    | Type and erase            | open   |
| S3  | A     | How are suggestions shown?                            | Flat list · grouped by kind · inline with an event counter per subject                                                                                                                                                                     | Grouped by kind           | open   |
| S4  | A     | Can a visitor combine several subjects?               | One subject at a time · several subjects unioned into one calendar                                                                                                                                                                         | One subject, refine later | open   |
| S5  | B     | Does the subscription link keep the displayed filter? | Always · never · visitor chooses, kept by default                                                                                                                                                                                          | Visitor chooses           | open   |
| S6  | B     | Which link form is proposed first?                    | Live subscription · downloadable copy · both at the same level                                                                                                                                                                             | Live subscription         | open   |
| S7  | C     | How is the published extra information shown?         | Collapsed "Informations publiées" section · technical panel · tooltips                                                                                                                                                                     | Collapsed section         | open   |
| S8  | D     | Which visual direction?                               | Full-page turtle hero · editorial off-white · interactive map                                                                                                                                                                              | Full-page turtle hero     | open   |
| S9  | E     | Does the tool remember the last search?               | Yes, proposed on return · neutral home every time                                                                                                                                                                                          | Yes                       | open   |
| S10 | D     | Keep the dark preference?                             | Keep with WCAG AA tokens · drop it                                                                                                                                                                                                         | Keep                      | open   |

## Interface proposal arbitration

FR-010 and FR-032 require proposals to be produced and arbitrated before implementation is
finalized. The proposals exist as review-only variants, each in its own component file, and are
never shipped in a production build unless `VITE_REVIEW_PROPOSALS=true`.

| Proposal | Screen    | File                                                                         | Hypothesis                                                  | Recommended |
| -------- | --------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------- |
| A        | Discovery | `apps/web/src/features/discovery/components/proposals/DiscoveryVariantA.vue` | A single centered promise converts first-time visitors      | yes         |
| B        | Discovery | `apps/web/src/features/discovery/components/proposals/DiscoveryVariantB.vue` | Repeat visitors want the field immediately, identity second | no          |
| C        | Discovery | `apps/web/src/features/discovery/components/proposals/DiscoveryVariantC.vue` | Explaining the three steps removes hesitation               | no          |
| A        | Detail    | `apps/web/src/features/calendar/components/proposals/DetailVariantA.vue`     | A card reads like the rest of the experience                | yes         |
| B        | Detail    | `apps/web/src/features/calendar/components/proposals/DetailVariantB.vue`     | An accent rule signals "public information"                 | no          |

Review with `?proposition=b|c` on the home address and `?propositionDetail=b` on an event address,
with `VITE_REVIEW_PROPOSALS=true` in a preview build.

**Arbitration record**: not yet held — status `defaulted`, recommendation applied so the
implementation could proceed. The poll answers above, once collected, replace the defaults and are
recorded here with their date.
