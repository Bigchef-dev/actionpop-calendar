<script setup lang="ts">
import { computed, ref } from 'vue';

import { absoluteApiUrl, REVIEW_PROPOSALS } from '../../../config';
import type { SearchSubject } from '../../../types';
import { useRecentSubject } from '../composables/useRecentSubject';
import { useSearchSuggestions } from '../composables/useSearchSuggestions';
import { shapeSuggestions } from '../utils/suggestion-shape';
import DiscoveryVariantA from './proposals/DiscoveryVariantA.vue';
import DiscoveryVariantB from './proposals/DiscoveryVariantB.vue';
import DiscoveryVariantC from './proposals/DiscoveryVariantC.vue';
import SearchField from './SearchField.vue';
import StateMessage from '../../../shared/components/StateMessage.vue';

const emit = defineEmits<{
  (event: 'select', subject: SearchSubject): void;
  (event: 'searched', outcome: 'fruitful' | 'empty'): void;
}>();

const EXAMPLES = ['Lyon', '69', 'GA Strasbourg SUD', 'Marseille', 'Groupe local Rennes', '31'];
const PROPOSALS = { a: DiscoveryVariantA, b: DiscoveryVariantB, c: DiscoveryVariantC } as const;

const query = ref('');
const { answer, status, retry } = useSearchSuggestions(query, {
  onSettled: (outcome) => emit('searched', outcome),
});
const { recent } = useRecentSubject();

const proposal = computed(() => {
  if (!REVIEW_PROPOSALS || typeof window === 'undefined') return PROPOSALS.a;
  const flag = new URLSearchParams(window.location.search).get('proposition');
  return flag === 'b' ? PROPOSALS.b : flag === 'c' ? PROPOSALS.c : PROPOSALS.a;
});

const fullFeedUrl = absoluteApiUrl('/calendar.ics');

const groups = computed(() => (answer.value === null ? [] : shapeSuggestions(answer.value)));
function pick(subject: SearchSubject): void {
  emit('select', subject);
}

function tryExample(example: string): void {
  query.value = example;
}
</script>

<template>
  <div class="pb-6">
    <component :is="proposal">
      <SearchField
        v-model="query"
        :groups="groups"
        :examples="EXAMPLES"
        :busy="status === 'loading'"
        list-id="ap-search-suggestions"
        @pick="pick"
      />

      <div v-if="recent !== null && query === ''" class="mt-3 text-left">
        <button
          type="button"
          class="ap-focusable rounded-full border px-4 py-2 text-xs font-semibold"
          :style="{ borderColor: 'var(--ap-border)' }"
          @click="
            emit('select', {
              kind: recent.kind,
              id: recent.id,
              label: recent.label,
              calendar: { path: '/calendar.ics', params: {} },
            })
          "
        >
          Reprendre : {{ recent.label }}
        </button>
      </div>

      <div v-if="query.trim() === ''" class="mt-4 flex flex-wrap justify-center gap-2">
        <button
          v-for="example in EXAMPLES.slice(0, 4)"
          :key="example"
          type="button"
          class="ap-focusable rounded-full border px-3 py-1.5 text-xs font-semibold opacity-80"
          :style="{ borderColor: 'var(--ap-border)' }"
          @click="tryExample(example)"
        >
          {{ example }}
        </button>
      </div>
    </component>

    <div class="mx-auto mt-6 max-w-xl">
      <StateMessage
        v-if="status === 'error'"
        title="Recherche indisponible"
        message="Le service de recherche ne répond pas pour le moment. Vous pouvez réessayer, ou ouvrir directement le calendrier complet."
        primary-label="Réessayer"
        @primary="retry"
      />

      <section v-else-if="status === 'empty'" class="ap-surface rounded-2xl px-5 py-6">
        <h2 class="text-base font-semibold">Rien trouvé pour « {{ query.trim() }} »</h2>
        <p class="mt-2 text-sm opacity-80">
          Vérifiez l'orthographe, essayez sans accent, ou cherchez un autre type de sujet.
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="alternative in EXAMPLES.slice(0, 3)"
            :key="alternative"
            type="button"
            class="ap-focusable rounded-full px-3 py-1.5 text-xs font-semibold"
            :style="{ backgroundColor: 'var(--ap-surface-muted)' }"
            @click="tryExample(alternative)"
          >
            {{ alternative }}
          </button>
        </div>
        <p class="mt-3 text-xs opacity-70">
          Un groupe d'action se cherche par son nom (« GA Strabourg Sud »), une ville par son nom, un
          département par son nom ou son numéro.
        </p>
      </section>
    </div>
  </div>
</template>
