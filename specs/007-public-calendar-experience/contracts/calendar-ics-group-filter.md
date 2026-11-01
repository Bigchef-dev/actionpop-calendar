# Contract: `group` criterion on the filtered calendar feed

**Extends**: [specs/003-icalendar-filtered-feed/contracts/calendar-ics.md](../../003-icalendar-filtered-feed/contracts/calendar-ics.md)

## Purpose

Let a visitor subscribe to the calendar of one action group, found through the subject search.
This is the only addition to the feed contract; every other parameter keeps its current
meaning and behaviour.

## Request

```http
GET /calendar.ics?group=npa-lyon,attac-rennes
```

| Parameter | Required | Repeatable      | Meaning                                                     | Example    |
| --------- | -------- | --------------- | ----------------------------------------------------------- | ---------- |
| `group`   | no       | comma-separated | Identifier of an action group that contributed to the event | `npa-lyon` |

## Semantics

- Values inside `group` combine with OR, like every other repeatable parameter; the parameter
  combines with the other parameters with AND.
- An event satisfies the criterion when it is attributed to at least one of the listed groups,
  through the existing group attribution link.
- The identifier is the same one the attribution already stores and the same one the subject
  search returns in `calendar.params.group`. No normalization is applied beyond trimming: an
  unknown identifier produces an empty calendar with status `200`, never a broad query.
- An empty value (`group=`) is a `400` with `code: "filter_value_invalid"`, consistent with the
  other parameters.
- An event attributed to several listed groups still appears once.
- `group` composes with `department`, `commune_*`, `country` and `event_type`; a request that
  combines `group` with a place returns the intersection, not the union.

## Responses

Unchanged. A `200` answer keeps the same headers, the same caching behaviour and the same
metadata emission; a request without `group` produces exactly the same document as before this
change.

## Compatibility

- Adding an optional parameter is backward compatible: every existing subscription URL keeps
  returning what it returned before.
- Because the parameter changes the shape of a subscription (a link now covers a group rather
  than a place), the API reference listing the accepted parameters MUST include `group`, and the
  `400` message for an unknown parameter MUST keep naming the offending parameter.
- Removing or renaming `group` after release is a breaking change for any link already copied by
  a visitor, and requires a deprecation window.

## Out of scope

Filtering by group at display time only (client-side, through `X-ACTIONPOP-GROUP`) is explicitly
not this contract: metadata families are configurable, so a client-side filter would silently
lose events when a deployment lowers the metadata level. The criterion is applied server-side so
the imported calendar is exact.
