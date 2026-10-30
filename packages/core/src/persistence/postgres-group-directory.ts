import { Prisma } from '@prisma/client';

import { normalizeScopeIdentity } from '../groups/observed-groups.js';
import { nextGroupStatus } from '../groups/group-status.js';

export type DirectoryClient = Prisma.TransactionClient;

export interface DirectoryEntry {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
}

/**
 * Applies a complete map directory to the group registry. The caller validates the
 * whole response first: an incomplete directory must change nothing.
 */
export async function synchronizeGroupDirectory(
  client: DirectoryClient,
  entries: readonly DirectoryEntry[],
  stoppedAt: Date = new Date(),
): Promise<void> {
  if (entries.length > 0) {
    const values = Prisma.join(
      entries.map((entry) => {
        const status = nextGroupStatus(
          { mapStatus: 'unlisted', retrievalStatus: 'pending' },
          {
            type: 'directory',
            isActive: entry.isActive,
          },
        );
        const stopped = status.retrievalStatus === 'stopped_inactive';
        return Prisma.sql`(
          ${entry.id}::text,
          ${normalizeScopeIdentity(entry.id)}::text,
          ${entry.name}::text,
          ${status.mapStatus}::text,
          ${status.retrievalStatus}::text,
          ${stopped ? stoppedAt : null}::timestamptz,
          ${stopped ? 'map_inactive' : null}::text
        )`;
      }),
    );

    await client.$executeRaw(Prisma.sql`
      INSERT INTO "ingestion_scope" (
        "scope_id", "scope_key", "scope_kind", "display_name", "discovery_source", "map_status",
        "retrieval_status", "stopped_at", "stopped_reason"
      )
      SELECT "scope_id", "scope_key", 'group', "display_name", 'directory', "map_status",
             "retrieval_status", "stopped_at", "stopped_reason"
      FROM (VALUES ${values}) AS incoming(
        "scope_id", "scope_key", "display_name", "map_status", "retrieval_status",
        "stopped_at", "stopped_reason"
      )
      ON CONFLICT ("scope_kind", "scope_key") DO UPDATE SET
        "display_name" = EXCLUDED."display_name",
        "map_status" = EXCLUDED."map_status",
        "retrieval_status" = EXCLUDED."retrieval_status",
        "stopped_at" = CASE
          WHEN EXCLUDED."retrieval_status" = 'active' THEN NULL
          ELSE COALESCE("ingestion_scope"."stopped_at", EXCLUDED."stopped_at")
        END,
        "stopped_reason" = CASE
          WHEN EXCLUDED."retrieval_status" = 'active' THEN NULL
          ELSE EXCLUDED."stopped_reason"
        END
    `);
  }

  const keys = entries.map((entry) => normalizeScopeIdentity(entry.id));
  const absentClause =
    keys.length === 0 ? Prisma.empty : Prisma.sql`AND "scope_key" NOT IN (${Prisma.join(keys)})`;

  await client.$executeRaw(Prisma.sql`
    UPDATE "ingestion_scope" SET "map_status" = 'removed'
    WHERE "scope_kind" = 'group' AND "map_status" IN ('listed', 'inactive')
    ${absentClause}
  `);
}
