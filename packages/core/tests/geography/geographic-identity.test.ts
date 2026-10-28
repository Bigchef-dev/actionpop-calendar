import { describe, expect, it } from 'vitest';

import {
  normalizeCommuneKey,
  normalizeCountryCode,
  normalizeDepartmentCode,
  normalizeGeographicName,
} from '../../src/domain/geographic-identity.js';

describe('normalizeGeographicName', () => {
  it('folds case, accents, punctuation and whitespace', () => {
    expect(normalizeGeographicName("  L'Haÿ-les-Roses ")).toBe('l hay les roses');
    expect(normalizeGeographicName('SAINT-ÉTIENNE')).toBe('saint etienne');
    expect(normalizeGeographicName('Abergement   Clémenciat')).toBe('abergement clemenciat');
  });

  it('keeps distinct names distinct', () => {
    expect(normalizeGeographicName('Lyon')).not.toBe(normalizeGeographicName('Lyon 7e'));
  });
});

describe('normalizeCountryCode', () => {
  it('uppercases a two-letter code', () => {
    expect(normalizeCountryCode(' fr ')).toBe('FR');
    expect(normalizeCountryCode('be')).toBe('BE');
  });

  it('rejects values that are not two letters', () => {
    expect(normalizeCountryCode('')).toBeUndefined();
    expect(normalizeCountryCode('   ')).toBeUndefined();
    expect(normalizeCountryCode('France')).toBeUndefined();
    expect(normalizeCountryCode('F1')).toBeUndefined();
  });
});

describe('normalizeDepartmentCode', () => {
  it('preserves leading zeroes and alphanumeric codes', () => {
    expect(normalizeDepartmentCode(' 01 ')).toBe('01');
    expect(normalizeDepartmentCode('2a')).toBe('2A');
    expect(normalizeDepartmentCode('69')).toBe('69');
  });

  it('treats an empty value as not stated', () => {
    expect(normalizeDepartmentCode('')).toBeUndefined();
    expect(normalizeDepartmentCode('  ')).toBeUndefined();
  });
});

describe('normalizeCommuneKey', () => {
  it('keeps the existing Redis key shape', () => {
    expect(normalizeCommuneKey('Saint-Étienne')).toBe('saint-etienne');
  });
});
