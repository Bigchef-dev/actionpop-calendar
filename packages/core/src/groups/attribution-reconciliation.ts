export interface AttributionDiff {
  readonly toAdd: readonly string[];
  readonly toRemove: readonly string[];
}

/**
 * Compares the links one observing listing previously contributed with the group
 * set it now states. Only this listing's contribution is reconciled, so an
 * attribution stated by another listing survives (union across observations).
 */
export function diffAttribution(
  previous: readonly string[],
  stated: readonly string[],
): AttributionDiff {
  const previousSet = new Set(previous);
  const statedSet = new Set(stated);

  return {
    toAdd: [...statedSet].filter((id) => !previousSet.has(id)).sort(),
    toRemove: [...previousSet].filter((id) => !statedSet.has(id)).sort(),
  };
}
