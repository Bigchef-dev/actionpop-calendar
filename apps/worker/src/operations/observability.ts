import { createLogger, MetricsRegistry, type Logger } from '@actionpop/core';

export interface WorkerObservability {
  logger: Logger;
  metrics: MetricsRegistry;
}

export function createWorkerObservability(environment = process.env.NODE_ENV ?? 'development'): WorkerObservability {
  return {
    logger: createLogger({ service: 'worker', environment }),
    metrics: new MetricsRegistry({ outcome: ['success', 'failure'], reason: ['network', 'validation', 'redis', 'other'] }),
  };
}