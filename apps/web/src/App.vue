<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import CalendarScreen from './features/calendar/components/CalendarScreen.vue';
import SearchHero from './features/discovery/components/SearchHero.vue';
import { resolveSubject } from './shared/api/client';
import AppShell from './shared/components/AppShell.vue';
import StateMessage from './shared/components/StateMessage.vue';
import {
  defaultLayoutFor,
  parseRoute,
  replaceRoute,
  serializeRoute,
  subjectKey,
  useRoute,
} from './shared/composables/useUrlState';
import type { SearchSubject } from './types';

type Resolution = 'idle' | 'loading' | 'ready' | 'unknown' | 'error';

const route = useRoute();
const defaultLayout = typeof window === 'undefined' ? 'liste' : defaultLayoutFor(window.innerWidth);

const state = computed(() => parseRoute(route.state.search, { defaultLayout }));
const subject = ref<SearchSubject | null>(null);
const resolution = ref<Resolution>('idle');

// The parsed route object is rebuilt on every address change, so the watcher tracks the
// subject key itself: opening an event or toggling a filter must not re-resolve the subject.
watch(
  () => subjectKey(state.value.subject),
  (key) => {
    const target = state.value.subject;
    if (key === null || target === null) {
      subject.value = null;
      resolution.value = 'idle';
      return;
    }
    resolution.value = 'loading';
    resolveSubject(target.kind, target.id)
      .then((found) => {
        subject.value = found;
        resolution.value = found === null ? 'unknown' : 'ready';
      })
      .catch(() => {
        subject.value = null;
        resolution.value = 'error';
      });
  },
  { immediate: true },
);

function select(target: SearchSubject): void {
  const hasParams = Object.keys(target.calendar.params).length > 0;
  route.write(
    serializeRoute(
      {
        subject: { kind: target.kind, id: target.id },
        types: [],
        layout: defaultLayout,
        eventId: null,
      },
      defaultLayout,
    ),
  );
  if (hasParams) {
    subject.value = target;
    resolution.value = 'ready';
  }
}

function backToDiscovery(): void {
  replaceRoute('');
  route.write('');
  subject.value = null;
  resolution.value = 'idle';
}

function retryResolution(): void {
  const target = state.value.subject;
  if (target === null) return;
  resolution.value = 'loading';
  resolveSubject(target.kind, target.id)
    .then((found) => {
      subject.value = found;
      resolution.value = found === null ? 'unknown' : 'ready';
    })
    .catch(() => {
      resolution.value = 'error';
    });
}
</script>

<template>
  <AppShell :on-discovery="subject === null" @home="backToDiscovery">
    <p v-for="notice in state.notices" :key="notice" class="mb-3 text-xs ap-secondary-text">
      {{ notice }}
    </p>

    <SearchHero v-if="state.subject === null" @select="select" />

    <div
      v-else-if="resolution === 'loading'"
      class="ap-surface mt-6 animate-pulse rounded-2xl px-4 py-10"
    >
      <span class="sr-only">Chargement du sujet…</span>
    </div>

    <StateMessage
      v-else-if="resolution === 'unknown'"
      class="mt-6"
      title="Ce sujet n'existe plus"
      :message="`Le sujet « ${state.subject.kind}:${state.subject.id} » est introuvable. Il a peut-être été renommé ou fusionné.`"
      primary-label="Rechercher à nouveau"
      @primary="backToDiscovery"
    />

    <StateMessage
      v-else-if="resolution === 'error'"
      class="mt-6"
      title="Service momentanément indisponible"
      message="Le sujet n'a pas pu être retrouvé. Vous pouvez réessayer sans perdre votre adresse."
      primary-label="Réessayer"
      @primary="retryResolution"
    />

    <CalendarScreen
      v-else-if="subject !== null"
      :subject="subject"
      @change-subject="backToDiscovery"
    />
  </AppShell>
</template>
