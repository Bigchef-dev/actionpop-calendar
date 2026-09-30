import { describe, expect, it } from 'vitest';

import { collectEventPages } from '../src/ingestion/event-pages.js';

describe('paginated Action Populaire events', () => {
  it('starts at page one, caps page size, and stops on a short page', async () => {
    const calls: Array<[number, number]> = [];
    const events = await collectEventPages(async (page, pageSize) => {
      calls.push([page, pageSize]);
      return page === 1 ? [{ id: 'event-1' }, { id: 'event-2' }] : [{ id: 'event-3' }];
    }, { pageSize: 5000, expectedPageSize: 2 });
    expect(calls).toEqual([[1, 1000], [2, 1000]]);
    expect(events).toHaveLength(3);
  });

  it('does not hide a failed page retrieval', async () => {
    await expect(collectEventPages(async () => { throw new Error('upstream down'); })).rejects.toThrow('upstream down');
  });
});