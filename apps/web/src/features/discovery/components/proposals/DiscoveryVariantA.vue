<template>
  <section class="flex flex-col items-center pt-6 text-center sm:pt-16">
    <span class="text-6xl" role="img" aria-label="Tortue de la campagne">
      <img src="/tortue-hourra.png" alt="Tortue de la campagne" height="96" width="96">
    </span>
    <h1 class="mt-5 text-3xl font-bold leading-tight sm:text-4xl">
      Toutes les actions près de chez toi,
      <span class="ap-primary-text">dans ton agenda.</span>
    </h1>
    <p class="mt-3 max-w-xl text-sm opacity-80">
      Cherche ta ville, ton département ou ton groupe d'action. Tu repars avec un calendrier qui se
      met à jour tout seul. Aucun compte, aucune installation.
    </p>
    <div class="mt-6 w-full max-w-xl">
      <slot />
    </div>
  </section>
</template>
