import { describe, expect, it } from 'vitest';

import { arrondissementPostalCodes, expandCommuneIds } from './commune-scope.js';

describe('expandCommuneIds', () => {
  it('includes municipal arrondissement codes for Lyon, Marseille and Paris', () => {
    const ids = expandCommuneIds(['69123', '13055', '75056']);

    expect(ids).toContain('69381');
    expect(ids).toContain('69389');
    expect(ids).toContain('13201');
    expect(ids).toContain('13216');
    expect(ids).toContain('75101');
    expect(ids).toContain('75120');
  });

  it('does not expand ordinary communes', () => {
    expect(expandCommuneIds(['01001'])).toEqual(['01001']);
  });

  it('returns arrondissement postal codes for stored legacy locations', () => {
    expect(arrondissementPostalCodes(['69123'])).toEqual([
      '69001',
      '69002',
      '69003',
      '69004',
      '69005',
      '69006',
      '69007',
      '69008',
      '69009',
    ]);
  });
});
