import { describe, expect, it } from 'vitest';

import { enrichEventGeography } from '../../src/geography/geographic-enricher.js';
import {
  FakeReferenceReader,
  VERSION,
  activeVersion,
  makeCommune,
  makeDepartment,
} from './fake-reference.js';

const lyon = makeCommune('69123', 'Lyon', '69', ['69001', '69002']);
const paris = makeCommune('75101', 'Paris 1er', '75', ['75001']);

function reader(): FakeReferenceReader {
  return new FakeReferenceReader(
    activeVersion(),
    [lyon, paris],
    [makeDepartment('69', 'Rhône'), makeDepartment('75', 'Paris')],
  );
}

describe('enrichEventGeography', () => {
  it('attaches a French event from the stated country, department and commune name', async () => {
    const result = await enrichEventGeography(
      { country: 'FR', departement: '69', communeName: 'Lyon', city: 'Lyon', zip: '69001' },
      reader(),
    );

    expect(result.geographicStatus).toBe('resolved');
    expect(result.countryCode).toBe('FR');
    expect(result.departmentCode).toBe('69');
    expect(result.communeId).toBe('69123');
    expect(result.departmentSource).toBe('stated');
    expect(result.referenceVersion).toBe(VERSION);
    expect(result.rawDepartmentCode).toBe('69');
    expect(result.rawCommuneName).toBe('Lyon');
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps a stated department when the commune cannot be resolved', async () => {
    const result = await enrichEventGeography(
      { country: 'FR', departement: '69', communeName: 'Ville Inexistante' },
      reader(),
    );

    expect(result.geographicStatus).toBe('incomplete');
    expect(result.departmentCode).toBe('69');
    expect(result.communeId).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('commune_unknown');
  });

  it('classifies an international event without French areas', async () => {
    const result = await enrichEventGeography(
      { country: 'BE', departement: '69', communeName: 'Lyon' },
      reader(),
    );

    expect(result.geographicStatus).toBe('international');
    expect(result.countryCode).toBe('BE');
    expect(result.departmentCode).toBeUndefined();
    expect(result.communeId).toBeUndefined();
    expect(result.rawCommuneName).toBe('Lyon');
  });

  it('classifies an event with no usable geographic field as national', async () => {
    const result = await enrichEventGeography({}, reader());

    expect(result.geographicStatus).toBe('national');
    expect(result.countryCode).toBeUndefined();
    expect(result.departmentCode).toBeUndefined();
    expect(result.communeId).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['country_missing', 'commune_name_missing']),
    );
  });

  it('still resolves French areas when the country is not stated', async () => {
    const result = await enrichEventGeography(
      { departement: '75', communeName: 'Paris 1er' },
      reader(),
    );

    expect(result.geographicStatus).toBe('resolved');
    expect(result.countryCode).toBeUndefined();
    expect(result.communeId).toBe('75101');
    expect(result.departmentCode).toBe('75');
  });

  it('keeps the stated country when no reference is available', async () => {
    const empty = new FakeReferenceReader(null, [], []);
    const result = await enrichEventGeography(
      { country: 'FR', departement: '69', communeName: 'Lyon' },
      empty,
    );

    expect(result.geographicStatus).toBe('unavailable');
    expect(result.countryCode).toBe('FR');
    expect(result.rawDepartmentCode).toBe('69');
    expect(result.rawCommuneName).toBe('Lyon');
    expect(result.communeId).toBeUndefined();
    expect(result.departmentCode).toBeUndefined();
    expect(result.referenceVersion).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'reference_unavailable',
    ]);
  });

  it('keeps an international classification even when the reference is unavailable', async () => {
    const empty = new FakeReferenceReader(null, [], []);
    const result = await enrichEventGeography({ country: 'BE' }, empty);

    expect(result.geographicStatus).toBe('unavailable');
    expect(result.countryCode).toBe('BE');
  });

  it('never approximates a similar commune name', async () => {
    const result = await enrichEventGeography(
      { country: 'FR', communeName: 'Lyon 7e' },
      new FakeReferenceReader(activeVersion(), [lyon], [makeDepartment('69')]),
    );

    expect(result.communeId).toBeUndefined();
    expect(result.geographicStatus).toBe('incomplete');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('commune_unknown');
  });
});
