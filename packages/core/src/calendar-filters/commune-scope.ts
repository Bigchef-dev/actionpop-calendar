const MUNICIPAL_ARRONDISSEMENTS: Readonly<
  Record<string, { readonly communeIds: readonly string[]; readonly postalCodes: readonly string[] }>
> = {
  '13055': {
    communeIds: Array.from({ length: 16 }, (_, index) => `132${String(index + 1).padStart(2, '0')}`),
    postalCodes: Array.from({ length: 16 }, (_, index) => `130${String(index + 1).padStart(2, '0')}`),
  },
  '69123': {
    communeIds: Array.from({ length: 9 }, (_, index) => `6938${index + 1}`),
    postalCodes: Array.from({ length: 9 }, (_, index) => `6900${index + 1}`),
  },
  '75056': {
    communeIds: Array.from({ length: 20 }, (_, index) => `751${String(index + 1).padStart(2, '0')}`),
    postalCodes: Array.from({ length: 20 }, (_, index) => `750${String(index + 1).padStart(2, '0')}`),
  },
};

/** A city-centre filter also includes events geocoded to one of its arrondissements. */
export function expandCommuneIds(communeIds: readonly string[]): readonly string[] {
  return [
    ...new Set(
      communeIds.flatMap((communeId) => [
        communeId,
        ...(MUNICIPAL_ARRONDISSEMENTS[communeId]?.communeIds ?? []),
      ]),
    ),
  ].sort();
}

export function arrondissementPostalCodes(communeIds: readonly string[]): readonly string[] {
  return [
    ...new Set(
      communeIds.flatMap((communeId) => MUNICIPAL_ARRONDISSEMENTS[communeId]?.postalCodes ?? []),
    ),
  ].sort();
}
