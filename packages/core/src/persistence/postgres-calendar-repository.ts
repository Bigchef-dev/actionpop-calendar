import type { Prisma, PrismaClient } from '@prisma/client';
import type { CalendarDataset } from './calendar-dataset-repository.js';
import type {
  Diagnostic,
  GeographicAttachment,
  GeographicStatus,
} from '../geography/reference-types.js';
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
    referenceVersion: string | null;
    geographicStatus: string | null;
    countryCode: string | null;
    departmentCode: string | null;
    departmentSource: string | null;
    rawDepartmentCode: string | null;
    rawCommuneName: string | null;
    communeId: string | null;
    geographicDiagnostics: Prisma.JsonValue | null;
    eventType: string | null;
  }): PublishedEvent {
    return {
      id: event.sourceEventId,
      sourceEventId: event.sourceEventId,
      name: event.summary,
      description: event.description ?? undefined,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      location:
        event.location === null
          ? null
          : {
              address1: event.location.address1 ?? '',
              city: event.location.city ?? '',
              zip: event.location.zip ?? '',
              coordinates: null,
            },
      contentHash: event.contentHash ?? '',
      sequence: event.sequence,
      ...(event.eventType === null ? {} : { eventType: event.eventType }),
      ...(event.geographicStatus === null ? {} : { geography: this.toGeography(event) }),
    };
  }

  private toGeography(event: {
    referenceVersion: string | null;
    geographicStatus: string | null;
    countryCode: string | null;
    departmentCode: string | null;
    departmentSource: string | null;
    rawDepartmentCode: string | null;
    rawCommuneName: string | null;
    communeId: string | null;
    geographicDiagnostics: Prisma.JsonValue | null;
  }): GeographicAttachment {
    return {
      geographicStatus: (event.geographicStatus ?? 'national') as GeographicStatus,
      diagnostics: readDiagnostics(event.geographicDiagnostics),
      ...(event.referenceVersion === null ? {} : { referenceVersion: event.referenceVersion }),
      ...(event.countryCode === null ? {} : { countryCode: event.countryCode }),
      ...(event.communeId === null ? {} : { communeId: event.communeId }),
      ...(event.departmentCode === null ? {} : { departmentCode: event.departmentCode }),
      ...(event.departmentSource === null
        ? {}
        : { departmentSource: event.departmentSource === 'reference' ? 'reference' : 'stated' }),
      ...(event.rawDepartmentCode === null ? {} : { rawDepartmentCode: event.rawDepartmentCode }),
      ...(event.rawCommuneName === null ? {} : { rawCommuneName: event.rawCommuneName }),
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
      ...this.toGeographyColumns(event),
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
      ...this.toGeographyColumns(event),
    };
  }

  private toGeographyColumns(event: PublishedEvent) {
    const geography = event.geography;
    if (geography === undefined) return {};

    return {
      referenceVersion: geography.referenceVersion ?? null,
      geographicStatus: geography.geographicStatus,
      countryCode: geography.countryCode ?? null,
      departmentCode: geography.departmentCode ?? null,
      departmentSource: geography.departmentSource ?? null,
      rawDepartmentCode: geography.rawDepartmentCode ?? null,
      rawCommuneName: geography.rawCommuneName ?? null,
      communeId: geography.communeId ?? null,
      geographicDiagnostics: toJsonValue(geography.diagnostics),
      ...(event.eventType === undefined ? {} : { eventType: event.eventType }),
    };
  }
}

// Prisma's JSON input types require an index signature that domain records do not have;
// the assertion is a narrow persistence-boundary conversion of already-validated data.
function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readDiagnostics(value: Prisma.JsonValue | null): Diagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const candidate = entry as Record<string, unknown>;
    const { code, field, message, severity } = candidate;
    if (
      typeof code !== 'string' ||
      typeof field !== 'string' ||
      typeof message !== 'string' ||
      (severity !== 'warning' && severity !== 'error')
    ) {
      return [];
    }
    return [{ code, field, message, severity }];
  });
}
