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
import { journey } from '../../../shared/telemetry/reporter';
import { useGroupNames } from '../composables/useGroupNames';
import { useWeather } from '../composables/useWeather';
import { groupCountsOf, groupIdsOf, hasAnyGroup } from '../utils/metadata';
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
const LAYOUTS = ['liste', 'jour', 'semaine', 'mois'] as const;
const defaultLayout: CalendarLayout =
  typeof window === 'undefined' ? 'liste' : defaultLayoutFor(window.innerWidth);

const route = useRoute();
const {
  events,
  status: feedStatus,
  retry: retryFeed,
} = useCalendarFeed(computed(() => props.subjects), {
  // A calendar with at least one event is the point where the visitor got something usable.
  onDisplayed: (eventCount) => {
    if (eventCount > 0) journey.track('calendar_shown', subjectKindOf(props.subjects[0]?.kind));
  },
});
const weather = useWeather();

const state = computed(() =>
  parseRoute(route.state.search, { defaultLayout, knownTypes: KNOWN_TYPES }),
);
const available = computed(() => availableTypes(events.value));
const shown = computed(() => filterByType(events.value, state.value.types));
const { names: groupNames } = useGroupNames(events);
const groupIds = computed(() => groupIdsOf(events.value));
const groupColors = computed(() => groupColorsFor(groupIds.value));
const hasEpciSubject = computed(() => props.subjects.some((subject) => subject.kind === 'epci'));

/** Wording of the unavailable state: an intermunicipality can be re-resolved, a city cannot. */
const errorNotice = computed(() =>
  hasEpciSubject.value
    ? {
        title: 'Territoire indisponible',
        message:
          'Les données de rattachement de cette intercommunalité sont indisponibles ou ont changé. Revenez à la recherche puis réessayez.',
      }
    : {
        title: 'Calendrier indisponible',
        message: 'Les actions de ce sujet n’ont pas pu être chargées. Réessayez dans un instant.',
      },
);

/** Wording of the empty state: an empty feed invites a subscription, a filtered one a reset. */
const emptyNotice = computed(() =>
  feedStatus.value === 'empty'
    ? {
        title: 'Aucune action prévue pour le moment',
        message:
          'Rien n’est programmé sur la période publiée. Abonnez-vous : les prochaines actions arriveront automatiquement.',
        primaryLabel: 'Voir mon lien de calendrier',
      }
    : {
        title: 'Aucune action avec ces filtres',
        message: 'Retirez un filtre pour retrouver les autres actions de ce sujet.',
        primaryLabel: 'Tout afficher',
      },
);

const groups = computed<AvailableGroup[]>(() => {
  if (props.subjects.some((subject) => subject.kind === 'group')) return [];
  return [...groupCountsOf(events.value).entries()]
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
  return shown.value.filter((event) => hasAnyGroup(event, activeGroups.value));
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

function subjectKindOf(kind: string | undefined): 'commune' | 'department' | 'group' | 'epci' | 'none' {
  return kind === 'commune' || kind === 'department' || kind === 'group' || kind === 'epci'
    ? kind
    : 'none';
}

function toggleType(slug: string): void {
  journey.track('type_filter', subjectKindOf(props.subjects[0]?.kind));
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

function selectGroup(group: readonly string[]): void {
  if (group.length > 0) journey.track('group_filter', subjectKindOf(props.subjects[0]?.kind));
  write({ group });
}

function open(target: CalendarEvent): void {
  journey.track('detail_opened', subjectKindOf(props.subjects[0]?.kind));
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
          <p class="ap-eyebrow">Calendrier de</p>
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
            class="ap-focusable rounded-xl border border-ap-border px-3 py-2 text-xs font-semibold"
            @click="emit('remove-subject', subject)"
          >
            Enlever
          </button>
        </div>
      </div>
      <button
        type="button"
        class="ap-focusable self-start rounded-xl border border-ap-border px-3 py-2 text-xs font-semibold"
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
      :title="errorNotice.title"
      :message="errorNotice.message"
      primary-label="Réessayer"
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
          @select="selectGroup($event)"
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

      <div class="ap-segmented mt-3" role="group" aria-label="Affichage">
        <button
          v-for="layout in LAYOUTS"
          :key="layout"
          type="button"
          class="ap-segmented-item ap-focusable"
          :aria-pressed="state.layout === layout"
          @click="write({ layout })"
        >
          {{ layout }}
        </button>
      </div>

      <StateMessage
        v-if="feedStatus === 'empty' || shownWithGroup.length === 0"
        class="mt-4"
        :title="emptyNotice.title"
        :message="emptyNotice.message"
        :primary-label="emptyNotice.primaryLabel"
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
