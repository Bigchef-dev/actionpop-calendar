import { describe, expect, it } from 'vitest';

import type { SearchAnswer, SearchSubject } from '../../src/types';
import {
  flattenSuggestions,
  kindLabel,
  shapeSuggestions,
  suggestionContext,
} from '../../src/features/discovery/utils/suggestion-shape';

function subject(kind: string, id: string, label: string, qualifier?: string): SearchSubject {
  return {
    kind,
    id,
    label,
    ...(qualifier === undefined ? {} : { qualifier }),
    calendar: { path: '/calendar.ics', params: { kind: id } },
  };
}

function answer(subjects: SearchSubject[]): SearchAnswer {
  return { query: 'saint', subjects, total: subjects.length, kindCounts: {} };
}

describe('kindLabel', () => {
  it('labels the known kinds in French and falls back to the raw kind', () => {
    expect(kindLabel('commune')).toBe('Ville');
    expect(kindLabel('department')).toBe('Département');
    expect(kindLabel('group')).toBe("Groupe d'action");
    expect(kindLabel('epci')).toBe('Intercommunalité');
    expect(kindLabel('region')).toBe('region');
  });
});

describe('suggestionContext', () => {
  it('shows the kind plus the disambiguating territory', () => {
    expect(suggestionContext(subject('commune', '93066', 'Saint-Denis', 'Seine-Saint-Denis'))).toBe(
      'Ville · Seine-Saint-Denis',
    );
    expect(suggestionContext(subject('department', '69', 'Rhône'))).toBe('Département');
    expect(suggestionContext(subject('epci', '200000001', 'Grand Exemple', 'Métropole · 75'))).toBe(
      'Intercommunalité · Métropole · 75',
    );
  });
});

describe('shapeSuggestions', () => {
  it('groups by kind in the order the server returned, keeping the 6-per-kind cap', () => {
    const answerWithMixedKinds = answer([
      subject('commune', '1', 'Saint-A'),
      subject('commune', '2', 'Saint-B'),
      subject('department', '69', 'Rhône'),
      subject('region', '84', 'Auvergne-Rhône-Alpes'),
    ]);
    const groups = shapeSuggestions(answerWithMixedKinds);
    expect(groups.map((group) => group.kind)).toEqual(['commune', 'department', 'region']);
    expect(groups[0]?.subjects).toHaveLength(2);
    expect(groups[0]?.label).toBe('Ville');
    expect(flattenSuggestions(groups).map((item) => item.id)).toEqual(['1', '2', '69', '84']);
  });
});
