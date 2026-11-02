<script setup lang="ts">
import { computed, watch } from 'vue';

import StateMessage from '../../../shared/components/StateMessage.vue';
import CopyButton from '../../../shared/components/CopyButton.vue';
import {
  defaultLayoutFor,
  parseRoute,
  serializeRoute,
  useRoute,
} from '../../../shared/composables/useUrlState';
import type { CalendarEvent, CalendarLayout, SearchSubject } from '../../../types';
import SubscriptionPanel from '../../subscription/components/SubscriptionPanel.vue';
import { buildCalendarLink } from '../../subscription/utils/calendar-link-builder';
import { ACTION_TYPES } from '../data/event-types';
import { useCalendarFeed } from '../composables/useCalendarFeed';
import { GROUP_METADATA, useGroupNames } from '../composables/useGroupNames';
import { useWeather } from '../composables/useWeather';
import { availableTypes, filterByType } from '../utils/type-filter';
import { groupColorFor, groupColorsFor } from '../utils/group-colors';
import CalendarView from './CalendarView.vue';
import EventDetail from './EventDetail.vue';
import FilterBar from './FilterBar.vue';
import GroupFilterBar, { type AvailableGroup } from './GroupFilterBar.vue';

const props = defineProps<{ subjects: readonly SearchSubject[] }>();
const emit = defineEmits<{
  (event: 'add-subject'): void;
  (event: 'remove-subject', subject: SearchSubject): void;
}>();

const KNOWN_TYPES = ACTION_TYPES.map((type) => type.slug);
const defaultLayout: CalendarLayout =
  typeof window === 'undefined' ? 'liste' : defaultLayoutFor(window.innerWidth);

const route = useRoute();
const {
  events,
  status: feedStatus,
  retry: retryFeed,
} = useCalendarFeed(computed(() => props.subjects));
const weather = useWeather();

