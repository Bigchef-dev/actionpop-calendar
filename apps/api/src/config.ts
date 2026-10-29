import { loadConfiguration, type RootConfig } from '@actionpop/core';

export interface ApiConfigResult {
  readonly config: RootConfig;
  readonly warning: string | undefined;
  readonly path: string | undefined;
}

export function loadApiConfiguration(
  env: Record<string, string | undefined> = process.env,
): ApiConfigResult {
  return loadConfiguration(env, 'api');
}

export function loadApiConfig(env: Record<string, string | undefined> = process.env): RootConfig {
  return loadConfiguration(env, 'api').config;
}
