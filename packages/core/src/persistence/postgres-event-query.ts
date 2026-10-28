import type { Prisma, PrismaClient } from '@prisma/client';

import type { GeographicFilter } from '../geography/geographic-filter.js';

export interface GeographicQueryResult {
  items: Array<{
    sourceEventId: string;
    eventType: string | null;
    countryCode: string | null;
    departmentCode: string | null;
    communeId: string | null;
    geographicStatus: string | null;
    referenceVersion: string | null;
  }>;
  total: number;
}

export class PostgresEventQuery {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(filter: GeographicFilter): Promise<GeographicQueryResult> {
    const where: Prisma.EventRecordWhereInput = {
      ...(filter.country === undefined ? {} : { countryCode: filter.country }),
      ...(filter.department === undefined ? {} : { departmentCode: filter.department }),
      ...(filter.commune === undefined ? {} : { communeId: filter.commune }),
      ...(filter.eventType === undefined ? {} : { eventType: filter.eventType }),
    };

    const rows = await this.prisma.eventRecord.findMany({
      where,
      select: {
        sourceEventId: true,
        eventType: true,
        countryCode: true,
        departmentCode: true,
        communeId: true,
        geographicStatus: true,
        referenceVersion: true,
      },
      orderBy: { sourceEventId: 'asc' },
    });

    const items = rows.map((row) => ({
      sourceEventId: row.sourceEventId,
      eventType: row.eventType,
      countryCode: row.countryCode,
      departmentCode: row.departmentCode,
      communeId: row.communeId,
      geographicStatus: row.geographicStatus,
      referenceVersion: row.referenceVersion,
    }));

    return { items, total: items.length };
  }
}
