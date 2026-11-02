import { describe, expect, it } from 'vitest';

import { joinMemberships, parseGroupementsCsv } from './epci-groupements-csv.js';

const HEADER =
  "Département;Arrondissement siège;Commune siège;N° SIREN;Nom du groupement;Nature juridique;Nombre de membres";

function parse(rows: readonly string[]) {
  return parseGroupementsCsv([HEADER, ...rows].join('\n'), 'epci-2026');
}

describe('parseGroupementsCsv', () => {
  it('keeps the four public categories and the Métropole de Lyon', () => {
    const result = parse([
      'Ain;Bourg-en-Bresse;Ambérieu;200000001;CC du Grand Exemple;CC;3',
      'Nord;Lille;Lille;245900410;Métropole Européenne de Lille;METRO;95',
      'Rhône;Lyon;Lyon;691234567;Métropole de Lyon;MET69;59',
      'Isère;Grenoble;Grenoble;200040715;Grenoble-Alpes-Métropole;CA;49',
    ]);

    expect(result.errors).toEqual([]);
    expect(result.references.map((row) => [row.id, row.kind])).toEqual([
      ['200000001', 'CC'],
      ['200040715', 'CA'],
      ['245900410', 'METRO'],
      ['691234567', 'METRO'],
    ]);
    expect(result.references[0]).toMatchObject({
      versionId: 'epci-2026',
      name: 'CC du Grand Exemple',
      normalizedName: 'c du grand exemple',
    });
  });

  it('ignores syndicates, PETR and other non intercommunal groupings with counts', () => {
    const result = parse([
      'Ain;Bourg;Arbigny;200005742;SIVOS des communes;SIVOM;2',
      'Ain;Bourg;Autre;200007276;SIVU de test;SIVU;6',
      'Ain;Bourg;Pays;200099999;PETR du Pays;PETR;40',
      'Ain;Bourg;Ambérieu;200000001;CC du Grand Exemple;CC;3',
    ]);

    expect(result.references).toHaveLength(1);
    expect(result.ignoredNatures).toEqual({ PETR: 1, SIVU: 1, SIVOM: 1 });
  });

  it('reports a missing required column', () => {
    const result = parseGroupementsCsv('Département;Nom du groupement\nAin;X', 'v1');
    expect(result.errors[0]).toContain('missing required column');
  });

  it('skips rows without a SIREN or a name', () => {
    const result = parse(['Ain;Bourg;Ambérieu;;Sans numéro;CC;3']);
    expect(result.references).toEqual([]);
    expect(result.errors[0]).toContain('missing SIREN or name');
  });
});

describe('joinMemberships', () => {
  const references = parse([
    'Ille-et-Vilaine;Rennes;Rennes;243500139;Rennes Métropole;METRO;43',
    'Ain;Bourg;Ambérieu;200000001;CC du Grand Exemple;CC;3',
  ]).references;

  it('attaches the member communes and derives the departments they span', () => {
    const joined = joinMemberships(
      references,
      [
        { inseeCode: '35238', departmentCode: '35', epciCode: '243500139' },
        { inseeCode: '35001', departmentCode: '35', epciCode: '243500139' },
        { inseeCode: '01001', departmentCode: '01', epciCode: '200000001' },
        { inseeCode: '01002', departmentCode: '01', epciCode: 'ZZZZZZZZZ' },
      ],
      'epci-2026',
    );

    expect(joined.memberships.map((row) => `${row.epciId}:${row.communeId}`)).toEqual([
      '243500139:35238',
      '243500139:35001',
      '200000001:01001',
    ]);
    expect(joined.references.find((row) => row.id === '243500139')?.departmentCodes).toEqual(['35']);
    expect(joined.communesWithoutTerritory).toBe(1);
  });

  it('reports a territory that has no member commune in the dataset', () => {
    const joined = joinMemberships(references, [], 'epci-2026');
    expect(joined.territoriesWithoutMember).toEqual(['200000001', '243500139']);
    expect(joined.memberships).toEqual([]);
  });
});
