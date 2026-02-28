<script setup lang="ts">
import type { AgendaConfig } from '../types'
import { NEXTCLOUD_BASE } from '../config'

defineProps<{ agendas: AgendaConfig[] }>()

function rawLink(id: string): string {
  return `${NEXTCLOUD_BASE}/${id}?export`
}

function appleLink(id: string): string {
  return rawLink(id).replace('https://', 'webcal://')
}

function googleLink(id: string): string {
  return `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(rawLink(id))}`
}

function copyLink(id: string): void {
  navigator.clipboard
    .writeText(rawLink(id))
    .then(() => alert('Lien copié ! Collez-le dans Outlook ou autre client CalDAV.'))
    .catch(() => alert('Impossible de copier automatiquement. Lien : ' + rawLink(id)))
}
</script>

<template>
  <div class="mt-16">
    <h3 class="text-2xl font-black text-[#4A235A] dark:text-[#e7d9ec] uppercase tracking-tight mb-6 text-center md:text-left">
      S'abonner aux agendas
    </h3>
    <p class="text-stone-500 dark:text-stone-400 mb-8 text-center md:text-left">
      Cliquez sur les boutons ci-dessous pour ajouter l'intégralité d'un agenda à votre téléphone.
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="agenda in agendas"
        :key="agenda.id"
        class="bg-white dark:bg-stone-900 p-6 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-sm hover:shadow-md transition flex flex-col h-full"
      >
        <div class="flex items-center gap-3 mb-4">
          <span class="w-4 h-4 rounded-full flex-shrink-0" :style="{ backgroundColor: agenda.color }"></span>
          <h4 class="font-bold text-stone-800 dark:text-stone-100 text-lg uppercase leading-tight">{{ agenda.name }}</h4>
        </div>

        <div class="mt-auto grid grid-cols-1 gap-2">
          <a
            :href="googleLink(agenda.id)"
            target="_blank"
            class="flex items-center justify-center gap-2 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-stone-50 dark:hover:bg-stone-700 transition group"
          >
            <svg class="w-4 h-4 text-stone-500 group-hover:text-[#4285F4] transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 2C7 2 2.5 6.5 2.5 12C2.5 17.5 7 22 12.5 22C18 22 22.5 17.5 22.5 12C22.5 6.5 18 2 12.5 2ZM12.5 20C8.1 20 4.5 16.4 4.5 12C4.5 7.6 8.1 4 12.5 4C16.9 4 20.5 7.6 20.5 12C20.5 16.4 16.9 20 12.5 20ZM16.5 13H13.5V16H11.5V13H8.5V11H11.5V8H13.5V11H16.5V13Z" />
            </svg>
            Google Agenda
          </a>

          <a
            :href="appleLink(agenda.id)"
            class="flex items-center justify-center gap-2 bg-stone-100 dark:bg-stone-700 text-stone-800 dark:text-stone-200 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-stone-200 dark:hover:bg-stone-600 transition"
          >
            🍏 iPhone / Mac
          </a>

          <button
            class="flex items-center justify-center gap-2 bg-stone-100 dark:bg-stone-700 text-stone-800 dark:text-stone-200 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-stone-200 dark:hover:bg-stone-600 transition"
            @click="copyLink(agenda.id)"
          >
            📋 Copier lien
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
