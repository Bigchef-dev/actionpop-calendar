import { ActionPopulaireEventPayload, hashCalendarContent, nextEventRevision } from '@actionpop/core';
import { buildRedisKey, normalizeScopeToken, PublishedGroupSnapshot, IncomingEvent, PublishedEvent } from '@actionpop/core';


interface PublishedGroupSnapshotEventIds extends PublishedGroupSnapshot {
  eventIds: string[];
}

export class SnapshotPublisher {
  private readonly snapshots = new Map<string, PublishedGroupSnapshotEventIds>();
  private readonly eventsById = new Map<string, PublishedEvent>();

  public async publish(scopeId: string, incoming: IncomingEvent[], complete = true): Promise<{
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

      const content = {
        sourceEventId: eventId,
        summary: rawEvent.name,
        startTime: rawEvent.startTime,
        endTime: rawEvent.endTime,
        ...(rawEvent.description !== undefined && { description: rawEvent.description }),
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

export interface RedisClient {
  eval(script: string, keyCount: number, ...args: string[]): Promise<unknown>;
  smembers?(key: string): Promise<string[]>;
  mget?(...keys: string[]): Promise<(string | null)[]>;
}

export class RedisSnapshotPublisher {
  public constructor(
    private readonly redis: RedisClient,
    private readonly namespace = 'actionpop',
  ) {}

  public async publish(
    scopeId: string,
    snapshot: PublishedGroupSnapshotEventIds,
    events: PublishedEvent[],
    complete = true,
  ): Promise<void> {
    if (!complete) throw new Error('only complete snapshots can be published');

    const token = normalizeScopeToken(scopeId);
    const groupSetKey = buildRedisKey(this.namespace, 'group', token, 'events');
    const snapshotMetaKey = buildRedisKey(this.namespace, 'group', token, 'meta');

    const eventArgs: string[] = [];
    for (const event of events) {
      const eventKey = buildRedisKey(this.namespace, 'event', String(event.id));
      eventArgs.push(eventKey, JSON.stringify(event));
    }

    const luaScript = `
      local groupSetKey = KEYS[1]
      local snapshotMetaKey = KEYS[2]
      local metadataPayload = ARGV[1]
      local newIdsCount = tonumber(ARGV[2])

      -- Réécriture du Set du groupe
      redis.call('DEL', groupSetKey)
      if newIdsCount > 0 then
        local idsToAdd = {}
        for i = 1, newIdsCount do
          table.insert(idsToAdd, ARGV[2 + i])
        end
        redis.call('SADD', groupSetKey, unpack(idsToAdd))
      end

      -- Enregistrement des événements individuels. Les anciennes clés ne
      -- sont pas supprimées : un événement peut être partagé par plusieurs groupes.
      local eventsStartIndex = 3 + newIdsCount + 1
      for i = eventsStartIndex, #ARGV, 2 do
        redis.call('SET', ARGV[i], ARGV[i + 1])
      end

      -- Mise à jour des métadonnées du snapshot
      redis.call('SET', snapshotMetaKey, metadataPayload)
      return 1
    `;

    const args = [
      JSON.stringify(snapshot),
      String(snapshot.eventIds.length),
      ...snapshot.eventIds,
      this.namespace,
      ...eventArgs,
    ];

    await this.redis.eval(luaScript, 2, groupSetKey, snapshotMetaKey, ...args);
  }
}

void hashCalendarContent;