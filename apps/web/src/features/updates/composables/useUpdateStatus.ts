import { onMounted, onUnmounted, ref } from 'vue';

import { fetchUpdateStatus } from '../../../shared/api/client';
import type { UpdateStatusAnswer } from '../../../types';

const POLL_INTERVAL_MS = 30_000;

/**
 * Keeps the indicator current without depending on a page reload.
 *
 * Polling only happens while the tab is visible; a failed refresh keeps the last known answer
 * and marks it, so the display never pretends to be fresher than its timestamp says.
 */
export function useUpdateStatus() {
  const answer = ref<UpdateStatusAnswer | null>(null);
  const failed = ref(false);
  const refreshing = ref(false);

  let timer: ReturnType<typeof setInterval> | null = null;
  let controller: AbortController | null = null;
  let stopped = false;

  async function load(): Promise<void> {
    if (stopped) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    refreshing.value = true;
    try {
      answer.value = await fetchUpdateStatus(request.signal);
      failed.value = false;
    } catch (error) {
      if (!request.signal.aborted) failed.value = true;
      void error;
    } finally {
      if (controller === request) refreshing.value = false;
    }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'visible') void load();
  }

  onMounted(() => {
    void load();
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
  });

  onUnmounted(() => {
    stopped = true;
    controller?.abort();
    if (timer !== null) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { answer, failed, refreshing, refresh: load };
}
