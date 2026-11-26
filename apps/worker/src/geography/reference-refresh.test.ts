import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HEADER, communeRows, epciDocument, stubWriter } from './reference-refresh-fixtures.js';
import { refreshGeographicReference } from './reference-refresh.js';

describe('refreshGeographicReference with an EPCI snapshot', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'actionpop-refresh-'));
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

  it('stages and activates a valid EPCI snapshot alongside the communes', async () => {
    const writer = stubWriter();
    const communesPath = await writeCommunes(['01001', '01002']);
    const epciPath = await writeEpci(epciDocument('01001'));

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

    expect(result.status).toBe('active');
    expect(result.counts).toMatchObject({ epcis: 1, memberships: 1 });
    expect(writer.staged[0]?.epcis).toHaveLength(1);
    expect(writer.staged[0]?.epciMemberships).toHaveLength(1);
    expect(writer.activated).toEqual([result.version]);
  });

  it('keeps the previous active version when activation is retryable', async () => {
    const writer = stubWriter();
    writer.activateReturnsRetryable = true;
    const communesPath = await writeCommunes(['01001']);
    const epciPath = await writeEpci(epciDocument('01001'));

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

    expect(result.status).toBe('staged');
    expect(writer.activated).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({ code: 'reference_activation_failed' });
  });
});
