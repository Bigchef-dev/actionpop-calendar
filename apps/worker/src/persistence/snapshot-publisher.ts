import { formatCalendarLocation, hashCalendarContent, nextEventRevision } from '@actionpop/core';
import { PostgresCalendarDatasetRepository, type PublicationSummary } from '@actionpop/core';
import {
  buildRedisKey,
  normalizeCommuneKey,
  normalizeScopeToken,
  toObservedGroups,
  type PublishedGroupSnapshot,
  type IncomingEvent,
  type PublishedEvent,
} from '@actionpop/core';

interface PublishedGroupSnapshotEventIds extends PublishedGroupSnapshot {
  eventIds: string[];
}

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
      const eventCommuneKey = buildRedisKey(this.namespace, 'event', String(event.id), 'commune');
      const communeKey =
        event.location?.city === undefined
          ? ''
          : buildRedisKey(
              this.namespace,
              'idx',
              'commune',
              normalizeCommuneKey(event.location.city),
            );
      eventArgs.push(eventKey, JSON.stringify(event), communeKey, eventCommuneKey);
    }

    const luaScript = `
local groupSetKey = KEYS[1]
local snapshotMetaKey = KEYS[2]
local metadataPayload = ARGV[1]
local newIdsCount = tonumber(ARGV[2])
local namespace = ARGV[3 + newIdsCount] -- On récupère le namespace dynamiquement

-- 1. Récupération des anciens événements pour calculer le diff
local oldIds = redis.call('SMEMBERS', groupSetKey)
local newIdsSet = {}
if newIdsCount > 0 then
  for i = 1, newIdsCount do
    newIdsSet[ARGV[2 + i]] = true
  end
end

-- 2. Nettoyage des événements supprimés (Orphelins)
for _, oldId in ipairs(oldIds) do
  if not newIdsSet[oldId] then
    local eventKey = namespace .. ':event:' .. oldId
    local eventCommuneKey = eventKey .. ':commune'
    
    local oldCommuneKey = redis.call('GET', eventCommuneKey)
    if oldCommuneKey then
      redis.call('SREM', oldCommuneKey, oldId)
    end
    
    redis.call('DEL', eventKey)
    redis.call('DEL', eventCommuneKey)
  end
end

-- 3. Réécriture du Set du groupe (Sécurisé contre les limites de "unpack")
redis.call('DEL', groupSetKey)
if newIdsCount > 0 then
  local batch = {}
  for i = 1, newIdsCount do
    table.insert(batch, ARGV[2 + i])
    if #batch >= 5000 then
      redis.call('SADD', groupSetKey, unpack(batch))
      batch = {}
    end
  end
  if #batch > 0 then
    redis.call('SADD', groupSetKey, unpack(batch))
  end
end

-- 4. Insertion des événements et mise à jour des index de communes
local eventsStartIndex = 4 + newIdsCount
for i = eventsStartIndex, #ARGV, 4 do
  local eventKey = ARGV[i]
  -- Correction regex : capture tout après :event:
  local eventId = string.match(eventKey, ':event:(.+)$') 
  local payload = ARGV[i + 1]
  local newCommuneKey = ARGV[i + 2]
  local eventCommuneKey = ARGV[i + 3]

  local oldCommuneKey = redis.call('GET', eventCommuneKey)
  if oldCommuneKey and oldCommuneKey ~= newCommuneKey then
    redis.call('SREM', oldCommuneKey, eventId)
  end

  redis.call('SET', eventKey, payload)
  if newCommuneKey ~= '' then
    redis.call('SADD', newCommuneKey, eventId)
    redis.call('SET', eventCommuneKey, newCommuneKey)
  else
    redis.call('DEL', eventCommuneKey)
  end
end

-- 5. Mise à jour des métadonnées
redis.call('SET', snapshotMetaKey, metadataPayload)
return 1`;

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
      events,
      status: 'complete',
    });
  }
}

void hashCalendarContent;
