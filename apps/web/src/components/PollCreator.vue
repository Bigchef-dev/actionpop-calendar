<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDarkMode } from '../composables/useDarkMode'
import { usePollEvents, type PollEvent } from '../composables/usePollEvents'
import { AGENDAS, POLL_BACKEND_URL } from '../config'
import type { AgendaConfig } from '../types'

const props = defineProps<{ chatId: string }>()

const { isDark, toggle } = useDarkMode()

// ------------------------------------------------------------
// Date selector
// ------------------------------------------------------------
function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

const selectedDateStr = ref<string>(todayStr())
const selectedDate = computed(() => new Date(selectedDateStr.value + 'T00:00:00'))

// ------------------------------------------------------------
// Agenda filter chips
// ------------------------------------------------------------
const activeAgendaIds = ref<Set<string>>(new Set(AGENDAS.map((a) => a.id)))

function toggleAgenda(id: string) {
  const next = new Set(activeAgendaIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  activeAgendaIds.value = next
}

const activeAgendas = computed<AgendaConfig[]>(() =>
  AGENDAS.filter((a) => activeAgendaIds.value.has(a.id)),
)

// ------------------------------------------------------------
// Fetch events
// ------------------------------------------------------------
const { events: calEvents, loading, error: fetchError, reload } = usePollEvents(selectedDate, activeAgendas)

// ------------------------------------------------------------
// Poll item list (editable)
// ------------------------------------------------------------
const EMOJIS = ['🚪', '🏫', '🚇', '🍒', '🪣', '⛺', '🇵🇸', '✊', '💡', '🍽️', '📢', '🔥', '🌟', '☀️', '🏠', '🚨', '📄']

interface PollItem {
  key: number
  checked: boolean
  emoji: string
  time: string
  title: string
  referents: string
  color: string
  showEmojiPicker: boolean
}

let keySeq = 0

function extractLeadingEmoji(text: string): { emoji: string; rest: string } {
  // Match a leading emoji (including multi-codepoint sequences like 🖌️)
  const match = text.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(\s*)/u)
  if (match) {
    return { emoji: match[1], rest: text.slice(match[0].length).trim() }
  }
  return { emoji: '📅', rest: text }
}

// Converts "HH:MM" (from <input type="time">) → "10h" or "10h30"
function formatTime(t: string): string {
  if (!t) return ''
  const [hh, mm] = t.split(':')
  const h = parseInt(hh, 10)
  const m = parseInt(mm, 10)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

// Extract names from description lines containing "responsable" or "référent"
function extractReferents(description: string): string {
  const names: string[] = []
  for (const line of description.split(/\n|\\n/)) {
    if (/responsable|référent/i.test(line)) {
      // grab the part after ":" if present, otherwise the whole line minus the keyword
      const afterColon = line.includes(':') ? line.split(':').slice(1).join(':').trim() : ''
      const value = afterColon || line.replace(/responsable|référent[s]?/gi, '').replace(/[:\-–]/g, '').trim()
      if (value) names.push(value)
    }
  }
  return names.join(', ')
}

function eventToItem(e: PollEvent): PollItem {
  const d = e.startDate
  const time = d
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : ''
  const { emoji, rest } = extractLeadingEmoji(e.title)
  return {
    key: keySeq++,
    checked: true,
    emoji,
    time,
    title: rest,
    referents: extractReferents(e.description),
    color: e.color,
    showEmojiPicker: false,
  }
}

const CANNOT_ATTEND: PollItem = {
  key: keySeq++,
  checked: true,
  emoji: '❌',
  time: '',
  title: 'Je ne peux pas',
  referents: '',
  color: '',
  showEmojiPicker: false,
}

const items = ref<PollItem[]>([CANNOT_ATTEND])

// Sync items when calEvents changes — keep manually-added items (key >= auto threshold)
let autoKeys = new Set<number>()
watch(calEvents, (newEvents) => {
  const manual = items.value.filter((i) => !autoKeys.has(i.key))
  const auto = newEvents.map((e) => eventToItem(e))
  autoKeys = new Set(auto.map((i) => i.key))
  items.value = [...auto, ...manual]
})

function addItem() {
  // Insérer avant la fin
  const newItem: PollItem = {
    key: keySeq++,
    checked: true,
    emoji: '📅',
    time: '',
    title: '',
    referents: '',
    color: '',
    showEmojiPicker: false,
  }
  items.value.splice(items.value.length - 1, 0, newItem)
}

function removeItem(key: number) {
  items.value = items.value.filter((i) => i.key !== key)
  autoKeys.delete(key)
}

// ------------------------------------------------------------
// Drag-and-drop reorder
// ------------------------------------------------------------
const draggingKey = ref<number | null>(null)
const dragOverKey = ref<number | null>(null)

function onDragStart(e: DragEvent, key: number) {
  draggingKey.value = key
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(key))
  }
}

