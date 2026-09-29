import { describe, expect, it } from 'vitest';

import { runHealthCheck } from './health.js';

describe('health checks', () => {
  it('returns a healthy result for a successful dependency check', async () => {
    await expect(runHealthCheck('redis', async () => undefined)).resolves.toEqual({
      name: 'redis',
      status: 'ready',
    });
  });

  it('converts dependency failures into an unhealthy result', async () => {
    await expect(runHealthCheck('redis', async () => { throw new Error('down'); })).resolves.toMatchObject({
      name: 'redis',
      status: 'not_ready',
    });
  });
});