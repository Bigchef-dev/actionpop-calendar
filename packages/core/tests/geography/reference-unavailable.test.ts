import { describe, expect, it } from 'vitest';

import { enrichEventGeography } from '../../src/geography/geographic-enricher.js';
import { FakeReferenceReader } from './fake-reference.js';

describe('enrichment without an active reference', () => {
  const unavailable = new FakeReferenceReader(null, [], []);

  it('publishes the event with the country kept and no administrative link', async () => {
    const result = await enrichEventGeography(
      { country: 'fr', departement: '69', communeName: 'Lyon', city: 'Lyon', zip: '69001' },
      unavailable,
    );

    expect(result).toMatchObject({
      geographicStatus: 'unavailable',
      countryCode: 'FR',
      rawDepartmentCode: '69',
      rawCommuneName: 'Lyon',
    });
    expect(result.communeId).toBeUndefined();
    expect(result.departmentCode).toBeUndefined();
    expect(result.departmentSource).toBeUndefined();
    expect(result.referenceVersion).toBeUndefined();
  });

  it('reports an actionable error diagnostic', async () => {
    const result = await enrichEventGeography({ country: 'FR' }, unavailable);
    const diagnostic = result.diagnostics.find((entry) => entry.code === 'reference_unavailable');
    expect(diagnostic).toMatchObject({ field: 'geography.reference', severity: 'error' });
  });

  it('still deduces no country when none is stated', async () => {
    const result = await enrichEventGeography({ communeName: 'Lyon' }, unavailable);
    expect(result.countryCode).toBeUndefined();
    expect(result.geographicStatus).toBe('unavailable');
    expect(result.diagnostics.map((entry) => entry.code)).toContain('country_missing');
  });
});
