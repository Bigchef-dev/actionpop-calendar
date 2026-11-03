<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import CalendarScreen from './features/calendar/components/CalendarScreen.vue';
import { useJourneyEmission } from './features/calendar/composables/useJourneyEmission';
import SearchHero from './features/discovery/components/SearchHero.vue';
import { resolveSubject } from './shared/api/client';
import AppShell from './shared/components/AppShell.vue';
import StateMessage from './shared/components/StateMessage.vue';
import {
  defaultLayoutFor,
  parseRoute,
  serializeRoute,
  useRoute,
} from './shared/composables/useUrlState';
import type { SearchSubject } from './types';

type Resolution = 'idle' | 'loading' | 'ready' | 'unknown' | 'error';

const journey = useJourneyEmission();
const route = useRoute();
const defaultLayout = typeof window === 'undefined' ? 'liste' : defaultLayoutFor(window.innerWidth);

const state = computed(() => parseRoute(route.state.search, { defaultLayout }));
const subjects = ref<SearchSubject[]>([]);
const adding = ref(false);
const resolution = ref<Resolution>('idle');

// The parsed route object is rebuilt on every address change, so the watcher tracks the
// subject key itself: opening an event or toggling a filter must not re-resolve the subject.
watch(
  () => state.value.subjects.map((subject) => `${subject.kind}:${subject.id}`).join(','),
  (keys) => {
    if (keys === '') {
      subjects.value = [];
      resolution.value = 'idle';
      return;
    }
    resolution.value = 'loading';
    Promise.all(
      state.value.subjects.map((target) => resolveSubject(target.kind, target.id)),
    ).then((found) => {
        subjects.value = found.filter((subject): subject is SearchSubject => subject !== null);
        resolution.value = subjects.value.length === state.value.subjects.length ? 'ready' : 'unknown';
      })
      .catch(() => {
        subjects.value = [];
        resolution.value = 'error';
      });
  },
  { immediate: true },
);

function select(target: SearchSubject): void {
  route.write(
    serializeRoute(
      {
        subjects: [{ kind: target.kind, id: target.id }],
        groups: [],
        types: [],
        layout: defaultLayout,
        eventId: null,
      },
      defaultLayout,
    ),
  );
  adding.value = false;
  subjects.value = [target];
  resolution.value = 'ready';
  // Accepting a suggestion is also selecting a territory: the two are counted separately so a
  // visit that arrives by address still registers as a territory selection.
  journey.trackSuggestion(target);
  journey.trackSelection([target]);
}

function handleSubjectSelect(target: SearchSubject): void {
  if (subjects.value.length === 0) {
    select(target);
    return;
  }
  addSubject(target);
}

function backToDiscovery(): void {
  route.write('');
  subjects.value = [];
  resolution.value = 'idle';
}

function addSubject(target: SearchSubject): void {
  if (subjects.value.some((subject) => subject.kind === target.kind && subject.id === target.id)) {
    adding.value = false;
    return;
  }
  subjects.value = [...subjects.value, target];
  journey.trackSelection([target]);
  route.write(
    serializeRoute(
      {
        subjects: subjects.value.map((subject) => ({ kind: subject.kind, id: subject.id })),
        groups: state.value.groups,
        types: state.value.types,
        layout: state.value.layout,
        eventId: state.value.eventId,
      },
      defaultLayout,
    ),
  );
  adding.value = false;
}

function removeSubject(target: SearchSubject): void {
  const remaining = subjects.value.filter(
    (subject) => subject.kind !== target.kind || subject.id !== target.id,
  );
  if (remaining.length === 0) {
    backToDiscovery();
    return;
  }
  subjects.value = remaining;
  route.write(
    serializeRoute(
      {
        subjects: remaining.map((subject) => ({ kind: subject.kind, id: subject.id })),
        groups: state.value.groups,
        types: state.value.types,
        layout: state.value.layout,
        eventId: state.value.eventId,
      },
      defaultLayout,
    ),
  );
}

function retryResolution(): void {
  const targets = state.value.subjects;
  if (targets.length === 0) return;
  resolution.value = 'loading';
  Promise.all(targets.map((target) => resolveSubject(target.kind, target.id)))
    .then((found) => {
      subjects.value = found.filter((subject): subject is SearchSubject => subject !== null);
      resolution.value = subjects.value.length === targets.length ? 'ready' : 'unknown';
    })
    .catch(() => {
      resolution.value = 'error';
    });
}
</script>

<template>
  <AppShell :on-discovery="subjects.length === 0" @home="backToDiscovery">
    <p v-for="notice in state.notices" :key="notice" class="mb-3 text-xs ap-secondary-text">
      {{ notice }}
    </p>

    <SearchHero
      v-if="subjects.length === 0 || adding"
      @select="handleSubjectSelect"
      @searched="journey.track($event === 'empty' ? 'search_empty' : 'search')"
    />

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
      message="Un item de recherche est introuvable. Il a peut-être été renommé ou fusionné."
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
      v-else-if="subjects.length > 0"
      :subjects="subjects"
      @add-subject="adding = true"
      @remove-subject="removeSubject"
    />
  </AppShell>
</template>
