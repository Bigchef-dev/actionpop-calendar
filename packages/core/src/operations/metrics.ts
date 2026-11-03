import {
  createHistogramState,
  histogramBucketSamples,
  recordHistogram,
  type HistogramState,
} from './metrics-histogram.js';
import {
  renderExposition,
  type ExpositionEntry,
  type ExpositionSample,
  type MetricFamily,
  type MetricType,
} from './metrics-exposition.js';
import { normalizeLabels, seriesKey } from './metrics-labels.js';
import type { MetricLabels, MetricSample } from './metrics-types.js';

export type { MetricLabels, MetricSample } from './metrics-types.js';
export { escapeLabelValue } from './metrics-exposition.js';

type Series =
  | { readonly name: string; readonly kind: 'counter'; readonly labels: MetricLabels; value: number }
  | { readonly name: string; readonly kind: 'gauge'; readonly labels: MetricLabels; value: number }
  | {
      readonly name: string;
      readonly kind: 'histogram';
      readonly labels: MetricLabels;
      readonly state: HistogramState;
    };

const DEFAULT_HELP = 'ActionPop Calendar metric.';

/**
 * In-memory registry for the API and the worker.
 *
 * Label values are checked against `allowedLabels` so a caller can never create an unbounded
 * series, and `constLabels` identifies the instance (`deployment`) without colliding with the
 * `instance` label Prometheus attaches at scrape time.
 */
export class MetricsRegistry {
  private readonly series = new Map<string, Series>();
  private readonly families = new Map<string, MetricFamily>();

  constructor(
    private readonly allowedLabels: Record<string, readonly string[]> = {},
    private readonly constLabels: MetricLabels = {},
  ) {}

  /** Documents a family; every family also gets a default help so `# HELP` is never missing. */
  declare(name: string, help: string, type: MetricType = 'counter'): void {
    const existing = this.families.get(name);
    this.families.set(name, { name, type: existing?.type ?? type, help });
  }

  increment(name: string, labels: MetricLabels = {}, amount = 1): void {
    this.family(name, 'counter');
    const normalized = this.normalize(labels);
    const key = seriesKey(name, normalized);
    const current = this.series.get(key);
    const previous = current?.kind === 'counter' ? current.value : 0;
    this.series.set(key, {
      name,
      kind: 'counter',
      labels: normalized,
      value: previous + amount,
    });
  }

  setGauge(name: string, labels: MetricLabels, value: number): void {
    this.family(name, 'gauge');
    const normalized = this.normalize(labels);
    this.series.set(seriesKey(name, normalized), { name, kind: 'gauge', labels: normalized, value });
  }

  /** Records one observation of a histogram family. A negative or non-finite value is ignored. */
  observe(name: string, labels: MetricLabels, value: number, buckets?: readonly number[]): void {
    this.family(name, 'histogram');
    const normalized = this.normalize(labels);
    const key = seriesKey(name, normalized);
    const current = this.series.get(key);
    const state = current?.kind === 'histogram' ? current.state : createHistogramState(buckets);
    this.series.set(key, { name, kind: 'histogram', labels: normalized, state });
    recordHistogram(state, value);
  }

  /** Counters and gauges only; histograms are read through `prometheus()`. */
  snapshot(): MetricSample[] {
    return [...this.series.values()]
      .filter((entry) => entry.kind !== 'histogram')
      .map((entry) => ({ name: entry.name, labels: entry.labels, value: entry.value }))
      .sort((left, right) => seriesKey(left.name, left.labels).localeCompare(seriesKey(right.name, right.labels)));
  }

  prometheus(): string {
    const entries: ExpositionEntry[] = [];
    const names = [...new Set([...this.series.values()].map((entry) => entry.name))].sort();

    for (const name of names) {
      const samples = [...this.series.values()]
        .filter((entry) => entry.name === name)
        .sort((left, right) => seriesKey(left.name, left.labels).localeCompare(seriesKey(right.name, right.labels)))
        .flatMap((entry) => this.samplesFor(entry));
      if (samples.length === 0) continue;
      entries.push({ family: this.familyOf(name), samples });
    }

    return renderExposition(entries);
  }

  private samplesFor(entry: Series): ExpositionSample[] {
    if (entry.kind !== 'histogram') {
      return [{ suffix: '', labels: entry.labels, value: entry.value }];
    }

    return [
      ...histogramBucketSamples(entry.state).map((bucket) => ({
        suffix: '_bucket',
        labels: { ...entry.labels, le: bucket.le },
        value: bucket.value,
      })),
      { suffix: '_sum', labels: entry.labels, value: entry.state.sum },
      { suffix: '_count', labels: entry.labels, value: entry.state.count },
    ];
  }

  private familyOf(name: string): MetricFamily {
    return this.families.get(name) ?? { name, type: 'counter', help: DEFAULT_HELP };
  }

  private family(name: string, type: MetricType): void {
    const existing = this.families.get(name);
    if (existing === undefined) {
      this.families.set(name, { name, type, help: DEFAULT_HELP });
      return;
    }
    if (existing.type !== type) {
      throw new Error(`metric ${name} is declared as ${existing.type}, not ${type}`);
    }
  }

  private normalize(labels: MetricLabels): MetricLabels {
    return normalizeLabels(labels, this.allowedLabels, this.constLabels);
  }
}
