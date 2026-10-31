import { Prisma } from '@prisma/client';

import type { MapEventSummary } from '../adapters/action-populaire-schemas.js';
import { normalizeScopeIdentity } from '../groups/observed-groups.js';
import type { RegistryClient } from './postgres-group-registry.js';

const BATCH_SIZE = 500;

export interface GapSelectionOptions {
  readonly now: Date;
  readonly freshnessHorizonMs: number;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

/**
 * Selects only identities that no active observation keeps fresh, that have no
 * pending or active event scope, that have not ended, and whose trigger is due.
 * At most 500 identities are evaluated per statement.
 */
export async function selectGapCandidates(
  client: RegistryClient,
  summaries: readonly MapEventSummary[],
  options: GapSelectionOptions,
): Promise<readonly string[]> {
  const horizon = new Date(options.now.getTime() - options.freshnessHorizonMs).toISOString();
  const selected: string[] = [];

  for (const batch of chunks(summaries, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const values = Prisma.join(
      batch.map(
        (summary) => Prisma.sql`(
          ${summary.id}::text,
          ${normalizeScopeIdentity(summary.id)}::text
        )`,
      ),
    );
    const rows = await client.$queryRaw<{ event_id: string }[]>(Prisma.sql`
      WITH incoming("event_id", "scope_key") AS (VALUES ${values}),
      covered AS (
        SELECT DISTINCT observation."event_id"
        FROM "event_observation" AS observation
        JOIN "ingestion_scope" AS scope ON scope."scope_id" = observation."via_scope_id"
        WHERE observation."event_id" IN (SELECT "event_id" FROM incoming)
          AND scope."retrieval_status" = 'active'
          AND observation."last_seen_period" >= ${horizon}::text
      ),
      scheduled AS (
        SELECT scope."scope_key"
        FROM "ingestion_scope" AS scope
        WHERE scope."scope_kind" = 'event'
          AND scope."retrieval_status" IN ('pending', 'active')
          AND scope."scope_key" IN (SELECT "scope_key" FROM incoming)
      )
      SELECT observation."event_id"
      FROM "map_event_observation" AS observation
      JOIN incoming ON incoming."event_id" = observation."event_id"
      WHERE NOT EXISTS (
          SELECT 1 FROM covered WHERE covered."event_id" = observation."event_id"
        )
        AND NOT EXISTS (
          SELECT 1 FROM scheduled WHERE scheduled."scope_key" = incoming."scope_key"
        )
        AND (observation."end_time" IS NULL OR observation."end_time" > ${options.now}::timestamptz)
        AND (
          observation."last_requested_at" IS NULL
          OR observation."next_reconcile_at" IS NULL
          OR observation."next_reconcile_at" <= ${options.now}::timestamptz
          OR observation."last_outcome" IN ('failed', 'mismatched')
        )
      ORDER BY observation."event_id" ASC
    `);
    selected.push(...rows.map((row) => row.event_id));
  }

  return selected;
}
