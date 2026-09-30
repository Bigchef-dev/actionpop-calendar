import { describe, expect, it, vi } from 'vitest';

import { buildServer } from '../src/server.js';

describe('feed read boundary', () => {
  it('only calls the prepared dataset repository', async () => {
    const getCurrent = vi.fn().mockResolvedValue({
      scopeId: 'group-1',
      revision: 1,
      generatedAt: new Date().toISOString(),
      events: [],
    });
    const upstream = vi.fn();
    const server = buildServer({ datasetRepository: { getCurrent }, upstream });

    await server.inject({ method: 'GET', url: '/feed/group-1' });
    expect(getCurrent).toHaveBeenCalledWith('group-1');
    expect(upstream).not.toHaveBeenCalled();
    await server.close();
  });
});
