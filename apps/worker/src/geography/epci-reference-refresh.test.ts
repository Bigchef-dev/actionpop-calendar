import { writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  readEpciReferenceSource,
  validateEpciReferenceSource,
} from './epci-reference-refresh.js';

describe('EPCI reference refresh adapter', () => {
  it('validates a normalized source document and returns a stable checksum', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'actionpop-epci-'));
    const path = join(directory, 'epci.json');
    await writeFile(path, JSON.stringify({
      version: 'epci-2026',
      source: 'official-fixture',
      publicationDate: '2026-01-01',
      license: 'Open Licence',
      references: [{
        versionId: 'epci-2026',
        id: '200000001',
        name: 'Grand Exemple',
        normalizedName: 'grand exemple',
        kind: 'CC',
        departmentCodes: ['01'],
        active: true,
      }],
      memberships: [{
        versionId: 'epci-2026',
        epciId: '200000001',
        communeId: '01001',
        quality: 'complete',
      }],
    }));

    try {
      const first = await validateEpciReferenceSource(path, new Set(['01001']));
      const second = await validateEpciReferenceSource(path, new Set(['01001']));
      expect(first.status).toBe('valid');
      expect(first.checksum).toBe(second.checksum);
      expect(first.counts).toEqual({ references: 1, memberships: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects membership rows that point to an unknown commune', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'actionpop-epci-'));
    const path = join(directory, 'epci.json');
    await writeFile(path, JSON.stringify({
      version: 'epci-2026',
      source: 'official-fixture',
      publicationDate: '2026-01-01',
      license: 'Open Licence',
      references: [],
      memberships: [{
        versionId: 'epci-2026',
        epciId: '200000001',
        communeId: '99999',
        quality: 'complete',
      }],
    }));

    try {
      const result = await validateEpciReferenceSource(path, new Set(['01001']));
      expect(result.status).toBe('rejected');
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('commune_unknown');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects malformed normalized documents before persistence', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'actionpop-epci-'));
    const path = join(directory, 'epci.json');
    await writeFile(path, JSON.stringify({ version: 'epci-2026' }));
    try {
      await expect(readEpciReferenceSource(path)).rejects.toThrow('invalid normalized shape');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
