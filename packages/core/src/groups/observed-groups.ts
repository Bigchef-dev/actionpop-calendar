export interface ObservedGroup {
  readonly id: string;
  readonly name?: string;
}

/** A group as the source states it, before normalization. */
export interface StatedGroup {
  readonly id: string;
  readonly name?: string | undefined;
}

export interface ObservedGroupsResult {
  readonly groups: readonly ObservedGroup[];
  /** Identifiers dropped because they trim to empty; reported, never thrown. */
  readonly blankIdentifiers: number;
}

export function normalizeScopeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Normalizes the groups a source states for one event: identifiers are trimmed,
 * blank identifiers are dropped and counted, duplicates collapse onto the first
 * stated name, and the result is sorted so attribution and content hashes are
 * deterministic.
 */
export function toObservedGroups(value: readonly StatedGroup[]): ObservedGroupsResult {
  const byIdentity = new Map<string, ObservedGroup>();
  let blankIdentifiers = 0;

  for (const group of value) {
    const id = group.id.trim();
    if (id === '') {
      blankIdentifiers += 1;
      continue;
    }
    const key = normalizeScopeIdentity(id);
    if (byIdentity.has(key)) continue;
    const name = group.name?.trim();
    byIdentity.set(key, name === undefined || name === '' ? { id } : { id, name });
  }

  const groups = [...byIdentity.values()].sort((left, right) =>
    normalizeScopeIdentity(left.id).localeCompare(normalizeScopeIdentity(right.id)),
  );

  return { groups, blankIdentifiers };
}
