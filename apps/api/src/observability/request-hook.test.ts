import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { MetricsRegistry, createLogger } from '@actionpop/core';

import { failureKindFor, registerRequestHook } from './request-hook.js';

const logger = createLogger({ service: 'test', environment: 'test' });

async function buildTestInstance(metrics: MetricsRegistry) {
  const instance = Fastify();
  registerRequestHook(instance, { metrics, logger });
  instance.get('/calendar.ics', async () => 'ok');
  instance.get('/boom', async () => {
    throw new Error('nope');
  });
  instance.get('/down', async (_request, reply) => reply.code(503).send({ error: 'down' }));
  return instance;
}

describe('request hook', () => {
  it('records a success without a failure sample', async () => {
    const metrics = new MetricsRegistry();
    const instance = await buildTestInstance(metrics);
    await instance.inject({ method: 'GET', url: '/calendar.ics?insee_commune=35238' });

    const text = metrics.prometheus();
    expect(text).toContain(
      'actionpop_http_requests_total{method="GET",route="/calendar.ics",status_class="2xx"} 1',
    );
    expect(text).not.toContain('actionpop_http_failures_total');
    expect(text).toContain('# TYPE actionpop_http_request_duration_seconds histogram');
    await instance.close();
  });

  it('separates a rejected request from an unavailable dependency', async () => {
    const metrics = new MetricsRegistry();
    const instance = await buildTestInstance(metrics);
    await instance.inject({ method: 'GET', url: '/missing' });
    await instance.inject({ method: 'GET', url: '/down' });

    const text = metrics.prometheus();
    expect(text).toContain(
      'actionpop_http_failures_total{failure_kind="client_rejected",route="/other"} 1',
    );
    expect(text).toContain(
      'actionpop_http_failures_total{failure_kind="dependency_unavailable",route="/other"} 1',
    );
    await instance.close();
  });

  it('classifies an unexpected server error as an internal error', () => {
    expect(failureKindFor(400)).toBe('client_rejected');
    expect(failureKindFor(404)).toBe('client_rejected');
    expect(failureKindFor(503)).toBe('dependency_unavailable');
    expect(failureKindFor(500)).toBe('internal_error');
    expect(failureKindFor(200)).toBeNull();
    expect(failureKindFor(304)).toBeNull();
  });
});
