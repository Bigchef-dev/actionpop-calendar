import { hashCalendarContent, nextEventRevision } from '@actionpop/core';
import { buildRedisKey, normalizeScopeToken } from '@actionpop/core';

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
  public constructor(private readonly redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    eval?: (script: string, keyCount: number, ...args: string[]) => Promise<unknown>;
  }, private readonly namespace = 'actionpop') {}

  public async publish(scopeId: string, snapshot: PublishedSnapshot, complete = true): Promise<void> {
    if (!complete) throw new Error('only complete snapshots can be published');
    const token = normalizeScopeToken(scopeId);
    const stagedKey = buildRedisKey(this.namespace, 'dataset', token, `staging-${snapshot.revision}`);
    const currentKey = buildRedisKey(this.namespace, 'dataset', token, 'current');
    const payload = JSON.stringify({ ...snapshot, status: 'complete' });
    if (this.redis.eval !== undefined) {
      await this.redis.eval(
        'redis.call("SET", KEYS[1], ARGV[1]); redis.call("SET", KEYS[2], ARGV[1]); return 1',
        2, stagedKey, currentKey, payload,
      );
      return;
    }
    await this.redis.set(stagedKey, payload);
    await this.redis.set(currentKey, payload);
  }
}

void hashCalendarContent;