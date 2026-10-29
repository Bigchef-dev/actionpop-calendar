import { Prisma } from '@prisma/client';

import { normalizeScopeIdentity, type ObservedGroup } from '../groups/observed-groups.js';
import type { GroupCatalogueEntry } from '../adapters/action-populaire-schemas.js';
import { activeGroupScopeIds, countGroupScopes, findGroupScope } from './postgres-group-queries.js';

export type RegistryClient = Prisma.TransactionClient;

export interface GroupRegistrationOutcome {
  readonly discovered: readonly string[];
  readonly reEnabled: readonly string[];
}

export interface GroupRegistryCounts {
  readonly active: number;
  readonly pending: number;
  readonly unlisted: number;
  readonly stopped: number;
}

export type ScopeIdLookup = ReadonlyMap<string, string>;

function observedValues(groups: readonly ObservedGroup[], observedAt: Date): Prisma.Sql {
  return Prisma.join(
    groups.map(
      (group) =>
        Prisma.sql`(${group.id}::text, ${normalizeScopeIdentity(group.id)}::text, ${group.name ?? null}::text, ${observedAt}::timestamptz)`,
    ),
  );
}

/**
 * Owns the `group_scope` lifecycle: which organizers exist, what the directory
 * says about them, and whether the scheduler may retrieve them.
 */
export class PostgresGroupRegistry {
  public constructor(private readonly client: RegistryClient) {}

  /** A missing scope is created pending and unlisted; it is never activated implicitly. */
  public async bootstrapScope(scopeId: string): Promise<void> {
    await this.client.$executeRaw(Prisma.sql`
      INSERT INTO "group_scope" ("scope_id", "scope_key", "discovery_source", "map_status", "retrieval_status")
      VALUES (${scopeId}::text, ${normalizeScopeIdentity(scopeId)}::text, 'event_payload', 'unlisted', 'pending')
      ON CONFLICT ("scope_key") DO NOTHING
    `);
  }

  /**
   * Registers the groups one observation states. New rows start `pending`, so the
   * cycle that discovered them does not retrieve them; a group stopped for an
   * unknown-group answer is re-enabled by the evidence, and an explicitly
   * inactive group stays stopped.
   */
  public async registerObservedGroups(
    groups: readonly ObservedGroup[],
    observedAt: Date,
  ): Promise<GroupRegistrationOutcome> {
    if (groups.length === 0) return { discovered: [], reEnabled: [] };
    const values = observedValues(groups, observedAt);

    const discovered = await this.client.$queryRaw<{ scope_key: string }[]>(Prisma.sql`
      INSERT INTO "group_scope" (
        "scope_id", "scope_key", "display_name", "discovery_source",
        "map_status", "retrieval_status", "first_observed_at", "last_observed_at"
      )
      SELECT "scope_id", "scope_key", "display_name", 'event_payload', 'unlisted', 'pending',
             "observed_at", "observed_at"
      FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "observed_at")
      ON CONFLICT ("scope_key") DO NOTHING
      RETURNING "scope_key"
    `);

    const reEnabled = await this.client.$queryRaw<{ scope_key: string }[]>(Prisma.sql`
      UPDATE "group_scope" AS g
      SET "retrieval_status" = 'active', "stopped_at" = NULL, "stopped_reason" = NULL
      FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "observed_at")
      WHERE g."scope_key" = incoming."scope_key" AND g."retrieval_status" = 'stopped_unknown'
      RETURNING g."scope_key"
    `);

    await this.client.$executeRaw(Prisma.sql`
      UPDATE "group_scope" AS g
      SET "display_name" = COALESCE(incoming."display_name", g."display_name"),
          "last_observed_at" = incoming."observed_at"
      FROM (VALUES ${values}) AS incoming("scope_id", "scope_key", "display_name", "observed_at")
      WHERE g."scope_key" = incoming."scope_key"
    `);

    return {
      discovered: discovered.map((row) => row.scope_key),
      reEnabled: reEnabled.map((row) => row.scope_key),
    };
  }

  /**
   * Maps the normalized identifiers of one observation onto the stored `scope_id`,
   * which keeps the first-seen spelling. Foreign keys point at `scope_id`, so every
   * write must use the registered spelling rather than the one the payload uses.
   */
  public async resolveScopeIds(scopeKeys: readonly string[]): Promise<ScopeIdLookup> {
    const keys = [...new Set(scopeKeys)];
    if (keys.length === 0) return new Map();

    const rows = await this.client.groupScope.findMany({
      where: { scopeKey: { in: keys } },
      select: { scopeId: true, scopeKey: true },
    });
    return new Map(rows.map((row) => [row.scopeKey, row.scopeId]));
  }

  /** Claims at most `limit` pending groups, oldest discovery first, and activates them. */
  public async promotePendingScopes(limit: number): Promise<readonly string[]> {
    if (limit < 1) return [];
    const promoted = await this.client.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
      WITH claimed AS (
        SELECT "scope_id" FROM "group_scope"
        WHERE "retrieval_status" = 'pending'
        ORDER BY "first_observed_at" ASC NULLS FIRST, "scope_id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "group_scope" SET "retrieval_status" = 'active'
      WHERE "scope_id" IN (SELECT "scope_id" FROM claimed)
      RETURNING "scope_id"
    `);
    return promoted.map((row) => row.scope_id);
  }

  /** Stops a group the source reports unknown; an inactive group keeps its inactive status. */
  public async markStoppedUnknown(
    scopeId: string,
    reason: string,
    stoppedAt: Date,
  ): Promise<boolean> {
    const rows = await this.client.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
      UPDATE "group_scope"
      SET "retrieval_status" = 'stopped_unknown', "stopped_reason" = ${reason}::text, "stopped_at" = ${stoppedAt}::timestamptz
      WHERE "scope_key" = ${normalizeScopeIdentity(scopeId)}::text
        AND "retrieval_status" <> 'stopped_inactive'
      RETURNING "scope_id"
    `);
    return rows.length > 0;
  }

  public activeScopeIds(): Promise<readonly string[]> {
    return activeGroupScopeIds(this.client);
  }

  public findGroup(scopeId: string): Promise<GroupCatalogueEntry | undefined> {
    return findGroupScope(this.client, scopeId);
  }

  public counts(): Promise<GroupRegistryCounts> {
    return countGroupScopes(this.client);
  }
}
