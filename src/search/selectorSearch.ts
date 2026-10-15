import type { SearchOptions, SearchResult, SelectorEntry } from '../types/selector';
import { compareResults, normalizeQuery, scoreEntry } from './ranking';

/**
 * Searches the index.
 *
 * Filtering and ranking happen here, never in the QuickPick: VS Code's own
 * filter has no idea what a BEM boundary is and would quietly drop valid hits.
 */
export function searchSelectors(
  entries: Iterable<SelectorEntry>,
  rawQuery: string,
  options: SearchOptions,
): SearchResult[] {
  const query = normalizeQuery(rawQuery);
  const limit = Math.max(1, options.maxResults);

  if (query.lower.length === 0) {
    return browse(entries, options, limit);
  }

  const matches: SearchResult[] = [];
  for (const entry of entries) {
    if (entry.hasPseudo && !options.includePseudoClasses) {
      continue;
    }
    const tier = scoreEntry(entry, query, {
      enableFuzzySearch: options.enableFuzzySearch,
      activeFilePath: options.prioritizeActiveFile ? options.activeFilePath : undefined,
    });
    if (!tier) {
      continue;
    }
    matches.push({ entry, score: tier.score, kind: tier.kind });
  }

  matches.sort(compareResults);
  return matches.slice(0, limit);
}

/** Empty query: show a stable, alphabetical slice of the index. */
function browse(
  entries: Iterable<SelectorEntry>,
  options: SearchOptions,
  limit: number,
): SearchResult[] {
  const results: SearchResult[] = [];
  for (const entry of entries) {
    if (entry.hasPseudo && !options.includePseudoClasses) {
      continue;
    }
    const activeBoost =
      options.prioritizeActiveFile && entry.filePath === options.activeFilePath ? 1 : 0;
    results.push({ entry, score: activeBoost, kind: 'substring' });
  }
  results.sort(compareResults);
  return results.slice(0, limit);
}
