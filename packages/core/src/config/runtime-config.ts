import { ConfigurationError } from '../operations/errors.js';
import { AppScopeConfig, LogLevel, QueueScopeConfig, RedisScopeConfig, RootConfig, UpstreamScopeConfig } from './config.interface.js';

function parsePositiveInt(val: string | undefined, name: string, fallback: number): number {
  if (!val || val.trim() === '') return fallback;
  const num = Number(val);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  return num;
}

export function parseAppConfig(env: Record<string, string | undefined>, service: string): AppScopeConfig {
  if (!service) throw new ConfigurationError('Service name is required');

  const timezone = env.TIMEZONE ?? 'Europe/Paris';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new ConfigurationError(`Invalid timezone: ${timezone}`);
  }

  return {
    service,
    environment: (env.NODE_ENV as AppScopeConfig['environment']) ?? 'development',
    logLevel: (env.LOG_LEVEL?.toLowerCase() as LogLevel) ?? LogLevel.INFO,
    timezone,
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

export function parseQueueConfig(env: Record<string, string | undefined>): QueueScopeConfig {
  return {
    attempts: parsePositiveInt(env.QUEUE_ATTEMPTS, 'QUEUE_ATTEMPTS', 3),
    backoffMs: parsePositiveInt(env.QUEUE_BACKOFF_MS, 'QUEUE_BACKOFF_MS', 1000),
    dispatcherIntervalMs: parsePositiveInt(env.DISPATCHER_INTERVAL_MS, 'DISPATCHER_INTERVAL_MS', 15 * 60 * 1000),
  };
}

export function parseUpstreamConfig(env: Record<string, string | undefined>): UpstreamScopeConfig | undefined {
  const baseUrl = env.UPSTREAM_BASE_URL?.trim();
  if (!baseUrl) return undefined;

  const parsed = new URL(baseUrl);
  return {
    baseUrl: parsed.toString(),
    token: env.UPSTREAM_TOKEN?.trim(),
  };
}

export function parseRuntimeConfig(
  env: Record<string, string | undefined>,
  service: string,
): RootConfig {
  return {
    app: parseAppConfig(env, service),
    redis: parseRedisConfig(env),
    queue: parseQueueConfig(env),
    upstream: parseUpstreamConfig(env),
  };
}