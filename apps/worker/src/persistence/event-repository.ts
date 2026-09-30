import { buildRedisKey, nextEventRevision } from '@actionpop/core';

interface RedisStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export class EventRepository {
  public constructor(private readonly redis: RedisStore, private readonly namespace = 'actionpop') {}

  public async save(scopeId: string, event: { id: string; name: string; startTime: string; endTime: string; description?: string }) {
    const key = buildRedisKey(this.namespace, 'event', scopeId, event.id);
    const previousValue = await this.redis.get(key);
    const previous = previousValue === null ? undefined : JSON.parse(previousValue) as { contentHash: string; sequence: number };
    const content = { sourceEventId: event.id, summary: event.name, startTime: event.startTime, endTime: event.endTime, ...(event.description === undefined ? {} : { description: event.description }) };
    const revision = nextEventRevision(content, previous);
    await this.redis.set(key, JSON.stringify({ ...event, ...revision }));
    return revision;
  }
}