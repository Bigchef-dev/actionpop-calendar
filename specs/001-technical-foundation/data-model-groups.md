# Data Model: Groups and Scheduling

## Scope

Represents a configured Action Populaire group and dispatcher scope.

| Field | Rule |
|---|---|
| `scopeId` | Stable source `id`; normalized before job identity creation |
| `displayName` | Source `name`; human-readable and not identity |
| `active` | Maps from `is_active`; only active scopes are dispatched |
| `scopeType` | Source `type`, initially group-based |
| `sourceSubtype` | Source `subtype` and `subtypes` for diagnostics |
| `certified` | Informational `is_certified` value |
| `locationId` | Optional reference to the typed `LocationRecord` for this group |
| `sourceLink` | Public source group URL |
| `sourceFilter` | Optional source `filter`, possibly empty |

The catalogue endpoint is the source of truth for discovery. A complete catalogue
sync upserts active and inactive groups before active scope changes are applied.
Deactivating a group prevents new jobs but does not delete its last published dataset.

## ProcessingPeriod

Represents one dispatcher slot.

| Field | Rule |
|---|---|
| `periodStartUtc` | Required identity and queue scheduling value |
| `periodEndUtc` | Required and later than start |
| `periodStartEuropeParis` | Derived audit value |
| `periodEndEuropeParis` | Derived audit value |
| `periodToken` | Stable UTC token used in job identity |

UTC identifies the slot to avoid daylight-saving duplicates or gaps. Application-facing
dates remain `Europe/Paris`.
