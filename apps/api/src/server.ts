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
  type SubjectSearchReader,
} from '@actionpop/core';
import { apiReference } from '@scalar/nestjs-api-reference';

import { createAppModule } from './app.module.js';
import type { CalendarIcsSettings } from './controllers/calendar-ics.controller.js';
import type { GeographicQueryResult } from './controllers/events.controller.js';
import type { BuildInfo } from './observability/build-info.js';
import { ClientVolumeBand } from './observability/client-volume-band.js';
import {
  registerRequestHook,
  type PublishedRequestObserver,
} from './observability/request-hook.js';

export interface DatasetReader {
  getCurrent(scopeId: string): Promise<CalendarDataset | null>;
}

export interface ServerOptionsEventQuery {
  list(filter: GeographicFilter): Promise<GeographicQueryResult>;
}

export interface ServerOptions {
  datasetRepository: DatasetReader;
  subjectSearch?: SubjectSearchReader;
  /** Origins allowed to read the public JSON reads; empty means no cross-origin access. */
  corsOrigins?: readonly string[];
  eventQuery?: ServerOptionsEventQuery;
  calendarService?: FilteredCalendarReader;
  calendarSettings?: CalendarIcsSettings;
  apiReference?: boolean;
  health?: { redis?: () => Promise<void>; postgres?: () => Promise<void> };
  upstream?: (...args: unknown[]) => unknown;
  metrics?: MetricsRegistry;
  logger?: Logger;
  /** Extra request observers, such as the in-memory client volume band. */
  requestHook?: PublishedRequestObserver;
  /** Instance identity reported through `actionpop_build_info`. */
  buildInfo?: BuildInfo;
  /** Secret re-keying the daily request-volume band; absent disables the band entirely. */
  volumeBandSalt?: string;
}

/**
 * The client-derived value the band hashes. It never leaves the module: only the resulting band
 * is recorded, and the salt rotates daily so yesterday's value cannot be recomputed.
 */
function clientValue(request: { ip?: string; headers: Record<string, unknown> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  const address = typeof forwarded === 'string' ? (forwarded.split(',')[0] ?? '').trim() : '';
  const signature = request.headers['user-agent'];
  return `${address === '' ? (request.ip ?? 'unknown') : address}|${typeof signature === 'string' ? signature : ''}`;
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

  // Cross-origin access is allow-listed so the static site can read the search route.
  const corsOrigins = options.corsOrigins ?? [];
  app.enableCors({
    origin: corsOrigins.length === 0 ? false : [...corsOrigins],
    methods: ['GET', 'HEAD', 'OPTIONS'],
    credentials: false,
  });

  // 2. Hooks de monitoring Fastify, isolés du montage pour rester sous le plafond de 150 lignes.
  registerRequestHook(fastifyInstance, {
    metrics,
    logger,
    ...options.requestHook,
    ...(options.volumeBandSalt === undefined
      ? {}
      : {
          volumeBand: {
            band: new ClientVolumeBand({ salt: options.volumeBandSalt }),
            clientValue: clientValue,
          },
        }),
  });

  // 3. Initialisation des modules Nest
  await app.init();

  // 4. Exploratory surfaces, closed by default. They are registered only when explicitly enabled,
  // so an absent route is genuinely absent rather than a filtered one.
  if (options.apiReference === true) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ActionPop Calendar API')
        .setDescription(
          'Read-only calendar surfaces. `/feed/{scopeId}` returns the group-scoped calendar, ' +
            '`/events` returns the filtered JSON event list, `/search/subjects` resolves a query to ' +
            'calendar subjects, and `/calendar.ics` returns the filtered iCalendar calendar. Geographic and event-type identifiers are strings so leading zeroes survive.',
        )
        .setVersion('0.1.0')
        .build(),
    );

    fastifyInstance.get('/openapi.json', async () => document);
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
