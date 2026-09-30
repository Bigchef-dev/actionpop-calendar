import { hashCalendarContent, nextEventRevision } from '@actionpop/core';
import { buildRedisKey } from '@actionpop/core';

interface IncomingEvent { id: string; name: string; startTime: string; endTime: string; description?: string }
export interface PublishedEvent extends IncomingEvent { sourceEventId: string; contentHash: string; sequence: number }
export interface PublishedSnapshot { scopeId: string; revision: number; generatedAt: string; events: PublishedEvent[] }

export class SnapshotPublisher {
  private readonly snapshots = new Map<string, PublishedSnapshot>();

  public async publish(scopeId: string, incoming: IncomingEvent[], complete = true): Promise<PublishedSnapshot> {
    if (!complete) throw new Error('only complete snapshots can be published');
    const previous = this.snapshots.get(scopeId);
    const previousEvents = new Map(previous?.events.map((event) => [event.id, event]));
    const events = incoming.map((event) => {
      const content = { sourceEventId: event.id, summary: event.name, startTime: event.startTime, endTime: event.endTime, ...(event.description === undefined ? {} : { description: event.description }) };
      const revision = nextEventRevision(content, previousEvents.get(event.id));
      return { ...event, sourceEventId: event.id, contentHash: revision.contentHash, sequence: revision.sequence };
    });
    const snapshot = { scopeId, revision: (previous?.revision ?? 0) + 1, generatedAt: new Date().toISOString(), events };
    this.snapshots.set(scopeId, snapshot);
    return snapshot;
  }

  public async current(scopeId: string): Promise<PublishedSnapshot | undefined> { return this.snapshots.get(scopeId); }
}

export class RedisSnapshotPublisher {
  public constructor(private readonly redis: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<unknown> }, private readonly namespace = 'actionpop') {}

  public async publish(scopeId: string, snapshot: PublishedSnapshot, complete = true): Promise<void> {
    if (!complete) throw new Error('only complete snapshots can be published');
    const stagedKey = buildRedisKey(this.namespace, 'dataset', scopeId, `staging-${snapshot.revision}`);
    const currentKey = buildRedisKey(this.namespace, 'dataset', scopeId, 'current');
    await this.redis.set(stagedKey, JSON.stringify(snapshot));
    await this.redis.set(currentKey, JSON.stringify(snapshot));
  }
}

void hashCalendarContent;