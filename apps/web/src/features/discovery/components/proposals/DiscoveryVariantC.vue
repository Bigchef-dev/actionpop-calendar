<template>
  <section class="grid items-center gap-6 pt-6 sm:grid-cols-[1.1fr_0.9fr]">
    <div>
      <h1 class="text-3xl font-bold leading-tight">
        Mon agenda d'action,
        <span class="ap-primary-text">en trois gestes.</span>
      </h1>
      <ol class="mt-4 space-y-2 text-sm opacity-80">
        <li><strong>1.</strong> Je cherche ma ville ou mon groupe.</li>
        <li><strong>2.</strong> Je filtre les actions qui m'intéressent.</li>
        <li><strong>3.</strong> J'importe le calendrier dans mon application.</li>
      </ol>
      <div class="mt-5">
        <slot />
      </div>
    </div>
    <span class="hidden text-7xl sm:block" role="img" aria-label="Tortue de la campagne">🐢</span>
  </section>
</template>
