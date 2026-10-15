import type { MatchKind, SelectorEntry } from '../types/selector';
import { fuzzyScore, isSeparator } from './fuzzyMatcher';

/**
 * Ranking tiers.
 *
 * The contract is "rank, never drop": every tier produces a hit, and a weak
 * fuzzy match is still a match. Tiers are spaced far enough apart that the
 * secondary criteria (active file, selector length) can never promote a worse
 * tier above a better one.
 */
export const TIER = {
  exact: 10_000,
  normalizedExact: 9_000,
  suffix: 8_000,
  multiTokenBoundary: 7_800,
  segment: 7_500,
  prefix: 7_000,
  multiToken: 6_200,
  substring: 6_000,
  fuzzyMax: 5_000,
} as const;

const ACTIVE_FILE_BONUS = 300;
const INTERPOLATION_PENALTY = 50;
const SHORTNESS_WEIGHT = 0.5;
const SHORTNESS_CAP = 120;

export interface NormalizedQuery {
  /** Lower-cased, trimmed, as typed. */
  readonly lower: string;
  /** `lower` without a single leading `.` or `#`. */
  readonly bare: string;
  /** Whitespace separated terms (already bare). */
  readonly tokens: readonly string[];
  /** All tokens concatenated, used as the fuzzy needle. */
  readonly joined: string;
  readonly isMultiToken: boolean;
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const lower = raw.trim().toLowerCase();
  const bare = stripLeadingSigil(lower);
  const tokens = lower.split(/\s+/).filter(Boolean).map(stripLeadingSigil);
  return {
    lower,
    bare,
    tokens,
    joined: tokens.join(''),
    isMultiToken: tokens.length > 1,
  };
}

function stripLeadingSigil(value: string): string {
  return value.startsWith('.') || value.startsWith('#') ? value.slice(1) : value;
}

export interface TierMatch {
  readonly score: number;
  readonly kind: MatchKind;
}

/** Scores one entry against a query, or returns `undefined` when it misses. */
export function scoreEntry(
  entry: SelectorEntry,
  query: NormalizedQuery,
  options: { enableFuzzySearch: boolean; activeFilePath?: string },
): TierMatch | undefined {
  const tier = matchTier(entry, query, options.enableFuzzySearch);
  if (!tier) {
    return undefined;
  }

  let score = tier.score;
  if (options.activeFilePath && entry.filePath === options.activeFilePath) {
    score += ACTIVE_FILE_BONUS;
  }
  if (entry.hasInterpolation) {
    score -= INTERPOLATION_PENALTY;
  }
  score += Math.max(0, SHORTNESS_CAP - entry.selector.length) * SHORTNESS_WEIGHT;

  return { score, kind: tier.kind };
}

function matchTier(
  entry: SelectorEntry,
  query: NormalizedQuery,
  enableFuzzySearch: boolean,
): TierMatch | undefined {
  const hay = entry.selector.toLowerCase();
  const bareHay = stripLeadingSigil(hay);

  if (hay === query.lower) {
    return { score: TIER.exact, kind: 'exact' };
  }
  if (bareHay === query.bare) {
    return { score: TIER.normalizedExact, kind: 'normalized-exact' };
  }

  if (query.isMultiToken) {
    const multi = matchTokens(bareHay, query.tokens);
    if (multi) {
      return multi;
    }
  } else {
    const literal = matchLiteral(bareHay, query.bare);
    if (literal) {
      return literal;
    }
  }

  if (!enableFuzzySearch || query.joined.length === 0) {
    return undefined;
  }
  const fuzzy = fuzzyScore(query.joined, bareHay);
  if (fuzzy === undefined) {
    return undefined;
  }
  return { score: fuzzy * TIER.fuzzyMax, kind: 'fuzzy' };
}

function matchLiteral(bareHay: string, needle: string): TierMatch | undefined {
  if (needle.length === 0) {
    return undefined;
  }
  const index = bareHay.indexOf(needle);
  if (index === -1) {
    return undefined;
  }
  if (bareHay.endsWith(needle) && startsAtBoundary(bareHay, bareHay.length - needle.length, needle)) {
    return { score: TIER.suffix, kind: 'suffix' };
  }
  if (index === 0) {
    return { score: TIER.prefix, kind: 'prefix' };
  }
  if (startsAtBoundary(bareHay, index, needle)) {
    return { score: TIER.segment, kind: 'segment' };
  }
  // Deeper matches are slightly less relevant, but never dropped.
  return { score: TIER.substring - Math.min(index, 100), kind: 'substring' };
}

function matchTokens(bareHay: string, tokens: readonly string[]): TierMatch | undefined {
  let cursor = 0;
  let allOnBoundary = true;
  for (const token of tokens) {
    if (token.length === 0) {
      continue;
    }
    const index = bareHay.indexOf(token, cursor);
    if (index === -1) {
      return undefined;
    }
    if (!startsAtBoundary(bareHay, index, token)) {
      allOnBoundary = false;
    }
    cursor = index + token.length;
  }
  return allOnBoundary
    ? { score: TIER.multiTokenBoundary, kind: 'multi-token' }
    : { score: TIER.multiToken, kind: 'multi-token' };
}

/**
 * A match sits on a BEM boundary when it starts the string, follows a
 * separator, or itself begins with one (so `__controls` matches the `__` in
 * `org-tree__controls`).
 */
function startsAtBoundary(haystack: string, index: number, needle: string): boolean {
  return index === 0 || isSeparator(haystack[index - 1]) || isSeparator(needle[0]);
}

/** Stable ordering so results never jump around between keystrokes. */
export function compareResults(
  a: { score: number; entry: SelectorEntry },
  b: { score: number; entry: SelectorEntry },
): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.entry.selector.length !== b.entry.selector.length) {
    return a.entry.selector.length - b.entry.selector.length;
  }
  if (a.entry.selector !== b.entry.selector) {
    return a.entry.selector < b.entry.selector ? -1 : 1;
  }
  if (a.entry.filePath !== b.entry.filePath) {
    return a.entry.filePath < b.entry.filePath ? -1 : 1;
  }
  if (a.entry.line !== b.entry.line) {
    return a.entry.line - b.entry.line;
  }
  return a.entry.column - b.entry.column;
}
