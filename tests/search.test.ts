import { describe, expect, it } from 'vitest';

import { parseScss } from '../src/parsers';
import { fuzzyScore } from '../src/search/fuzzyMatcher';
import { normalizeQuery, scoreEntry, TIER } from '../src/search/ranking';
import { searchSelectors } from '../src/search/selectorSearch';
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions, type SelectorEntry } from '../src/types/selector';

function entriesFrom(files: Record<string, string>): SelectorEntry[] {
  return Object.entries(files).flatMap(([path, source]) => parseScss(path, source).entries);
}

const PROJECT = entriesFrom({
  '/p/_tree.scss': `.org-tree {
  &__header { height: 40px; }
  &__controls {
    display: flex;
    &-button {
      cursor: pointer;
      &:hover { color: red; }
    }
  }
}`,
  '/p/UserPanel.scss': `.user-panel {
  &__controls { display: grid; }
}`,
  '/p/_table.scss': `.table {
  &__header {
    &__controls { display: block; }
  }
}`,
});

function search(query: string, overrides: Partial<SearchOptions> = {}): string[] {
  return searchSelectors(PROJECT, query, { ...DEFAULT_SEARCH_OPTIONS, ...overrides }).map(
    (result) => result.entry.selector,
  );
}

describe('exact and normalized search', () => {
  it('finds a full selector typed with the leading dot', () => {
    expect(search('.org-tree__controls')[0]).toBe('.org-tree__controls');
  });

  it('treats the leading dot as optional', () => {
    expect(search('org-tree__controls')[0]).toBe('.org-tree__controls');
  });

  it('is case insensitive but preserves the original casing', () => {
    expect(search('ORG-TREE__CONTROLS')[0]).toBe('.org-tree__controls');
  });

  it('ranks the exact hit above its own longer descendants', () => {
    const results = search('org-tree__controls');

    expect(results[0]).toBe('.org-tree__controls');
    expect(results).toContain('.org-tree__controls-button');
  });
});

describe('partial and BEM suffix search', () => {
  it('finds every __controls across files regardless of nesting depth', () => {
    const results = search('__controls');

    // Suffix matches rank first, but the deeper `-button` hit is never dropped.
    expect(results.slice(0, 3).sort()).toEqual([
      '.org-tree__controls',
      '.table__header__controls',
      '.user-panel__controls',
    ]);
    expect(results).toContain('.org-tree__controls-button');
    expect(results).toHaveLength(4);
  });

  it('finds a selector by a mid-word fragment', () => {
    expect(search('controls-button')).toContain('.org-tree__controls-button');
  });

  it('finds a selector by a cut-off fragment spanning a BEM boundary', () => {
    expect(search('tree__cont')[0]).toBe('.org-tree__controls');
  });

  it('matches a shared fragment in several files', () => {
    const results = search('header');

    expect(results.slice(0, 2).sort()).toEqual(['.org-tree__header', '.table__header']);
    expect(results).toContain('.table__header__controls');
  });
});

describe('fuzzy search', () => {
  it('matches abbreviated multi-token queries', () => {
    expect(search('org ctrl')[0]).toBe('.org-tree__controls');
  });

  it('can be switched off', () => {
    expect(search('org ctrl', { enableFuzzySearch: false })).toEqual([]);
  });

  it('prefers matches that start on segment boundaries', () => {
    const boundary = fuzzyScore('ctrl', 'card-controls');
    const scattered = fuzzyScore('ctrl', 'contact-replace');

    expect(boundary).toBeDefined();
    expect(scattered).toBeDefined();
    expect(boundary!).toBeGreaterThan(scattered!);
  });

  it('returns undefined when the query is not a subsequence', () => {
    expect(fuzzyScore('zzz', 'org-tree')).toBeUndefined();
  });
});

describe('ranking', () => {
  const base: SelectorEntry = {
    selector: '.org-tree__controls',
    sourceSelector: '&__controls',
    filePath: '/p/_tree.scss',
    line: 3,
    column: 3,
    length: 11,
    preview: '&__controls {',
    hasPseudo: false,
    hasInterpolation: false,
  };

  it('orders the tiers exact > normalized > suffix > segment > prefix > substring', () => {
    const tierOf = (query: string) =>
      scoreEntry(base, normalizeQuery(query), { enableFuzzySearch: true })!;

    expect(tierOf('.org-tree__controls').kind).toBe('exact');
    expect(tierOf('org-tree__controls').kind).toBe('normalized-exact');
    expect(tierOf('__controls').kind).toBe('suffix');
    expect(tierOf('tree__cont').kind).toBe('segment');
    expect(tierOf('org-tree').kind).toBe('prefix');
    expect(tierOf('ree__c').kind).toBe('substring');
    expect(tierOf('ogtc').kind).toBe('fuzzy');

    expect(TIER.exact).toBeGreaterThan(TIER.normalizedExact);
    expect(TIER.normalizedExact).toBeGreaterThan(TIER.suffix);
    expect(TIER.suffix).toBeGreaterThan(TIER.segment);
    expect(TIER.segment).toBeGreaterThan(TIER.prefix);
    expect(TIER.prefix).toBeGreaterThan(TIER.substring);
    expect(TIER.substring).toBeGreaterThan(TIER.fuzzyMax);
  });

  it('boosts results living in the active file', () => {
    const inactive = scoreEntry(base, normalizeQuery('__controls'), { enableFuzzySearch: true })!;
    const active = scoreEntry(base, normalizeQuery('__controls'), {
      enableFuzzySearch: true,
      activeFilePath: '/p/_tree.scss',
    })!;

    expect(active.score).toBeGreaterThan(inactive.score);
  });

  it('puts the active file first without dropping the others', () => {
    const results = search('__controls', {
      prioritizeActiveFile: true,
      activeFilePath: '/p/UserPanel.scss',
    });

    expect(results[0]).toBe('.user-panel__controls');
    expect(results).toHaveLength(4);
  });

  it('prefers the shorter selector on equal tiers', () => {
    const results = search('__header');

    expect(results[0]).toBe('.table__header');
    expect(results[1]).toBe('.org-tree__header');
  });

  it('is deterministic across repeated runs', () => {
    expect(search('controls')).toEqual(search('controls'));
  });
});

describe('result set behaviour', () => {
  it('keeps duplicate selectors declared in different files', () => {
    const entries = entriesFrom({
      '/p/a.scss': '.dup { color: red; }',
      '/p/b.scss': '.dup { color: blue; }',
    });
    const results = searchSelectors(entries, '.dup', DEFAULT_SEARCH_OPTIONS);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.entry.filePath).sort()).toEqual(['/p/a.scss', '/p/b.scss']);
  });

  it('hides pseudo-class entries unless explicitly enabled', () => {
    expect(search('hover')).toEqual([]);
    expect(search('hover', { includePseudoClasses: true })).toEqual([
      '.org-tree__controls-button:hover',
    ]);
  });

  it('honours maxResults', () => {
    expect(search('o', { maxResults: 2 })).toHaveLength(2);
  });

  it('lists the index alphabetically for an empty query', () => {
    const results = search('');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toBe('.table');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(search('zzzzqqq')).toEqual([]);
  });
});
