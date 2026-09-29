import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.js';

describe('structured logger', () => {
  it('emits required context and sanitizes sensitive fields', () => {
    const output: string[] = [];
    const logger = createLogger({ service: 'worker', environment: 'test', sink: value => output.push(value) });

    logger.error('ingest failed', {
      requestId: 'job-1',
      operation: 'publish',
      outcome: 'failure',
      durationMs: 12,
      secret: 'hidden',
    });

    const record = JSON.parse(output[0] ?? '{}') as Record<string, unknown>;
    expect(record).toMatchObject({ service: 'worker', environment: 'test', requestId: 'job-1' });
    expect(record.secret).toBeUndefined();
  });
});