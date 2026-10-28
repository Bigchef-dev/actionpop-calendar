import { buildRedisKey, normalizeScopeToken } from '../index-internal.js';
import { normalizeCommuneKey } from '../domain/geographic-identity.js';
import type { CalendarDataset } from './calendar-dataset-repository.js';
import type { PublishedEvent } from '../models/event.interface.js';

interface RedisCalendarStore {
  get(key: string): Promise<string | null>;
  smembers(key: string): Promise<string[]>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  sinter(...keys: string[]): Promise<string[]>;
}

interface PublishedGroupSnapshot {
  scopeId: string;
  revision: number;
  generatedAt: string;
  eventIds: string[];
}

export class RedisCalendarDatasetRepository {
  public constructor(
    private readonly redis: RedisCalendarStore,
    private readonly namespace = 'actionpop',
  ) {}

  public async getCurrent(scopeId: string): Promise<CalendarDataset | null> {
    const token = normalizeScopeToken(scopeId);
    const metadataKey = buildRedisKey(this.namespace, 'group', token, 'meta');
    const groupEventsKey = buildRedisKey(this.namespace, 'group', token, 'events');
    const metadataValue = await this.redis.get(metadataKey);
    if (metadataValue === null) return null;

    const metadata = JSON.parse(metadataValue) as PublishedGroupSnapshot;
    if (
      metadata.scopeId !== scopeId
      || !Number.isInteger(metadata.revision)
      || typeof metadata.generatedAt !== 'string'
      || !Array.isArray(metadata.eventIds)
      || metadata.eventIds.some((id): id is string => typeof id !== 'string')
    ) {
      throw new Error(`invalid calendar metadata for scope ${scopeId}`);
    }
    const revision = metadata.revision;
    const generatedAt = metadata.generatedAt;
    const metadataEventIds = metadata.eventIds;

    const ids = await this.redis.smembers(groupEventsKey);
    const eventIds = [...new Set(ids)].sort();
    const expectedEventIds = [...metadataEventIds].sort();
    if (eventIds.length !== expectedEventIds.length
      || eventIds.some((id, index) => id !== expectedEventIds[index])) {
      throw new Error(`calendar metadata is inconsistent for scope ${scopeId}`);
    }

    if (eventIds.length === 0) {
      return {
        scopeId,
        revision,
        generatedAt,
        events: [],
        status: 'complete',
      };
    }

    const eventKeys = eventIds.map((id) => buildRedisKey(this.namespace, 'event', id));
    const values = await this.redis.mget(...eventKeys);
    const events = values.map((value, index) => {
      if (value === null) throw new Error(`missing event ${eventIds[index]} for scope ${scopeId}`);
      const event = JSON.parse(value) as PublishedEvent;
      if (event.sourceEventId !== eventIds[index]) {
        throw new Error(`event ${eventIds[index]} has inconsistent identity`);
      }
      return event;
    });

    return {
      scopeId,
      revision,
      generatedAt,
      events,
      status: 'complete',
    };
  }

  public async getByProperties(
    scopeId: string,
    properties: { commune?: string },
  ): Promise<PublishedEvent[]> {
    const token = normalizeScopeToken(scopeId);
    const keys = [buildRedisKey(this.namespace, 'group', token, 'events')];
    if (properties.commune !== undefined) {
      keys.push(buildRedisKey(this.namespace, 'idx', 'commune', normalizeCommuneKey(properties.commune)));
    }
    const ids = await this.redis.sinter(...keys);
    if (ids.length === 0) return [];

    const values = await this.redis.mget(
      ...ids.map((id) => buildRedisKey(this.namespace, 'event', id)),
    );
    return values.map((value, index) => {
      if (value === null) throw new Error(`missing event ${ids[index]} for scope ${scopeId}`);
      return JSON.parse(value) as PublishedEvent;
    });
  }
}
