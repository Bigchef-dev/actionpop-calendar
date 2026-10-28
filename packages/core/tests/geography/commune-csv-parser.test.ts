import { describe, expect, it } from 'vitest';

import { parseCommuneCsvLines, parseRfc4180 } from '../../src/geography/commune-csv-parser.js';

const header = 'code_insee,nom_standard,nom_sans_pronom,code_postal,codes_postaux,dep_code,dep_nom';

describe('parseRfc4180', () => {
  it('keeps quoted commas inside a field', () => {
    expect(parseRfc4180(['a,"b,c",d'])).toEqual([['a', 'b,c', 'd']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseRfc4180(['a,"L""Abergement"'])).toEqual([['a', 'L"Abergement']]);
  });

  it('joins multiline quoted fields', () => {
    expect(parseRfc4180(['a,"line1', 'line2"'])).toEqual([['a', 'line1\nline2']]);
  });
});

describe('parseCommuneCsvLines', () => {
  it('reads the required columns and expands postal code lists', () => {
    const result = parseCommuneCsvLines([
      header,
      '01001,"L\'Abergement-Clémenciat",Abergement-Clémenciat,01400,01400,01,Ain',
      '01004,Ambérieu-en-Bugey,Ambérieu-en-Bugey,01500,"01500, 01501, 01502",01,Ain',
    ]);

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      inseeCode: '01001',
      name: "L'Abergement-Clémenciat",
      departmentCode: '01',
      departmentName: 'Ain',
      postalCodes: ['01400'],
    });
    expect(result.rows[1]?.postalCodes).toEqual(['01500', '01501', '01502']);
  });

  it('keeps leading zeroes as strings', () => {
    const result = parseCommuneCsvLines([header, '01001,Lyon,Lyon,01000,01000,01,Ain']);
    expect(result.rows[0]?.inseeCode).toBe('01001');
    expect(result.rows[0]?.departmentCode).toBe('01');
    expect(result.rows[0]?.postalCodes).toEqual(['01000']);
  });

  it('keeps alphanumeric Corsican department codes', () => {
    const result = parseCommuneCsvLines([
      header,
      '2A004,Ajaccio,Ajaccio,20000,20000,2A,Corse-du-Sud',
    ]);
    expect(result.rows[0]?.departmentCode).toBe('2A');
  });

  it('reports missing required columns', () => {
    const result = parseCommuneCsvLines(['code_insee,nom_standard', '01001,Lyon']);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'missing required column "nom_sans_pronom"',
        'missing required column "code_postal"',
        'missing required column "codes_postaux"',
        'missing required column "dep_code"',
        'missing required column "dep_nom"',
      ]),
    );
  });

  it('reports a malformed row without discarding the others', () => {
    const result = parseCommuneCsvLines([
      header,
      '01001,Lyon,Lyon,69001,69001,69,Rhône',
      ',Sans code,,00000,00000,69,Rhône',
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual(['row 3: missing code_insee']);
  });

  it('handles an empty file', () => {
    expect(parseCommuneCsvLines([])).toEqual({ rows: [], errors: ['the CSV file is empty'] });
  });
});
