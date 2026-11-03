import { describe, expect, it } from 'vitest';

import { departmentOf, parseOfficialEpciCsv } from './epci-official-csv.js';

const HEADER = 'CODGEO,LIBGEO,EPCI,LIBEPCI,NATURE_EPCI';

function parse(rows: readonly string[], activeIds?: ReadonlySet<string>) {
  return parseOfficialEpciCsv([HEADER, ...rows], {
    versionId: 'epci-2026',
    ...(activeIds === undefined ? {} : { activeIds }),
  });
}

describe('parseOfficialEpciCsv', () => {
  it('builds one reference per territory with its departments and one membership per commune', () => {
    const result = parse([
      '01001,Ambérieu,"200000001","Métropole du Grand Exemple",METRO',
      '01002,Bellegarde,"200000001","Métropole du Grand Exemple",METRO',
      '69001,Lyon,"200069193","Métropole de Lyon",METRO',
    ]);

    expect(result.errors).toEqual([]);
    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({
      versionId: 'epci-2026',
      id: '200000001',
      name: 'Métropole du Grand Exemple',
      normalizedName: 'metropole du grand exemple',
      kind: 'METRO',
      departmentCodes: ['01'],
      active: true,
    });
    expect(result.memberships.map((membership) => membership.communeId)).toEqual([
      '01001',
      '01002',
      '69001',
    ]);
    expect(result.memberships.every((membership) => membership.quality === 'complete')).toBe(true);
  });

  it('accumulates every department a territory spans', () => {
    const result = parse([
      '01001,Ambérieu,"200000002","Grand Territoire",CC',
      '69001,Lyon,"200000002","Grand Territoire",CC',
      '2A004,Ajaccio,"200000002","Grand Territoire",CC',
    ]);

    expect(result.references[0]?.departmentCodes).toEqual(['01', '2A', '69']);
  });

  it('skips natures outside the four public EPCI categories and reports them', () => {
    const result = parse([
      '01001,Ambérieu,"200000001","Métropole du Grand Exemple",METRO',
      '01002,Bellegarde,"24010001","SIVU des Rivières",SIVU',
      '01003,Collines,"24010002","SIVOM des Collines",SIVOM',
    ]);

    expect(result.references).toHaveLength(1);
    expect(result.ignoredNatures).toEqual(['SIVOM', 'SIVU']);
  });

  it('supports the accented métropole shorthand and rejects unknown natures', () => {
    const result = parse([
      '01001,Ambérieu,"200000001","Métropole A",MET',
      '01002,Bellegarde,"200000003","Agglo B",CA',
      '01003,Autre,"200000004","Urbaine C",CU',
    ]);

    expect(result.references.map((row) => row.kind)).toEqual(['METRO', 'CA', 'CU']);
  });

  it('marks a territory inactive when the source state says so', () => {
    const withColumn = parseOfficialEpciCsv(
      ['CODGEO,EPCI,LIBEPCI,NATURE_EPCI,ACTIVE', '01001,"200000001","Grand","CC",inactive'],
      { versionId: 'epci-2026' },
    );
    expect(withColumn.references[0]?.active).toBe(false);
  });

  it('marks territories outside the published active set as inactive', () => {
    const result = parse(
      ['01001,Ambérieu,"200000001","Grand A",CC', '01002,Bellegarde,"200000002","Grand B",CC'],
      new Set(['200000002']),
    );

    expect(result.references.map((row) => [row.id, row.active])).toEqual([
      ['200000001', false],
      ['200000002', true],
    ]);
  });

  it('rejects duplicate membership rows instead of publishing them', () => {
    const result = parse([
      '01001,Ambérieu,"200000001","Grand",CC',
      '01001,Ambérieu,"200000001","Grand",CC',
    ]);

    expect(result.memberships).toHaveLength(1);
    expect(result.errors[0]).toContain('duplicate membership');
  });

  it('reports a missing required column', () => {
    const result = parseOfficialEpciCsv(['CODGEO,LIBGEO', '01001,Ambérieu'], { versionId: 'v1' });
    expect(result.errors[0]).toContain('must expose');
  });

  it('derives departments from commune codes', () => {
    expect(departmentOf('01001')).toBe('01');
    expect(departmentOf('2A004')).toBe('2A');
    expect(departmentOf('2B033')).toBe('2B');
    expect(departmentOf('')).toBeUndefined();
  });
});
