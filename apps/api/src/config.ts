import { parseRuntimeConfig, type RuntimeConfig } from '@actionpop/core';

export function loadApiConfig(
  env: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  return parseRuntimeConfig(env, 'api');
}
