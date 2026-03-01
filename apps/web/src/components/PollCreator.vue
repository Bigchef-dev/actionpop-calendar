<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDarkMode } from '../composables/useDarkMode'
import { usePollEvents } from '../composables/usePollEvents'
import { usePollItems } from '../composables/usePollItems'
import { usePollDrag } from '../composables/usePollDrag'
import { useSendPoll } from '../composables/useSendPoll'
import { formatTime } from '../utils/poll.utils'
import { AGENDAS } from '../config'
import type { AgendaConfig } from '../types'
import PollItemRow from './PollItemRow.vue'

const props = defineProps<{ chatId: string }>()

const { isDark, toggle } = useDarkMode()

// Date
function todayStr() { return new Date().toISOString().slice(0, 10) }
const selectedDateStr = ref(todayStr())
const selectedDate = computed(() => new Date(selectedDateStr.value + 'T00:00:00'))

// Agendas
const activeAgendaIds = ref<Set<string>>(new Set(AGENDAS.map((a) => a.id)))
function toggleAgenda(id: string) {
  const next = new Set(activeAgendaIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  activeAgendaIds.value = next
}
const activeAgendas = computed<AgendaConfig[]>(() => AGENDAS.filter((a) => activeAgendaIds.value.has(a.id)))

// Events
const { events: calEvents, loading, error: fetchError, reload } = usePollEvents(selectedDate, activeAgendas)

// Items
const { items, autoKeys, addItem, removeItem, toggleEmojiPicker, pickEmoji } = usePollItems(calEvents)

// Drag & drop
const { draggingKey, dragOverKey, isTouchDragging, onDragStart, onDragOver, onDrop, onDragEnd, onHandleTouchStart, onHandleTouchMove, onHandleTouchEnd } = usePollDrag(items)

// Question
const question = ref('')
watch(selectedDateStr, (d) => {
  const [y, m, day] = d.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(day))
  const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  question.value = `📅 Actions - ${label.charAt(0).toUpperCase() + label.slice(1)}`
}, { immediate: true })

// Send & copy
const { sendState, sendError, copyState, sendPoll, copyPreview } = useSendPoll(props.chatId, question, items)

const checkedItems = computed(() => items.value.filter((i) => i.checked && i.title.trim()))
</script>

