import { ConfigurationError, loadConfiguration, type RootConfig } from '@actionpop/core';

export interface WorkerConfig extends RootConfig {
  upstreamToken: string | undefined;
  upstreamBaseUrl: string;
}

export interface WorkerConfigurationResult {
  readonly config: WorkerConfig;
  readonly warning: string | undefined;
  readonly configurationPath: string | undefined;
}

/**
 * The worker reads the same YAML document and the same override rules as the
 * API, so one configuration file governs both runtimes.
 */
export function loadWorkerConfiguration(
  env: Record<string, string | undefined> = process.env,
): WorkerConfigurationResult {
  const { config, warning, path } = loadConfiguration(env, 'worker');
  if (config.upstream?.baseUrl === undefined) {
    throw new ConfigurationError('UPSTREAM_BASE_URL is required for the worker');
  }
  return {
    config: {
      ...config,
      upstreamBaseUrl: config.upstream.baseUrl,
      upstreamToken: config.upstream.token,
    },
    warning,
    configurationPath: path,
  };
}

export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): WorkerConfig {
  return loadWorkerConfiguration(env).config;
}
