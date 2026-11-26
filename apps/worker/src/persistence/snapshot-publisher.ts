import { formatCalendarLocation, hashCalendarContent, nextEventRevision } from '@actionpop/core';
import { PostgresCalendarDatasetRepository, type PublicationSummary } from '@actionpop/core';
import { toObservedGroups, type IncomingEvent, type PublishedEvent } from '@actionpop/core';

import type { PublishedGroupSnapshotEventIds } from './published-snapshot.js';

export { RedisSnapshotPublisher, type RedisClient } from './redis-snapshot-publisher.js';
export type { PublishedGroupSnapshotEventIds } from './published-snapshot.js';

export class SnapshotPublisher {
  private readonly snapshots = new Map<string, PublishedGroupSnapshotEventIds>();
  private readonly eventsById = new Map<string, PublishedEvent>();

  public async publish(
    scopeId: string,
    incoming: IncomingEvent[],
    complete = true,
    periodToken?: string,
  ): Promise<{
    snapshot: PublishedGroupSnapshotEventIds;
    events: PublishedEvent[];
  }> {
    if (!complete) throw new Error('only complete snapshots can be published');

    const previous = this.snapshots.get(scopeId);
    const eventIds: string[] = [];
    const events: PublishedEvent[] = [];

    for (const rawEvent of incoming) {
      const eventId = String(rawEvent.id);
      eventIds.push(eventId);

      const calendarLocation = formatCalendarLocation(rawEvent.location);
      const groupIds = toObservedGroups(rawEvent.groups ?? []).groups.map((group) => group.id);
      const content = {
        sourceEventId: eventId,
        summary: rawEvent.name,
        startTime: rawEvent.startTime,
        endTime: rawEvent.endTime,
        ...(rawEvent.description !== undefined && { description: rawEvent.description }),
        ...(calendarLocation !== undefined && { location: calendarLocation }),
        ...(groupIds.length > 0 && { groupIds }),
      };

      const previousEvent = this.eventsById.get(eventId);
      const revision = nextEventRevision(content, previousEvent);

      const published: PublishedEvent = {
        ...rawEvent,
        id: eventId,
        sourceEventId: eventId,
        contentHash: revision.contentHash,
        sequence: revision.sequence,
      };

      this.eventsById.set(eventId, published);
      events.push(published);
    }

    const snapshot: PublishedGroupSnapshotEventIds = {
      scopeId,
      revision: (previous?.revision ?? 0) + 1,
      generatedAt: new Date().toISOString(),
      ...(periodToken === undefined ? {} : { periodToken }),
      eventIds,
    };

    this.snapshots.set(scopeId, snapshot);
    return { snapshot, events };
  }

  public async current(scopeId: string): Promise<PublishedGroupSnapshotEventIds | undefined> {
    return this.snapshots.get(scopeId);
  }

  public getEvent(id: string): PublishedEvent | undefined {
    return this.eventsById.get(id);
  }
}

export class PostgresSnapshotPublisher {
  public constructor(private readonly repository: PostgresCalendarDatasetRepository) {}

  public async publish(
    scopeId: string,
    snapshot: PublishedGroupSnapshotEventIds,
    events: PublishedEvent[],
    complete = true,
  ): Promise<PublicationSummary> {
    if (!complete) throw new Error('only complete snapshots can be published');
    return this.repository.saveCurrent({
      scopeId,
      revision: snapshot.revision,
      generatedAt: snapshot.generatedAt,
      ...(snapshot.periodToken === undefined ? {} : { periodToken: snapshot.periodToken }),
      ...(snapshot.scopeKind === undefined ? {} : { scopeKind: snapshot.scopeKind }),
      events,
      status: 'complete',
    });
  }

  public async markEventCancelled(sourceEventId: string): Promise<boolean> {
    return this.repository.markEventCancelled(sourceEventId);
  }
}

void hashCalendarContent;
