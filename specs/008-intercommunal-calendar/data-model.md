# Data Model: Intercommunal Calendar Discovery

## Reference Version

Represents one imported administrative snapshot.

| Field | Type | Rules |
|---|---|---|
| `version` | string | Stable source/version identifier; required and unique |
| `source` | string | Public source identifier; required |
| `status` | enum | `staged`, `active`, or `retired` |
| `loadedAt` | timestamp | Required; `Europe/Paris` for user-facing reporting |
| `activatedAt` | timestamp | Set only when validation passes |
| `diagnostics` | structured JSON | Counts and validation failures |

Only one version may be active for EPCI serving. Activation is atomic.

## Intercommunal Territory

Represents an EPCI search subject.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Official stable EPCI identifier; required and unique within a version |
| `name` | string | Public display name; non-empty |
| `normalizedName` | string | Accent/case-insensitive search form |
| `kind` | enum | `CC`, `CA`, `CU`, or `METRO` |
| `categoryLabel` | string | French category label shown to users |
| `departmentCodes` | string[] | Geographic qualifiers; valid department codes |
| `active` | boolean | Only active territories enter new search results |
| `version` | relation | Exactly one reference version |

Stable identity is the official ID, not the display name. Renaming does not create a new
subject when the official ID remains stable.

## EPCI Membership

Represents membership in a reference snapshot.

| Field | Type | Rules |
|---|---|---|
| `epciId` | string | References an intercommunal territory |
| `communeId` | string | References an existing commune reference |
| `version` | string | Same snapshot as the territory |
| `validFrom` | date | Optional source validity start |
| `validTo` | date | Optional; must not precede `validFrom` |
| `quality` | enum | `complete` or `unverified` |

The compound identity is `(version, epciId, communeId)`. Duplicate rows are rejected.

## Search Subject

The existing public subject shape with:

- `kind: "epci"`;
- `id`: official EPCI ID;
- `label`: public name;
- `qualifier`: category plus department context;
- `calendar.params.epci`: the EPCI ID.

The category is metadata on the subject and does not create a separate query kind.

## Resolved Territory Calendar Scope

An in-memory query result containing:

- selected EPCI ID;
- active reference version;
- sorted unique commune IDs;
- membership quality (`complete` or `incomplete`);
- diagnostics, if any;
- existing event-type and group filters.

An incomplete scope cannot be presented as complete. It may return a dedicated availability
state and must not fall back to a different subject.

## State Transitions

```text
staged -> active       only after identity, category, membership, and referential validation
staged -> retired      when validation fails or source is superseded
active -> retired      when replaced by a newly activated version
```

Serving always reads the active version. A failed refresh leaves the previous active version
unchanged.
