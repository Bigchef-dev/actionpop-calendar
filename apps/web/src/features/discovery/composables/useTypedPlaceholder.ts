import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';

import { buildPlaceholderScript } from '../utils/typed-placeholder';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface TypedPlaceholderHandle {
  readonly text: Ref<string>;
  readonly isStatic: Ref<boolean>;
}

/** Drives the rotating examples, stopping whenever the visitor interacts or asks for less motion. */
export function useTypedPlaceholder(
  examples: readonly string[],
  state: { readonly focused: Ref<boolean>; readonly hasInput: Ref<boolean> },
): TypedPlaceholderHandle {
  const frames = buildPlaceholderScript(examples);
  const index = ref(0);
  const prefersReducedMotion = ref(
    typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  const isStatic = computed(
    () => prefersReducedMotion.value || state.focused.value || state.hasInput.value,
  );

  let timer: number | null = null;

  function stop(): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    stop();
    if (isStatic.value || frames.length === 0) {
      index.value = 0;
      return;
    }
    const frame = frames[index.value % frames.length];
    timer = window.setTimeout(() => {
      index.value = (index.value + 1) % frames.length;
      schedule();
    }, frame?.delayMs ?? 1000);
  }

  watch(isStatic, schedule, { immediate: true });
  onBeforeUnmount(stop);

  return {
    text: computed(() => (isStatic.value ? '' : (frames[index.value]?.text ?? ''))),
    isStatic,
  };
}
