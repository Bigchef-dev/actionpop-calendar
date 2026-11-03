import { createHmac, randomBytes } from 'node:crypto';

export const VOLUME_BANDS = ['low', 'moderate', 'high', 'very_high', 'extreme'] as const;

export type VolumeBand = (typeof VOLUME_BANDS)[number];

/** Inclusive upper bounds of each band, in requests per day per client. */
const BAND_CEILINGS: ReadonlyArray<{ readonly band: VolumeBand; readonly max: number }> = [
  { band: 'low', max: 19 },
  { band: 'moderate', max: 99 },
  { band: 'high', max: 499 },
  { band: 'very_high', max: 1999 },
];

export const MAX_TRACKED_CLIENTS = 10_000;

export interface VolumeBandOptions {
  readonly salt: string;
  readonly timezone?: string;
  readonly maxClients?: number;
  readonly now?: () => Date;
  readonly fallbackSalt?: string;
}

function dayKey(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function bandFor(count: number): VolumeBand {
  for (const entry of BAND_CEILINGS) {
    if (count <= entry.max) return entry.band;
  }
  return 'extreme';
}

/**
 * Counts requests per client without ever identifying one.
 *
 * The key is an HMAC of the client-derived value, salted with a secret plus the current day in
 * Europe/Paris, so the key space is rebuilt daily and yesterday's key can no longer be computed.
 * Nothing is written to disk or to a log, the map is bounded, and only a band leaves this module —
 * the key itself is never a metric label.
 */
export class ClientVolumeBand {
  private readonly salt: string;
  private readonly timezone: string;
  private readonly maxClients: number;
  private readonly now: () => Date;
  private counts = new Map<string, number>();
  private currentDay: string;

  constructor(options: VolumeBandOptions) {
    // An unset secret still rotates daily: a per-process random key is used instead of nothing.
    this.salt = options.salt !== '' ? options.salt : (options.fallbackSalt ?? randomBytes(32).toString('hex'));
    this.timezone = options.timezone ?? 'Europe/Paris';
    this.maxClients = options.maxClients ?? MAX_TRACKED_CLIENTS;
    this.now = options.now ?? (() => new Date());
    this.currentDay = dayKey(this.now(), this.timezone);
  }

  /** Records one request and returns the band the client now falls into. */
  observe(clientDerivedValue: string): VolumeBand {
    const day = dayKey(this.now(), this.timezone);
    if (day !== this.currentDay) {
      // Rotation drops every key: a client restarts at `low` instead of accumulating history.
      this.counts = new Map();
      this.currentDay = day;
    }

    const key = createHmac('sha256', `${this.salt}:${day}`)
      .update(clientDerivedValue)
      .digest('base64url');

    if (!this.counts.has(key) && this.counts.size >= this.maxClients) {
      const oldest = this.counts.keys().next();
      if (oldest.done !== true) this.counts.delete(oldest.value);
    }

    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return bandFor(count);
  }

  /** Number of keys currently held, for tests and for a bounded-memory assertion. */
  size(): number {
    return this.counts.size;
  }
}
