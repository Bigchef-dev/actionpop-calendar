import { describe, expect, it } from 'vitest';

import { GroupCatalogueRepository } from '../src/catalogue/group-catalogue.js';

describe('Action Populaire group catalogue', () => {
  it('publishes a complete catalogue and preserves inactive groups', async () => {
    const repository = new GroupCatalogueRepository();
    await repository.synchronize([
      { id: 'group-1', name: 'Active', is_active: true },
      { id: 'group-2', name: 'Inactive', is_active: false },
    ]);
    expect(repository.activeScopes()).toEqual(['group-1']);
    expect(repository.get('group-2')?.is_active).toBe(false);
  });

  it('keeps the last complete catalogue when synchronization fails', async () => {
    const repository = new GroupCatalogueRepository();
    await repository.synchronize([{ id: 'group-1', name: 'Active', is_active: true }]);
    await expect(repository.synchronizePartial([{ id: 'group-2', name: 'Partial', is_active: true }])).rejects.toThrow();
    expect(repository.activeScopes()).toEqual(['group-1']);
  });
});