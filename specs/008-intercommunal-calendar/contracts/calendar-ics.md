# Contract: EPCI Calendar Feed

## Endpoint

`GET /calendar.ics?epci={id}&event_type={type}&group={group-id}`

`epci` is optional and can coexist with existing criteria.

## Filter semantics

- Multiple EPCI IDs in one `epci` parameter combine with OR.
- EPCI criteria and event-type/group criteria combine with AND.
- An EPCI resolves to its current active commune membership.
- Events matching through multiple communes or groups are returned once, keyed by the
  existing stable event identity.
- Existing city, department, event-type, group, cache, ETag, and `304` behavior remains valid.

## Availability states

| State | Feed behavior | UI expectation |
|---|---|---|
| active and complete | `200 text/calendar` | Show calendar normally |
| active with incomplete membership | Explicit availability error/diagnostic; no unrelated events | Explain incomplete coverage and recovery |
| invalid or retired ID | Existing invalid-filter error shape | Return to search without fallback scope |
| valid but no matching events | `200 text/calendar` with zero entries | Offer subscription for future events |

Unavailable or incomplete EPCI membership returns HTTP `503` with the existing
`diagnostics` array. Invalid or retired identifiers remain HTTP `400`. Neither state may be
encoded as a successful unrelated feed.

## Compatibility

Links without `epci` are byte-for-byte contract-compatible apart from existing dynamic headers.
The generated subject link must contain `epci`, active event types, and active group IDs.
