import { buildRedisKey, normalizeScopeToken } from '../index-internal.js';

export interface StoredCalendarEvent {
  sourceEventId: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  sequence: number;
  location?: string;
}

export interface CalendarDataset {
  scopeId: string;
  revision: number;
  generatedAt: string;
  events: StoredCalendarEvent[];
  status?: 'complete';
}

interface RedisValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export class CalendarDatasetRepository {
  public constructor(
    private readonly redis: RedisValueStore,
    private readonly namespace = 'actionpop',
  ) {}

  public async getCurrent(scopeId: string): Promise<CalendarDataset | null> {
    const value = await this.redis.get(this.currentKey(scopeId));
    if (value === null) return null;

    const dataset = JSON.parse(value) as CalendarDataset;
    if (dataset.status !== undefined && dataset.status !== 'complete') return null;
    if (dataset.scopeId !== scopeId || !Array.isArray(dataset.events)) return null;
    return dataset;
  }

  public async saveCurrent(dataset: CalendarDataset): Promise<void> {
    if (dataset.status !== undefined && dataset.status !== 'complete') {
      throw new Error('only complete calendar datasets can be published');
    }
    await this.redis.set(this.currentKey(dataset.scopeId), JSON.stringify(dataset));
  }

  public currentKey(scopeId: string): string {
    return buildRedisKey(this.namespace, 'dataset', normalizeScopeToken(scopeId), 'current');
  }
}
