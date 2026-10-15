<template>
  <div class="external-block">
    <span class="external-block__label">Styled from another file</span>
  </div>
</template>

<!--
  `src` styles are indexed from their origin file, NOT duplicated here.
  Searching `external-block__label` must land in external-block.scss.
-->
<style src="./external-block.scss" lang="scss"></style>
