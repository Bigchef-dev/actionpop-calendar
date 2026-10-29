import { describe, expect, it } from 'vitest';

import { diffAttribution } from './attribution-reconciliation.js';

describe('diffAttribution', () => {
  it('adds newly stated groups and removes the ones this listing stopped stating', () => {
    expect(diffAttribution(['group-b', 'group-c'], ['group-b', 'group-d'])).toEqual({
      toAdd: ['group-d'],
      toRemove: ['group-c'],
    });
  });

  it('returns empty diffs when the source is unchanged, so a replay is idempotent', () => {
    expect(diffAttribution(['group-b'], ['group-b'])).toEqual({ toAdd: [], toRemove: [] });
  });

  it('removes every contribution when a listing states no group at all', () => {
    expect(diffAttribution(['group-b', 'group-c'], [])).toEqual({
      toAdd: [],
      toRemove: ['group-b', 'group-c'],
    });
  });

  it('adds every group on the first observation', () => {
    expect(diffAttribution([], ['group-a', 'group-b'])).toEqual({
      toAdd: ['group-a', 'group-b'],
      toRemove: [],
    });
  });

  it('only reconciles the contribution it is given, leaving other listings untouched', () => {
    const fromListingA = diffAttribution(['group-b'], ['group-c']);
    expect(fromListingA).toEqual({ toAdd: ['group-c'], toRemove: ['group-b'] });
  });
});
