/** Label values are always strings; the registry owns their normalization and escaping. */
export type MetricLabels = Record<string, string>;

export interface MetricSample {
  name: string;
  labels: MetricLabels;
  value: number;
}
