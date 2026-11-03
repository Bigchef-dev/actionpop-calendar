import type { Prisma, PrismaClient } from '@prisma/client';

import type { CalendarDataset } from './calendar-dataset-repository.js';
import type { GeographicAttachment, GeographicStatus } from '../geography/reference-types.js';
import type { LocationEvent, PublishedEvent } from '../models/event.interface.js';
import { readDiagnostics } from './diagnostic-json.js';
import { parsePeriodToken } from '../domain/job-identity.js';
import { CYCLE_METRICS, cycleMetricSamples } from '../groups/cycle-metrics.js';
import { normalizeScopeIdentity, toObservedGroups } from '../groups/observed-groups.js';
import { nextEventScopeStatus, requiresEventIngestion } from '../scopes/event-scope.js';
import { writeEventAttribution } from './attribution-writer.js';
import { upsertEventRecord } from './event-record-writer.js';
import { PostgresCycleMetrics } from './postgres-cycle-metrics.js';
import { PostgresGroupRegistry } from './postgres-group-registry.js';
import {
  recordEventScopeObservation,
  requestEventScopes,
  retireEventScopesForStatedGroups,
  type EventScopeRequest,
} from './postgres-event-scopes.js';

const PUBLICATION_TIMEOUT_MS = 60_000;

/** The pure rule answers "does this observation retire the event's own ingestion?". */
function retiresForStatedGroup(statesGroup: boolean, endTime: string, observedAt: Date): boolean {
  const endsAt = new Date(endTime);
  const decision = nextEventScopeStatus(
    {
      retrievalStatus: 'active',
      eventEndsAt: Number.isNaN(endsAt.getTime()) ? null : endsAt,
      statesGroup,
      unknownAnswer: false,
    },
    observedAt,
  );
  return decision.type === 'retire' && decision.reason === 'event_group_stated';
}

export interface PublicationSummary {
  readonly events: number;
  readonly eventsWithoutGroup: number;
  readonly attributionsAdded: number;
  readonly attributionsRemoved: number;
  readonly discoveredUnlisted: number;
  readonly reEnabled: number;
  readonly blankIdentifiers: number;
  readonly eventScopesCreated: number;
  readonly eventScopesRetired: number;
}

export class PostgresCalendarDatasetRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async markEventCancelled(sourceEventId: string): Promise<boolean> {
    const result = await this.prisma.eventRecord.updateMany({
      where: { sourceEventId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', sequence: { increment: 1 } },
    });
    return result.count > 0;
  }

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
        const observingKind = dataset.scopeKind ?? 'group';
        // A scope row is never activated here: eligibility belongs to the directory
        // and to the discovery ceiling, not to publication.
        await registry.bootstrapScope(dataset.scopeId, observingKind);
        const registration = await registry.registerObservedGroups(
          statedGroups,
          new Date(dataset.generatedAt),
        );
        // Attribution always points at groups; the observing scope may be a group or an
        // event, and every write references the registered spelling of its identifier.
        const scopeIds = await registry.resolveScopeIds(
          statedGroups.map((group) => normalizeScopeIdentity(group.id)),
          'group',
        );
        const observingScopeId =
          (
            await registry.resolveScopeIds([normalizeScopeIdentity(dataset.scopeId)], observingKind)
          ).get(normalizeScopeIdentity(dataset.scopeId)) ?? dataset.scopeId;

        const observedAt = new Date(dataset.generatedAt);
        const requests: EventScopeRequest[] = dataset.events
          .filter((event) =>
            requiresEventIngestion({ groups: event.groups, endTime: event.endTime }, observedAt),
          )
          .map((event) => ({
            eventId: event.sourceEventId,
            displayName: event.name,
            endTime: event.endTime,
          }));
        const requestedScopes = await requestEventScopes(transaction, requests, observedAt);

        let added = 0;
        let removed = 0;
        let withoutGroup = 0;
        const groupStatingEventIds: string[] = [];

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
          // Only what this observation states may retire a scope: a reading that states
          // no group must leave the event's own ingestion scheduled.
          if (retiresForStatedGroup(attribution.statedGroups > 0, event.endTime, observedAt)) {
            groupStatingEventIds.push(event.sourceEventId);
          }
        }

        // An event that now states a group is observed by group listings from the next
        // cycle on; its own ingestion retires instead of becoming a parallel refresh path.
        const retiredScopes = await retireEventScopesForStatedGroups(
          transaction,
          groupStatingEventIds,
          observedAt,
        );
        // A detail reading is the only place that learns a moved end time, including the
        // case where the event already ended, so the scope's own observation is recorded
        // whatever the outcome above.
        const endedScopes =
          observingKind === 'event'
            ? await Promise.all(
                dataset.events.map((event) =>
                  recordEventScopeObservation(
                    transaction,
                    event.sourceEventId,
                    event.endTime,
                    observedAt,
                  ),
                ),
              ).then((counts) => counts.reduce((total, count) => total + count, 0))
            : 0;

        await new PostgresCycleMetrics(transaction).increment(
          periodToken,
          cycleMetricSamples({
            [CYCLE_METRICS.discoveredUnlisted]: registration.discovered.length,
            [CYCLE_METRICS.reEnabled]: registration.reEnabled.length,
            [CYCLE_METRICS.blankIdentifier]: blankIdentifiers,
            [CYCLE_METRICS.eventsWithoutGroup]: withoutGroup,
            [CYCLE_METRICS.attributionsAdded]: added,
            [CYCLE_METRICS.attributionsRemoved]: removed,
            [CYCLE_METRICS.eventScopesCreated]: requestedScopes.created.length,
            [CYCLE_METRICS.eventScopesRetired]: retiredScopes + endedScopes,
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
          eventScopesCreated: requestedScopes.created.length,
          eventScopesRetired: retiredScopes + endedScopes,
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
