import { describe, expect, it } from 'vitest';

import {
  ClientVolumeBand,
  MAX_TRACKED_CLIENTS,
  VOLUME_BANDS,
  bandFor,
} from './client-volume-band.js';

function band(options: Partial<ConstructorParameters<typeof ClientVolumeBand>[0]> = {}) {
  return new ClientVolumeBand({ salt: 'test-secret', ...options });
}

describe('client volume band', () => {
  it('maps a count onto one of five bounded bands', () => {
    expect(bandFor(1)).toBe('low');
    expect(bandFor(19)).toBe('low');
    expect(bandFor(20)).toBe('moderate');
    expect(bandFor(99)).toBe('moderate');
    expect(bandFor(100)).toBe('high');
    expect(bandFor(499)).toBe('high');
    expect(bandFor(500)).toBe('very_high');
    expect(bandFor(1999)).toBe('very_high');
    expect(bandFor(2000)).toBe('extreme');
  });

  it('grows the band for the same client and keeps clients apart', () => {
    const tracker = band();

    for (let index = 0; index < 20; index += 1) tracker.observe('198.51.100.7|curl/8');

    expect(tracker.observe('198.51.100.7|curl/8')).toBe('moderate');
    expect(tracker.observe('203.0.113.9|Mozilla/5.0')).toBe('low');
  });

  it('re-keys every day, so a client restarts at the lowest band', () => {
    let current = new Date('2026-11-02T10:00:00Z');
    const tracker = band({ now: () => current });

    for (let index = 0; index < 120; index += 1) tracker.observe('198.51.100.7');

    current = new Date('2026-11-03T00:30:00Z');
    expect(tracker.observe('198.51.100.7')).toBe('low');
  });

  it('returns only a band, never the key it tracks', () => {
    const tracker = band();
    const result = tracker.observe('198.51.100.7|curl/8');

    expect(VOLUME_BANDS).toContain(result);
    expect(result).not.toContain('198.51.100.7');
    expect(JSON.stringify(tracker)).not.toContain('198.51.100.7');
  });

  it('stays bounded in memory', () => {
    const tracker = band({ maxClients: 3 });

    for (let index = 0; index < 10; index += 1) tracker.observe(`client-${index}`);

    expect(tracker.size()).toBe(3);
    expect(tracker.size()).toBeLessThanOrEqual(MAX_TRACKED_CLIENTS);
  });
});
