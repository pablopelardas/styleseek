/**
 * Fuzzy subsequence matcher (fzy-style dynamic programming).
 *
 * A greedy left-to-right scan is cheap but wrong: for `ctrl` against
 * `.card-controls` it would consume the `c` of `card` and then fail to reward
 * the far better match inside `controls`. The DP below always finds the
 * highest scoring alignment, which is what makes BEM boundaries win.
 */

const SCORE_MIN = -Infinity;
const BONUS_BOUNDARY = 0.9;
const BONUS_FIRST_CHAR = 1.0;
const SCORE_GAP_LEADING = -0.005;
const SCORE_GAP_TRAILING = -0.005;
const SCORE_GAP_INNER = -0.01;
const SCORE_CONSECUTIVE = 1.0;

/** Characters that start a new meaningful segment in a CSS selector. */
const SEPARATORS = new Set(['-', '_', '.', '#', ' ', ':', '>', '+', '~', '[', ']', '(', ')', ',']);

export function isSeparator(char: string | undefined): boolean {
  return char === undefined || SEPARATORS.has(char);
}

/** Cheap pre-filter: can every query char be found in order? */
export function isSubsequence(query: string, haystack: string): boolean {
  if (query.length === 0) {
    return true;
  }
  let qi = 0;
  for (let hi = 0; hi < haystack.length && qi < query.length; hi++) {
    if (haystack[hi] === query[qi]) {
      qi++;
    }
  }
  return qi === query.length;
}

function boundaryBonuses(haystack: string): Float64Array {
  const bonuses = new Float64Array(haystack.length);
  for (let i = 0; i < haystack.length; i++) {
    if (i === 0) {
      bonuses[i] = BONUS_FIRST_CHAR;
    } else if (SEPARATORS.has(haystack[i - 1])) {
      bonuses[i] = BONUS_BOUNDARY;
    } else {
      bonuses[i] = 0;
    }
  }
  return bonuses;
}

/**
 * Returns a normalised score in `[0, 1]`, or `undefined` when `query` is not a
 * subsequence of `haystack`. Both arguments must already be lower-cased.
 */
export function fuzzyScore(query: string, haystack: string): number | undefined {
  const m = query.length;
  const n = haystack.length;
  if (m === 0 || n === 0 || m > n) {
    return undefined;
  }
  if (!isSubsequence(query, haystack)) {
    return undefined;
  }
  if (query === haystack) {
    return 1;
  }

  const bonus = boundaryBonuses(haystack);
  let prevD = new Float64Array(n).fill(SCORE_MIN);
  let prevM = new Float64Array(n).fill(SCORE_MIN);
  let currD = new Float64Array(n);
  let currM = new Float64Array(n);

  for (let i = 0; i < m; i++) {
    const isLast = i === m - 1;
    const gapPenalty = isLast ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;
    // Row 0 may start with a gap (the match need not begin at index 0).
    let prevRowBest = i === 0 ? 0 : SCORE_MIN;

    for (let j = 0; j < n; j++) {
      if (query[i] === haystack[j]) {
        let score = SCORE_MIN;
        if (i === 0) {
          score = j * SCORE_GAP_LEADING + bonus[j];
        } else if (j > 0) {
          score = Math.max(prevM[j - 1] + bonus[j], prevD[j - 1] + SCORE_CONSECUTIVE);
        }
        currD[j] = score;
        currM[j] = Math.max(score, prevRowBest + gapPenalty);
      } else {
        currD[j] = SCORE_MIN;
        currM[j] = prevRowBest + gapPenalty;
      }
      prevRowBest = currM[j];
    }

    const swapD = prevD;
    const swapM = prevM;
    prevD = currD;
    prevM = currM;
    currD = swapD;
    currM = swapM;
  }

  const raw = prevM[n - 1];
  if (!Number.isFinite(raw)) {
    return undefined;
  }
  // Best achievable: every char consecutive, starting on a boundary.
  const best = BONUS_FIRST_CHAR + (m - 1) * SCORE_CONSECUTIVE;
  return Math.max(0, Math.min(1, raw / best));
}
