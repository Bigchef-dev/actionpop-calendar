import { parseRuntimeConfig, RootConfig } from "@actionpop/core";

export function loadApiConfig(
  env: Record<string, string | undefined> = process.env,
): RootConfig {
  return parseRuntimeConfig(env, 'api');
}
