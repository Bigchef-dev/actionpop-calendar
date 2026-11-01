<template>
  <section class="pt-4">
    <div class="ap-surface rounded-3xl px-5 py-6 sm:px-8 sm:py-8">
      <p class="text-[11px] font-bold uppercase tracking-widest ap-secondary-text">
        Agenda des actions
      </p>
      <h1 class="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
        Trouve les actions qui te concernent.
      </h1>
      <p class="mt-2 text-sm opacity-80">
        Une ville, un département, un groupe : le calendrier suit ce que tu choisis.
      </p>
      <div class="mt-5">
        <slot />
      </div>
    </div>
  </section>
</template>
