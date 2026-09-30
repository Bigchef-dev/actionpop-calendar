import type { QueueOptions } from 'bullmq';
import { classifyRetry } from '@actionpop/core';

export interface QueueSettings {
  attempts: number;
  backoffMs: number;
}

export function buildQueueOptions(settings: QueueSettings): Pick<QueueOptions, 'defaultJobOptions'> {
  return {
    defaultJobOptions: {
      attempts: settings.attempts,
      backoff: { type: 'exponential', delay: settings.backoffMs },
      removeOnFail: false,
      removeOnComplete: { age: 24 * 60 * 60 },
    },
  };
}

export function retryDelayMs(attempt: number, baseMs: number, jitterMs = 250): number {
  const exponential = baseMs * (2 ** Math.max(0, attempt - 1));
  return exponential + (jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0);
}

export function shouldRetry(error: unknown): boolean {
  return classifyRetry(error).retryable;
}