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

export interface ObservabilityScopeConfig {
  /**
   * Short identifier of the running instance, emitted as the `deployment` metric label so two
   * instances running at once stay distinguishable. Normalized to `unknown` when unusable.
   */
  readonly deployment: string;
  /**
   * Secret used to re-key the daily client volume band. It never leaves the process and is never
   * logged; an empty value means a per-process random key is generated at startup.
   */
  readonly bandSalt: string;
  /** Whether the published site may report journey steps to this API. */
  readonly telemetryEnabled: boolean;
}

export interface RootConfig {
  readonly app: AppScopeConfig;
  readonly calendar: CalendarConfig;
  readonly redis: RedisScopeConfig;
  readonly queue: QueueScopeConfig;
  readonly ingestion: IngestionScopeConfig;
  readonly observability: ObservabilityScopeConfig;
  readonly upstream: UpstreamScopeConfig | undefined;
}
