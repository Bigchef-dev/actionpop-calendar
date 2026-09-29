export type MetricLabels = Record<string, string>;
export interface MetricSample {
  name: string;
  labels: MetricLabels;
  value: number;
}

export class MetricsRegistry {
  private readonly values = new Map<string, MetricSample>();

  constructor(private readonly allowedLabels: Record<string, readonly string[]> = {}) {}

  increment(name: string, labels: MetricLabels = {}, amount = 1): void {
    this.update(name, labels, amount);
  }

  setGauge(name: string, labels: MetricLabels, value: number): void {
    const normalized = this.normalizeLabels(labels);
    const key = this.key(name, normalized);
    this.values.set(key, { name, labels: normalized, value });
  }

  snapshot(): MetricSample[] {
    const samples = [...this.values.values()];
    samples.sort((left, right) => {
      const leftKey = this.key(left.name, left.labels);
      const rightKey = this.key(right.name, right.labels);
      return leftKey.localeCompare(rightKey);
    });
    return samples;
  }

  private update(name: string, labels: MetricLabels, amount: number): void {
    const normalized = this.normalizeLabels(labels);
    const key = this.key(name, normalized);
    const current = this.values.get(key);
    this.values.set(key, { name, labels: normalized, value: (current?.value ?? 0) + amount });
  }

  private normalizeLabels(labels: MetricLabels): MetricLabels {
    const normalizedLabels: MetricLabels = {};
    const labelEntries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));

    for (const [name, value] of labelEntries) {
      const allowed = this.allowedLabels[name];
      normalizedLabels[name] = allowed !== undefined && !allowed.includes(value) ? 'other' : value;
    }

    return normalizedLabels;
  }

  private key(name: string, labels: MetricLabels): string {
    return `${name}:${JSON.stringify(labels)}`;
  }
}