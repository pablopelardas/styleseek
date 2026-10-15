/**
 * Extraction of the class name under the cursor.
 *
 * VS Code's default word definition stops at `-`, which would turn
 * `org-tree__controls` into `org`. This walks the identifier itself.
 */

const NAME_CHAR = /[A-Za-z0-9_-]/;

/** Returns the full class-like token surrounding `character`, if any. */
export function extractSelectorToken(lineText: string, character: number): string | undefined {
  if (lineText.length === 0) {
    return undefined;
  }
  const cursor = Math.min(Math.max(character, 0), lineText.length);

  let start = cursor;
  while (start > 0 && NAME_CHAR.test(lineText[start - 1])) {
    start--;
  }
  let end = cursor;
  while (end < lineText.length && NAME_CHAR.test(lineText[end])) {
    end++;
  }
  if (start === end) {
    return undefined;
  }

  // Keep a leading sigil so `.card` stays a class and `#id` stays an id.
  const sigil = start > 0 && (lineText[start - 1] === '.' || lineText[start - 1] === '#');
  return (sigil ? lineText[start - 1] : '') + lineText.slice(start, end);
}

/** Cleans a user selection so `"card__title"` becomes `card__title`. */
export function cleanSelection(selection: string): string | undefined {
  const trimmed = selection.trim().replace(/^["'`]|["'`]$/g, '').trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
