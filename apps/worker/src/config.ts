import { parseRuntimeConfig, type RuntimeConfig } from '@actionpop/core';

export function loadWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  return parseRuntimeConfig(env, 'worker');
}
