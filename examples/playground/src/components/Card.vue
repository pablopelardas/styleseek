<template>
  <article class="card-widget">
    <h2 class="card-widget__title">Title</h2>
  </article>
</template>

<!-- Two blocks in one file: both are indexed, with their own real line numbers. -->
<style lang="scss">
.card-widget {
  border: 1px solid;

  &__title {
    font-size: 1.2rem;
  }
}
</style>

<style scoped lang="scss">
.card-widget {
  &__footer {
    opacity: 0.6;
  }
}
</style>
