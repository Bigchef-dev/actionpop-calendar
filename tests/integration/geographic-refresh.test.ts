import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { refreshGeographicReference } from '../../apps/worker/src/geography/reference-refresh.js';
import { PostgresGeographicReferenceRepository } from '../../packages/core/src/persistence/geographic-reference-repository.js';
import { PostgresGeographicReferenceWriter } from '../../packages/core/src/persistence/geographic-reference-writer.js';
import { startIntegrationPostgres, truncateGeographicReference } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_geographic_refresh' });
const writer = new PostgresGeographicReferenceWriter(harness.prisma);
const reader = new PostgresGeographicReferenceRepository(harness.prisma);
const COMMUNES = 'data/communes-france-2026.csv';
// Parsing the full reference twice per test exceeds the default timeout.
const REFRESH_TIMEOUT_MS = 60_000;

beforeEach(async () => {
  await harness.prisma.eventRecord.deleteMany();
  await truncateGeographicReference(harness.prisma);
});

afterAll(async () => {
  await harness.stop();
});

describe('refreshGeographicReference', () => {
  it(
    'refuses an insufficient dataset and leaves the active version untouched',
    async () => {
      const first = await refreshGeographicReference(
        {
          communesPath: COMMUNES,
          source: 'data/communes-france-2026.csv',
          publicationDate: '2026-01-01',
          license: 'Licence Ouverte 2.0',
        },
        writer,
      );
      expect(first.status).toBe('active');

      const rejected = await refreshGeographicReference(
        {
          communesPath: COMMUNES,
          source: 'data/communes-france-2026.csv',
          publicationDate: '2026-02-01',
          license: 'Licence Ouverte 2.0',
          minimumCommuneCount: 100000,
        },
        writer,
      );

      expect(rejected.status).toBe('rejected');
      expect(rejected.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        'reference_coverage_insufficient',
      );
      expect((await reader.findActiveVersion())?.version).toBe(first.version);
    },
    REFRESH_TIMEOUT_MS,
  );

  it(
    'activates the validated dataset and exposes reference lookups',
    async () => {
      const result = await refreshGeographicReference(
        {
          communesPath: COMMUNES,
          source: 'data/communes-france-2026.csv',
          publicationDate: '2026-01-01',
          license: 'Licence Ouverte 2.0',
        },
        writer,
      );

      expect(result.status).toBe('active');
      expect(result.diagnostics).toEqual([]);
      expect(result.counts.communes).toBe(34868);
      expect(result.counts.departments).toBe(101);

      expect((await reader.findActiveVersion())?.version).toBe(result.version);
      expect(await reader.findDepartment(result.version, '2A')).toMatchObject({ code: '2A' });
      expect(
        (await reader.findCommunesByNormalizedName(result.version, 'lyon'))[0]?.inseeCode,
      ).toBe('69123');
    },
    REFRESH_TIMEOUT_MS,
  );

  it(
    'rejects missing provenance without creating a version',
    async () => {
      const result = await refreshGeographicReference(
        {
          communesPath: COMMUNES,
          source: '',
          publicationDate: '',
          license: '',
        },
        writer,
      );

      expect(result.status).toBe('rejected');
      expect(await harness.prisma.geographicReferenceVersion.count()).toBe(0);
      expect(await reader.findActiveVersion()).toBeNull();
    },
    REFRESH_TIMEOUT_MS,
  );
});