<template>
  <!-- Guard: chatId must be non-empty (checked by parent, but belt-and-suspenders) -->
  <div
    v-if="!chatId || !chatId.trim()"
    class="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8f5f9] via-[#f3eef5] to-[#ede5f0] dark:from-[#120a16] dark:via-[#0f0712] dark:to-[#0c050f]"
  >
    <div class="rounded-2xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 p-10 max-w-md text-center shadow-lg">
      <p class="text-4xl mb-4">🚫</p>
      <p class="text-lg font-semibold text-red-700 dark:text-red-300">Le paramètre <code class="font-mono bg-red-100 dark:bg-red-900 px-1 rounded">chatId</code> est requis dans l'URL.</p>
      <p class="mt-2 text-sm text-red-500 dark:text-red-400">
        Exemple : <code class="font-mono">?chatId=-1001234567890</code>
      </p>
    </div>
  </div>

  <!-- Main page -->
  <div
    v-else
    class="min-h-screen antialiased font-sans bg-gradient-to-br from-[#f8f5f9] via-[#f3eef5] to-[#ede5f0] dark:from-[#120a16] dark:via-[#0f0712] dark:to-[#0c050f] transition-colors duration-300"
  >
    <div class="max-w-3xl mx-auto px-4 py-10">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-stone-800 dark:text-stone-100">🗳️ Créer un sondage</h1>
          <p class="text-sm text-stone-500 dark:text-stone-400 mt-1">
            Chat : <code class="font-mono bg-stone-200 dark:bg-stone-700 px-1 rounded text-xs">{{ chatId }}</code>
          </p>
        </div>
        <button
          @click="toggle"
          class="p-2 rounded-full hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-stone-600 dark:text-stone-300"
          title="Basculer dark mode"
        >{{ isDark ? '☀️' : '🌙' }}</button>
      </div>

      <!-- Date picker -->
      <section class="mb-6">
        <label class="block text-sm font-semibold text-stone-600 dark:text-stone-300 mb-2">📆 Journée</label>
        <input
          v-model="selectedDateStr"
          type="date"
          class="rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </section>

      <!-- Agenda filter chips -->
      <section class="mb-6">
        <label class="block text-sm font-semibold text-stone-600 dark:text-stone-300 mb-2">📂 Agendas</label>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="agenda in AGENDAS"
            :key="agenda.id"
            @click="toggleAgenda(agenda.id)"
            class="px-3 py-1 rounded-full text-xs font-medium border transition-all"
            :class="activeAgendaIds.has(agenda.id)
              ? 'text-white border-transparent shadow'
              : 'bg-transparent text-stone-500 dark:text-stone-400 border-stone-300 dark:border-stone-600'"
            :style="activeAgendaIds.has(agenda.id) ? `background-color: ${agenda.color}; border-color: ${agenda.color}` : ''"
          >{{ agenda.name }}</button>
        </div>
      </section>

      <!-- Question field -->
      <section class="mb-6">
        <label class="block text-sm font-semibold text-stone-600 dark:text-stone-300 mb-2">❓ Question du sondage</label>
        <input
          v-model="question"
          type="text"
          maxlength="300"
          class="w-full rounded-xl border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="Votre question…"
        />
        <p class="text-right text-xs text-stone-400 mt-1">{{ question.length }}/300</p>
      </section>

      <!-- Items list -->
      <section class="mb-4">
        <div class="flex items-center justify-between mb-3">
          <label class="text-sm font-semibold text-stone-600 dark:text-stone-300">📋 Options du sondage</label>
          <button
            @click="reload"
            :disabled="loading"
            class="text-xs text-violet-500 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-200 flex items-center gap-1 disabled:opacity-40"
          >
            <span :class="{ 'animate-spin inline-block': loading }">↻</span> Rafraîchir
          </button>
        </div>

        <!-- Loading skeleton -->
        <div v-if="loading" class="space-y-2">
          <div v-for="n in 4" :key="n" class="h-12 rounded-xl bg-stone-200 dark:bg-stone-700 animate-pulse" />
        </div>

        <!-- Fetch error -->
        <div v-else-if="fetchError" class="rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-300">
          ⚠️ {{ fetchError }}
        </div>

        <!-- Items -->
        <div v-else class="space-y-2">
          <PollItemRow
            v-for="item in items"
            :key="item.key"
            :item="item"
            :is-auto="autoKeys.has(item.key)"
            :is-dragging="draggingKey === item.key"
            :is-drag-over="dragOverKey === item.key && draggingKey !== item.key"
            :is-touch-dragging="isTouchDragging"
            @remove="removeItem(item.key)"
            @drag-start="onDragStart($event, item.key)"
            @drag-over="onDragOver($event, item.key)"
            @drop="onDrop(item.key)"
            @drag-end="onDragEnd"
            @handle-touch-start="onHandleTouchStart($event, item.key)"
            @handle-touch-move="onHandleTouchMove"
            @handle-touch-end="onHandleTouchEnd"
            @toggle-emoji="toggleEmojiPicker(item)"
            @pick-emoji="pickEmoji(item, $event)"
          />
        </div>

        <!-- Add item button -->
        <button
          @click="addItem"
          class="mt-3 w-full rounded-xl border border-dashed border-stone-300 dark:border-stone-600 text-stone-400 dark:text-stone-500 hover:border-violet-400 dark:hover:border-violet-500 hover:text-violet-500 dark:hover:text-violet-400 py-2 text-sm transition-colors"
        >
          + Ajouter un événement
        </button>
      </section>

      <!-- Preview -->
      <section v-if="checkedItems.length > 0" class="mb-6">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Aperçu des options</p>
          <button
            @click="copyPreview"
            class="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors"
            :class="copyState === 'copied'
              ? 'border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950'
              : 'border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400'"
            title="Copier dans le presse-papier"
          >
            <span>{{ copyState === 'copied' ? '✅' : '📋' }}</span>
            <span>{{ copyState === 'copied' ? 'Copié !' : 'Copier' }}</span>
          </button>
        </div>
        <ul class="space-y-1">
          <li
            v-for="(item, idx) in checkedItems"
            :key="item.key"
            class="text-sm text-stone-700 dark:text-stone-300"
          >
            <span class="font-mono text-stone-400 mr-2">{{ idx + 1 }}.</span>
            <span v-if="item.time" class="mr-1 font-mono text-stone-500">{{ formatTime(item.time) }}</span>
            <span class="mr-1">{{ item.emoji }}</span>
            {{ item.title.trim() }}
            <span v-if="item.referents.trim()" class="ml-1 text-stone-400 dark:text-stone-500 italic">({{ item.referents.trim() }})</span>
          </li>
        </ul>
      </section>

      <!-- Send button + status -->
      <div class="flex flex-col gap-3">
        <button
          @click="sendPoll"
          :disabled="sendState === 'loading'"
          class="w-full rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 text-sm transition-colors shadow"
        >
          <span v-if="sendState === 'loading'">⏳ Envoi en cours…</span>
          <span v-else>🗳️ Envoyer le sondage</span>
        </button>

        <div v-if="sendState === 'success'" class="rounded-xl bg-green-50 dark:bg-green-950 border border-green-300 dark:border-green-700 p-4 text-sm text-green-700 dark:text-green-300 text-center">
          ✅ Sondage envoyé avec succès !
        </div>

        <div v-if="sendState === 'error'" class="rounded-xl bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700 p-4 text-sm text-red-700 dark:text-red-300 text-center">
          ❌ {{ sendError }}
        </div>
      </div>

    </div>
  </div>
</template>
