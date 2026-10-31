import { Prisma } from '@prisma/client';

import type { ScopeKind } from '../scopes/scope-kind.js';
import type { RegistryClient } from './postgres-group-registry.js';

export interface ActiveScope {
  readonly scopeId: string;
  readonly scopeKind: ScopeKind;
}

/**
 * Every scope the dispatcher may retrieve, with its kind. Both kinds share one
 * selection so the scheduling order and the per-cycle ceiling stay single-sourced.
 */
export async function activeScopes(client: RegistryClient): Promise<readonly ActiveScope[]> {
  const rows = await client.$queryRaw<{ scope_id: string; scope_kind: string }[]>(Prisma.sql`
    SELECT "scope_id", "scope_kind" FROM "ingestion_scope"
    WHERE "retrieval_status" = 'active'
    ORDER BY "scope_id" ASC
  `);
  return rows.map((row) => ({
    scopeId: row.scope_id,
    scopeKind:
      row.scope_kind === 'map' ? 'map' : row.scope_kind === 'event' ? 'event' : 'group',
  }));
}

export interface EventScopeCounts {
  readonly pending: number;
  readonly active: number;
  readonly retired: number;
}

export async function countEventScopes(client: RegistryClient): Promise<EventScopeCounts> {
  const rows = await client.$queryRaw<{ pending: bigint; active: bigint; retired: bigint }[]>(
    Prisma.sql`
      SELECT
        count(*) FILTER (WHERE "retrieval_status" = 'pending') AS pending,
        count(*) FILTER (WHERE "retrieval_status" = 'active') AS active,
        count(*) FILTER (WHERE "retrieval_status" = 'retired') AS retired
      FROM "ingestion_scope"
      WHERE "scope_kind" = 'event'
    `,
  );
  const row = rows[0];
  return {
    pending: Number(row?.pending ?? 0),
    active: Number(row?.active ?? 0),
    retired: Number(row?.retired ?? 0),
  };
}
