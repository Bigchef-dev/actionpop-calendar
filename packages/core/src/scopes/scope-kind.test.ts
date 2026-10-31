import { describe, expect, it } from 'vitest';

import { isScopeKind } from './scope-kind.js';

describe('isScopeKind', () => {
  it('recognises group, event and map scopes only', () => {
    expect(isScopeKind('group')).toBe(true);
    expect(isScopeKind('event')).toBe(true);
    expect(isScopeKind('map')).toBe(true);
    expect(isScopeKind('directory')).toBe(false);
    expect(isScopeKind(undefined)).toBe(false);
  });
});
