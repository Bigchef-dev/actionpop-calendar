<script setup lang="ts">
import { type PollItem, EMOJIS } from '../utils/poll.utils'

const props = defineProps<{
  item: PollItem
  isAuto: boolean
  isDragging: boolean
  isDragOver: boolean
  isTouchDragging: boolean
}>()

const emit = defineEmits<{
  (e: 'remove'): void
  (e: 'drag-start', ev: DragEvent): void
  (e: 'drag-over', ev: DragEvent): void
  (e: 'drop'): void
  (e: 'drag-end'): void
  (e: 'handle-touch-start', ev: TouchEvent): void
  (e: 'handle-touch-move', ev: TouchEvent): void
  (e: 'handle-touch-end'): void
  (e: 'toggle-emoji'): void
  (e: 'pick-emoji', emoji: string): void
}>()
</script>

<template>
  <div
    :data-item-key="item.key"
    draggable="true"
    @dragstart="emit('drag-start', $event)"
    @dragover="emit('drag-over', $event)"
    @drop="emit('drop')"
    @dragend="emit('drag-end')"
    class="flex flex-col gap-1.5 rounded-xl border px-3 py-2 transition-colors"
    :class="[
      item.checked
        ? 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700'
        : 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-800 opacity-60',
      isDragOver && !isDragging ? 'border-violet-400 dark:border-violet-500 ring-1 ring-violet-300' : '',
      isDragging ? 'opacity-40' : '',
      isTouchDragging ? 'touch-none' : '',
    ]"
  >
    <!-- Ligne 1 : drag + checkbox + emoji + titre + dot + supprimer -->
    <div class="flex items-center gap-2">
      <span
        class="shrink-0 cursor-grab active:cursor-grabbing text-stone-300 dark:text-stone-600 select-none text-base leading-none touch-none"
        title="Maintenir pour réordonner"
        @touchstart="emit('handle-touch-start', $event)"
        @touchmove="emit('handle-touch-move', $event)"
        @touchend="emit('handle-touch-end')"
      >⠇</span>

      <input
        type="checkbox"
        v-model="item.checked"
        class="accent-violet-600 w-4 h-4 shrink-0 cursor-pointer"
        @dragstart.prevent
      />

      <div class="relative shrink-0">
        <button
          @click="emit('toggle-emoji')"
          class="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 flex items-center justify-center text-lg transition-colors"
          title="Choisir un emoji"
        >{{ item.emoji }}</button>

        <div
          v-if="item.showEmojiPicker"
          class="absolute z-50 top-10 left-0 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-xl shadow-xl p-2 grid grid-cols-5 gap-1 w-44"
        >
          <button
            v-for="e in EMOJIS"
            :key="e"
            @click="emit('pick-emoji', e)"
            class="w-7 h-7 flex items-center justify-center rounded hover:bg-stone-100 dark:hover:bg-stone-700 text-base transition-colors"
          >{{ e }}</button>
        </div>
      </div>

      <input
        v-model="item.title"
        type="text"
        maxlength="100"
        class="flex-1 min-w-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-800 dark:text-stone-100 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
        placeholder="Titre de l'événement"
      />

      <span
        v-if="isAuto && item.color"
        class="w-2 h-2 rounded-full shrink-0"
        :style="{ backgroundColor: item.color }"
        title="Source CalDAV"
      />

      <button
        @click="emit('remove')"
        class="shrink-0 text-stone-300 dark:text-stone-600 hover:text-red-400 dark:hover:text-red-400 text-lg leading-none transition-colors"
        title="Supprimer"
      >×</button>
    </div>

    <!-- Ligne 2 : heure début - heure fin + référents -->
    <div class="flex items-center gap-2 pl-8">
      <input
        v-model="item.time"
        type="time"
        class="w-28 shrink-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-700 dark:text-stone-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
        title="Heure de début"
      />
      <span class="text-stone-400 dark:text-stone-500 text-xs shrink-0">-</span>
      <input
        v-model="item.endTime"
        type="time"
        class="w-28 shrink-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-700 dark:text-stone-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
        title="Heure de fin"
      />
      <input
        v-model="item.referents"
        type="text"
        class="flex-1 min-w-0 rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 italic"
        placeholder="Référents…"
      />
    </div>
  </div>
</template>
