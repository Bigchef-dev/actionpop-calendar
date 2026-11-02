<script setup lang="ts">
import AppHeader from './AppHeader.vue';

defineProps<{ onDiscovery?: boolean }>();
const emit = defineEmits<{ (event: 'home'): void }>();
</script>

<template>
  <div class="ap-page min-h-dvh">
    <div class="mx-auto w-full max-w-5xl px-3 sm:px-6">
      <AppHeader :on-discovery="onDiscovery" @home="emit('home')">
        <template #actions>
          <slot name="header-actions" />
        </template>
      </AppHeader>
      <main class="pb-10">
        <slot />
      </main>
      <footer
        class="mt-10 border-t py-6 text-center text-xs font-semibold uppercase tracking-widest opacity-60"
        :style="{ borderColor: 'var(--ap-border)' }"
      >
        Données issues de <a href="https://www.actionpopulaire.fr/" target="_blank" rel="noopener noreferrer" class="ap-primary-text">Action Populaire</a>
      </footer>
    </div>
  </div>
</template>
