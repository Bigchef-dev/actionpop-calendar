import type { PrismaClient } from '@prisma/client';
import { enrichEventGeography, type RawLocationFields } from '@actionpop/core';

import type { PostgresGeographicReferenceRepository } from '@actionpop/core';

export interface ReEnrichmentResult {
  examined: number;
  updated: number;
}

/**
 * Recomputes the geographic attachment of events from the raw location fields kept at
 * ingestion time, without changing the source identity, dates, event type or raw location.
 */
export async function reEnrichEvents(
  prisma: PrismaClient,
  reader: PostgresGeographicReferenceRepository,
  previousVersion: string,
): Promise<ReEnrichmentResult> {
  const events = await prisma.eventRecord.findMany({
    where: { referenceVersion: previousVersion },
    select: {
      sourceEventId: true,
      rawDepartmentCode: true,
      rawCommuneName: true,
      location: { select: { city: true, zip: true } },
    },
  });

  let updated = 0;
  for (const event of events) {
    const raw: RawLocationFields = {
      ...(event.rawDepartmentCode === null ? {} : { departement: event.rawDepartmentCode }),
      ...(event.rawCommuneName === null ? {} : { communeName: event.rawCommuneName }),
      ...(event.location?.city == null ? {} : { city: event.location.city }),
      ...(event.location?.zip == null ? {} : { zip: event.location.zip }),
    };
    const geography = await enrichEventGeography(raw, reader);

    await prisma.eventRecord.update({
      where: { sourceEventId: event.sourceEventId },
      data: {
        referenceVersion: geography.referenceVersion ?? null,
        geographicStatus: geography.geographicStatus,
        countryCode: geography.countryCode ?? null,
        departmentCode: geography.departmentCode ?? null,
        departmentSource: geography.departmentSource ?? null,
        communeId: geography.communeId ?? null,
        geographicDiagnostics: JSON.parse(JSON.stringify(geography.diagnostics)),
      },
    });
    updated += 1;
  }

  return { examined: events.length, updated };
}
