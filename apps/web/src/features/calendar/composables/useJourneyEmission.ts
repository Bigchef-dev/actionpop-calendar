import { onBeforeUnmount, onMounted } from 'vue';

import type { SearchSubject } from '../../../types';
import { journey } from '../../../shared/telemetry/reporter';
import type { JourneyStep } from '../../../shared/telemetry/journey';

const SUBJECT_KINDS = new Set(['commune', 'department', 'group', 'epci']);

type ReportableKind = 'commune' | 'department' | 'group' | 'epci' | 'none';

/** Maps an API subject kind onto the bounded journey vocabulary. */
export function subjectKindOf(kind: string | undefined): ReportableKind {
  return kind !== undefined && SUBJECT_KINDS.has(kind) ? (kind as ReportableKind) : 'none';
}

export interface JourneyEmission {
  readonly track: (step: JourneyStep, kind?: string) => void;
  readonly trackSelection: (subjects: readonly SearchSubject[]) => void;
  readonly trackSuggestion: (subject: SearchSubject) => void;
}

/**
 * Keeps the emission plumbing out of the component and flushes on teardown.
 *
 * Every call returns immediately: reporting never delays an interaction, and a blocked endpoint
 * never breaks the calendar.
 */
export function useJourneyEmission(): JourneyEmission {
  onMounted(() => journey.track('arrival'));
  onBeforeUnmount(() => journey.flush());

  return {
    track: (step, kind) => journey.track(step, subjectKindOf(kind)),
    trackSelection: (subjects) => journey.track('subject_selected', subjectKindOf(subjects[0]?.kind)),
    trackSuggestion: (subject) =>
      journey.track('suggestion_accepted', subjectKindOf(subject.kind)),
  };
}
