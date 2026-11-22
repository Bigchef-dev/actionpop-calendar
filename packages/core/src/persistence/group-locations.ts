import { Prisma } from '@prisma/client';

import type { ActionPopulaireLocation } from '../adapters/action-populaire-schemas.js';

/**
 * Keeps one shared location per group: the address the detail document states, and its point when
 * the source publishes one.
 *
 * It reuses the same `location_record` / `geo_point` rows events use, so a future read that needs
 * a group address finds it where every other address lives.
 */
const BATCH_SIZE = 500;

/**
 * Selects the address a group location keeps. It accepts the same validated location object as an
 * event, and returns nothing when the source states neither a place nor a point.
 */
export interface GroupLocationInput {
  readonly scopeId: string;
  readonly address?: {
    readonly zip?: string;
    readonly city?: string;
    readonly coordinates?: { readonly longitude: number; readonly latitude: number };
  };
}

export function groupAddressOf(
  location: ActionPopulaireLocation | null | undefined,
): GroupLocationInput['address'] | undefined {
  if (location === null || location === undefined) return undefined;
  const point = location.coordinates?.coordinates;
  const address = {
    ...(location.zip === undefined || location.zip === null ? {} : { zip: location.zip }),
    ...(location.city === undefined ? {} : { city: location.city }),
    ...(point === undefined || point === null
      ? {}
      : { coordinates: { longitude: point[0], latitude: point[1] } }),
  };
  return Object.keys(address).length === 0 ? undefined : address;
}

export async function writeGroupLocations(
  client: Prisma.TransactionClient,
  locations: readonly GroupLocationInput[],
): Promise<void> {
  for (const batch of chunks(locations, BATCH_SIZE)) await writeBatch(client, batch);
}

async function writeBatch(
  client: Prisma.TransactionClient,
  batch: readonly GroupLocationInput[],
): Promise<void> {
  const values = Prisma.join(
    batch.map(
      (entry) => Prisma.sql`(
        ${entry.scopeId}::text,
        ${entry.address?.zip ?? null}::text,
        ${entry.address?.city ?? null}::text
      )`,
    ),
  );

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "location_record" ("location_id", "owner_type", "zip", "city")
    SELECT 'group:' || incoming."scope_id", 'GROUP', incoming."zip", incoming."city"
    FROM (VALUES ${values}) AS incoming("scope_id", "zip", "city")
    ON CONFLICT ("location_id") DO UPDATE SET
      "owner_type" = 'GROUP',
      "zip" = EXCLUDED."zip",
      "city" = EXCLUDED."city"
  `);

  const located = batch.filter((entry) => entry.address?.coordinates !== undefined);
  if (located.length > 0) {
    const points = Prisma.join(
      located.map(
        (entry) => Prisma.sql`(
          ${entry.scopeId}::text,
          ${entry.address?.coordinates?.longitude ?? 0}::numeric,
          ${entry.address?.coordinates?.latitude ?? 0}::numeric
        )`,
      ),
    );
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "geo_point" ("location_id", "type", "longitude", "latitude")
      SELECT 'group:' || incoming."scope_id", 'Point', incoming."longitude", incoming."latitude"
      FROM (VALUES ${points}) AS incoming("scope_id", "longitude", "latitude")
      ON CONFLICT ("location_id") DO UPDATE SET
        "type" = 'Point',
        "longitude" = EXCLUDED."longitude",
        "latitude" = EXCLUDED."latitude"
    `);
  }

  const unlocated = batch
    .filter((entry) => entry.address?.coordinates === undefined)
    .map((entry) => `group:${entry.scopeId}`);
  if (unlocated.length > 0) {
    await client.geoPoint.deleteMany({ where: { locationId: { in: unlocated } } });
  }

  await client.$executeRaw(Prisma.sql`
    UPDATE "ingestion_scope" AS scope
    SET "location_id" = 'group:' || scope."scope_id"
    WHERE scope."scope_id" IN (
      SELECT column1 FROM (VALUES ${Prisma.join(batch.map((entry) => Prisma.sql`(${entry.scopeId}::text)`))}) AS ids(column1)
    )
      AND EXISTS (
        SELECT 1 FROM "location_record" AS located
        WHERE located."location_id" = 'group:' || scope."scope_id"
      )
  `);
}

export async function clearGroupLocations(
  client: Prisma.TransactionClient,
  scopeIds: readonly string[],
): Promise<void> {
  if (scopeIds.length === 0) return;
  const locationIds = scopeIds.map((id) => `group:${id}`);
  await client.geoPoint.deleteMany({ where: { locationId: { in: locationIds } } });
  await client.locationRecord.deleteMany({ where: { locationId: { in: locationIds } } });
  // A group that no longer states an address must lose the attachment that address justified.
  await client.ingestionScope.updateMany({
    where: { scopeId: { in: [...scopeIds] } },
    data: { enrichedAt: null, geographicStatus: null },
  });
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}
