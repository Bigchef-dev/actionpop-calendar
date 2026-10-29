import type { Prisma, PrismaClient } from '@prisma/client';

import type { CalendarDataset } from './calendar-dataset-repository.js';
import type { GeographicAttachment, GeographicStatus } from '../geography/reference-types.js';
import type { LocationEvent, PublishedEvent } from '../models/event.interface.js';
import { readDiagnostics } from './diagnostic-json.js';
import { parsePeriodToken } from '../domain/job-identity.js';
import { CYCLE_METRICS, cycleMetricSamples } from '../groups/cycle-metrics.js';
import { normalizeScopeIdentity, toObservedGroups } from '../groups/observed-groups.js';
import { writeEventAttribution } from './attribution-writer.js';
import { upsertEventRecord } from './event-record-writer.js';
import { PostgresCycleMetrics } from './postgres-cycle-metrics.js';
import { PostgresGroupRegistry } from './postgres-group-registry.js';

const PUBLICATION_TIMEOUT_MS = 60_000;

export interface PublicationSummary {
  readonly events: number;
  readonly eventsWithoutGroup: number;
  readonly attributionsAdded: number;
  readonly attributionsRemoved: number;
  readonly discoveredUnlisted: number;
  readonly reEnabled: number;
  readonly blankIdentifiers: number;
}

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

  /**
   * Publishes one complete listing: the events, their attribution as the source
   * states it, the evidence of the observation, and the snapshot, in one
   * transaction so a reader cannot observe a partially attributed event.
   */
  public async saveCurrent(dataset: CalendarDataset): Promise<PublicationSummary> {
    const periodToken = dataset.periodToken ?? parsePeriodToken(dataset.generatedAt).toISOString();
    const blankIdentifiers = dataset.events.reduce(
      (total, event) => total + (event.blankGroupIdentifiers ?? 0),
      0,
    );
    const statedGroups = toObservedGroups(
      dataset.events.flatMap((event) => [...(event.groups ?? [])]),
    ).groups;

    return this.prisma.$transaction(
      async (transaction): Promise<PublicationSummary> => {
        const registry = new PostgresGroupRegistry(transaction);
        // A scope row is never activated here: eligibility belongs to the directory
        // and to the discovery ceiling, not to publication.
        await registry.bootstrapScope(dataset.scopeId);
        const registration = await registry.registerObservedGroups(
          statedGroups,
          new Date(dataset.generatedAt),
        );
        // Every write below references `group_scope.scope_id`, which keeps the
        // first-seen spelling; a payload or job may name the same group differently.
        const scopeIds = await registry.resolveScopeIds([
          normalizeScopeIdentity(dataset.scopeId),
          ...statedGroups.map((group) => normalizeScopeIdentity(group.id)),
        ]);
        const observingScopeId =
          scopeIds.get(normalizeScopeIdentity(dataset.scopeId)) ?? dataset.scopeId;

        let added = 0;
        let removed = 0;
        let withoutGroup = 0;

        for (const event of dataset.events) {
          await upsertEventRecord(transaction, event);
          const attribution = await writeEventAttribution(
            transaction,
            event,
            observingScopeId,
            periodToken,
            scopeIds,
          );
          added += attribution.added;
          removed += attribution.removed;
          withoutGroup += attribution.eventsWithoutGroup;
        }

        await new PostgresCycleMetrics(transaction).increment(
          periodToken,
          cycleMetricSamples({
            [CYCLE_METRICS.discoveredUnlisted]: registration.discovered.length,
            [CYCLE_METRICS.reEnabled]: registration.reEnabled.length,
            [CYCLE_METRICS.blankIdentifier]: blankIdentifiers,
            [CYCLE_METRICS.eventsWithoutGroup]: withoutGroup,
            [CYCLE_METRICS.attributionsAdded]: added,
            [CYCLE_METRICS.attributionsRemoved]: removed,
          }),
        );

        await transaction.calendarSnapshot.create({
          data: {
            snapshotId: `${observingScopeId}:${dataset.revision}:${Date.now()}`,
            scopeId: observingScopeId,
            revision: dataset.revision,
            generatedAt: new Date(dataset.generatedAt),
            status: 'complete',
            eventIds: dataset.events.map((event) => event.sourceEventId),
          },
        });

        return {
          events: dataset.events.length,
          eventsWithoutGroup: withoutGroup,
          attributionsAdded: added,
          attributionsRemoved: removed,
          discoveredUnlisted: registration.discovered.length,
          reEnabled: registration.reEnabled.length,
          blankIdentifiers,
        };
      },
      { timeout: PUBLICATION_TIMEOUT_MS },
    );
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
