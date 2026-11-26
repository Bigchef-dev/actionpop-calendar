import { createServer, type Server, type ServerResponse } from 'node:http';

import type { Logger, MetricsRegistry } from '@actionpop/core';
import type { Queue } from 'bullmq';

export interface HealthServerOptions {
  readonly port: number;
  readonly version: string;
  readonly deployment: string;
  readonly readiness: () => Promise<boolean>;
  readonly metrics: MetricsRegistry;
  readonly logger: Logger;
  readonly queue: Pick<Queue, 'getJobCounts'>;
}

/**
 * Exposes liveness, readiness and Prometheus metrics. Scrapes and probes handle their
 * own errors so a transient dependency failure can never surface as an unhandled
 * rejection, which would stop the worker.
 */
export async function startHealthServer(options: HealthServerOptions): Promise<Server> {
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/metrics') {
        await respondWithMetrics(options, response);
        return;
      }
      const live = request.url === '/health/live';
      const ready = live || (request.url === '/health/ready' && (await options.readiness()));
      respondWithStatus(response, ready ? 200 : 503, ready ? 'ready' : 'not_ready');
    } catch (error) {
      options.logger.error('health request failed', {
        operation: 'health',
        outcome: 'failure',
        failure: error instanceof Error ? error.message : 'unknown error',
      });
      if (!response.headersSent) {
        respondWithStatus(response, 503, 'not_ready');
      } else {
        response.destroy();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    // Without this, a port conflict leaves the startup promise pending forever.
    const onListenError = (error: Error) => reject(error);
    server.once('error', onListenError);
    server.listen(options.port, '0.0.0.0', () => {
      server.off('error', onListenError);
      resolve();
    });
  });
  return server;
}

async function respondWithMetrics(
  options: HealthServerOptions,
  response: ServerResponse,
): Promise<void> {
  const counts = await options.queue.getJobCounts('wait', 'active', 'delayed', 'failed');
  options.metrics.setGauge(
    'actionpop_queue_depth',
    {},
    (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0),
  );
  options.metrics.setGauge('actionpop_redis_ready', {}, (await options.readiness()) ? 1 : 0);
  options.metrics.setGauge(
    'actionpop_build_info',
    { deployment: options.deployment, version: options.version },
    1,
  );
  response.statusCode = 200;
  response.setHeader('content-type', 'text/plain; version=0.0.4');
  response.end(options.metrics.prometheus());
}

function respondWithStatus(response: ServerResponse, statusCode: number, status: string): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ status }));
}
