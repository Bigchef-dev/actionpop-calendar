import { ConfigurationError } from '../operations/errors.js';
import { readConfiguration } from './config-file.js';
import {
  AppScopeConfig,
  CalendarConfig,
  IngestionScopeConfig,
  LogLevel,
  QueueScopeConfig,
  RedisScopeConfig,
  RootConfig,
  UpstreamScopeConfig,
} from './config.interface.js';
import {
  DEFAULT_DISPATCHER_INTERVAL_MS,
  DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE,
  DEFAULT_INGESTION_WORKER_CONCURRENCY,
} from './defaults.config.js';
import { findWorkspaceRoot } from './load-env.js';

function parsePositiveInt(val: string | undefined, name: string, fallback: number): number {
  if (!val || val.trim() === '') return fallback;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  return num;
}

function parseTimezone(value: string | undefined): string {
  const timezone = value ?? 'Europe/Paris';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new ConfigurationError(`Invalid timezone: ${timezone}`);
  }
  return timezone;
}

export function parseAppConfig(
  env: Record<string, string | undefined>,
  service: string,
  document: {
    environment?: string | undefined;
    logLevel?: string | undefined;
    timezone?: string | undefined;
  } = {},
): AppScopeConfig {
  if (!service) throw new ConfigurationError('Service name is required');

  return {
    service,
    environment:
      (document.environment as AppScopeConfig['environment']) ??
      (env.NODE_ENV as AppScopeConfig['environment']) ??
      'development',
    logLevel:
      (document.logLevel?.toLowerCase() as LogLevel) ??
      (env.LOG_LEVEL?.toLowerCase() as LogLevel) ??
      LogLevel.INFO,
    timezone: parseTimezone(document.timezone ?? env.TIMEZONE),
  };
}

export function parseRedisConfig(env: Record<string, string | undefined>): RedisScopeConfig {
  const url = env.REDIS_URL;
  if (!url) throw new ConfigurationError('REDIS_URL is required');

  const parsed = new URL(url);
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new ConfigurationError('REDIS_URL must use redis:// or rediss://');
  }

  return { url: parsed.toString() };
}

export function parseQueueConfig(
  env: Record<string, string | undefined>,
  document: {
    attempts?: number | undefined;
    backoffMs?: number | undefined;
    dispatcherIntervalMs?: number | undefined;
  } = {},
): QueueScopeConfig {
  return {
    attempts: document.attempts ?? parsePositiveInt(env.QUEUE_ATTEMPTS, 'QUEUE_ATTEMPTS', 3),
    backoffMs:
      document.backoffMs ?? parsePositiveInt(env.QUEUE_BACKOFF_MS, 'QUEUE_BACKOFF_MS', 1000),
    dispatcherIntervalMs:
      document.dispatcherIntervalMs ??
      parsePositiveInt(
        env.DISPATCHER_INTERVAL_MS,
        'DISPATCHER_INTERVAL_MS',
        DEFAULT_DISPATCHER_INTERVAL_MS,
      ),
  };
}

export function parseIngestionConfig(
  env: Record<string, string | undefined>,
  document: {
    maxNewGroupsPerCycle?: number | undefined;
    workerConcurrency?: number | undefined;
  } = {},
): IngestionScopeConfig {
  return {
    maxNewGroupsPerCycle:
      document.maxNewGroupsPerCycle ??
      parsePositiveInt(
        env.INGESTION_MAX_NEW_GROUPS_PER_CYCLE,
        'INGESTION_MAX_NEW_GROUPS_PER_CYCLE',
        DEFAULT_INGESTION_MAX_NEW_GROUPS_PER_CYCLE,
      ),
    workerConcurrency:
      document.workerConcurrency ??
      parsePositiveInt(
        env.INGESTION_WORKER_CONCURRENCY,
        'INGESTION_WORKER_CONCURRENCY',
        DEFAULT_INGESTION_WORKER_CONCURRENCY,
      ),
  };
}

export function parseUpstreamConfig(
  env: Record<string, string | undefined>,
): UpstreamScopeConfig | undefined {
  const baseUrl = env.UPSTREAM_BASE_URL?.trim();
  if (!baseUrl) return undefined;

  const parsed = new URL(baseUrl);
  return {
    baseUrl: parsed.toString(),
    token: env.UPSTREAM_TOKEN?.trim(),
  };
}

/**
 * Reads the shared YAML document, overlays environment variables and validates
 * the merged result. Environment values always win over file values, and the
 * file is never rewritten.
 */
export interface ConfigurationLoadResult {
  readonly config: RootConfig;
  readonly warning: string | undefined;
  readonly path: string | undefined;
}

export function loadConfiguration(
  env: Record<string, string | undefined>,
  service: string,
  rootDirectory: string = findWorkspaceRoot(process.cwd()) ?? process.cwd(),
): ConfigurationLoadResult {
  const { path, warning, parsed } = readConfiguration(env, rootDirectory);

  const config: RootConfig = {
    app: parseAppConfig(env, service, parsed.app),
    calendar: parsed.calendar as CalendarConfig,
    redis: parseRedisConfig(env),
    queue: parseQueueConfig(env, parsed.queue),
    ingestion: parseIngestionConfig(env, parsed.ingestion),
    upstream: parseUpstreamConfig(env),
  };

  return { config, warning, path };
}

export function parseRuntimeConfig(
  env: Record<string, string | undefined>,
  service: string,
  rootDirectory: string = findWorkspaceRoot(process.cwd()) ?? process.cwd(),
): RootConfig {
  return loadConfiguration(env, service, rootDirectory).config;
}
