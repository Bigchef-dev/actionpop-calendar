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

export interface RedisScopeConfig {
  readonly url: string;
}

export interface QueueScopeConfig {
  readonly attempts: number;
  readonly backoffMs: number;
  readonly dispatcherIntervalMs: number;
}

export interface UpstreamScopeConfig {
  readonly baseUrl: string;
  readonly token?: string | undefined;
}

export interface RootConfig {
  readonly app: AppScopeConfig;
  readonly redis: RedisScopeConfig;
  readonly queue: QueueScopeConfig;
  readonly upstream: UpstreamScopeConfig | undefined;
}