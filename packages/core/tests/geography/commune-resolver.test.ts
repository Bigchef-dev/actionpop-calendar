import { describe, expect, it } from 'vitest';

import { resolveCommune } from '../../src/geography/commune-resolver.js';
import { FakeReferenceReader, VERSION, activeVersion, makeCommune } from './fake-reference.js';

const lyon = makeCommune('69123', 'Lyon', '69', ['69000']);
const paris = makeCommune('75056', 'Paris', '75', ['75000']);
const marseille = makeCommune('13055', 'Marseille', '13', ['13000']);
const saintDenis93 = makeCommune('93066', 'Saint-Denis', '93', ['93200']);
const saintDenis974 = makeCommune('97411', 'Saint-Denis', '974', ['97400']);
const valence = makeCommune('26362', 'Valence', '26', ['26000']);
const valence82 = makeCommune('82000', 'Valence', '82', ['82400']);

function reader(): FakeReferenceReader {
  return new FakeReferenceReader(
    activeVersion(),
    [lyon, paris, marseille, saintDenis93, saintDenis974, valence, valence82],
    [],
  );
}

describe('resolveCommune', () => {
  it('resolves an exact name after normalization', async () => {
    const result = await resolveCommune({ communeName: '  LYON ' }, reader(), VERSION);
    expect(result.commune?.inseeCode).toBe('69123');
    expect(result.diagnostics).toEqual([]);
  });

  it('matches the pronoun-free alias', async () => {
    const withAlias = makeCommune(
      '01001',
      "L'Abergement-Clémenciat",
      '01',
      ['01400'],
      'Abergement-Clemenciat',
    );
    const custom = new FakeReferenceReader(activeVersion(), [withAlias], []);
    const result = await resolveCommune({ communeName: 'Abergement Clemenciat' }, custom, VERSION);
    expect(result.commune?.inseeCode).toBe('01001');
  });

  it('disambiguates homonyms with the stated department code', async () => {
    const result = await resolveCommune(
      { communeName: 'Saint-Denis', departement: '974' },
      reader(),
      VERSION,
    );
    expect(result.commune?.inseeCode).toBe('97411');
    expect(result.diagnostics).toEqual([]);
  });

  it('leaves an ambiguous homonym unresolved', async () => {
    const result = await resolveCommune({ communeName: 'Saint-Denis' }, reader(), VERSION);
    expect(result.commune).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'commune_match_ambiguous',
    );
  });

  it('does not resolve through an unknown department code', async () => {
    const result = await resolveCommune(
      { communeName: 'Saint-Denis', departement: '99' },
      reader(),
      VERSION,
    );
    expect(result.commune).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'commune_match_ambiguous',
    );
  });

  it('disambiguates homonymous cities with the department implied by the postal code', async () => {
    const result = await resolveCommune(
      { communeName: 'Saint-Denis', zip: '97400' },
      reader(),
      VERSION,
    );
    expect(result.commune?.inseeCode).toBe('97411');
  });

  it('reports an unknown commune name', async () => {
    const result = await resolveCommune({ communeName: 'Ville Inexistante' }, reader(), VERSION);
    expect(result.commune).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain('commune_unknown');
  });

  it('falls back to the city name when no commune name is stated', async () => {
    const result = await resolveCommune({ city: 'Lyon' }, reader(), VERSION);
    expect(result.commune?.inseeCode).toBe('69123');
    expect(result.diagnostics).toEqual([]);
  });

  it('ignores an arrondissement postal code and attaches the city commune', async () => {
    const result = await resolveCommune({ city: 'Paris', zip: '75005' }, reader(), VERSION);
    expect(result.commune?.inseeCode).toBe('75056');
    expect(result.diagnostics).toEqual([]);
  });

  it('attaches Lyon from an arrondissement postal code', async () => {
    const result = await resolveCommune({ city: 'Lyon', zip: '69003' }, reader(), VERSION);
    expect(result.commune?.inseeCode).toBe('69123');
  });

  it('attaches Marseille from an arrondissement postal code', async () => {
    const result = await resolveCommune({ city: 'Marseille', zip: '13008' }, reader(), VERSION);
    expect(result.commune?.inseeCode).toBe('13055');
  });

  it('prefers the commune name over the city name', async () => {
    const result = await resolveCommune(
      { communeName: 'Valence', zip: '82400', city: 'Valence', departement: '26' },
      reader(),
      VERSION,
    );
    expect(result.commune?.inseeCode).toBe('26362');
  });

  it('reports a missing name when neither a commune name nor a city is stated', async () => {
    const result = await resolveCommune({ zip: '69001' }, reader(), VERSION);
    expect(result.commune).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'commune_name_missing',
    );
  });
});
