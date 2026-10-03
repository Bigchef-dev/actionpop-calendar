import { ConfigurationError, parseRuntimeConfig, RootConfig } from '@actionpop/core';

export interface WorkerConfig extends RootConfig {
  upstreamToken: string | undefined;
  upstreamBaseUrl: string;
}

export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  const config = parseRuntimeConfig(env, 'worker');
  if (config.upstream?.baseUrl === undefined) {
    throw new ConfigurationError('UPSTREAM_BASE_URL is required for the worker');
  }
  return { ...config, upstreamBaseUrl: config.upstream.baseUrl, upstreamToken: config.upstream.token };
}
