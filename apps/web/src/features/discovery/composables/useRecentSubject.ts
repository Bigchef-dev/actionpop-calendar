import { ref, type Ref } from 'vue';

const STORAGE_KEY = 'ap-agenda-recent-subject';

export interface RecentSubject {
  kind: string;
  id: string;
  label: string;
}

function read(): RecentSubject | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<RecentSubject>;
    if (
      typeof parsed.kind !== 'string' ||
      typeof parsed.id !== 'string' ||
      typeof parsed.label !== 'string'
    ) {
      return null;
    }
    return { kind: parsed.kind, id: parsed.id, label: parsed.label };
  } catch {
    return null;
  }
}

/** Remembers the last chosen subject locally. The address always wins over this value. */
export function useRecentSubject(): {
  readonly recent: Ref<RecentSubject | null>;
  remember: (subject: RecentSubject) => void;
} {
  const recent = ref<RecentSubject | null>(typeof window === 'undefined' ? null : read());

  function remember(subject: RecentSubject): void {
    recent.value = subject;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subject));
    } catch {
      // A browser refusing storage must not break the journey.
    }
  }

  return { recent, remember };
}