function onDragOver(e: DragEvent, key: number) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverKey.value = key
}

function onDrop(key: number) {
  if (draggingKey.value === null || draggingKey.value === key) return
  const arr = [...items.value]
  const from = arr.findIndex((i) => i.key === draggingKey.value)
  const to = arr.findIndex((i) => i.key === key)
  if (from === -1 || to === -1) return
  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  items.value = arr
  draggingKey.value = null
  dragOverKey.value = null
}

function onDragEnd() {
  draggingKey.value = null
  dragOverKey.value = null
}

function pickEmoji(item: PollItem, emoji: string) {
  item.emoji = emoji
  item.showEmojiPicker = false
}

function closeAllEmojiPickers(exceptKey?: number) {
  for (const i of items.value) {
    if (i.key !== exceptKey) i.showEmojiPicker = false
  }
}

function toggleEmojiPicker(item: PollItem) {
  const wasOpen = item.showEmojiPicker
  closeAllEmojiPickers(item.key)
  item.showEmojiPicker = !wasOpen
}

// ------------------------------------------------------------
// Question field
// ------------------------------------------------------------
const question = ref<string>('')
watch(selectedDateStr, (d) => {
  const [y, m, day] = d.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(day))
  const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const labelCap = label.charAt(0).toUpperCase() + label.slice(1)
  question.value = `📅 Actions - ${labelCap}`
}, { immediate: true })

// ------------------------------------------------------------
// Send poll
// ------------------------------------------------------------
const sendState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const sendError = ref<string>('')

// ------------------------------------------------------------
// Clipboard copy
// ------------------------------------------------------------
const copyState = ref<'idle' | 'copied'>('idle')

async function copyPreview() {
  const checkedItems = items.value.filter((i) => i.checked && i.title.trim())
  const lines = [
    question.value.trim(),
    '',
    ...checkedItems.map((i) => {
      const parts: string[] = []
      parts.push(i.emoji)
      if (i.time) parts.push(formatTime(i.time))
      parts.push(i.title.trim())
      if (i.referents.trim()) parts.push(`(${i.referents.trim()})`)
      return parts.join(' ')
    }),
  ]
  await navigator.clipboard.writeText(lines.join('\n'))
  copyState.value = 'copied'
  setTimeout(() => (copyState.value = 'idle'), 2000)
}

