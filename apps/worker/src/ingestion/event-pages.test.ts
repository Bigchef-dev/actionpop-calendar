import { describe, expect, it } from 'vitest';

import { collectEventPages } from './event-pages.js';

describe('incremental event pages', () => {
  it('uses one-based pages and stops at a short page', async () => {
    const calls: Array<[number, number]> = [];
    const events = await collectEventPages(async (page, pageSize) => {
      calls.push([page, pageSize]);
      return page === 1 ? [{ id: 'event-1' }, { id: 'event-2' }] : [{ id: 'event-3' }];
    }, { pageSize: 5000, expectedPageSize: 2 });

    expect(calls).toEqual([[1, 1000], [2, 1000]]);
    expect(events).toHaveLength(3);
  });
});