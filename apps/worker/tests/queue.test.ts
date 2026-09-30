import { describe, expect, it } from 'vitest';

import { buildQueueOptions } from '../src/queue/queue.js';

describe('queue configuration', () => {
  it('configures bounded attempts, delayed backoff, and retained failures', () => {
    const options = buildQueueOptions({ attempts: 4, backoffMs: 500 });
    expect(options.defaultJobOptions?.attempts).toBe(4);
    expect(options.defaultJobOptions?.backoff).toMatchObject({ type: 'exponential', delay: 500 });
    expect(options.defaultJobOptions?.removeOnFail).toBe(false);
  });
});