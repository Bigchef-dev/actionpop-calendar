import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PostgresGeographicReferenceWriter, StageReferenceInput } from '@actionpop/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { refreshGeographicReference } from './reference-refresh.js';

const HEADER = 'code_insee,nom_standard,nom_sans_pronom,code_postal,codes_postaux,dep_code,dep_nom';

function communeRows(codes: readonly string[]): string[] {
  return codes.map((code, index) => `${code},Commune ${index + 1},Commune ${index + 1},0100${index},,01,Ain`);
}

interface StagedWriter {
  readonly writer: PostgresGeographicReferenceWriter;
  readonly staged: StageReferenceInput[];
  readonly activated: string[];
  activateReturnsRetryable: boolean;
}

function stubWriter(): StagedWriter {
  const staged: StageReferenceInput[] = [];
  const activated: string[] = [];
  const state = {
    staged,
    activated,
    activateReturnsRetryable: false,
  };
  const writer = {
    stage: async (input: StageReferenceInput) => {
      staged.push(input);
    },
    activate: async (version: string) => {
      if (state.activateReturnsRetryable) {
        return {
          status: 'retryable' as const,
          diagnostics: [
            {
              code: 'reference_activation_failed',
              field: 'geographic_reference_version.status',
              message: 'activation failed',
              severity: 'error' as const,
            },
          ],
        };
      }
      activated.push(version);
      return { status: 'active' as const };
    },
  } as unknown as PostgresGeographicReferenceWriter;
  return Object.defineProperty(state, 'writer', { value: writer }) as unknown as StagedWriter;
}

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

  function epciDocument(membershipCommuneId: string) {
    return {
      version: 'epci-2026',
      source: 'official-fixture',
      publicationDate: '2026-01-01',
      license: 'Open Licence',
      references: [
        {
          versionId: 'epci-2026',
          id: '200000001',
          name: 'Grand Exemple',
          normalizedName: 'grand exemple',
          kind: 'CC',
          departmentCodes: ['01'],
          active: true,
        },
      ],
      memberships: [
        {
          versionId: 'epci-2026',
          epciId: '200000001',
          communeId: membershipCommuneId,
          quality: 'complete',
        },
      ],
    };
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
