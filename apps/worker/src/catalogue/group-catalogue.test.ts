import { describe, expect, it } from 'vitest';

import { RedisGroupCatalogueRepository } from './group-catalogue.js';

describe('Redis group catalogue', () => {
  it('persists complete catalogues and reads active scopes', async () => {
    const values = new Map<string, string>();
    const repository = new RedisGroupCatalogueRepository({
      get: async key => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); },
    });

    await repository.synchronize([
      { id: 'group-1', name: 'Active', is_active: true },
      { id: 'group-2', name: 'Inactive', is_active: false },
    ]);

    expect(await repository.activeScopes()).toEqual(['group-1']);
    expect(await repository.get('group-2')).toMatchObject({ is_active: false });
  });
});