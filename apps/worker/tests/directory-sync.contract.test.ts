import { describe, expect, it } from 'vitest';

import { validateGroupCatalogue } from '@actionpop/core';

import { synchronizeDirectory } from '../src/catalogue/directory-sync.js';

describe('map directory synchronisation in a cycle', () => {
  it('applies a complete directory', async () => {
    const applied: unknown[] = [];

    const outcome = await synchronizeDirectory(
      async () => [{ id: 'group-1', name: 'Groupe', is_active: true }],
      async (value) => {
        applied.push(value);
      },
    );

    expect(outcome).toEqual({ synced: true });
    expect(applied).toHaveLength(1);
  });

  it('keeps every known group and reports the failure when the directory is unavailable', async () => {
    let written = 0;

    const outcome = await synchronizeDirectory(
      async () => {
        throw new Error('upstream unavailable');
      },
      async () => {
        written += 1;
      },
    );

    expect(outcome).toEqual({ synced: false, failure: 'upstream unavailable' });
    expect(written).toBe(0);
  });

  it('keeps every known group when the directory does not validate', async () => {
    let written = 0;

    const outcome = await synchronizeDirectory(
      async () => ({ not: 'a directory' }),
      async (value) => {
        validateGroupCatalogue(value);
        written += 1;
      },
    );

    expect(outcome.synced).toBe(false);
    expect(outcome.failure).toBeDefined();
    expect(written).toBe(0);
  });

  it('never throws, so the cycle still dispatches retrievable listings', async () => {
    await expect(
      synchronizeDirectory(
        async () => [],
        async () => {
          throw new Error('write failed');
        },
      ),
    ).resolves.toEqual({ synced: false, failure: 'write failed' });
  });
});
