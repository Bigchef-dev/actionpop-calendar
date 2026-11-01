<template>
  <article class="ap-surface rounded-none px-5 py-6 sm:rounded-3xl">
    <div class="border-l-4 pl-4" :style="{ borderColor: 'var(--ap-primary)' }">
      <slot />
    </div>
  </article>
</template>
