<script setup lang="ts">
import { computed, watch } from 'vue';

import StateMessage from '../../../shared/components/StateMessage.vue';
import {
  defaultLayoutFor,
  parseRoute,
  serializeRoute,
  useRoute,
} from '../../../shared/composables/useUrlState';
import type { CalendarEvent, CalendarLayout, SearchSubject } from '../../../types';
import SubscriptionPanel from '../../subscription/components/SubscriptionPanel.vue';
import { ACTION_TYPES } from '../data/event-types';
import { useCalendarFeed } from '../composables/useCalendarFeed';
import { useWeather } from '../composables/useWeather';
import { availableTypes, feedPeriod, filterByType, formatPeriod } from '../utils/type-filter';
import CalendarView from './CalendarView.vue';
import EventDetail from './EventDetail.vue';
import FilterBar from './FilterBar.vue';

const props = defineProps<{ subject: SearchSubject }>();
const emit = defineEmits<{ (event: 'change-subject'): void }>();

const KNOWN_TYPES = ACTION_TYPES.map((type) => type.slug);
const defaultLayout: CalendarLayout =
  typeof window === 'undefined' ? 'liste' : defaultLayoutFor(window.innerWidth);

const route = useRoute();
const {
  events,
  status: feedStatus,
  retry: retryFeed,
} = useCalendarFeed(computed(() => props.subject));
const weather = useWeather();

const state = computed(() =>
  parseRoute(route.state.search, { defaultLayout, knownTypes: KNOWN_TYPES }),
);
const available = computed(() => availableTypes(events.value));
const shown = computed(() => filterByType(events.value, state.value.types));
const period = computed(() => feedPeriod(shown.value));
const selected = computed(
  () => shown.value.find((event) => event.id === state.value.eventId) ?? null,
);

watch(
  shown,
  (events) => {
    void weather.ensure(events);
  },
  { immediate: true },
);

function write(patch: {
  types?: readonly string[];
  layout?: CalendarLayout;
  eventId?: string | null;
}): void {
  route.write(
    serializeRoute(
      {
        subject: state.value.subject,
        types: [...(patch.types ?? state.value.types)],
        layout: patch.layout ?? state.value.layout,
        eventId: patch.eventId === undefined ? state.value.eventId : patch.eventId,
      },
      defaultLayout,
    ),
  );
}

function toggleType(slug: string): void {
  const next = state.value.types.includes(slug)
    ? state.value.types.filter((value) => value !== slug)
    : [...state.value.types, slug];
  write({ types: next });
}

function open(target: CalendarEvent): void {
  write({ eventId: target.id });
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-widest opacity-60">Calendrier de</p>
        <h1 class="text-2xl font-bold leading-tight">{{ subject.label }}</h1>
        <p v-if="period !== null" class="mt-1 text-xs opacity-70">{{ formatPeriod(period) }}</p>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="ap-focusable rounded-xl border px-3 py-2 text-xs font-semibold"
          :style="{ borderColor: 'var(--ap-border)' }"
          @click="emit('change-subject')"
        >
          Changer de sujet
        </button>
        <a class="ap-button ap-focusable rounded-xl px-4 py-2 text-xs" href="#ap-subscription">
          Mon lien de calendrier
        </a>
      </div>
    </div>

    <p v-for="notice in state.notices" :key="notice" class="mt-3 text-xs ap-secondary-text">
      {{ notice }}
    </p>

    <div
      v-if="feedStatus === 'loading'"
      class="ap-surface mt-4 animate-pulse rounded-2xl px-4 py-10"
    >
      <span class="sr-only">Chargement du calendrier…</span>
    </div>

    <StateMessage
      v-else-if="feedStatus === 'error'"
      class="mt-4"
      title="Calendrier indisponible"
      message="Les actions de ce sujet n'ont pas pu être chargées. Réessayez dans un instant."
      primary-label="Réessayer"
      @primary="retryFeed()"
    />

    <template v-else>
      <FilterBar
        v-if="available.length > 1"
        class="mt-5"
        :available="available"
        :selected="state.types"
        :shown="shown.length"
        :total="events.length"
        @toggle="toggleType"
        @clear="write({ types: [] })"
      />

      <div class="mt-2 flex gap-1" role="group" aria-label="Affichage">
        <button
          v-for="layout in ['liste', 'semaine', 'mois'] as const"
          :key="layout"
          type="button"
          class="ap-focusable rounded-lg px-3 py-2 text-xs font-semibold capitalize"
          :aria-pressed="state.layout === layout"
          :style="
            state.layout === layout
              ? { backgroundColor: 'var(--ap-primary)', color: 'var(--ap-on-primary)' }
              : { color: 'var(--ap-ink)' }
          "
          @click="write({ layout })"
        >
          {{ layout }}
        </button>
      </div>

      <StateMessage
        v-if="feedStatus === 'empty' || shown.length === 0"
        class="mt-4"
        :title="
          feedStatus === 'empty'
            ? 'Aucune action prévue pour le moment'
            : 'Aucune action avec ces filtres'
        "
        :message="
          feedStatus === 'empty'
            ? 'Rien n’est programmé sur la période publiée. Abonnez-vous : les prochaines actions arriveront automatiquement.'
            : 'Retirez un filtre pour retrouver les autres actions de ce sujet.'
        "
        :primary-label="feedStatus === 'empty' ? 'Voir mon lien de calendrier' : 'Tout afficher'"
        @primary="feedStatus === 'empty' ? write({ types: [] }) : write({ types: [] })"
      />

      <CalendarView
        v-else
        class="mt-4"
        :events="shown"
        :layout="state.layout"
        :weather-for="weather.weatherFor"
        @open="open"
      />

      <SubscriptionPanel :subject="subject" :types="state.types" :period="period" />
    </template>

    <EventDetail
      :event="selected"
      :weather="selected === null ? null : weather.weatherFor(selected)"
      @close="write({ eventId: null })"
    />
  </div>
</template>
