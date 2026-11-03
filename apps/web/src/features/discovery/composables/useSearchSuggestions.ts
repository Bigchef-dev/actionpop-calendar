import { ref, watch, type Ref } from 'vue';

import { searchSubjects } from '../../../shared/api/client';
import type { SearchAnswer } from '../../../types';

export type SuggestionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 150;

export interface SearchSuggestionsHandle {
  readonly answer: Ref<SearchAnswer | null>;
  readonly status: Ref<SuggestionStatus>;
  readonly retry: () => void;
}

export interface SearchSuggestionOptions {
  /** Called once per completed search, so the caller can count a fruitful or empty query. */
  readonly onSettled?: (outcome: 'fruitful' | 'empty') => void;
}

/** Debounced, abortable suggestion search driven by the typed query. */
export function useSearchSuggestions(
  query: Ref<string>,
  options: SearchSuggestionOptions = {},
): SearchSuggestionsHandle {
  const answer = ref<SearchAnswer | null>(null);
  const status = ref<SuggestionStatus>('idle');

  let timer: number | null = null;
  let controller: AbortController | null = null;

  function run(): void {
    const trimmed = query.value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      answer.value = null;
      status.value = 'idle';
      return;
    }

    controller?.abort();
    controller = new AbortController();
    status.value = 'loading';

    searchSubjects(trimmed, { limit: 18, signal: controller.signal })
      .then((result) => {
        answer.value = result;
        status.value = result.subjects.length === 0 ? 'empty' : 'ready';
        options.onSettled?.(result.subjects.length === 0 ? 'empty' : 'fruitful');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        answer.value = null;
        status.value = 'error';
      });
  }

  // A new query immediately drops the previous answer, so a stale "no result" never
  // describes the text currently displayed.
  watch(query, (value) => {
    if (timer !== null) window.clearTimeout(timer);
    controller?.abort();

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      answer.value = null;
      status.value = 'idle';
      return;
    }

    answer.value = null;
    status.value = 'loading';
    timer = window.setTimeout(run, DEBOUNCE_MS);
  });

  return { answer, status, retry: run };
}
