import type { EnvironmentMapping } from './config-schema.js';

const asBoolean = (raw: string): unknown => {
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return raw;
};

const asInteger = (raw: string): unknown => {
  const value = raw.trim();
  return /^-?\d+$/.test(value) ? Number(value) : raw;
};

const asList = (raw: string): unknown =>
  raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

const asText = (raw: string): unknown => raw.trim();
const asLowerText = (raw: string): unknown => raw.trim().toLowerCase();

export const ENVIRONMENT_MAPPINGS: readonly EnvironmentMapping[] = [
  { key: 'app.environment', variable: 'NODE_ENV', read: asText },
  { key: 'app.logLevel', variable: 'LOG_LEVEL', read: asLowerText },
  { key: 'app.timezone', variable: 'TIMEZONE', read: asText },
  { key: 'app.port', variable: 'PORT', read: asInteger },
  { key: 'calendar.enabled', variable: 'CALENDAR_ENABLED', read: asBoolean },
  { key: 'calendar.lookbackDays', variable: 'CALENDAR_LOOKBACK_DAYS', read: asInteger },
  { key: 'calendar.lookaheadDays', variable: 'CALENDAR_LOOKAHEAD_DAYS', read: asInteger },
  { key: 'calendar.maxEntries', variable: 'CALENDAR_MAX_ENTRIES', read: asInteger },
  { key: 'calendar.maxGroupsPerEvent', variable: 'CALENDAR_MAX_GROUPS_PER_EVENT', read: asInteger },
  {
    key: 'calendar.revalidationSeconds',
    variable: 'CALENDAR_REVALIDATION_SECONDS',
    read: asInteger,
  },
  { key: 'calendar.metadataLevel', variable: 'CALENDAR_METADATA_LEVEL', read: asText },
  { key: 'calendar.disabledFamilies', variable: 'CALENDAR_DISABLED_FAMILIES', read: asList },
  { key: 'queue.attempts', variable: 'QUEUE_ATTEMPTS', read: asInteger },
  { key: 'queue.backoffMs', variable: 'QUEUE_BACKOFF_MS', read: asInteger },
  { key: 'queue.dispatcherIntervalMs', variable: 'DISPATCHER_INTERVAL_MS', read: asInteger },
];

export function variableFor(key: string): string | undefined {
  return ENVIRONMENT_MAPPINGS.find((mapping) => mapping.key === key)?.variable;
}

/**
 * Overlays environment values on the file document. The file is never mutated:
 * the merge clones it, so a deployment can override a value without rewriting
 * the reviewed document.
 */
export function applyEnvironmentOverrides(
  env: Record<string, string | undefined>,
  document: Record<string, unknown>,
): { document: Record<string, unknown>; environmentKeys: Set<string> } {
  const merged: Record<string, unknown> = structuredClone(document);
  const environmentKeys = new Set<string>();

  for (const mapping of ENVIRONMENT_MAPPINGS) {
    const raw = env[mapping.variable];
    if (raw === undefined || raw.trim() === '') continue;
    writeAtPath(merged, mapping.key, mapping.read(raw));
    environmentKeys.add(mapping.key);
  }

  return { document: merged, environmentKeys };
}

function writeAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let current: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (existing === undefined || existing === null || typeof existing !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1];
  if (last !== undefined) current[last] = value;
}
