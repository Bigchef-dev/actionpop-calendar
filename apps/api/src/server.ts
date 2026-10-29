import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  MetricsRegistry,
  createLogger,
  type Logger,
  type CalendarDataset,
  type FilteredCalendarReader,
  type GeographicFilter,
} from '@actionpop/core';
import { apiReference } from '@scalar/nestjs-api-reference';

import { createAppModule } from './app.module.js';
import type { CalendarIcsSettings } from './controllers/calendar-ics.controller.js';
import type { GeographicQueryResult } from './controllers/events.controller.js';

export interface DatasetReader {
  getCurrent(scopeId: string): Promise<CalendarDataset | null>;
}

export interface ServerOptionsEventQuery {
  list(filter: GeographicFilter): Promise<GeographicQueryResult>;
}

export interface ServerOptions {
  datasetRepository: DatasetReader;
  eventQuery?: ServerOptionsEventQuery;
  calendarService?: FilteredCalendarReader;
  calendarSettings?: CalendarIcsSettings;
  apiReference?: boolean;
  health?: { redis?: () => Promise<void>; postgres?: () => Promise<void> };
  upstream?: (...args: unknown[]) => unknown;
  metrics?: MetricsRegistry;
  logger?: Logger;
}

export async function buildApp(options: ServerOptions): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: false, requestIdHeader: 'x-request-id' });
  const fastifyInstance = adapter.getInstance();

  const metrics = options.metrics ?? new MetricsRegistry();
  const logger =
    options.logger ??
    createLogger({ service: 'api', environment: process.env.NODE_ENV ?? 'development' });

  // 1. Instanciation de l'app NestJS
  // The resolved dependencies are injected into the module so the controllers and the
  // Fastify hooks below report to the same registry and logger.
  const app = await NestFactory.create<NestFastifyApplication>(
    createAppModule({ ...options, metrics, logger }),
    adapter,
    { logger: false, abortOnError: false },
  );

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
    metrics.increment(
      'actionpop_http_request_duration_seconds',
      { method: request.method },
      durationMs / 1000,
    );
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

  // 3. OpenAPI document generated from the Nest decorators, served as raw JSON
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ActionPop Calendar API')
      .setDescription(
        'Read-only calendar surfaces. `/feed/{scopeId}` returns the group-scoped calendar, ' +
          '`/events` returns the filtered JSON event list, and `/calendar.ics` returns the filtered ' +
          'iCalendar calendar. Geographic and event-type identifiers are strings so leading zeroes survive.',
      )
      .setVersion('0.1.0')
      .build(),
  );

  fastifyInstance.get('/openapi.json', async () => document);

  // 4. Initialisation des modules Nest
  await app.init();

  // 5. Interactive reference built from the same document, so it cannot drift from the code
  if (options.apiReference !== false) {
    app.use(
      '/reference',
      apiReference({
        url: '/openapi.json',
        withFastify: true,
        pageTitle: 'ActionPop Calendar API',
      }),
    );
  }

  return app;
}
