<script setup lang="ts">
import { computed } from 'vue';

import type { CalendarEvent } from '../../../types';
import { actionPopulaireUrl, groupPageUrl } from '../utils/event-links';
import { groupIds } from '../utils/metadata';

const props = defineProps<{
  event: CalendarEvent;
  groupNames: Readonly<Record<string, string>>;
}>();

const ACTION_POPULAIRE_LOGO =
  'https://melenchon2027.fr/wp-content/uploads/2026/09/LOGO-Action-Populaire-%E2%80%94-2-lignes.svg';

const groups = computed(() =>
  groupIds(props.event).map((id) => ({
    id,
    label: props.groupNames[id] ?? 'Groupe sans nom',
    url: groupPageUrl(id),
  })),
);

const sourceUrl = computed(() => actionPopulaireUrl(props.event));
</script>

<template>
  <section
    v-if="groups.length > 0 || sourceUrl !== null"
    class="mt-4 rounded-2xl border border-ap-border px-4 py-3"
  >
    <div v-if="groups.length > 0">
      <h2 class="text-xs font-bold uppercase tracking-wide opacity-60">Groupes</h2>
      <ul class="mt-2 space-y-1 text-sm" aria-label="Groupes de l'événement">
        <li v-for="group in groups" :key="group.id">
          <a
            class="ap-primary-text ap-focusable underline underline-offset-2"
            :href="group.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ group.label }}
          </a>
        </li>
      </ul>
    </div>
    <a
      v-if="sourceUrl !== null"
      class="ap-cta-yellow ap-focusable mt-3"
      :href="sourceUrl"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img :src="ACTION_POPULAIRE_LOGO" alt="" class="h-8 w-auto" />
      <span>Action populaire</span>
    </a>
  </section>
</template>
