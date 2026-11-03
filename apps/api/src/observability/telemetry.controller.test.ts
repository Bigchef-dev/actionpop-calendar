import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MetricsRegistry, type CalendarDataset } from '@actionpop/core';

import { buildApp } from '../server.js';

const datasetRepository = {
  getCurrent: async (): Promise<CalendarDataset | null> => null,
};

let metrics: MetricsRegistry;

async function app() {
  return buildApp({ datasetRepository, metrics });
}

function payload(steps: readonly unknown[], visit = 'abcdefgh'): string {
  return JSON.stringify({ v: 1, visit, steps });
}

beforeEach(() => {
  metrics = new MetricsRegistry();
});

afterEach(() => {
  metrics = new MetricsRegistry();
});

describe('POST /telemetry/journey', () => {
  it('accepts a batch and counts every step', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/telemetry/journey',
      headers: { 'content-type': 'application/json' },
      payload: payload([{ s: 'arrival' }, { s: 'subject_selected', k: 'commune' }]),
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    const text = metrics.prometheus();
    expect(text).toContain('actionpop_journey_steps_total{step="arrival",subject_kind="none"} 1');
    expect(text).toContain(
      'actionpop_journey_steps_total{step="subject_selected",subject_kind="commune"} 1',
    );
    await server.close();
  });

  it('counts an unknown step as rejected and accepts the rest', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/telemetry/journey',
      headers: { 'content-type': 'application/json' },
      payload: payload([{ s: 'teleport' }, { s: 'search' }]),
    });

    expect(response.statusCode).toBe(204);
    const text = metrics.prometheus();
    expect(text).toContain(
      'actionpop_telemetry_rejected_total{reason="unknown_step"} 1',
    );
    expect(text).toContain('actionpop_journey_steps_total{step="search",subject_kind="none"} 1');
    await server.close();
  });

  it('refuses a wrong method, a wrong content type and an oversized body', async () => {
    const server = await app();

    const wrongMethod = await server.inject({ method: 'GET', url: '/telemetry/journey' });
    const wrongType = await server.inject({
      method: 'POST',
      url: '/telemetry/journey',
      headers: { 'content-type': 'text/plain' },
      payload: 'hello',
    });
    const oversized = await server.inject({
      method: 'POST',
      url: '/telemetry/journey',
      headers: { 'content-type': 'application/json' },
      payload: payload([{ s: 'arrival', padding: 'a'.repeat(3000) }]),
    });

    expect(wrongMethod.statusCode).toBe(405);
    expect(wrongType.statusCode).toBe(415);
    expect(oversized.statusCode).toBe(413);
    expect(oversized.body).toBe('');
    await server.close();
  });

  it('refuses a malformed body without recording a step', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/telemetry/journey',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ v: 1, visit: 'bad visit', steps: [{ s: 'arrival' }] }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('');
    expect(metrics.prometheus()).not.toContain('actionpop_journey_steps_total');
    await server.close();
  });

  it('never echoes the payload in a refusal', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'POST',
      url: '/telemetry/journey',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ v: 1, visit: 'SECRET-VALUE', steps: [] }),
    });

    expect(response.body).toBe('');
    expect(response.body).not.toContain('SECRET-VALUE');
    await server.close();
  });
});
