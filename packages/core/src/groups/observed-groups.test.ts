import { describe, expect, it } from 'vitest';

import { normalizeScopeIdentity, toObservedGroups } from './observed-groups.js';

describe('normalizeScopeIdentity', () => {
  it('trims and folds case so one identifier cannot become two scopes', () => {
    expect(normalizeScopeIdentity('  ABC-def  ')).toBe('abc-def');
    expect(normalizeScopeIdentity('ABC')).toBe(normalizeScopeIdentity('abc'));
  });
});

describe('toObservedGroups', () => {
  it('keeps the stated identifiers sorted and named', () => {
    const result = toObservedGroups([
      { id: 'group-b', name: 'Beta' },
      { id: 'group-a', name: 'Alpha' },
    ]);

    expect(result.groups).toEqual([
      { id: 'group-a', name: 'Alpha' },
      { id: 'group-b', name: 'Beta' },
    ]);
    expect(result.blankIdentifiers).toBe(0);
  });

  it('drops and counts identifiers that trim to nothing', () => {
    const result = toObservedGroups([{ id: '   ' }, { id: 'group-a' }]);

    expect(result.groups).toEqual([{ id: 'group-a' }]);
    expect(result.blankIdentifiers).toBe(1);
  });

  it('collapses duplicates, including case-only differences, keeping the first name', () => {
    const result = toObservedGroups([
      { id: 'Group-A', name: 'First' },
      { id: 'group-a', name: 'Second' },
      { id: 'group-b' },
    ]);

    expect(result.groups).toEqual([{ id: 'Group-A', name: 'First' }, { id: 'group-b' }]);
  });

  it('treats an empty group list as "no group stated"', () => {
    expect(toObservedGroups([])).toEqual({ groups: [], blankIdentifiers: 0 });
  });

  it('ignores an unreadable name', () => {
    expect(toObservedGroups([{ id: 'group-a', name: '  ' }]).groups).toEqual([{ id: 'group-a' }]);
  });
});
