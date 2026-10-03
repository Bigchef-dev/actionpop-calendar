import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MetricsRegistry, createLogger, type Logger, type CalendarDataset } from '@actionpop/core';

import { createAppModule } from './app.module.js';

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

export async function buildApp(options: ServerOptions): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: false, requestIdHeader: 'x-request-id' });
  const fastifyInstance = adapter.getInstance();

  // 1. Instanciation de l'app NestJS
  const app = await NestFactory.create<NestFastifyApplication>(
    createAppModule(options),
    adapter,
    { logger: false, abortOnError: false }
  );

  const metrics = options.metrics ?? new MetricsRegistry();
  const logger = options.logger ?? createLogger({ service: 'api', environment: process.env.NODE_ENV ?? 'development' });
  const requestStarts = new Map<string, number>();

  // 2. Hooks de monitoring Fastify (Attachés à l'instance sous-jacente)
  fastifyInstance.addHook('onRequest', async (request) => {
    requestStarts.set(request.id, Date.now());
  });

  fastifyInstance.addHook('onResponse', async (request, reply) => {
    const durationMs = Date.now() - (requestStarts.get(request.id) ?? Date.now());
    requestStarts.delete(request.id);
    metrics.increment('actionpop_http_requests_total', {
      outcome: reply.statusCode >= 400 ? 'failure' : 'success',
      method: request.method,
    });
    metrics.increment('actionpop_http_request_duration_seconds', { method: request.method }, durationMs / 1000);
    logger.info('request completed', {
      requestId: request.id,
      operation: `${request.method} ${request.url}`,
      outcome: reply.statusCode >= 400 ? 'failure' : 'success',
      statusCode: reply.statusCode,
      durationMs,
    });
  });

  fastifyInstance.addHook('onError', async (request, _reply, error) => {
    logger.error('request failed', {
      requestId: request.id,
      operation: `${request.method} ${request.url}`,
      outcome: 'failure',
      failure: error.message,
    });
  });

  // 3. Swagger & Scalar (sans avoir besoin de route `/openapi.json`)
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('ActionPop Calendar API').setVersion('0.1.0').build(),
  );


  // (Optionnel) Exposer le raw JSON
  fastifyInstance.get('/openapi.json', async () => document);

  // 4. Initialisation des modules Nest
  await app.init();

  return app;
}