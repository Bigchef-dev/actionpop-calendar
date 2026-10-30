import { Prisma } from '@prisma/client';

import type { GroupCatalogueEntry } from '../adapters/action-populaire-schemas.js';
import { normalizeScopeIdentity } from '../groups/observed-groups.js';
import type { GroupRegistryCounts, RegistryClient } from './postgres-group-registry.js';

export async function activeGroupScopeIds(client: RegistryClient): Promise<readonly string[]> {
  const rows = await client.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
    SELECT "scope_id" FROM "ingestion_scope"
    WHERE "scope_kind" = 'group' AND "retrieval_status" = 'active'
    ORDER BY "scope_id" ASC
  `);
  return rows.map((row) => row.scope_id);
}

export async function findGroupScope(
  client: RegistryClient,
  scopeId: string,
): Promise<GroupCatalogueEntry | undefined> {
  const rows = await client.$queryRaw<
    {
      scope_id: string;
      display_name: string | null;
      scope_type: string | null;
      source_subtype: number | null;
      certified: boolean | null;
      source_link: string | null;
      source_filter: string | null;
      map_status: string;
    }[]
  >(Prisma.sql`
    SELECT "scope_id", "display_name", "scope_type", "source_subtype", "certified",
           "source_link", "source_filter", "map_status"
    FROM "ingestion_scope"
    WHERE "scope_kind" = 'group' AND "scope_key" = ${normalizeScopeIdentity(scopeId)}::text
  `);
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    id: row.scope_id,
    name: row.display_name ?? row.scope_id,
    is_active: row.map_status === 'listed',
    ...(row.scope_type === null ? {} : { type: row.scope_type }),
    ...(row.source_subtype === null ? {} : { subtype: row.source_subtype }),
    ...(row.certified === null ? {} : { is_certified: row.certified }),
    ...(row.source_link === null ? {} : { link: row.source_link }),
    ...(row.source_filter === null ? {} : { filter: row.source_filter }),
  };
}

export async function countGroupScopes(client: RegistryClient): Promise<GroupRegistryCounts> {
  const rows = await client.$queryRaw<
    { active: bigint; pending: bigint; unlisted: bigint; stopped: bigint }[]
  >(Prisma.sql`
    SELECT
      count(*) FILTER (WHERE "retrieval_status" = 'active') AS active,
      count(*) FILTER (WHERE "retrieval_status" = 'pending') AS pending,
      count(*) FILTER (WHERE "map_status" = 'unlisted') AS unlisted,
      count(*) FILTER (WHERE "retrieval_status" LIKE 'stopped_%') AS stopped
    FROM "ingestion_scope"
    WHERE "scope_kind" = 'group'
  `);
  const row = rows[0];
  return {
    active: Number(row?.active ?? 0),
    pending: Number(row?.pending ?? 0),
    unlisted: Number(row?.unlisted ?? 0),
    stopped: Number(row?.stopped ?? 0),
  };
}
