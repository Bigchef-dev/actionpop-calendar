import type { Prisma, PrismaClient } from '@prisma/client';
import type { CalendarDataset } from './calendar-dataset-repository.js';
import type { GeographicAttachment, GeographicStatus } from '../geography/reference-types.js';
import type { LocationEvent, PublishedEvent } from '../models/event.interface.js';
import { readDiagnostics } from './diagnostic-json.js';

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
      include: { location: { include: { geoPoint: true } } },
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
        const locationId = await this.upsertEventLocation(transaction, event);
        await transaction.eventRecord.upsert({
          where: { sourceEventId: event.sourceEventId },
          create: this.toEventCreate(event, dataset.scopeId, locationId),
          update: this.toEventUpdate(event, locationId),
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
    location: {
      name: string | null;
      address1: string | null;
      address2: string | null;
      zip: string | null;
      city: string | null;
      fullAddress: string | null;
      shortAddress: string | null;
      geoPoint: { latitude: Prisma.Decimal; longitude: Prisma.Decimal } | null;
    } | null;
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
      location: event.location === null ? null : toLocationEvent(event.location),
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

  private toEventCreate(event: PublishedEvent, scopeId: string, locationId: string | null) {
    return {
      sourceEventId: event.sourceEventId,
      locationId,
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

  private toEventUpdate(event: PublishedEvent, locationId: string | null) {
    return {
      locationId,
      summary: event.name,
      description: event.description ?? null,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
      contentHash: event.contentHash,
      sequence: event.sequence,
      ...this.toGeographyColumns(event),
    };
  }

  /**
   * Stores the event address under a stable, event-scoped key and returns it, or
   * null when the source states no location. The address is not part of the event
   * identity, so re-ingesting the same event updates the same row.
   */
  private async upsertEventLocation(
    transaction: Prisma.TransactionClient,
    event: PublishedEvent,
  ): Promise<string | null> {
    const locationId = `event:${event.sourceEventId}`;
    const location = event.location;
    if (location === null) {
      // The source stopped stating an address: drop the row instead of leaving
      // an orphan that no event references.
      await transaction.geoPoint.deleteMany({ where: { locationId } });
      await transaction.locationRecord.deleteMany({ where: { locationId } });
      return null;
    }

    const data = {
      ownerType: 'EVENT',
      name: location.name ?? null,
      address1: location.address1 ?? null,
      address2: location.address2 ?? null,
      zip: location.zip ?? null,
      city: location.city ?? null,
      fullAddress: location.address ?? null,
      shortAddress: location.shortAddress ?? location.shortLocation ?? null,
    };

    await transaction.locationRecord.upsert({
      where: { locationId },
      create: { locationId, ...data },
      update: data,
    });

    const coordinates = location.coordinates;
    if (coordinates === undefined || coordinates === null) {
      await transaction.geoPoint.deleteMany({ where: { locationId } });
      return locationId;
    }

    const [longitude, latitude] = coordinates.coordinates;
    await transaction.geoPoint.upsert({
      where: { locationId },
      create: { locationId, type: 'Point', longitude, latitude },
      update: { type: 'Point', longitude, latitude },
    });

    return locationId;
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

function toLocationEvent(location: {
  name: string | null;
  address1: string | null;
  address2: string | null;
  zip: string | null;
  city: string | null;
  fullAddress: string | null;
  shortAddress: string | null;
  geoPoint: { latitude: Prisma.Decimal; longitude: Prisma.Decimal } | null;
}): LocationEvent {
  const geoPoint = location.geoPoint;
  return {
    ...(location.name === null ? {} : { name: location.name }),
    ...(location.address1 === null ? {} : { address1: location.address1 }),
    ...(location.address2 === null ? {} : { address2: location.address2 }),
    ...(location.zip === null ? {} : { zip: location.zip }),
    ...(location.city === null ? {} : { city: location.city }),
    ...(location.fullAddress === null ? {} : { address: location.fullAddress }),
    ...(location.shortAddress === null ? {} : { shortAddress: location.shortAddress }),
    ...(geoPoint === null
      ? {}
      : {
          coordinates: {
            type: 'Point' as const,
            coordinates: [geoPoint.longitude.toNumber(), geoPoint.latitude.toNumber()] as [
              number,
              number,
            ],
          },
        }),
  };
}

// Prisma's JSON input types require an index signature that domain records do not have;
// the assertion is a narrow persistence-boundary conversion of already-validated data.
function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
