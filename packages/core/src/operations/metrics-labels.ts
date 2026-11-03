import type { MetricLabels } from './metrics-types.js';

/**
 * Merges the instance labels over the caller labels and maps any value outside its allowed
 * enumeration to `other`, so an unexpected value can never create an unbounded series.
 */
export function normalizeLabels(
  labels: MetricLabels,
  allowedLabels: Record<string, readonly string[]>,
  constLabels: MetricLabels,
): MetricLabels {
  const merged = { ...labels, ...constLabels };
  const entries = Object.entries(merged).sort(([left], [right]) => left.localeCompare(right));
  const normalized: MetricLabels = {};

  for (const [name, value] of entries) {
    const allowed = allowedLabels[name];
    normalized[name] = allowed !== undefined && !allowed.includes(value) ? 'other' : value;
  }

  return normalized;
}

export function seriesKey(name: string, labels: MetricLabels): string {
  return `${name}:${JSON.stringify(labels)}`;
}
