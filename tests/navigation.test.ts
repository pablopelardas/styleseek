import { describe, expect, it } from 'vitest';

import { parseScss, parseVue } from '../src/parsers';
import { searchSelectors } from '../src/search/selectorSearch';
import { DEFAULT_SEARCH_OPTIONS, type SelectorEntry } from '../src/types/selector';
import { cleanSelection, extractSelectorToken } from '../src/util/selectorToken';
import { TREE_SCSS } from './helpers';

/** Slices the file exactly the way `revealEntry` builds its editor range. */
function tokenAt(fileText: string, entry: SelectorEntry): string {
  const line = fileText.split('\n')[entry.line - 1];
  return line.slice(entry.column - 1, entry.column - 1 + entry.length);
}

function topHit(fileText: string, query: string, parse = parseScss): SelectorEntry {
  const { entries } = parse('/p/_tree.scss', fileText);
  const results = searchSelectors(entries, query, DEFAULT_SEARCH_OPTIONS);
  expect(results.length).toBeGreaterThan(0);
  return results[0].entry;
}

describe('navigation targets (acceptance criteria)', () => {
  it('Case A: org-tree__controls lands on &__controls', () => {
    const entry = topHit(TREE_SCSS, 'org-tree__controls');

    expect(entry.selector).toBe('.org-tree__controls');
    expect(tokenAt(TREE_SCSS, entry)).toBe('&__controls');
    expect(entry.line).toBe(6);
  });

  it('Case C: controls-button lands on &-button, not on its parents', () => {
    const entry = topHit(TREE_SCSS, 'controls-button');

    expect(entry.selector).toBe('.org-tree__controls-button');
    expect(tokenAt(TREE_SCSS, entry)).toBe('&-button');
    expect(entry.line).toBe(9);
  });

  it('Case D: the fuzzy query "org ctrl" still lands on &__controls', () => {
    const entry = topHit(TREE_SCSS, 'org ctrl');

    expect(entry.selector).toBe('.org-tree__controls');
    expect(tokenAt(TREE_SCSS, entry)).toBe('&__controls');
  });

  it('Case E: a selector pasted from DevTools resolves to one declaration', () => {
    const { entries } = parseScss('/p/_tree.scss', TREE_SCSS);
    const results = searchSelectors(entries, '.org-tree__controls', DEFAULT_SEARCH_OPTIONS);

    expect(results[0].kind).toBe('exact');
    expect(tokenAt(TREE_SCSS, results[0].entry)).toBe('&__controls');
  });

  it('each selector of a list gets its own target', () => {
    const source = `.card {
  &__title,
  &__subtitle {
    color: white;
  }
}`;
    const { entries } = parseScss('/p/card.scss', source);

    expect(tokenAt(source, entries[1])).toBe('&__title');
    expect(tokenAt(source, entries[2])).toBe('&__subtitle');
  });

  it('targets inside a .vue file point at the SFC line, not the block line', () => {
    const sfc = `<template>
  <div class="panel" />
</template>

<style scoped lang="scss">
.panel {
  &__body {
    color: red;
  }
}
</style>
`;
    const entry = topHit(sfc, '__body', parseVue);

    expect(entry.line).toBe(7);
    expect(tokenAt(sfc, entry)).toBe('&__body');
  });
});

describe('token detection under the cursor', () => {
  const cases: Array<[string, string, number, string | undefined]> = [
    ['HTML class attribute', '<div class="org-tree__controls">', 20, 'org-tree__controls'],
    ['Vue binding', ':class="[\'card__title\', x]"', 16, 'card__title'],
    ['JSX className', '<div className="btn btn--primary" />', 25, 'btn--primary'],
    ['SCSS declaration', '.org-tree__header {', 5, '.org-tree__header'],
    ['id selector', '#main-nav {', 4, '#main-nav'],
    ['cursor on whitespace', '  <div />', 0, undefined],
  ];

  for (const [name, line, character, expected] of cases) {
    it(`extracts the full BEM token: ${name}`, () => {
      expect(extractSelectorToken(line, character)).toBe(expected);
    });
  }

  it('does not stop at a hyphen the way the default word definition does', () => {
    expect(extractSelectorToken('class="org-tree__controls-button"', 10)).toBe(
      'org-tree__controls-button',
    );
  });

  it('strips quotes from a manual selection', () => {
    expect(cleanSelection('  "card__title" ')).toBe('card__title');
    expect(cleanSelection('   ')).toBeUndefined();
  });
});
