/** The two kinds of retrieval target the scheduler knows about. */
export type ScopeKind = 'group' | 'event';

export function isScopeKind(value: unknown): value is ScopeKind {
  return value === 'group' || value === 'event';
}
