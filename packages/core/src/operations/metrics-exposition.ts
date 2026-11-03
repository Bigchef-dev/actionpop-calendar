import type { MetricLabels } from './metrics-types.js';

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricFamily {
  readonly name: string;
  readonly type: MetricType;
  readonly help: string;
}

export interface ExpositionSample {
  readonly suffix: string;
  readonly labels: MetricLabels;
  readonly value: number;
}

export interface ExpositionEntry {
  readonly family: MetricFamily;
  readonly samples: readonly ExpositionSample[];
}

/** Prometheus text format escapes backslashes, double quotes and newlines in label values. */
export function escapeLabelValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n');
}

export function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  const body = entries
    .map(([name, value]) => `${name}="${escapeLabelValue(value)}"`)
    .join(',');
  return `{${body}}`;
}

export function formatValue(value: number): string {
  if (Number.isFinite(value)) return String(value);
  return value > 0 ? '+Inf' : value < 0 ? '-Inf' : 'NaN';
}

/**
 * Renders one `# HELP` and one `# TYPE` line per family before its first sample, so a histogram is
 * readable by Prometheus and every series is typed rather than `untyped`.
 */
export function renderExposition(entries: readonly ExpositionEntry[]): string {
  const lines: string[] = [];

  for (const { family, samples } of entries) {
    if (samples.length === 0) continue;
    lines.push(`# HELP ${family.name} ${family.help}`);
    lines.push(`# TYPE ${family.name} ${family.type}`);
    for (const sample of samples) {
      lines.push(`${family.name}${sample.suffix}${formatLabels(sample.labels)} ${formatValue(sample.value)}`);
    }
  }

  return lines.join('\n') + '\n';
}
