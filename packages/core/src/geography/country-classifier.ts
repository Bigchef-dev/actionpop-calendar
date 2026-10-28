import { normalizeCountryCode } from '../domain/geographic-identity.js';
import type { Diagnostic } from './reference-types.js';

export type CountryScope = 'france' | 'foreign' | 'unstated' | 'unsupported';

export interface CountryClassification {
  scope: CountryScope;
  countryCode?: string;
  diagnostics: Diagnostic[];
}

export function classifyCountry(rawCountry: string | undefined): CountryClassification {
  const trimmed = rawCountry?.trim();
  if (trimmed === undefined || trimmed === '') {
    return {
      scope: 'unstated',
      diagnostics: [
        {
          code: 'country_missing',
          field: 'location.country',
          message: 'no country was stated on the event',
          severity: 'warning',
        },
      ],
    };
  }

  const countryCode = normalizeCountryCode(trimmed);
  if (countryCode === undefined) {
    return {
      scope: 'unsupported',
      diagnostics: [
        {
          code: 'country_unsupported',
          field: 'location.country',
          message: `"${trimmed}" is not a two-letter country code`,
          severity: 'warning',
        },
      ],
    };
  }

  if (countryCode === 'FR') {
    return { scope: 'france', countryCode, diagnostics: [] };
  }

  return { scope: 'foreign', countryCode, diagnostics: [] };
}