async function sendPoll() {
  const checkedItems = items.value.filter((i) => i.checked && i.title.trim())
  if (checkedItems.length < 2) {
    sendError.value = 'Sélectionnez au moins 2 éléments à inclure dans le sondage.'
    sendState.value = 'error'
    return
  }
  if (!question.value.trim()) {
    sendError.value = 'La question est obligatoire.'
    sendState.value = 'error'
    return
  }

  const options = checkedItems.map((i) => {
    const parts: string[] = []
    if (i.emoji) parts.push(i.emoji)
    if (i.time) parts.push(formatTime(i.time))
    parts.push(i.title.trim())
    if (i.referents.trim()) parts.push(`(${i.referents.trim()})`)
    return parts.join(' ')
    return parts.join(' ')
  })

  sendState.value = 'loading'
  sendError.value = ''
  try {
    const res = await fetch(`${POLL_BACKEND_URL}/send-poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: props.chatId,
        question: question.value.trim(),
        options,
        isAnonymous: false,
        allowsMultipleAnswers: true,
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      sendError.value = data.error ?? 'Erreur Telegram inconnue'
      sendState.value = 'error'
    } else {
      sendState.value = 'success'
    }
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Erreur réseau'
    sendState.value = 'error'
  }
}
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

        <!-- No events -->
        <div v-else-if="!loading && items.filter(i => autoKeys.has(i.key)).length === 0 && items.length === 0" class="text-sm text-stone-400 dark:text-stone-500 text-center py-6">
          Aucun événement trouvé pour cette journée. Ajoutez-en manuellement ci-dessous.
        </div>

        <!-- Items -->
        <div v-else class="space-y-2">
          <div
            v-for="item in items"
            :key="item.key"
            draggable="true"
            @dragstart="onDragStart($event, item.key)"
            @dragover="onDragOver($event, item.key)"
            @drop="onDrop(item.key)"
            @dragend="onDragEnd"
            class="flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors"
            :class="[
              item.checked
                ? 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700'
                : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-800 opacity-60',
              dragOverKey === item.key && draggingKey !== item.key
                ? 'border-violet-400 dark:border-violet-500 ring-1 ring-violet-300'
                : '',
              draggingKey === item.key ? 'opacity-40' : ''
            ]"
          >
            <!-- Drag handle -->
            <span
              class="shrink-0 cursor-grab active:cursor-grabbing text-stone-300 dark:text-stone-600 select-none text-base leading-none"
              title="Réordonner"
            >⠇</span>

            <!-- Checkbox -->
            <input
              type="checkbox"
              v-model="item.checked"
              class="accent-violet-600 w-4 h-4 shrink-0 cursor-pointer"
              @dragstart.prevent
            />

            <!-- Emoji picker trigger -->
            <div class="relative shrink-0">
              <button
                @click="toggleEmojiPicker(item)"
                class="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 flex items-center justify-center text-lg transition-colors"
                title="Choisir un emoji"
              >{{ item.emoji }}</button>

              <!-- Emoji popover -->
              <div
                v-if="item.showEmojiPicker"
                class="absolute z-50 top-10 left-0 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1 w-44"
              >
                <button
                  v-for="e in EMOJIS"
                  :key="e"
                  @click="pickEmoji(item, e)"
                  class="w-7 h-7 flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-stone-700 text-base transition-colors"
                >{{ e }}</button>
              </div>
            </div>

            <!-- Time input -->
            <input
              v-model="item.time"
              type="time"
              class="w-24 shrink-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-700 dark:text-stone-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
            />

            <!-- Title input -->
            <input
              v-model="item.title"
              type="text"
              maxlength="100"
              class="flex-1 min-w-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-800 dark:text-stone-100 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
              placeholder="Titre de l'événement"
            />

            <!-- Referents input -->
            <input
              v-model="item.referents"
              type="text"
              class="w-36 shrink-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 italic"
              placeholder="Responsables…"
            />

            <!-- Agenda dot -->
            <span
              v-if="autoKeys.has(item.key) && item.color"
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: item.color }"
              :title="'Source CalDAV'"
            />

            <!-- Remove button -->
            <button
              @click="removeItem(item.key)"
              class="shrink-0 text-stone-300 dark:text-stone-600 hover:text-red-400 dark:hover:text-red-400 text-lg leading-none transition-colors"
              title="Supprimer"
            >×</button>
          </div>
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
      <section v-if="items.filter(i => i.checked && i.title.trim()).length > 0" class="mb-6">
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
            v-for="(item, idx) in items.filter(i => i.checked && i.title.trim())"
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
