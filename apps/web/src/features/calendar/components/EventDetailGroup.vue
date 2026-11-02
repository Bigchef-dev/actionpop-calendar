<script setup lang="ts">
import { computed } from 'vue';

import type { CalendarEvent } from '../../../types';
import { actionPopulaireUrl } from '../utils/event-links';
import { GROUP_METADATA } from '../composables/useGroupNames';

const props = defineProps<{
  event: CalendarEvent;
  groupNames: Readonly<Record<string, string>>;
}>();

const groups = computed(() => {
  const ids = new Set<string>();
  return props.event.metadata
    .filter((entry) => entry.name === GROUP_METADATA)
    .map((entry) => entry.value.trim())
    .filter((id) => id !== '' && !ids.has(id))
    .filter((id) => {
      ids.add(id);
      return true;
    })
    .map((id) => ({
      id,
      label: props.groupNames[id] ?? 'Groupe sans nom',
      url: `https://actionpopulaire.fr/groupes/${encodeURIComponent(id)}/`,
    }));
});

const source = computed(() => actionPopulaireUrl(props.event));
</script>

<template>
  <section v-if="groups.length > 0 || source !== null" class="mt-4 rounded-2xl border px-4 py-3" :style="{ borderColor: 'var(--ap-border)' }">
    <div v-if="groups.length > 0">
      <h2 class="text-xs font-bold uppercase tracking-wide opacity-60">Groupes</h2>
      <ul class="mt-2 space-y-1 text-sm" aria-label="Groupes de l'événement">
        <li
          v-for="group in groups"
          :key="group.id"
        >
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
      v-if="source !== null"
      class="ap-focusable mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-bold"
      :style="{ backgroundColor: 'var(--ap-yellow)', color: 'var(--ap-yellow-ink)' }"
      :href="source"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src="https://melenchon2027.fr/wp-content/uploads/2026/09/LOGO-Action-Populaire-%E2%80%94-2-lignes.svg"
        alt=""
        class="h-8 w-auto"
      />
      <span>Action populaire</span>
    </a>
  </section>
</template>
