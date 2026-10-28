import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { buildReferenceIndex } from '../../packages/core/src/geography/commune-name-index.js';
import type { CommuneCsvRow } from '../../packages/core/src/geography/commune-csv-parser.js';
import { PostgresGeographicReferenceRepository } from '../../packages/core/src/persistence/geographic-reference-repository.js';
import { PostgresGeographicReferenceWriter } from '../../packages/core/src/persistence/geographic-reference-writer.js';
import { startIntegrationPostgres, truncateGeographicReference } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_geographic_reference' });
const writer = new PostgresGeographicReferenceWriter(harness.prisma);
const reader = new PostgresGeographicReferenceRepository(harness.prisma);

beforeEach(async () => {
  await harness.prisma.eventRecord.deleteMany();
  await truncateGeographicReference(harness.prisma);
});

afterAll(async () => {
  await harness.stop();
});

function row(inseeCode: string, name: string, departmentCode = '69'): CommuneCsvRow {
  return {
    inseeCode,
    name,
    pronounFreeName: name,
    postalCodes: ['69001'],
    departmentCode,
    departmentName: 'Rhône',
  };
}

async function stage(version: string, rows: CommuneCsvRow[] = [row('69123', 'Lyon')]) {
  const index = buildReferenceIndex(rows);
  await writer.stage({
    version,
    source: 'data/communes-france-2026.csv',
    publicationDate: '2026-01-01',
    license: 'Licence Ouverte 2.0',
    index,
  });
  return index;
}

describe('geographic reference staging and activation', () => {
  it('keeps staged rows invisible to active-version readers', async () => {
    await stage('communes-v1');
    expect(await reader.findActiveVersion()).toBeNull();
    expect(await reader.findCommunesByNormalizedName('communes-v1', 'lyon')).toHaveLength(1);
  });

  it('activates a version in one transaction and retires the previous one', async () => {
    await stage('communes-v1');
    expect(await writer.activate('communes-v1')).toEqual({ status: 'active' });
    expect((await reader.findActiveVersion())?.version).toBe('communes-v1');

    await stage('communes-v2');
    await writer.activate('communes-v2');

    const rows = await harness.prisma.geographicReferenceVersion.findMany({
      orderBy: { version: 'asc' },
    });
    expect(rows.map((item) => [item.version, item.status])).toEqual([
      ['communes-v1', 'superseded'],
      ['communes-v2', 'active'],
    ]);
    expect((await reader.findActiveVersion())?.version).toBe('communes-v2');
  });

  it('retains the previous version for replay', async () => {
    await stage('communes-v1');
    await writer.activate('communes-v1');
    await stage('communes-v2', [row('69123', 'Lyon'), row('69266', 'Villeurbanne')]);
    await writer.activate('communes-v2');

    expect(await reader.findCommunesByNormalizedName('communes-v1', 'lyon')).toHaveLength(1);
    expect(await reader.findCommunesByNormalizedName('communes-v2', 'villeurbanne')).toHaveLength(
      1,
    );
  });

  it('refuses a second active version through the partial unique index', async () => {
    await stage('communes-v1');
    await stage('communes-v2');
    await writer.activate('communes-v1');

    const direct = await harness.prisma.geographicReferenceVersion
      .update({
        where: { version: 'communes-v2' },
        data: { status: 'active' },
      })
      .catch((error: unknown) => error);
    expect(direct).toBeInstanceOf(Error);
    expect((await reader.findActiveVersion())?.version).toBe('communes-v1');
  });

  it('serializes activation so the newer version becomes the only active one', async () => {
    await stage('communes-v1');
    await stage('communes-v2');
    await writer.activate('communes-v1');

    const result = await writer.activate('communes-v2');
    expect(result.status).toBe('active');
    expect(
      (
        await harness.prisma.geographicReferenceVersion.findMany({ where: { status: 'active' } })
      ).map((row) => row.version),
    ).toEqual(['communes-v2']);
  });

  it('leaves the previous active version intact when activation fails', async () => {
    await stage('communes-v1');
    await writer.activate('communes-v1');
    await stage('communes-v2');

    const result = await writer.activate('unknown-version');
    expect(result.status).toBe('retryable');
    expect((await reader.findActiveVersion())?.version).toBe('communes-v1');
  });

  it('marks a rejected version without touching the active pointer', async () => {
    await stage('communes-v1');
    await writer.activate('communes-v1');
    await stage('communes-v3');

    await writer.reject('communes-v3', [
      {
        code: 'reference_coverage_insufficient',
        field: 'communes',
        message: 'too few',
        severity: 'error',
      },
    ]);

    expect((await reader.findActiveVersion())?.version).toBe('communes-v1');
    const rejected = await harness.prisma.geographicReferenceVersion.findUnique({
      where: { version: 'communes-v3' },
    });
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.validationErrors).toEqual([
      {
        code: 'reference_coverage_insufficient',
        field: 'communes',
        message: 'too few',
        severity: 'error',
      },
    ]);
  });
});
