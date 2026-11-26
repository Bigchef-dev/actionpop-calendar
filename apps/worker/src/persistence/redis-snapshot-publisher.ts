import {
  buildRedisKey,
  normalizeCommuneKey,
  normalizeScopeToken,
  type PublishedEvent,
} from '@actionpop/core';

import type { PublishedGroupSnapshotEventIds } from './published-snapshot.js';
import { REDIS_SNAPSHOT_SCRIPT } from './redis-snapshot-script.js';

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

    const args = [
      JSON.stringify(snapshot),
      String(snapshot.eventIds.length),
      ...snapshot.eventIds,
      this.namespace,
      ...eventArgs,
    ];

    await this.redis.eval(REDIS_SNAPSHOT_SCRIPT, 2, groupSetKey, snapshotMetaKey, ...args);
  }
}
