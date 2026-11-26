import type { PostgresGeographicReferenceWriter, StageReferenceInput } from '@actionpop/core';

export const HEADER =
  'code_insee,nom_standard,nom_sans_pronom,code_postal,codes_postaux,dep_code,dep_nom';

export function communeRows(codes: readonly string[]): string[] {
  return codes.map(
    (code, index) => `${code},Commune ${index + 1},Commune ${index + 1},0100${index},,01,Ain`,
  );
}

export interface StagedWriter {
  readonly writer: PostgresGeographicReferenceWriter;
  readonly staged: StageReferenceInput[];
  readonly activated: string[];
  activateReturnsRetryable: boolean;
}

export function stubWriter(): StagedWriter {
  const staged: StageReferenceInput[] = [];
  const activated: string[] = [];
  const state = {
    staged,
    activated,
    activateReturnsRetryable: false,
  };
  const writer = {
    stage: async (input: StageReferenceInput) => {
      staged.push(input);
    },
    activate: async (version: string) => {
      if (state.activateReturnsRetryable) {
        return {
          status: 'retryable' as const,
          diagnostics: [
            {
              code: 'reference_activation_failed',
              field: 'geographic_reference_version.status',
              message: 'activation failed',
              severity: 'error' as const,
            },
          ],
        };
      }
      activated.push(version);
      return { status: 'active' as const };
    },
  } as unknown as PostgresGeographicReferenceWriter;
  return Object.defineProperty(state, 'writer', { value: writer }) as unknown as StagedWriter;
}

export function epciDocument(membershipCommuneId: string) {
  return {
    version: 'epci-2026',
    source: 'official-fixture',
    publicationDate: '2026-01-01',
    license: 'Open Licence',
    references: [
      {
        versionId: 'epci-2026',
        id: '200000001',
        name: 'Grand Exemple',
        normalizedName: 'grand exemple',
        kind: 'CC',
        departmentCodes: ['01'],
        active: true,
      },
    ],
    memberships: [
      {
        versionId: 'epci-2026',
        epciId: '200000001',
        communeId: membershipCommuneId,
        quality: 'complete',
      },
    ],
  };
}
