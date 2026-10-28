import type { PrismaClient } from '@prisma/client';

import type { EventTypeReader, ObservedEventType } from '../geography/event-types.js';

export class PostgresEventTypeRepository implements EventTypeReader {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findEventType(value: string): Promise<ObservedEventType | null> {
    const row = await this.prisma.eventTypeReference.findUnique({ where: { value } });
    return row === null
      ? null
      : { value: row.value, firstSeenAt: row.firstSeenAt.toISOString(), source: row.source };
  }

  public async recordObservedEventTypes(values: string[], source: string): Promise<void> {
    const unique = [
      ...new Set(values.map((value) => value.trim()).filter((value) => value !== '')),
    ];
    if (unique.length === 0) return;

    for (const value of unique) {
      await this.prisma.eventTypeReference.upsert({
        where: { value },
        create: { value, source },
        update: {},
      });
    }
  }
}
