import { Prisma } from '@prisma/client';

import type { GroupAttachment } from '../groups/group-attachment.js';
import type { RegistryClient } from './postgres-group-registry.js';

/**
 * Selects the groups that need spatial work and writes the result back.
 *
 * Selection is incremental on purpose: the 15-minute cycle must not recompute 35k polygons for a
 * catalogue that barely moved. Only a group that has no attachment, whose attachment belongs to
 * another reference version, or whose coordinates changed since its last attempt is returned.
 */
const BATCH_SIZE = 500;

export interface EnrichmentCandidate {
  readonly scopeId: string;
}

export interface AttachmentWrite {
  readonly scopeId: string;
  readonly attachment: GroupAttachment & {
    readonly communeName?: string;
    readonly departmentName?: string;
  };
}

/**
 * Groups worth reading upstream again: never attached, attached against another reference
 * version, or last read long enough ago that their stated address may have moved.
 */
export async function selectAttachmentCandidates(
  client: RegistryClient,
  version: string,
  staleBefore: Date,
): Promise<readonly EnrichmentCandidate[]> {
  const rows = await client.$queryRaw<{ scope_id: string }[]>(Prisma.sql`
    SELECT scope."scope_id"
    FROM "ingestion_scope" AS scope
    WHERE scope."scope_kind" = 'group'
      AND scope."map_status" = 'listed'
      AND scope."retrieval_status" = 'active'
      AND (
        scope."geographic_status" IS NULL
        OR scope."reference_version" IS DISTINCT FROM ${version}::text
        OR scope."enriched_at" IS NULL
        OR scope."enriched_at" < ${staleBefore}::timestamptz
      )
    ORDER BY scope."scope_id" ASC
  `);

  return rows.map((row) => ({ scopeId: row.scope_id }));
}

export async function persistAttachments(
  client: RegistryClient,
  writes: readonly AttachmentWrite[],
): Promise<void> {
  for (const batch of chunks(writes, BATCH_SIZE)) {
    const values = Prisma.join(
      batch.map(
        (write) => Prisma.sql`(
          ${write.scopeId}::text,
          ${write.attachment.countryCode ?? null}::text,
          ${write.attachment.communeId ?? null}::text,
          ${write.attachment.communeName ?? null}::text,
          ${write.attachment.departmentCode ?? null}::text,
          ${write.attachment.departmentName ?? null}::text,
          ${write.attachment.referenceVersion}::text,
          ${write.attachment.status}::text,
          ${JSON.stringify(write.attachment.diagnostics)}::jsonb,
          ${new Date()}::timestamptz
        )`,
      ),
    );

    await client.$executeRaw(Prisma.sql`
      UPDATE "ingestion_scope" AS scope SET
        "country_code" = incoming."country_code",
        "commune_id" = incoming."commune_id",
        "commune_name" = incoming."commune_name",
        "department_code" = incoming."department_code",
        "department_name" = incoming."department_name",
        "reference_version" = incoming."reference_version",
        "geographic_status" = incoming."geographic_status",
        "geographic_diagnostics" = incoming."geographic_diagnostics",
        "enriched_at" = incoming."enriched_at"
      FROM (VALUES ${values}) AS incoming(
        "scope_id", "country_code", "commune_id", "commune_name", "department_code",
        "department_name", "reference_version", "geographic_status",
        "geographic_diagnostics", "enriched_at"
      )
      WHERE scope."scope_id" = incoming."scope_id"
    `);
  }
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
