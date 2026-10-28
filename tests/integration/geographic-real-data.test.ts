import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { enrichEventGeography } from '../../packages/core/src/geography/geographic-enricher.js';
import { PostgresGeographicReferenceRepository } from '../../packages/core/src/persistence/geographic-reference-repository.js';
import { startIntegrationPostgres } from './postgres-setup.js';

const harness = await startIntegrationPostgres({ schema: 'test_geographic_real_data' });
const reader = new PostgresGeographicReferenceRepository(harness.prisma);
const REFRESH_TIMEOUT_MS = 120_000;

beforeAll(async () => {
  const { refreshGeographicReference } =
    await import('../../apps/worker/src/geography/reference-refresh.js');
  const { PostgresGeographicReferenceWriter } =
    await import('../../packages/core/src/persistence/geographic-reference-writer.js');
  const result = await refreshGeographicReference(
    {
      communesPath: 'data/communes-france-2026.csv',
      source: 'data/communes-france-2026.csv',
      publicationDate: '2026-01-01',
      license: 'Licence Ouverte 2.0',
    },
    new PostgresGeographicReferenceWriter(harness.prisma),
  );
  if (result.status !== 'active') {
    throw new Error(`reference refresh did not activate: ${JSON.stringify(result.diagnostics)}`);
  }
}, REFRESH_TIMEOUT_MS);

afterAll(async () => {
  await harness.stop();
});

describe('enrichment against the supplied reference', () => {
  it('resolves a commune stated by name with its department', async () => {
    const result = await enrichEventGeography(
      { country: 'FR', departement: '69', communeName: 'Lyon', city: 'Lyon', zip: '69001' },
      reader,
    );
    expect(result.geographicStatus).toBe('resolved');
    expect(result.communeId).toBe('69123');
    expect(result.departmentCode).toBe('69');
    expect(result.countryCode).toBe('FR');
  });

  it('resolves an arrondissement postal code to the city commune', async () => {
    const paris = await enrichEventGeography(
      { country: 'FR', city: 'Paris', zip: '75005' },
      reader,
    );
    expect(paris.communeId).toBe('75056');
    expect(paris.departmentCode).toBe('75');

    const lyon = await enrichEventGeography({ country: 'FR', city: 'Lyon', zip: '69003' }, reader);
    expect(lyon.communeId).toBe('69123');

    const marseille = await enrichEventGeography(
      { country: 'FR', city: 'Marseille', zip: '13008' },
      reader,
    );
    expect(marseille.communeId).toBe('13055');
    expect(marseille.departmentCode).toBe('13');
  });

  it('keeps leading zeroes and alphanumeric departments', async () => {
    const ain = await enrichEventGeography(
      { country: 'FR', departement: '01', communeName: "L'Abergement-Clémenciat" },
      reader,
    );
    expect(ain.communeId).toBe('01001');
    expect(ain.departmentCode).toBe('01');

    const corse = await enrichEventGeography(
      { country: 'FR', departement: '2A', communeName: 'Ajaccio' },
      reader,
    );
    expect(corse.communeId).toBe('2A004');
    expect(corse.departmentCode).toBe('2A');
  });

  it('disambiguates an overseas homonym through the postal department', async () => {
    const reunion = await enrichEventGeography(
      { country: 'FR', communeName: 'Saint-Denis', zip: '97400' },
      reader,
    );
    expect(reunion.communeId).toBe('97411');

    const ambiguous = await enrichEventGeography(
      { country: 'FR', communeName: 'Saint-Denis' },
      reader,
    );
    expect(ambiguous.communeId).toBeUndefined();
    expect(ambiguous.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'commune_match_ambiguous',
    );
  });

  it('keeps an arrondissement name unresolved until arrondissements are modelled', async () => {
    const result = await enrichEventGeography(
      { country: 'FR', departement: '75', communeName: 'Paris 1er' },
      reader,
    );
    expect(result.communeId).toBeUndefined();
    expect(result.departmentCode).toBe('75');
    expect(result.geographicStatus).toBe('incomplete');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('commune_unknown');
  });

  it('classifies an international event without French areas', async () => {
    const result = await enrichEventGeography(
      { country: 'BE', communeName: 'Lyon', departement: '69' },
      reader,
    );
    expect(result.geographicStatus).toBe('international');
    expect(result.countryCode).toBe('BE');
    expect(result.communeId).toBeUndefined();
    expect(result.departmentCode).toBeUndefined();
  });
});
