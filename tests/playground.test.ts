import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { isSupportedFile, parseFile } from '../src/parsers';
import { searchSelectors } from '../src/search/selectorSearch';
import {
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
  type SelectorEntry,
} from '../src/types/selector';

/**
 * Runs the real parsers over `examples/playground`.
 *
 * The playground README makes concrete promises to whoever is trying the
 * extension ("search X, get Y"). This test is what keeps those promises
 * honest: if the parser regresses, the documentation fails with it.
 */
const ROOT = 'examples/playground';

let entries: SelectorEntry[];
let files: string[];
let parseErrors: number;

function collectFiles(dir: string, found: string[] = []): string[] {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      collectFiles(full, found);
    } else if (isSupportedFile(full)) {
      found.push(full);
    }
  }
  return found;
}

/** Normalises Windows separators so assertions read the same everywhere. */
function at(entry: SelectorEntry): string {
  const relative = path.relative(ROOT, entry.filePath).split(path.sep).join('/');
  return `${relative}:${entry.line}:${entry.column}`;
}

function find(query: string, overrides: Partial<SearchOptions> = {}) {
  return searchSelectors(entries, query, { ...DEFAULT_SEARCH_OPTIONS, ...overrides });
}

function selectors(query: string, overrides: Partial<SearchOptions> = {}): string[] {
  return find(query, overrides).map((result) => result.entry.selector);
}

beforeAll(() => {
  files = collectFiles(ROOT).sort();
  entries = [];
  parseErrors = 0;
  for (const file of files) {
    const result = parseFile(file, fs.readFileSync(file, 'utf8'));
    entries.push(...result.entries);
    parseErrors += result.errors.length;
  }
});

describe('playground index health', () => {
  it('matches the numbers printed by Show Index Status', () => {
    expect(files).toHaveLength(7);
    expect(entries).toHaveLength(53);
    expect(parseErrors).toBe(0);
  });
});

describe('playground acceptance cases', () => {
  it('Case A — org-tree__controls resolves to &__controls', () => {
    const [first] = find('org-tree__controls');

    expect(first.entry.selector).toBe('.org-tree__controls');
    expect(first.entry.sourceSelector).toBe('&__controls');
    expect(at(first.entry)).toBe('src/styles/components/_tree.scss:11:3');
  });

  it('Case B — __controls spans three different files', () => {
    const top = find('__controls').slice(0, 3);

    expect(top.map((result) => result.entry.selector).sort()).toEqual([
      '.org-tree__controls',
      '.table__header__controls',
      '.user-panel__controls',
    ]);
    expect(new Set(top.map((result) => result.entry.filePath)).size).toBe(3);
    // The deeper `-button` hit is ranked lower, never dropped.
    expect(selectors('__controls')).toContain('.org-tree__controls-button');
  });

  it('Case C — controls-button resolves to &-button, not to a parent', () => {
    const [first] = find('controls-button');

    expect(first.entry.selector).toBe('.org-tree__controls-button');
    expect(first.entry.sourceSelector).toBe('&-button');
    expect(at(first.entry)).toBe('src/styles/components/_tree.scss:14:5');
  });

  it('Case D — the fuzzy query "org ctrl" finds the controls block', () => {
    const [first] = find('org ctrl');

    expect(first.kind).toBe('fuzzy');
    expect(first.entry.selector).toBe('.org-tree__controls');
  });

  it('Case E — a DevTools paste is an exact match', () => {
    expect(find('.org-tree__controls')[0].kind).toBe('exact');
  });
});

describe('playground edge cases', () => {
  it('keeps descendants separated by a space', () => {
    expect(selectors('container')).toContain('.container .button');
    expect(selectors('container')).not.toContain('.container.button');
  });

  it('gives each selector of a list its own position', () => {
    expect(at(find('card__title')[0].entry)).toBe('src/styles/_edge-cases.scss:31:3');
    expect(at(find('card__subtitle')[0].entry)).toBe('src/styles/_edge-cases.scss:32:3');
  });

  it('expands a parent list into the full cartesian product', () => {
    for (const selector of ['.alpha__x', '.beta__x', '.alpha__y', '.beta__y']) {
      expect(selectors(selector)).toContain(selector);
    }
  });

  it('does not split an attribute selector on its inner comma', () => {
    expect(selectors('input')).toContain('.input[data-kind="a,b"]');
  });

  it('replaces every & occurrence', () => {
    const found = selectors('theme-dark');

    expect(found).toContain('.page .theme-dark');
    expect(found).toContain('.theme-dark + .theme-dark');
  });

  it('treats @media and @supports as transparent', () => {
    expect(selectors('panel__body')).toContain('.panel__body');
    expect(selectors('panel__grid')).toContain('.panel__grid');
  });

  it('resolves @at-root against the document root', () => {
    expect(selectors('escaped')).toContain('.escaped');
    expect(selectors('escaped')).not.toContain('.wrapper .escaped');
  });

  it('never indexes @keyframes steps', () => {
    expect(selectors('spin')).toEqual([]);
    expect(entries.map((entry) => entry.selector)).not.toContain('0%');
  });

  it('skips & inside a @mixin but keeps literal selectors', () => {
    expect(selectors('shadow')).toEqual([]);
    expect(selectors('plain-inside-mixin')).toContain('.plain-inside-mixin');
  });

  it('keeps interpolation literal and still findable', () => {
    expect(selectors('-button')).toContain('.#{$prefix}-button');
    expect(selectors('-button')).toContain('.#{$prefix}-button__icon');
  });

  it('hides pseudo-classes by default and reveals them on demand', () => {
    expect(selectors('hover')).toEqual([]);
    expect(selectors('hover', { includePseudoClasses: true })).toContain('.button:hover');
  });
});

describe('playground Vue handling', () => {
  it('indexes both style blocks of a single component', () => {
    const widgets = find('card-widget').map((result) => at(result.entry));

    expect(widgets).toContain('src/components/Card.vue:9:1');
    expect(widgets).toContain('src/components/Card.vue:19:1');
    expect(selectors('card-widget')).toEqual(
      expect.arrayContaining(['.card-widget__title', '.card-widget__footer']),
    );
  });

  it('indexes a <style src> target once, at its origin', () => {
    const results = find('external-block__label');

    expect(results).toHaveLength(1);
    expect(at(results[0].entry)).toBe('src/components/external-block.scss:4:3');
    expect(entries.filter((entry) => entry.filePath.endsWith('ExternalStyles.vue'))).toEqual([]);
  });

  it('points scoped SCSS at the real line of the .vue file', () => {
    expect(at(find('user-panel__controls')[0].entry)).toBe('src/components/UserPanel.vue:18:3');
  });
});
