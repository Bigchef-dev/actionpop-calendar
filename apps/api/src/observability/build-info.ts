import type { MetricLabels } from '@actionpop/core';

/**
 * Identity of the running instance, reported through `actionpop_build_info`.
 *
 * `deployment` distinguishes two instances running at once; it is deliberately not named
 * `instance`, which Prometheus attaches to every sample at scrape time. `version` comes from the
 * image environment and falls back to `0.0.0` rather than guessing.
 */
export interface BuildInfo {
  readonly deployment: string;
  readonly version: string;
}

export function buildInfo(env: Record<string, string | undefined> = process.env): BuildInfo {
  const version = (env.APP_VERSION ?? '').trim();
  return {
    deployment: (env.OBSERVABILITY_DEPLOYMENT ?? '').trim() || 'unknown',
    version: version === '' ? '0.0.0' : version,
  };
}

export function buildInfoLabels(info: BuildInfo): MetricLabels {
  return { deployment: info.deployment, version: info.version };
}
