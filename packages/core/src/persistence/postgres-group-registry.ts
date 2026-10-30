import { Prisma } from '@prisma/client';

import { normalizeScopeIdentity, type ObservedGroup } from '../groups/observed-groups.js';
import type { GroupCatalogueEntry } from '../adapters/action-populaire-schemas.js';
import type { ScopeKind } from '../scopes/scope-kind.js';
import {
  registerObservedGroups,
  type GroupRegistrationOutcome,
} from './postgres-group-discovery.js';
import { activeScopes, type ActiveScope } from './postgres-scope-queries.js';
import { countGroupScopes, findGroupScope } from './postgres-group-queries.js';

export type RegistryClient = Prisma.TransactionClient;

export interface GroupRegistryCounts {
  readonly active: number;
  readonly pending: number;
  readonly unlisted: number;
  readonly stopped: number;
}

export type ScopeIdLookup = ReadonlyMap<string, string>;

/**
 * Owns the `ingestion_scope` lifecycle: which organizers exist, what the directory
 * says about them, and whether the scheduler may retrieve them. Event scopes share
 * the table but never the group rules.
 */
export class PostgresGroupRegistry {
  public constructor(private readonly client: RegistryClient) {}

  /**
   * A missing scope is created pending and never activated implicitly. An event scope
   * holds no map status, so it boots `not_applicable` instead of `unlisted`.
   */
  public async bootstrapScope(scopeId: string, kind: ScopeKind = 'group'): Promise<void> {
    const mapStatus = kind === 'event' ? 'not_applicable' : 'unlisted';
    await this.client.$executeRaw(Prisma.sql`
      INSERT INTO "ingestion_scope" (
        "scope_id", "scope_key", "scope_kind", "discovery_source", "map_status", "retrieval_status"
      )
      VALUES (
        ${scopeId}::text, ${normalizeScopeIdentity(scopeId)}::text, ${kind}::text,
        'event_payload', ${mapStatus}::text, 'pending'
      )
      -- Target-less on purpose: a concurrent identical insert may conflict on the
      -- primary key or on the (kind, key) index, and both mean "already bootstrapped".
      ON CONFLICT DO NOTHING
    `);
  }

  /** Delegates to the discovery module so this registry stays about lifecycle. */
  public registerObservedGroups(
    groups: readonly ObservedGroup[],
    observedAt: Date,
  ): Promise<GroupRegistrationOutcome> {
    return registerObservedGroups(this.client, groups, observedAt);
  }

  /**
   * Maps the normalized identifiers of one observation onto the stored `scope_id`,
   * which keeps the first-seen spelling. Foreign keys point at `scope_id`, so every
   * write must use the registered spelling rather than the one the payload uses.
   */
  public async resolveScopeIds(
    scopeKeys: readonly string[],
    kind: ScopeKind = 'group',
  ): Promise<ScopeIdLookup> {
    const keys = [...new Set(scopeKeys)];
    if (keys.length === 0) return new Map();

    const rows = await this.client.ingestionScope.findMany({
      where: { scopeKind: kind, scopeKey: { in: keys } },
      select: { scopeId: true, scopeKey: true },
    });
    return new Map(rows.map((row) => [row.scopeKey, row.scopeId]));
  }

  /** Claims at most `limit` pending groups, oldest discovery first, and activates them. */
  public async promotePendingScopes(limit: number): Promise<readonly string[]> {
    if (limit < 1) return [];
    const promoted = await this.client.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
      WITH claimed AS (
        SELECT "scope_id" FROM "ingestion_scope"
        WHERE "retrieval_status" = 'pending'
        ORDER BY "first_observed_at" ASC NULLS FIRST, "scope_id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ingestion_scope" SET "retrieval_status" = 'active'
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
      UPDATE "ingestion_scope"
      SET "retrieval_status" = 'stopped_unknown', "stopped_reason" = ${reason}::text, "stopped_at" = ${stoppedAt}::timestamptz
      WHERE "scope_kind" = 'group'
        AND "scope_key" = ${normalizeScopeIdentity(scopeId)}::text
        AND "retrieval_status" <> 'stopped_inactive'
      RETURNING "scope_id"
    `);
    return rows.length > 0;
  }

  public activeScopes(): Promise<readonly ActiveScope[]> {
    return activeScopes(this.client);
  }

  public findGroup(scopeId: string): Promise<GroupCatalogueEntry | undefined> {
    return findGroupScope(this.client, scopeId);
  }

  public counts(): Promise<GroupRegistryCounts> {
    return countGroupScopes(this.client);
  }
}
