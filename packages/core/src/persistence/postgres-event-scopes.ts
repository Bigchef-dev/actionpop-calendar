import { Prisma } from '@prisma/client';

import { normalizeScopeIdentity } from '../groups/observed-groups.js';
import { nextEventScopeStatus, type EventRetirementReason } from '../scopes/event-scope.js';
import type { RegistryClient } from './postgres-group-registry.js';

export interface EventScopeRequest {
  readonly eventId: string;
  readonly displayName: string;
  readonly endTime: string;
}

export interface EventScopeRequestOutcome {
  readonly created: readonly string[];
  readonly reopened: readonly string[];
}

function requestValues(requests: readonly EventScopeRequest[], observedAt: Date): Prisma.Sql {
  return Prisma.join(
    requests.map(
      (request) =>
        Prisma.sql`(
          ${request.eventId}::text,
          ${normalizeScopeIdentity(request.eventId)}::text,
          ${request.displayName}::text,
          ${new Date(request.endTime)}::timestamptz,
          ${observedAt}::timestamptz
        )`,
    ),
  );
}

/**
 * Requests one event ingestion per qualifying event. New rows start `pending`, so the
 * cycle that discovered them adds no work; an existing row only refreshes what a
 * reschedule can change, and a retired row comes back to `pending` because the event
 * qualifies again — never as a duplicate row.
 */
export async function requestEventScopes(
  transaction: RegistryClient,
  requests: readonly EventScopeRequest[],
  observedAt: Date,
): Promise<EventScopeRequestOutcome> {
  if (requests.length === 0) return { created: [], reopened: [] };
  const values = requestValues(requests, observedAt);

  const created = await transaction.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
    INSERT INTO "ingestion_scope" (
      "scope_id", "scope_key", "scope_kind", "display_name", "discovery_source",
      "map_status", "retrieval_status", "first_observed_at", "last_observed_at", "event_ends_at"
    )
    SELECT "scope_id", "scope_key", 'event', "display_name", 'event_payload',
           'not_applicable', 'pending', "observed_at", "observed_at", "ends_at"
    FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "ends_at", "observed_at")
    ON CONFLICT DO NOTHING
    RETURNING "scope_id"
  `);

  const reopened = await transaction.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
    UPDATE "ingestion_scope" AS g
    SET "retrieval_status" = 'pending', "stopped_at" = NULL, "stopped_reason" = NULL,
        "display_name" = COALESCE(incoming."display_name", g."display_name"),
        "event_ends_at" = incoming."ends_at", "last_observed_at" = incoming."observed_at"
    FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "ends_at", "observed_at")
    WHERE g."scope_kind" = 'event'
      AND g."scope_key" = incoming."scope_key"
      AND g."retrieval_status" = 'retired'
    RETURNING g."scope_id"
  `);

  await transaction.$executeRaw(Prisma.sql`
    UPDATE "ingestion_scope" AS g
    SET "display_name" = COALESCE(incoming."display_name", g."display_name"),
        "event_ends_at" = incoming."ends_at",
        "last_observed_at" = incoming."observed_at"
    FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "ends_at", "observed_at")
    WHERE g."scope_kind" = 'event' AND g."scope_key" = incoming."scope_key"
  `);

  return {
    created: created.map((row) => row.scope_id),
    reopened: reopened.map((row) => row.scope_id),
  };
}

/**
 * Retires the event ingests of the events one observation just attributed to a group,
 * because the group listings observe them from now on. The input is the stated groups of
 * that observation, never the union of earlier ones: an observation that states no group
 * must leave a scope scheduled.
 */
export async function retireEventScopesForStatedGroups(
  transaction: RegistryClient,
  eventIds: readonly string[],
  at: Date,
): Promise<number> {
  return retireEventScopesOfEvents(transaction, [...new Set(eventIds)], 'event_group_stated', at);
}

/** Bounds one retirement pass; a backlog retires over several cycles instead of a scan. */
const RETIREMENT_BATCH = 500;

/**
 * Retires the event ingests whose event has ended, before anything is promoted. The
 * candidate rows come from the index, but the pure rule decides each one, so the
 * dispatcher, the publication and the job outcome share a single definition of "ended".
 */
export async function retireEndedEventScopes(client: RegistryClient, now: Date): Promise<number> {
  const candidates = await client.$queryRaw<{ scope_id: string; event_ends_at: Date | null }[]>(
    Prisma.sql`
      SELECT "scope_id", "event_ends_at" FROM "ingestion_scope"
      WHERE "scope_kind" = 'event'
        AND "retrieval_status" IN ('pending', 'active')
        AND "event_ends_at" <= ${now}::timestamptz
      ORDER BY "event_ends_at" ASC
      LIMIT ${RETIREMENT_BATCH}
    `,
  );
  const ended = candidates
    .filter(
      (row) =>
        nextEventScopeStatus(
          {
            retrievalStatus: 'active',
            eventEndsAt: row.event_ends_at,
            statesGroup: false,
            unknownAnswer: false,
          },
          now,
        ).type === 'retire',
    )
    .map((row) => row.scope_id);
  return retireEventScopesOfEvents(client, ended, 'event_ended', now);
}

/** Retires one event ingestion the source answered as unknown; nothing else changes. */
export async function retireUnknownEventScope(
  client: RegistryClient,
  scopeId: string,
  at: Date,
): Promise<boolean> {
  return (await retireEventScopesOfEvents(client, [scopeId], 'event_unknown', at)) > 0;
}

/**
 * Records what a detail reading learned about its own scope, whatever state that scope is
 * in: the end time and the observation moment always advance, which is what lets a
 * shortened event stop being retrieved. A scope whose event has already ended retires
 * instead of being read again.
 */
export async function recordEventScopeObservation(
  client: RegistryClient,
  eventId: string,
  endTime: string,
  observedAt: Date,
): Promise<number> {
  const endsAt = new Date(endTime);
  await client.$executeRaw(Prisma.sql`
    UPDATE "ingestion_scope"
    SET "event_ends_at" = ${endsAt}::timestamptz, "last_observed_at" = ${observedAt}::timestamptz
    WHERE "scope_kind" = 'event' AND "scope_key" = ${normalizeScopeIdentity(eventId)}::text
  `);

  // The stored status is irrelevant to this branch: a pending and an active scope retire
  // for the same reason once the event has ended.
  const decision = nextEventScopeStatus(
    { retrievalStatus: 'active', eventEndsAt: endsAt, statesGroup: false, unknownAnswer: false },
    observedAt,
  );
  if (decision.type !== 'retire' || decision.reason !== 'event_ended') return 0;
  return retireEventScopesOfEvents(client, [eventId], decision.reason, observedAt);
}

/** One bounded `UPDATE … RETURNING` over event scopes of the given events. */
async function retireEventScopesOfEvents(
  client: RegistryClient,
  eventIds: readonly string[],
  reason: EventRetirementReason,
  at: Date,
): Promise<number> {
  if (eventIds.length === 0) return 0;
  const retired = await client.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
    UPDATE "ingestion_scope"
    SET "retrieval_status" = 'retired', "stopped_reason" = ${reason}::text, "stopped_at" = ${at}::timestamptz
    WHERE "scope_kind" = 'event'
      AND "retrieval_status" IN ('pending', 'active')
      AND "scope_id" IN (${Prisma.join([...new Set(eventIds)])})
    RETURNING "scope_id"
  `);
  return retired.length;
}
