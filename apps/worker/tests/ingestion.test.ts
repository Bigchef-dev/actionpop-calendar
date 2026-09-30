import { describe, expect, it } from 'vitest';

import { processIngestionJob } from '../src/ingestion/processor.js';

describe('ingestion processor', () => {
  it('retrieves, publishes, then acknowledges', async () => {
    const order: string[] = [];
    await processIngestionJob({
      retrieve: async () => { order.push('retrieve'); return []; },
      publish: async () => { order.push('publish'); },
      acknowledge: async () => { order.push('ack'); },
    });
    expect(order).toEqual(['retrieve', 'publish', 'ack']);
  });

  it('does not acknowledge when publication fails', async () => {
    let acknowledged = false;
    await expect(processIngestionJob({
      retrieve: async () => [],
      publish: async () => { throw new Error('write failed'); },
      acknowledge: async () => { acknowledged = true; },
    })).rejects.toThrow('write failed');
    expect(acknowledged).toBe(false);
  });
});