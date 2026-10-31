import type { MetadataFamily, MetadataLevel } from '../calendar/metadata-levels.js';

export enum LogLevel {
  INFO = 'info',
  DEBUG = 'debug',
  WARN = 'warn',
  ERROR = 'error',
}

export interface AppScopeConfig {
  readonly service: string;
  readonly environment: 'development' | 'production' | 'test';
  readonly logLevel: LogLevel;
  readonly timezone: string;
}

export interface CalendarConfig {
  readonly enabled: boolean;
  readonly lookbackDays: number;
  readonly lookaheadDays: number;
  readonly maxEntries: number;
  readonly maxGroupsPerEvent: number;
  readonly revalidationSeconds: number;
  readonly metadataLevel: MetadataLevel;
  readonly disabledFamilies: readonly MetadataFamily[];
}

export interface RedisScopeConfig {
  readonly url: string;
}

export interface QueueScopeConfig {
  readonly attempts: number;
  readonly backoffMs: number;
  readonly dispatcherIntervalMs: number;
}

export interface IngestionScopeConfig {
  readonly maxNewGroupsPerCycle: number;
  /** Concurrent group retrievals per worker process. */
  readonly workerConcurrency: number;
  readonly mapDiscoveryEnabled: boolean;
  readonly mapFreshnessHorizonMs: number;
  readonly mapReconciliationIntervalMs: number;
}

export interface UpstreamScopeConfig {
  readonly baseUrl: string;
  readonly token?: string | undefined;
}

export interface RootConfig {
  readonly app: AppScopeConfig;
  readonly calendar: CalendarConfig;
  readonly redis: RedisScopeConfig;
  readonly queue: QueueScopeConfig;
  readonly ingestion: IngestionScopeConfig;
  readonly upstream: UpstreamScopeConfig | undefined;
}
