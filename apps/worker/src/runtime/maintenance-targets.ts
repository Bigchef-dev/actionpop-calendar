/** Operator-selectable reset targets; each maps to one scope kind and its ledger rows. */
export type ResetTarget = 'groups' | 'events' | 'map';

const TARGET_ALIASES: Readonly<Record<string, ResetTarget>> = {
  group: 'groups',
  groups: 'groups',
  event: 'events',
  events: 'events',
  map: 'map',
};

/** Normalizes one `--target` value, accepting singular and plural spellings. */
export function parseResetTarget(value: string): ResetTarget {
  const target = TARGET_ALIASES[value.trim().toLowerCase()];
  if (target === undefined) {
    throw new Error(`unknown target "${value}" (expected groups, events or map)`);
  }
  return target;
}
