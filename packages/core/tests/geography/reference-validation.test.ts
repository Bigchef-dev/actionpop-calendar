import { describe, expect, it } from 'vitest';

import type { CommuneCsvRow } from '../../src/geography/commune-csv-parser.js';
import { buildReferenceIndex } from '../../src/geography/commune-name-index.js';
import {
  hasBlockingDiagnostics,
  validateReference,
} from '../../src/geography/reference-validation.js';

function row(inseeCode: string, departmentCode = '69', name = 'Lyon'): CommuneCsvRow {
  return {
    inseeCode,
    name,
    pronounFreeName: name,
    postalCodes: ['69001'],
    departmentCode,
    departmentName: 'Rhône',
  };
}

function validate(
  rows: CommuneCsvRow[],
  overrides: Partial<Parameters<typeof validateReference>[0]> = {},
) {
  return validateReference({
    index: buildReferenceIndex(rows),
    source: 'data/communes-france-2026.csv',
    publicationDate: '2026-01-01',
    license: 'Licence Ouverte 2.0',
    parseErrors: [],
    minimumCommuneCount: 1,
    ...overrides,
  });
}

describe('validateReference', () => {
  it('accepts a coherent reference', () => {
    expect(validate([row('69123'), row('69266')])).toEqual([]);
  });

  it('refuses duplicate INSEE codes', () => {
    const codes = validate([row('69123'), row('69123')]).map((diagnostic) => diagnostic.code);
    expect(codes).toContain('reference_duplicate_identifier');
  });

  it('refuses a commune without name or department', () => {
    const codes = validate([row('69123', '69', ''), row('69266', '')]).map((d) => d.code);
    expect(codes).toContain('reference_commune_name_missing');
    expect(codes).toContain('reference_department_missing');
  });

  it('refuses insufficient coverage', () => {
    const diagnostics = validate([row('69123')], { minimumCommuneCount: 1000 });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'reference_coverage_insufficient',
    );
  });

  it('refuses missing provenance or license', () => {
    const codes = validate([row('69123')], { license: '', source: '', publicationDate: '' }).map(
      (diagnostic) => diagnostic.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'reference_source_missing',
        'reference_publication_date_missing',
        'reference_license_missing',
      ]),
    );
  });

  it('surfaces CSV parse errors as blocking diagnostics', () => {
    const diagnostics = validate([row('69123')], { parseErrors: ['row 3: missing code_insee'] });
    expect(hasBlockingDiagnostics(diagnostics)).toBe(true);
    expect(diagnostics[0]).toMatchObject({ code: 'reference_csv_invalid', field: 'communesPath' });
  });
});
