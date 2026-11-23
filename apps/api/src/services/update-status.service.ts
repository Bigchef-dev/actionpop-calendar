import {
  buildUpdateStatus,
  calculateProcessingPeriod,
  type UpdateStatusAnswer,
  type UpdateStatusReader,
} from '@actionpop/core';

const DEFAULT_CACHE_TTL_MS = 10_000;
const HISTORY_LIMIT = 5;

export interface UpdateStatusServiceOptions {
  readonly reader: UpdateStatusReader;
  readonly intervalMs: number;
  readonly cacheTtlMs?: number;
  readonly now?: () => Date;
  /** Receives a read failure for internal logging; the error never reaches the answer. */
  readonly onFailure?: (error: unknown) => void;
}

interface CachedAnswer {
  readonly at: number;
  readonly answer: UpdateStatusAnswer;
}

/**
 * Assembles the public answer and shields PostgreSQL from visitor polling.
 *
 * The two reads are independent so one failing source degrades one section rather than the whole
 * page. A successful answer is cached for a few seconds; an unknown one never is.
 */
export class UpdateStatusService {
  private readonly reader: UpdateStatusReader;
  private readonly intervalMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private readonly onFailure: ((error: unknown) => void) | undefined;
  private cached: CachedAnswer | null = null;
  private inFlight: Promise<UpdateStatusAnswer> | null = null;

  public constructor(options: UpdateStatusServiceOptions) {
    this.reader = options.reader;
    this.intervalMs = options.intervalMs;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.onFailure = options.onFailure;
  }

  public async answer(): Promise<UpdateStatusAnswer> {
    const now = this.now();
    if (this.cached !== null && now.getTime() - this.cached.at < this.cacheTtlMs) {
      return this.cached.answer;
    }
    if (this.inFlight !== null) return this.inFlight;

    const pending = this.load(now);
    this.inFlight = pending;
    try {
      return await pending;
    } finally {
      this.inFlight = null;
    }
  }

  private async load(now: Date): Promise<UpdateStatusAnswer> {
    const period = calculateProcessingPeriod(now, this.intervalMs);
    const [current, settled] = await Promise.allSettled([
      this.reader.current(period.periodStartUtc),
      this.reader.settled(HISTORY_LIMIT, period.periodStartUtc, now),
    ]);

    const currentAvailable = current.status === 'fulfilled';
    if (current.status === 'rejected') this.onFailure?.(current.reason);
    if (settled.status === 'rejected') this.onFailure?.(settled.reason);

    const reading = current.status === 'fulfilled' ? current.value : null;
    const answer = buildUpdateStatus({
      now,
      intervalMs: this.intervalMs,
      current:
        reading === null
          ? null
          : {
              startedAt: period.periodStartUtc,
              counts: reading.counts,
              groups: reading.groups,
              events: reading.events,
              completedAt: reading.completedAt,
            },
      currentAvailable,
      settled: settled.status === 'fulfilled' ? settled.value : null,
    });

    if (answer.state !== 'unknown') this.cached = { at: now.getTime(), answer };
    return answer;
  }
}