const state = computed(() =>
  parseRoute(route.state.search, { defaultLayout, knownTypes: KNOWN_TYPES }),
);
const available = computed(() => availableTypes(events.value));
const shown = computed(() => filterByType(events.value, state.value.types));
const { names: groupNames } = useGroupNames(events);
const groupIds = computed(() => {
  const ids: string[] = [];
  for (const event of events.value) {
    for (const entry of event.metadata) {
      const id = entry.name === GROUP_METADATA ? entry.value.trim() : '';
      if (id !== '' && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
});
const groupColors = computed(() => groupColorsFor(groupIds.value));
const hasEpciSubject = computed(() => props.subjects.some((subject) => subject.kind === 'epci'));
const groups = computed<AvailableGroup[]>(() => {
  if (props.subjects.some((subject) => subject.kind === 'group')) return [];
  const counts = new Map<string, number>();
  for (const event of events.value) {
    const seen = new Set<string>();
    for (const entry of event.metadata) {
      const id = entry.value.trim();
      if (entry.name !== GROUP_METADATA || id === '' || seen.has(id)) continue;
      seen.add(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: groupNames.value[id] ?? 'Groupe sans nom',
      count,
      color: groupColors.value.get(id) ?? groupColorFor(id),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'fr'));
});
/** Groups that are no longer published by any event of the subject are ignored. */
const activeGroups = computed(() => {
  const availableIds = new Set(groups.value.map((group) => group.id));
  return state.value.groups.filter((id) => availableIds.has(id));
});
const shownWithGroup = computed(() => {
  if (activeGroups.value.length === 0) return shown.value;
  return shown.value.filter((event) =>
    event.metadata.some(
      (entry) => entry.name === GROUP_METADATA && activeGroups.value.includes(entry.value.trim()),
    ),
  );
});
const selected = computed(
  () => shownWithGroup.value.find((event) => event.id === state.value.eventId) ?? null,
);
const subjectLinks = computed(() =>
  props.subjects.map((subject) => ({
    subject,
    link: buildCalendarLink([subject], {
      types: state.value.types,
      groups: activeGroups.value,
      scope: 'city-only',
      city: subject,
    }),
  })),
);

watch(
  shownWithGroup,
  (events) => {
    void weather.ensure(events);
  },
  { immediate: true },
);

function write(patch: {
  types?: readonly string[];
  group?: readonly string[];
  layout?: CalendarLayout;
  eventId?: string | null;
}): void {
  route.write(
    serializeRoute(
      {
        subjects: props.subjects.map((subject) => ({ kind: subject.kind, id: subject.id })),
        types: [...(patch.types ?? state.value.types)],
        groups: patch.group === undefined ? state.value.groups : [...patch.group],
        layout: patch.layout ?? state.value.layout,
        eventId: patch.eventId === undefined ? state.value.eventId : patch.eventId,
      },
      defaultLayout,
    ),
  );
}

function toggleType(slug: string): void {
  const availableSlugs = available.value.map((type) => type.slug);
  const selected = state.value.types.length === 0 ? availableSlugs : state.value.types;
  const next = selected.includes(slug)
    ? selected.filter((value) => value !== slug)
    : [...selected, slug];
  write({
    types:
      next.length === availableSlugs.length && availableSlugs.every((value) => next.includes(value))
        ? []
        : next,
  });
}

function open(target: CalendarEvent): void {
  write({ eventId: target.id });
}
</script>

<template>
  <div>
    <div class="flex flex-col gap-2">
      <div
        v-for="{ subject, link } in subjectLinks"
        :key="`${subject.kind}:${subject.id}`"
        class="ap-surface flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <p class="text-[11px] font-bold uppercase tracking-widest opacity-60">Calendrier de</p>
          <h1 class="truncate text-lg font-bold leading-tight">{{ subject.label }}</h1>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <CopyButton
            v-if="link !== null"
            :value="link.subscriptionUrl"
            label="Copier le lien partiel"
          />
          <span v-else class="text-xs opacity-60">Lien indisponible</span>
          <button
            type="button"
            class="ap-focusable rounded-xl border px-3 py-2 text-xs font-semibold"
            :style="{ borderColor: 'var(--ap-border)' }"
            @click="emit('remove-subject', subject)"
          >
            Enlever
          </button>
        </div>
      </div>
      <button
        type="button"
        class="ap-focusable self-start rounded-xl border px-3 py-2 text-xs font-semibold"
        :style="{ borderColor: 'var(--ap-border)' }"
        @click="emit('add-subject')"
      >
        + Ajouter
      </button>
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
      :title="hasEpciSubject ? 'Territoire indisponible' : 'Calendrier indisponible'"
      :message="
        hasEpciSubject
          ? 'Les données de rattachement de cette intercommunalité sont indisponibles ou ont changé. Revenez à la recherche puis réessayez.'
          : 'Les actions de ce sujet n’ont pas pu être chargées. Réessayez dans un instant.'
      "
      :primary-label="hasEpciSubject ? 'Réessayer' : 'Réessayer'"
      @primary="retryFeed()"
    />

    <template v-else>
      <div
        v-if="groups.length > 0 || available.length > 1"
        class="ap-surface mt-4 space-y-2 rounded-2xl px-3 py-2.5"
      >
        <GroupFilterBar
          v-if="groups.length > 0"
          :available="groups"
          :selected="activeGroups"
          @select="write({ group: $event })"
        />
        <FilterBar
          v-if="available.length > 1"
          :available="available"
          :selected="state.types"
          :shown="shownWithGroup.length"
          :total="events.length"
          @toggle="toggleType"
          @clear="write({ types: [] })"
        />
      </div>

      <div
        class="mt-3 inline-flex gap-0.5 rounded-xl p-0.5"
        role="group"
        aria-label="Affichage"
        :style="{ backgroundColor: 'var(--ap-surface-muted)' }"
      >
        <button
          v-for="layout in ['liste', 'jour', 'semaine', 'mois'] as const"
          :key="layout"
          type="button"
          class="ap-focusable rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize"
          :aria-pressed="state.layout === layout"
          :style="
            state.layout === layout
              ? {
                  backgroundColor: 'var(--ap-surface)',
                  color: 'var(--ap-primary)',
                  boxShadow: '0 1px 2px var(--ap-shadow)',
                }
              : { color: 'var(--ap-ink)' }
          "
          @click="write({ layout })"
        >
          {{ layout }}
        </button>
      </div>

      <StateMessage
        v-if="feedStatus === 'empty' || shownWithGroup.length === 0"
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
        @primary="write({ types: [], group: [] })"
      />

      <CalendarView
        v-else
        class="mt-4"
        :events="shownWithGroup"
        :layout="state.layout"
        :group-colors="groups"
        :weather-for="weather.weatherFor"
        @open="open"
      />

      <SubscriptionPanel :subjects="props.subjects" :types="state.types" :groups="activeGroups" />
    </template>

    <EventDetail
      :event="selected"
      :weather="selected === null ? null : weather.weatherFor(selected)"
      :group-names="groupNames"
      @close="write({ eventId: null })"
    />
  </div>
</template>
