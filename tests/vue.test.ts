import { describe, expect, it } from 'vitest';

import { parseVue } from '../src/parsers';
import { describeEntries, findEntry, selectorsOf } from './helpers';

const SFC = `<template>
  <div class="org-tree">
    <div class="org-tree__controls" />
  </div>
</template>

<script setup lang="ts">
const x = 1;
</script>

<style scoped lang="scss">
.org-tree {
  &__controls {
    display: flex;
  }
}
</style>
`;

describe('Vue SFC style extraction', () => {
  it('reconstructs nested selectors with file-relative positions', () => {
    const { entries, errors } = parseVue('/p/Tree.vue', SFC);

    expect(errors).toEqual([]);
    expect(describeEntries(entries)).toEqual(['.org-tree @ 12:1', '.org-tree__controls @ 13:3']);
  });

  it('points the preview at the real line of the .vue file', () => {
    const { entries } = parseVue('/p/Tree.vue', SFC);
    const controls = findEntry(entries, '.org-tree__controls');
    const line = SFC.split('\n')[controls!.line - 1];

    expect(line.trim()).toBe('&__controls {');
    expect(controls?.preview).toBe('&__controls {');
  });

  it('indexes multiple style blocks independently', () => {
    const source = `<template><div /></template>

<style lang="scss">
.global { &__a { color: red; } }
</style>

<style scoped lang="scss">
.local { &__b { color: red; } }
</style>
`;

    expect(describeEntries(parseVue('/p/Multi.vue', source).entries)).toEqual([
      '.global @ 4:1',
      '.global__a @ 4:11',
      '.local @ 8:1',
      '.local__b @ 8:10',
    ]);
  });

  it('reports a <style src> target instead of duplicating its selectors', () => {
    const source = `<template><div /></template>

<style src="./styles.scss" lang="scss"></style>
`;
    const result = parseVue('/p/Ext.vue', source);

    expect(result.entries).toEqual([]);
    expect(result.externalStyles).toEqual(['./styles.scss']);
  });

  it('handles a plain <style> block with no lang attribute', () => {
    const source = `<template><div /></template>

<style>
.plain { color: red; }
</style>
`;

    expect(selectorsOf(parseVue('/p/Plain.vue', source).entries)).toEqual(['.plain']);
  });

  it('skips unsupported style languages with an explicit error', () => {
    const source = `<template><div /></template>

<style lang="stylus">
.a
  color red
</style>
`;
    const result = parseVue('/p/Styl.vue', source);

    expect(result.entries).toEqual([]);
    expect(result.errors[0].message).toMatch(/stylus/);
  });

  it('survives a broken style block without losing the other one', () => {
    const source = `<template><div /></template>

<style lang="scss">
.ok { color: red; }
</style>

<style lang="scss">
.broken { color: red;
</style>
`;
    const result = parseVue('/p/Half.vue', source);

    expect(selectorsOf(result.entries)).toEqual(['.ok']);
    expect(result.errors).toHaveLength(1);
  });
});
