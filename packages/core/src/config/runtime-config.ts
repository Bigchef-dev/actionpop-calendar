import { ConfigurationError } from '../operations/errors.js';

export const DEFAULT_TIMEZONE = 'Europe/Paris';
export const DEFAULT_DISPATCHER_INTERVAL_MS = 15 * 60 * 1000;

export interface RuntimeConfig {
  service: string;
  environment: string;
  redisUrl: string;
  timezone: string;
  dispatcherIntervalMs: number;
  queueAttempts: number;
  queueBackoffMs: number;
  upstreamBaseUrl?: string;
  upstreamToken?: string;
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseRuntimeConfig(
  env: Record<string, string | undefined>,
  service: string,
): RuntimeConfig {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) throw new ConfigurationError('REDIS_URL is required');
  if (env.TIMEZONE !== undefined && env.TIMEZONE !== DEFAULT_TIMEZONE) {
    throw new ConfigurationError(`TIMEZONE must be ${DEFAULT_TIMEZONE}`);
  }

  const config: RuntimeConfig = {
    service,
    environment: env.NODE_ENV ?? 'development',
    redisUrl,
    timezone: DEFAULT_TIMEZONE,
    dispatcherIntervalMs: positiveInteger(
      env.DISPATCHER_INTERVAL_MS,
      'DISPATCHER_INTERVAL_MS',
      DEFAULT_DISPATCHER_INTERVAL_MS,
    ),
    queueAttempts: positiveInteger(env.QUEUE_ATTEMPTS, 'QUEUE_ATTEMPTS', 3),
    queueBackoffMs: positiveInteger(env.QUEUE_BACKOFF_MS, 'QUEUE_BACKOFF_MS', 1000),
  };

  if (env.UPSTREAM_BASE_URL !== undefined && env.UPSTREAM_BASE_URL !== '') {
    config.upstreamBaseUrl = env.UPSTREAM_BASE_URL;
  }
  if (env.UPSTREAM_TOKEN !== undefined && env.UPSTREAM_TOKEN !== '') {
    config.upstreamToken = env.UPSTREAM_TOKEN;
  }

  return config;
}