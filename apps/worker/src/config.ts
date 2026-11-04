import { ConfigurationError, loadConfiguration, type RootConfig } from '@actionpop/core';

export interface WorkerConfig extends RootConfig {
  upstreamToken: string | undefined;
  upstreamBaseUrl: string;
  /**
   * Proxy the worker reaches the source through, when set. SOCKS5 lets the deployment
   * choose its egress address instead of depending on the host's own.
   */
  sockProxy: string | undefined;
}

const SOCK_PROXY_PROTOCOLS = new Set(['socks5:', 'socks:', 'http:', 'https:']);

export function parseSockProxy(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (candidate === undefined || candidate === '') return undefined;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new ConfigurationError('SOCK_PROXY must be a valid URL');
  }
  if (!SOCK_PROXY_PROTOCOLS.has(url.protocol)) {
    throw new ConfigurationError('SOCK_PROXY must use socks5://, socks://, http:// or https://');
  }
  return url.toString();
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
      sockProxy: parseSockProxy(env.SOCK_PROXY),
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
