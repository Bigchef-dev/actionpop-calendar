# Contract: Calendar Entry Metadata

## Purpose

Carry reconciliation, classification, provenance and diagnostic information on each calendar entry without breaking third-party clients. Experimental properties use the RFC 5545 `X-` namespace; a client that does not know them ignores them.

## Levels

| Level | Emits |
|-------|-------|
| `off` | No experimental property |
| `identity` | Identity family |
| `standard` (default) | Identity, classification and provenance families |
| `full` | Everything, including geography, diagnostics and raw source values |

A family disabled in configuration emits nothing, at any level.

## Experimental properties

| Property | Family | Level | Value |
|----------|--------|-------|-------|
| `X-ACTIONPOP-EVENT-ID` | identity | identity | Source event identifier, identical to the `UID` local part |
| `X-ACTIONPOP-UPDATED-AT` | identity | identity | Last update instant, UTC basic format |
| `X-ACTIONPOP-PERIOD` | identity | identity | Last processing period token |
| `X-ACTIONPOP-EVENT-TYPE` | classification | standard | Event-type label |
| `X-ACTIONPOP-SOURCE-URL` | provenance | standard | Canonical source page |
| `X-ACTIONPOP-GROUP` | provenance | standard | Group identifier, repeated, at most `maxGroupsPerEvent` |
| `X-ACTIONPOP-GEO-STATUS` | geography | full | `resolved`, `national`, `international`, `incomplete`, `invalid`, `unavailable` |
| `X-ACTIONPOP-COUNTRY` | geography | full | Two-letter country code |
| `X-ACTIONPOP-DEPARTMENT` | geography | full | Department code as text, including leading zeroes and `2A`/`2B` |
| `X-ACTIONPOP-INSEE-COMMUNE` | geography | full | INSEE code as text |
| `X-ACTIONPOP-GEO-REFERENCE` | geography | full | Reference version identifier |
| `X-ACTIONPOP-GEO-DIAGNOSTIC-COUNT` | diagnostics | full | Number of enrichment diagnostics |
| `X-ACTIONPOP-GEO-DIAGNOSTIC` | diagnostics | full | One diagnostic, repeated |
| `X-ACTIONPOP-RAW-DEPARTMENT` | raw source | full | Department code exactly as stated by the source |
| `X-ACTIONPOP-RAW-COMMUNE` | raw source | full | Commune name exactly as stated by the source |

## Diagnostic encoding

```text
X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous;FIELD=location.commune.name;SEVERITY=warning:several communes match "Sainte-Colombe"
```

- `CODE`, `FIELD` and `SEVERITY` are property parameters; `SEVERITY` is `warning` or `error`.
- The property value is the human-readable message, escaped as calendar text.
- Diagnostics are ordered by `code`, then `field`, so the emitted order is stable.

## Standard properties

Emitted independently of the metadata level, from the event's own published data.

| Property | Source | Omitted when |
|----------|--------|--------------|
| `LOCATION` | Place name, then the postal address: `address1` and `address2` with the postal code and city appended only when the street line does not already state them. Falls back to the short address, then the flattened full address, then the place name alone. A map link stored instead of a street line is ignored, and a place name that merely repeats the city is dropped. | No address field is populated |
| `URL` | Event source page | `source_url` is null |
| `CATEGORIES` | Event-type label | `event_type` is null |
| `GEO` | Latitude and longitude, six decimals, `latitude;longitude` | The event states no coordinates |

## Rules

- Property names are uppercase.
- Every value is escaped: backslash, comma, semicolon and line break (FR-034).
- A property whose value is unknown is omitted, never emitted empty (FR-035).
- Contents lines are folded at 75 octets with a leading space on continuation lines.
- Lines end with CRLF.
- `X-ACTIONPOP-EVENT-ID` never changes for an event; `X-ACTIONPOP-UPDATED-AT` and `X-ACTIONPOP-PERIOD` describe the last successful observation, not content equality (FR-036).
- No credentials, tokens, personal data or internal storage identifiers are emitted (FR-038).

## Verification

The emitted property set, levels and value domains are asserted against the generated OpenAPI document, so a property added, removed or re-levelled without updating the document fails the contract test (FR-040).
