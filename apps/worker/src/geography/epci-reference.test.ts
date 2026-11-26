import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HEADER, communeRows, epciDocument, stubWriter } from './reference-refresh-fixtures.js';
import { refreshGeographicReference } from './reference-refresh.js';

describe('refreshGeographicReference with an EPCI snapshot', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'actionpop-epci-reference-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function writeCommunes(codes: readonly string[]): Promise<string> {
    const path = join(directory, 'communes.csv');
    await writeFile(path, [HEADER, ...communeRows(codes)].join('\n'));
    return path;
  }

  async function writeEpci(document: unknown): Promise<string> {
    const path = join(directory, 'epci.json');
    await writeFile(path, JSON.stringify(document));
    return path;
  }

  it('rejects a snapshot whose membership points to an unknown commune', async () => {
    const writer = stubWriter();
    const communesPath = await writeCommunes(['01001']);
    const epciPath = await writeEpci(epciDocument('99999'));

    const result = await refreshGeographicReference(
      {
        communesPath,
        epciPath,
        source: 'official-fixture',
        publicationDate: '2026-01-01',
        license: 'Open Licence',
        minimumCommuneCount: 1,
      },
      writer.writer,
    );

    expect(result.status).toBe('rejected');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'epci_commune_unknown',
    );
    expect(writer.staged).toEqual([]);
    expect(writer.activated).toEqual([]);
  });

  it('stages the new membership when the same territory changes commune', async () => {
    const writer = stubWriter();
    const communesPath = await writeCommunes(['01001', '01002']);
    const epciPath = await writeEpci(epciDocument('01002'));

    const result = await refreshGeographicReference(
      {
        communesPath,
        epciPath,
        source: 'official-fixture',
        publicationDate: '2026-02-01',
        license: 'Open Licence',
        minimumCommuneCount: 1,
      },
      writer.writer,
    );

    expect(result.status).toBe('active');
    expect(writer.staged[0]?.epciMemberships?.[0]?.communeId).toBe('01002');
  });
});
