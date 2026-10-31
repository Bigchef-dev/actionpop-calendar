import { Prisma } from '@prisma/client';

import type { MapEventSummary } from '../adapters/action-populaire-schemas.js';
import { summaryFingerprint } from '../discovery/map-selection.js';
import type { RegistryClient } from './postgres-group-registry.js';

const BATCH_SIZE = 500;

export type MapOutcome = 'resolved' | 'unknown' | 'mismatched' | 'failed';

export interface MapListingRecordOutcome {
  readonly inserted: number;
  readonly changed: number;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function optionalDate(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

function listingValues(summaries: readonly MapEventSummary[], observedAt: Date): Prisma.Sql {
  return Prisma.join(
    summaries.map(
      (summary) => Prisma.sql`(
        ${summary.id}::text,
        ${summaryFingerprint(summary)}::text,
        ${summary.name ?? null}::text,
        ${optionalDate(summary.start_time)}::timestamptz,
        ${optionalDate(summary.end_time)}::timestamptz,
        ${summary.subtype ?? null}::int,
        ${observedAt}::timestamptz
      )`,
    ),
  );
}

/**
 * Records the complete listing index. A changed fingerprint clears the
 * reconciliation deadline so the identity is selectable in this same cycle;
 * an unchanged identity only advances its last-seen instant.
 */
export async function recordListing(
  client: RegistryClient,
  summaries: readonly MapEventSummary[],
  observedAt: Date,
): Promise<MapListingRecordOutcome> {
  let inserted = 0;
  let changed = 0;

  for (const batch of chunks(summaries, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const values = listingValues(batch, observedAt);
    const rows = await client.$queryRaw<{ inserted: boolean; changed: boolean }[]>(Prisma.sql`
      WITH incoming(
        "event_id", "summary_fingerprint", "display_name", "start_time", "end_time",
        "subtype_id", "observed_at"
      ) AS (VALUES ${values}),
      existing AS (
        SELECT "event_id", "summary_fingerprint" FROM "map_event_observation"
        WHERE "event_id" IN (SELECT "event_id" FROM incoming)
      ),
      upserted AS (
        INSERT INTO "map_event_observation" (
          "event_id", "summary_fingerprint", "display_name", "start_time", "end_time",
          "subtype_id", "first_seen_at", "last_seen_at"
        )
        SELECT "event_id", "summary_fingerprint", "display_name", "start_time", "end_time",
               "subtype_id", "observed_at", "observed_at"
        FROM incoming
        ON CONFLICT ("event_id") DO UPDATE SET
          "display_name" = EXCLUDED."display_name",
          "start_time" = EXCLUDED."start_time",
          "end_time" = EXCLUDED."end_time",
          "subtype_id" = EXCLUDED."subtype_id",
          "last_seen_at" = EXCLUDED."last_seen_at",
          "next_reconcile_at" = CASE
            WHEN "map_event_observation"."summary_fingerprint" IS DISTINCT FROM EXCLUDED."summary_fingerprint"
            THEN NULL ELSE "map_event_observation"."next_reconcile_at"
          END,
          "summary_fingerprint" = EXCLUDED."summary_fingerprint"
        RETURNING "event_id", (xmax = 0) AS inserted
      )
      SELECT upserted."event_id", upserted.inserted,
             (existing."event_id" IS NOT NULL
              AND existing."summary_fingerprint" IS DISTINCT FROM incoming."summary_fingerprint") AS changed
      FROM upserted
      JOIN incoming ON incoming."event_id" = upserted."event_id"
      LEFT JOIN existing ON existing."event_id" = upserted."event_id"
    `);
    inserted += rows.filter((row) => row.inserted).length;
    changed += rows.filter((row) => row.changed).length;
  }

  return { inserted, changed };
}
/** Marks the selected identities as requested so the next cycle does not repeat them. */
export async function markRequested(
  client: RegistryClient,
  eventIds: readonly string[],
  requestedAt: Date,
  nextReconcileAt: Date,
): Promise<number> {
  let updated = 0;
  for (const batch of chunks([...new Set(eventIds)], BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const values = Prisma.join(batch.map((eventId) => Prisma.sql`(${eventId}::text)`));
    const rows = await client.$queryRaw<{ event_id: string }[]>(Prisma.sql`
      UPDATE "map_event_observation" AS observation
      SET "last_requested_at" = ${requestedAt}::timestamptz,
          "last_outcome" = 'requested',
          "next_reconcile_at" = ${nextReconcileAt}::timestamptz
      FROM (VALUES ${values}) AS incoming("event_id")
      WHERE observation."event_id" = incoming."event_id"
      RETURNING observation."event_id"
    `);
    updated += rows.length;
  }
  return updated;
}
/** Updates only an existing observation, so group-discovered events are untouched. */
export async function recordOutcome(
  client: RegistryClient,
  eventId: string,
  outcome: MapOutcome,
  at: Date,
  nextReconcileAt: Date | null,
): Promise<boolean> {
  const updated = await client.$queryRaw<{ event_id: string }[]>(Prisma.sql`
    UPDATE "map_event_observation"
    SET "last_outcome" = ${outcome}::text,
        "next_reconcile_at" = ${nextReconcileAt ?? at}::timestamptz
    WHERE "event_id" = ${eventId}::text
    RETURNING "event_id"
  `);
  return updated.length > 0;
}

export async function countObservations(client: RegistryClient): Promise<number> {
  const rows = await client.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*) AS count FROM "map_event_observation"
  `);
  return Number(rows[0]?.count ?? 0);
}
