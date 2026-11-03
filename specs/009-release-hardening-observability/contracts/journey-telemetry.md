# Contract: Journey Telemetry

`POST /telemetry/journey` — the only write surface this feature adds.

## Routing

Public through the edge (see [edge-surface.md](./edge-surface.md)). Same origin as the SPA, so no
CORS rule is involved. `/internal/*` is unrelated and stays private.

## Request

| Part | Rule |
|---|---|
| Method | `POST` only |
| `Content-Type` | `application/json` (a `; charset=utf-8` suffix is accepted) |
| Body limit | 2 000 bytes |
| Body schema | `{ "v": 1, "visit": "<1-64 chars, [A-Za-z0-9_-]>", "steps": [ { "s": "<JourneyStep>", "k"?: "<SubjectKind>" } ] }` |
| `steps` length | 1 to 10 |

`JourneyStep` and `SubjectKind` values are enumerated in
[../data-model.md](../data-model.md) sections 1.5 and 2.

## Responses

| Status | When | Body |
|---|---|---|
| `204` | Batch accepted. Also returned when *some* steps are unknown: unknown steps are counted as `unknown_step` and dropped. | empty |
| `405` | Any method other than `POST`. | empty |
| `413` | Body exceeds 2 000 bytes. | empty |
| `415` | Content type is not JSON. | empty |
| `400` | Body is not parseable JSON, or a required field is missing or out of range. | empty |

No response ever echoes the payload, and no error body explains what failed. This removes
enumeration value from a public write route.

## Effects

Exactly these counters move (`data-model.md` §1.5):

- `actionpop_journey_steps_total{step,subject_kind}` for each accepted step; a visit is counted by
  `step="arrival"`, and there is no separate visit family
- `actionpop_telemetry_rejected_total{reason}` for `malformed`, `too_large`, `wrong_type`,
  `unknown_step`

**No persistence.** No database write, no file, no log line containing the payload.

## Client behaviour (required by FR-018)

- Steps are queued in memory and flushed on a timer or when the queue reaches its bound.
- `navigator.sendBeacon` is used when the page may unload (export, subscribe); otherwise `fetch`
  with `keepalive: true`.
- Failures are dropped, never retried, and never awaited by a user interaction.
- If `localStorage` is unavailable (private mode, storage disabled), the visit marker is kept in
  memory for the tab lifetime and the journey still works.

## Verification

- `apps/api/src/observability/journey-events.test.ts` — schema acceptance and every rejection
  reason, discriminated-result typing.
- `apps/api/src/observability/telemetry.controller.test.ts` — status codes per row above, and that
  no step is recorded for a rejected batch.
- `apps/web/tests/telemetry.spec.ts` — a blocked-reporting scenario still renders the calendar
  (SC-006), and interaction timing is unchanged with reporting enabled (SC-007).
