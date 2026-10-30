import { Prisma } from '@prisma/client';

import { normalizeScopeIdentity, type ObservedGroup } from '../groups/observed-groups.js';
import type { RegistryClient } from './postgres-group-registry.js';

export interface GroupRegistrationOutcome {
  readonly discovered: readonly string[];
  readonly reEnabled: readonly string[];
}

function observedValues(groups: readonly ObservedGroup[], observedAt: Date): Prisma.Sql {
  return Prisma.join(
    groups.map(
      (group) =>
        Prisma.sql`(${group.id}::text, ${normalizeScopeIdentity(group.id)}::text, ${group.name ?? null}::text, ${observedAt}::timestamptz)`,
    ),
  );
}

/**
 * Registers the groups one observation states. New rows start `pending`, so the cycle
 * that discovered them does not retrieve them; a group stopped for an unknown-group
 * answer is re-enabled by the evidence, and an explicitly inactive group stays stopped.
 */
export async function registerObservedGroups(
  client: RegistryClient,
  groups: readonly ObservedGroup[],
  observedAt: Date,
): Promise<GroupRegistrationOutcome> {
  if (groups.length === 0) return { discovered: [], reEnabled: [] };
  const values = observedValues(groups, observedAt);

  const discovered = await client.$queryRaw<{ scope_key: string }[]>(Prisma.sql`
    INSERT INTO "ingestion_scope" (
      "scope_id", "scope_key", "scope_kind", "display_name", "discovery_source",
      "map_status", "retrieval_status", "first_observed_at", "last_observed_at"
    )
    SELECT "scope_id", "scope_key", 'group', "display_name", 'event_payload', 'unlisted', 'pending',
           "observed_at", "observed_at"
    FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "observed_at")
    ON CONFLICT DO NOTHING
    RETURNING "scope_key"
  `);

  const reEnabled = await client.$queryRaw<{ scope_key: string }[]>(Prisma.sql`
    UPDATE "ingestion_scope" AS g
    SET "retrieval_status" = 'active', "stopped_at" = NULL, "stopped_reason" = NULL
    FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "observed_at")
    WHERE g."scope_kind" = 'group'
      AND g."scope_key" = incoming."scope_key"
      AND g."retrieval_status" = 'stopped_unknown'
    RETURNING g."scope_key"
  `);

  await client.$executeRaw(Prisma.sql`
    UPDATE "ingestion_scope" AS g
    SET "display_name" = COALESCE(incoming."display_name", g."display_name"),
        "last_observed_at" = incoming."observed_at"
    FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "observed_at")
    WHERE g."scope_kind" = 'group' AND g."scope_key" = incoming."scope_key"
  `);

  return {
    discovered: discovered.map((row) => row.scope_key),
    reEnabled: reEnabled.map((row) => row.scope_key),
  };
}
