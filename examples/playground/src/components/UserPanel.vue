<template>
  <div class="user-panel">
    <!-- Put the cursor on this class and hit Ctrl+Alt+S -->
    <header class="user-panel__controls">
      <button class="user-panel__controls-close">×</button>
    </header>
  </div>
</template>

<script setup lang="ts">
const title = 'User panel';
</script>

<style scoped lang="scss">
.user-panel {
  display: grid;

  &__controls {
    display: grid;

    &-close {
      cursor: pointer;
    }
  }
}
</style>
