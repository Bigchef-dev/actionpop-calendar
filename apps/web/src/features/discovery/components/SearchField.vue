<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { SearchSubject } from '../../../types';
import { useTypedPlaceholder } from '../composables/useTypedPlaceholder';
import { flattenSuggestions, type SuggestionGroup } from '../utils/suggestion-shape';
import SuggestionList from './SuggestionList.vue';
import TypedPlaceholder from './TypedPlaceholder.vue';

const props = defineProps<{
  modelValue: string;
  groups: SuggestionGroup[];
  examples: string[];
  busy: boolean;
  listId: string;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'pick', subject: SearchSubject): void;
}>();

const input = ref<HTMLInputElement | null>(null);
const focused = ref(false);
const open = ref(false);
const activeIndex = ref(-1);

const hasInput = computed(() => props.modelValue.trim() !== '');
const flat = computed(() => flattenSuggestions(props.groups));
const { text: placeholderText, isStatic } = useTypedPlaceholder(props.examples, {
  focused,
  hasInput,
});

const announcement = computed(() => {
  if (props.busy) return 'Recherche en cours.';
  if (!hasInput.value) return '';
  return `${flat.value.length} suggestions disponibles.`;
});

const activeId = computed(() => {
  const subject = flat.value[activeIndex.value];
  return subject === undefined ? undefined : `${props.listId}-${subject.kind}-${subject.id}`;
});

watch(
  () => props.groups,
  () => {
    activeIndex.value = -1;
    open.value = focused.value && flat.value.length > 0;
  },
);

function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value);
  open.value = value.trim() !== '';
}

function choose(subject: SearchSubject | undefined): void {
  if (subject === undefined) return;
  emit('pick', subject);
  open.value = false;
  focused.value = false;
  input.value?.blur();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    open.value = true;
    activeIndex.value = Math.min(activeIndex.value + 1, flat.value.length - 1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, -1);
    return;
  }
  if (event.key === 'Enter') {
    if (open.value && activeIndex.value >= 0) {
      event.preventDefault();
      choose(flat.value[activeIndex.value]);
    }
    return;
  }
  if (event.key === 'Escape') {
    open.value = false;
    activeIndex.value = -1;
    return;
  }
  if (event.key === 'Tab') {
    open.value = false;
  }
}

function onFocus(): void {
  focused.value = true;
  open.value = flat.value.length > 0 && hasInput.value;
}

function onBlur(): void {
  focused.value = false;
  window.setTimeout(() => {
    open.value = false;
  }, 120);
}
</script>

<template>
  <div class="relative">
    <label class="sr-only" for="ap-search"
      >Rechercher une ville, un département ou un groupe d'action</label
    >
    <span
      class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-lg"
      aria-hidden="true"
    >
      🔎
    </span>
    <input
      id="ap-search"
      ref="input"
      :value="modelValue"
      type="search"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="activeId"
      :aria-busy="busy"
      class="ap-focusable w-full rounded-2xl border py-4 pl-12 pr-4 text-base shadow-sm"
      :style="{
        backgroundColor: 'var(--ap-surface)',
        borderColor: 'var(--ap-border)',
        color: 'var(--ap-ink)',
      }"
      :placeholder="hasInput || !isStatic ? '' : 'Ex. : Lyon, 69, GA Strasbourg SUD'"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    />
    <TypedPlaceholder :text="placeholderText" :visible="!hasInput" />
    <SuggestionList
      v-if="open"
      :groups="groups"
      :active-index="activeIndex"
      :list-id="listId"
      :busy="busy"
      @pick="choose"
      @hover="activeIndex = $event"
    />
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
  </div>
</template>
