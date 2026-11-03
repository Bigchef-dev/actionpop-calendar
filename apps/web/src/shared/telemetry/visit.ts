/** How long a visit survives without visitor activity. */
export const VISIT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

const STORAGE_KEY = 'actionpop.visit';

export interface Visit {
  readonly id: string;
  readonly startedAt: string;
  readonly lastActivityAt: string;
}

export interface VisitTracker {
  /** True when the current visit started on this call, so `arrival` is counted exactly once. */
  readonly start: () => boolean;
  readonly current: () => Visit;
}

interface VisitStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/**
 * Browser-local, shared across the tabs of this origin.
 *
 * `sessionStorage` is per tab, so it cannot satisfy "two tabs are one visit": each tab would
 * start its own. `localStorage` is shared, and the thirty-minute idle check below is what bounds
 * its lifetime — a record older than that is replaced rather than reused, so it never becomes a
 * durable visitor identity.
 */
function defaultStorage(): VisitStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Private mode or a storage-disabled browser throws on access, not on write.
    return null;
  }
}

function newIdentifier(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return String(crypto.randomUUID()).split('-').join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function read(storage: VisitStorage | null): Visit | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<Visit>;
    return typeof candidate.id === 'string' &&
      typeof candidate.startedAt === 'string' &&
      typeof candidate.lastActivityAt === 'string'
      ? { id: candidate.id, startedAt: candidate.startedAt, lastActivityAt: candidate.lastActivityAt }
      : null;
  } catch {
    return null;
  }
}

function write(storage: VisitStorage | null, visit: Visit): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(visit));
  } catch {
    // A full or blocked storage only costs precision, never the site.
  }
}

/**
 * Tracks one anonymous visit in the visitor's browser.
 *
 * The identifier never leaves this tab group's storage, and the record holds nothing else: no
 * address, no signature, no territory. A visit ends after thirty minutes without activity, so a
 * return the next day counts as a new arrival instead of extending the previous one.
 */
export function createVisitTracker(
  storage: VisitStorage | null = defaultStorage(),
  now: () => Date = () => new Date(),
): VisitTracker {
  let memoryVisit: Visit | null = null;

  const current = (): Visit => {
    // Storage wins: another tab may have refreshed the visit more recently than this one.
    const existing = read(storage) ?? memoryVisit;
    if (existing !== null) return existing;
    const startedAt = now().toISOString();
    memoryVisit = { id: newIdentifier(), startedAt, lastActivityAt: startedAt };
    return memoryVisit;
  };

  return {
    current,
    start: () => {
      const nowMs = now().getTime();
      const existing = read(storage) ?? memoryVisit;

      if (existing !== null) {
        const idle = nowMs - new Date(existing.lastActivityAt).getTime();
        if (Number.isFinite(idle) && idle <= VISIT_IDLE_TIMEOUT_MS) {
          memoryVisit = { ...existing, lastActivityAt: new Date(nowMs).toISOString() };
          write(storage, memoryVisit);
          return false;
        }
      }

      const startedAt = new Date(nowMs).toISOString();
      memoryVisit = { id: newIdentifier(), startedAt, lastActivityAt: startedAt };
      write(storage, memoryVisit);
      return true;
    },
  };
}
