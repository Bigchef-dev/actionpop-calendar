import { describe, expect, it } from 'vitest';

import { classifyCountry } from '../../src/geography/country-classifier.js';

describe('classifyCountry', () => {
  it('classifies France from the stated code', () => {
    expect(classifyCountry(' fr ')).toEqual({
      scope: 'france',
      countryCode: 'FR',
      diagnostics: [],
    });
  });

  it('classifies another stated country as foreign', () => {
    const result = classifyCountry('be');
    expect(result.scope).toBe('foreign');
    expect(result.countryCode).toBe('BE');
    expect(result.diagnostics).toEqual([]);
  });

  it('deduces no country when the field is absent or blank', () => {
    for (const value of [undefined, '', '   ']) {
      const result = classifyCountry(value);
      expect(result.scope).toBe('unstated');
      expect(result.countryCode).toBeUndefined();
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['country_missing']);
    }
  });

  it('diagnoses an unsupported value without guessing a country', () => {
    const result = classifyCountry('France');
    expect(result.scope).toBe('unsupported');
    expect(result.countryCode).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'country_unsupported',
    ]);
    expect(result.diagnostics[0]?.field).toBe('location.country');
  });
});
