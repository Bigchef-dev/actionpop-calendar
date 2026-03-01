<script setup lang="ts">
defineProps<{ isDark: boolean }>()
const emit = defineEmits<{ (e: 'toggle-dark'): void }>()
</script>

<template>
  <header class="flex flex-col md:flex-row justify-between items-end mb-6 gap-6">
    <div>
      <h1 class="text-3xl md:text-5xl font-black text-[#4A235A] dark:text-[#e7d9ec] uppercase tracking-tighter leading-none">
        FAIRE MIEUX <span class="text-[#F97316]">RENNES</span>
      </h1>
      <p class="text-stone-500 dark:text-stone-400 font-bold text-sm uppercase tracking-widest mt-2">
        Agenda des actions militantes
      </p>
    </div>
    <div class="flex items-center gap-3">
      <!-- Dark mode toggle -->
      <button
        class="w-9 h-9 flex items-center justify-center rounded-full border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
        :title="isDark ? 'Passer en mode clair' : 'Passer en mode sombre'"
        @click="emit('toggle-dark')"
      >
        <svg v-if="isDark" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>
      <!-- Live badge -->
      <div class="flex items-center gap-3 bg-white dark:bg-stone-800 px-5 py-2 rounded-full shadow-sm border border-stone-200 dark:border-stone-700">
        <span class="relative flex h-3 w-3">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9750A4] opacity-75"></span>
          <span class="relative inline-flex rounded-full h-3 w-3 bg-[#9750A4]"></span>
        </span>
        <span class="text-xs font-black text-[#4A235A] dark:text-[#e7d9ec] uppercase tracking-wider">Campagne en cours</span>
      </div>
    </div>
  </header>
</template>
