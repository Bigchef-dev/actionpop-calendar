/**
 * Fixed-bucket histograms for the in-house metrics registry.
 *
 * Client-side quantiles are deliberately absent: they cannot be aggregated across the two
 * instances a cutover may run, and their memory cost is unbounded. Prometheus computes quantiles
 * from these buckets at query time instead.
 */

/** Boundaries in seconds: a healthy calendar read is 10-150 ms, the tail matters up to 10 s. */
export const DEFAULT_HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

export interface HistogramState {
  readonly buckets: readonly number[];
  /** Non-cumulative count per bucket; a value above the last boundary lands only in `+Inf`. */
  readonly counts: number[];
  sum: number;
  count: number;
}

export interface HistogramBucketSample {
  readonly le: string;
  /** Cumulative count of observations less than or equal to `le`. */
  readonly value: number;
}

export function createHistogramState(
  buckets: readonly number[] = DEFAULT_HISTOGRAM_BUCKETS,
): HistogramState {
  return { buckets, counts: buckets.map(() => 0), sum: 0, count: 0 };
}

export function recordHistogram(state: HistogramState, value: number): void {
  // A negative or non-finite observation is a programming error in a caller, not a data point:
  // recording it would corrupt the distribution without any way to notice.
  if (!Number.isFinite(value) || value < 0) return;

  state.sum += value;
  state.count += 1;
  const index = state.buckets.findIndex((boundary) => value <= boundary);
  if (index === -1) return;
  state.counts[index] = (state.counts[index] ?? 0) + 1;
}

export function histogramBucketSamples(state: HistogramState): HistogramBucketSample[] {
  const samples: HistogramBucketSample[] = [];
  let cumulative = 0;

  state.buckets.forEach((boundary, index) => {
    cumulative += state.counts[index] ?? 0;
    samples.push({ le: String(boundary), value: cumulative });
  });
  samples.push({ le: '+Inf', value: state.count });

  return samples;
}
