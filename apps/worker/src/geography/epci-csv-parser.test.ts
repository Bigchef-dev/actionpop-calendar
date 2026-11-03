import { describe, expect, it } from 'vitest';

import { parseEpciCsv } from './epci-csv-parser.js';

describe('parseEpciCsv', () => {
  it('parses EPCI identities and memberships into versioned records', () => {
    const result = parseEpciCsv(
      [
        'id,name,kind,departments,active',
        '200000001,Grand Exemple,CC,01,true',
        '',
        'epci_id,commune_id,quality',
        '200000001,01001,complete',
      ].join('\n'),
      'geo-2026',
    );
    expect(result.errors).toEqual([]);
    expect(result.references[0]).toMatchObject({
      versionId: 'geo-2026',
      id: '200000001',
      normalizedName: 'grand exemple',
    });
    expect(result.memberships).toEqual([{
      versionId: 'geo-2026',
      epciId: '200000001',
      communeId: '01001',
      quality: 'complete',
    }]);
  });
});