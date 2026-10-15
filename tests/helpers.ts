import type { SelectorEntry } from '../src/types/selector';

/** `selector @ line:column` — compact assertions that read like the source. */
export function describeEntries(entries: readonly SelectorEntry[]): string[] {
  return entries.map((entry) => `${entry.selector} @ ${entry.line}:${entry.column}`);
}

export function selectorsOf(entries: readonly SelectorEntry[]): string[] {
  return entries.map((entry) => entry.selector);
}

export function findEntry(
  entries: readonly SelectorEntry[],
  selector: string,
): SelectorEntry | undefined {
  return entries.find((entry) => entry.selector === selector);
}

/** The canonical fixture from the acceptance criteria. */
export const TREE_SCSS = `.org-tree {
  &__header {
    height: 40px;
  }

  &__controls {
    display: flex;

    &-button {
      cursor: pointer;
    }
  }
}
`;
