<script setup lang="ts">
import { computed, ref } from 'vue';

import CopyButton from '../../../shared/components/CopyButton.vue';
import type { SearchSubject } from '../../../types';
import { buildCalendarLink } from '../utils/calendar-link-builder';
import LinkFormatChoice from './LinkFormatChoice.vue';

const props = defineProps<{
  subject: SearchSubject;
  types: readonly string[];
  period: { from: Date; to: Date } | null;
}>();

const keepFilters = ref(props.types.length > 0);

const link = computed(() =>
  buildCalendarLink(props.subject, {
    keepFilters: keepFilters.value,
    types: props.types,
    period: props.period,
  }),
);
</script>

<template>
  <section
    id="ap-subscription"
    class="ap-surface mt-6 rounded-2xl px-4 py-5"
    aria-labelledby="ap-subscription-title"
  >
    <h2 id="ap-subscription-title" class="text-base font-bold">Garder ce calendrier avec moi</h2>

    <template v-if="link !== null">
      <p class="mt-1 text-sm opacity-80">
        L'abonnement se met à jour tout seul : les nouvelles actions arrivent sans rien refaire.
        Aucun compte n'est nécessaire ici.
      </p>

      <LinkFormatChoice
        v-if="types.length > 0"
        :keep-filters="keepFilters"
        :filter-count="types.length"
        @update:keep-filters="keepFilters = $event"
      />

      <p
        class="mt-4 rounded-xl px-3 py-2 text-xs"
        :style="{ backgroundColor: 'var(--ap-surface-muted)' }"
      >
        {{ link.description }}
      </p>

      <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <CopyButton :value="link.subscriptionUrl" label="Copier le lien d'abonnement" />
        <a
          class="ap-button-secondary ap-focusable rounded-xl px-4 py-3 text-center text-sm"
          :href="link.webcalUrl"
        >
          Ouvrir dans mon application (iPhone / Mac)
        </a>
        <a
          class="ap-focusable rounded-xl border px-4 py-3 text-center text-sm font-semibold"
          :style="{ borderColor: 'var(--ap-border)' }"
          :href="link.calendarServiceUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ajouter à Outlook
        </a>
        <a
          class="ap-focusable rounded-xl border px-4 py-3 text-center text-sm font-semibold"
          :style="{ borderColor: 'var(--ap-border)' }"
          :href="link.downloadUrl"
          download
        >
          Télécharger une copie
        </a>
      </div>

      <details class="mt-4 text-xs">
        <summary class="ap-focusable cursor-pointer font-semibold">Voir le lien complet</summary>
        <p class="mt-2 break-all opacity-80">{{ link.subscriptionUrl }}</p>
      </details>
    </template>

    <div v-else class="mt-3">
      <p class="text-sm opacity-80">
        Ce sujet ne permet pas encore de produire un calendrier dédié. Vous pouvez réessayer, ou
        garder le calendrier complet.
      </p>
      <a class="ap-primary-text mt-2 inline-block text-sm font-semibold underline" href="#retry">
        Réessayer
      </a>
    </div>
  </section>
</template>
