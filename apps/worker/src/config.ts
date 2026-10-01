import { ConfigurationError, parseRuntimeConfig, type RuntimeConfig } from '@actionpop/core';

export interface WorkerConfig extends RuntimeConfig {
  upstreamBaseUrl: string;
}

export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const config = parseRuntimeConfig(env, 'worker');
  if (config.upstreamBaseUrl === undefined) {
    throw new ConfigurationError('UPSTREAM_BASE_URL is required for the worker');
  }
  return { ...config, upstreamBaseUrl: config.upstreamBaseUrl };
}
