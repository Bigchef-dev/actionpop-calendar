import type { SearchAnswer, SearchSubject } from '../../../types';

export const KIND_LABELS: Record<string, string> = {
  commune: 'Ville',
  department: 'Département',
  group: "Groupe d'action",
  epci: 'Intercommunalité',
};

export interface SuggestionGroup {
  kind: string;
  label: string;
  subjects: SearchSubject[];
}

/** Readable label of a kind, falling back to the raw kind for a kind sent by a newer server. */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** Contextual line of a suggestion: kind, plus the territory when the subject has one. */
export function suggestionContext(subject: SearchSubject): string {
  const parts = [kindLabel(subject.kind)];
  if (subject.qualifier !== undefined) parts.push(subject.qualifier);
  else if (subject.parent !== undefined) parts.push(subject.parent);
  return parts.join(' · ');
}

/** Groups an answer by kind in the order the server returned, without reordering subjects. */
export function shapeSuggestions(answer: SearchAnswer): SuggestionGroup[] {
  const groups: SuggestionGroup[] = [];
  for (const subject of answer.subjects) {
    const existing = groups.find((group) => group.kind === subject.kind);
    if (existing !== undefined) {
      existing.subjects.push(subject);
      continue;
    }
    groups.push({ kind: subject.kind, label: kindLabel(subject.kind), subjects: [subject] });
  }
  return groups;
}

/** Flattens shaped groups back into one navigable list, preserving display order. */
export function flattenSuggestions(groups: readonly SuggestionGroup[]): SearchSubject[] {
  return groups.flatMap((group) => group.subjects);
}
