const ENDPOINT = '/telemetry/journey';

export interface JourneyPayload {
  readonly v: 1;
  readonly visit: string;
  readonly steps: ReadonlyArray<{ readonly s: string; readonly k?: string }>;
}

/**
 * Posts one batch and never waits for it.
 *
 * Reporting must not delay a visitor: the promise is deliberately not returned, failures are
 * dropped, and nothing is retried. A lost batch is a lost measurement, not a lost interaction.
 */
export function sendJourneyPayload(payload: JourneyPayload, unloadSafe = false): void {
  if (typeof window === 'undefined') return;

  const body = JSON.stringify(payload);

  try {
    if (unloadSafe && typeof navigator.sendBeacon === 'function') {
      const sent = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      if (sent) return;
    }
  } catch {
    // Fall through to fetch: a blocked beacon must not drop the batch while the page is alive.
  }

  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // A browser that refuses the request entirely loses the batch, never the page.
  }
}
