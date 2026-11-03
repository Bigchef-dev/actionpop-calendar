import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Logger, MetricsRegistry } from '@actionpop/core';

import type { ClientVolumeBand } from './client-volume-band.js';
import { methodLabel, routeTemplate, statusClass } from './route-template.js';

export type FailureKind = 'client_rejected' | 'dependency_unavailable' | 'internal_error';

/** Observer for the in-memory volume band; never receives a label that outlives the request. */
export interface PublishedRequestObserver {
  readonly onPublishedRequest?: (request: FastifyRequest) => void;
}

export interface RequestHookOptions extends PublishedRequestObserver {
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
  /**
   * Records request volume per client. Off when absent, which is how a deployment that has not
   * provided a salt avoids tracking anything.
   */
  readonly volumeBand?: {
    readonly band: ClientVolumeBand;
    readonly clientValue: (request: FastifyRequest) => string;
  };
}

const INTERNAL_PREFIX = '/internal/';

export function failureKindFor(statusCode: number): FailureKind | null {
  if (statusCode >= 400 && statusCode < 500) return 'client_rejected';
  if (statusCode === 503) return 'dependency_unavailable';
  if (statusCode >= 500) return 'internal_error';
  return null;
}

/**
 * Records every request with bounded labels only: the route template, never the URL, so a search
 * term or a territory identifier can never reach a metric series or a log line.
 */
export function registerRequestHook(
  instance: FastifyInstance,
  options: RequestHookOptions,
): void {
  const { metrics, logger, onPublishedRequest, volumeBand } = options;
  const starts = new Map<string, number>();

  instance.addHook('onRequest', async (request) => {
    starts.set(request.id, Date.now());
    if (request.url.startsWith(INTERNAL_PREFIX)) return;

    onPublishedRequest?.(request);
    if (volumeBand !== undefined) {
      // Only the band leaves the module: the key stays in memory and rotates every day.
      const band = volumeBand.band.observe(volumeBand.clientValue(request));
      metrics.increment('actionpop_client_request_band_total', { band });
    }
  });

  instance.addHook('onResponse', async (request, reply) => {
    const startedAt = starts.get(request.id) ?? Date.now();
    starts.delete(request.id);

    const durationSeconds = (Date.now() - startedAt) / 1000;
    const route = routeTemplate(request.url);
    const method = methodLabel(request.method);
    const outcome = reply.statusCode >= 400 ? 'failure' : 'success';

    metrics.increment('actionpop_http_requests_total', {
      route,
      method,
      status_class: statusClass(reply.statusCode),
    });
    metrics.observe('actionpop_http_request_duration_seconds', { route, method }, durationSeconds);

    const failureKind = failureKindFor(reply.statusCode);
    if (failureKind !== null) {
      metrics.increment('actionpop_http_failures_total', { route, failure_kind: failureKind });
    }

    logger.info('request completed', {
      requestId: request.id,
      operation: `${request.method} ${route}`,
      outcome,
      statusCode: reply.statusCode,
      durationMs: Math.round(durationSeconds * 1000),
      ...(failureKind === null ? {} : { failureKind }),
    });
  });

  instance.addHook('onError', async (request, _reply, error) => {
    logger.error('request failed', {
      requestId: request.id,
      operation: `${request.method} ${routeTemplate(request.url)}`,
      outcome: 'failure',
      failure: error.message,
    });
  });
}
