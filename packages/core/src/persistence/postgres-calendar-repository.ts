import type { PrismaClient } from '@prisma/client';
import type { CalendarDataset } from './calendar-dataset-repository.js';
import type { PublishedEvent } from '../models/event.interface.js';

export class PostgresCalendarDatasetRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getCurrent(scopeId: string): Promise<CalendarDataset | null> {
    const snapshot = await this.prisma.calendarSnapshot.findFirst({
      where: { scopeId, status: 'complete' },
      orderBy: { revision: 'desc' },
    });
    if (snapshot === null) return null;

    const eventIds = this.readEventIds(snapshot.eventIds);
    const records = await this.prisma.eventRecord.findMany({
      where: { sourceEventId: { in: eventIds } },
      include: { location: true },
    });
    const byId = new Map(records.map((event) => [event.sourceEventId, event]));
    const events = eventIds.map((eventId) => {
      const event = byId.get(eventId);
      if (event === undefined) throw new Error(`missing event ${eventId} for scope ${scopeId}`);
      return this.toPublishedEvent(event);
    });

    return {
      scopeId,
      revision: snapshot.revision,
      generatedAt: snapshot.generatedAt.toISOString(),
      events,
      status: 'complete',
    };
  }

  public async saveCurrent(dataset: CalendarDataset): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.groupScope.upsert({
        where: { scopeId: dataset.scopeId },
        create: { scopeId: dataset.scopeId, active: true },
        update: {},
      });

      for (const event of dataset.events) {
        await transaction.eventRecord.upsert({
          where: { sourceEventId: event.sourceEventId },
          create: this.toEventCreate(event, dataset.scopeId),
          update: this.toEventUpdate(event),
        });
        await transaction.eventGroupLink.upsert({
          where: {
            eventId_scopeId: {
              eventId: event.sourceEventId,
              scopeId: dataset.scopeId,
            },
          },
          create: { eventId: event.sourceEventId, scopeId: dataset.scopeId },
          update: {},
        });
      }

      await transaction.calendarSnapshot.create({
        data: {
          snapshotId: `${dataset.scopeId}:${dataset.revision}:${Date.now()}`,
          scopeId: dataset.scopeId,
          revision: dataset.revision,
          generatedAt: new Date(dataset.generatedAt),
          status: 'complete',
          eventIds: dataset.events.map((event) => event.sourceEventId),
        },
      });
    });
  }

  private readEventIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
      throw new Error('invalid event IDs in calendar snapshot');
    }
    return value;
  }

  private toPublishedEvent(event: {
    sourceEventId: string;
    summary: string;
    description: string | null;
    startTime: Date;
    endTime: Date;
    contentHash: string | null;
    sequence: number;
    timezone: string;
    location: { address1: string | null; city: string | null; zip: string | null } | null;
  }): PublishedEvent {
    return {
      id: event.sourceEventId,
      sourceEventId: event.sourceEventId,
      name: event.summary,
      description: event.description ?? undefined,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      location: event.location === null ? null : {
        address1: event.location.address1 ?? '',
        city: event.location.city ?? '',
        zip: event.location.zip ?? '',
        coordinates: null,
      },
      contentHash: event.contentHash ?? '',
      sequence: event.sequence,
    };
  }

  private toEventCreate(event: PublishedEvent, scopeId: string) {
    return {
      sourceEventId: event.sourceEventId,
      summary: event.name,
      description: event.description ?? null,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      contentHash: event.contentHash,
      sequence: event.sequence,
      timezone: 'Europe/Paris',
      lastSeenPeriod: null,
      groupLinks: { create: { scopeId } },
    };
  }

  private toEventUpdate(event: PublishedEvent) {
    return {
      summary: event.name,
      description: event.description ?? null,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      contentHash: event.contentHash,
      sequence: event.sequence,
    };
  }
}
