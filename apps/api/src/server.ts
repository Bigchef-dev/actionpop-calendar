import Fastify, { type FastifyInstance } from 'fastify';
import {
  buildIcalFeed,
  MetricsRegistry,
  createLogger,
  runHealthCheck,
  type CalendarDataset,
  type HealthResult,
  type Logger,
} from '@actionpop/core';

export interface DatasetReader {
  getCurrent(scopeId: string): Promise<CalendarDataset | null>;
}

export interface ServerOptions {
  datasetRepository: DatasetReader;
  health?: { redis?: () => Promise<void> };
  upstream?: (...args: unknown[]) => unknown;
  metrics?: MetricsRegistry;
  logger?: Logger;
}

function publicError(message: string): { error: string } {
  return { error: message };
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const metrics = options.metrics ?? new MetricsRegistry();
  const logger = options.logger ?? createLogger({ service: 'api', environment: process.env.NODE_ENV ?? 'development' });
  const requestStarts = new Map<string, number>();
  const server = Fastify({ logger: false, requestIdHeader: 'x-request-id' });

  server.addHook('onRequest', async (request) => {
    requestStarts.set(request.id, Date.now());
  });

  server.addHook('onResponse', async (request, reply) => {
    const durationMs = Date.now() - (requestStarts.get(request.id) ?? Date.now());
    requestStarts.delete(request.id);
    metrics.increment('actionpop_http_requests_total', {
      outcome: reply.statusCode >= 500 ? 'failure' : 'success',
      method: request.method,
    });
    metrics.increment('actionpop_http_request_duration_seconds', { method: request.method }, durationMs / 1000);
    logger.info('request completed', {
      requestId: request.id,
      operation: `${request.method} ${request.url}`,
      outcome: reply.statusCode >= 500 ? 'failure' : 'success',
      durationMs,
    });
  });

  server.addHook('onError', async (request, _reply, error) => {
    logger.error('request failed', {
      requestId: request.id,
      operation: `${request.method} ${request.url}`,
      outcome: 'failure',
      failure: error.message,
    });
  });

  server.route({
    method: 'GET',
    url: '/feed/:scopeId',
    handler: async (request, reply) => {
      let scopeId: string;
      try {
        scopeId = (request.params as { scopeId: string }).scopeId;
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scopeId)) throw new Error('invalid scope');
      } catch {
        return reply.code(400).send(publicError('invalid scope identifier'));
      }

      let dataset: CalendarDataset | null;
      try {
        dataset = await options.datasetRepository.getCurrent(scopeId);
      } catch {
        return reply.code(503).send(publicError('calendar data unavailable'));
      }
      if (dataset === null) return reply.code(404).send(publicError('scope not found'));

      const feed = buildIcalFeed({ ...dataset, events: dataset.events });
      reply.header('ETag', `"${feed.revision}"`);
      reply.header('Cache-Control', 'public, max-age=900');
      if (request.headers['if-none-match'] === `"${feed.revision}"`) return reply.code(304).send();
      return reply.type('text/calendar; charset=utf-8').send(feed.body);
    },
  });

  server.route({
    method: ['POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/feed/:scopeId',
    handler: async (_request, reply) => reply.code(405).send(publicError('read-only feed')),
  });

  server.get('/internal/live', async () => ({ status: 'ready' }));
  server.get('/internal/metrics', async (_request, reply) => {
    let redisReady = 1;
    if (options.health?.redis !== undefined) {
      try {
        await options.health.redis();
      } catch {
        redisReady = 0;
      }
    }
    metrics.setGauge('actionpop_redis_ready', {}, redisReady);
    return reply.type('text/plain; version=0.0.4').send(Buffer.from(metrics.prometheus()));
  });
  server.get('/internal/ready', async (_request, reply) => {
    const checks: HealthResult[] = [];
    if (options.health?.redis !== undefined)
      checks.push(await runHealthCheck('redis', options.health.redis));
    const ready = checks.every((check) => check.status === 'ready');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });
  return server;
}
