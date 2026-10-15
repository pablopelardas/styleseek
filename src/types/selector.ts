/**
 * Core data model. Deliberately free of any `vscode` import so that parsing,
 * indexing and searching can be unit-tested without an Extension Host.
 */

/** A single reconstructed selector plus the exact place it was declared. */
export interface SelectorEntry {
  /** Fully reconstructed selector, e.g. `.org-tree__controls-button`. */
  readonly selector: string;
  /** The token as literally written in the source, e.g. `&-button`. */
  readonly sourceSelector: string;
  /** Absolute path (or URI string) of the file holding the declaration. */
  readonly filePath: string;
  /** 1-based line of `sourceSelector` inside the file. */
  readonly line: number;
  /** 1-based column of `sourceSelector` inside the file. */
  readonly column: number;
  /** Length of `sourceSelector`, used to highlight the token on navigation. */
  readonly length: number;
  /** Trimmed text of the source line, shown as a preview. */
  readonly preview: string;
  /** True when the last compound carries a pseudo-class / pseudo-element. */
  readonly hasPseudo: boolean;
  /** True when the selector still contains an unresolved `#{...}`. */
  readonly hasInterpolation: boolean;
}

/** Result of parsing one file. */
export interface ParseResult {
  readonly entries: SelectorEntry[];
  /** Non-fatal problems: syntax errors, unresolvable nesting, etc. */
  readonly errors: ParseError[];
}

export interface ParseError {
  readonly filePath: string;
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

/** A scored search hit. */
export interface SearchResult {
  readonly entry: SelectorEntry;
  readonly score: number;
  /** Which rule produced the match — used for debugging and for the UI badge. */
  readonly kind: MatchKind;
}

export type MatchKind =
  | 'exact'
  | 'normalized-exact'
  | 'suffix'
  | 'segment'
  | 'prefix'
  | 'substring'
  | 'multi-token'
  | 'fuzzy';

export interface SearchOptions {
  readonly maxResults: number;
  readonly enableFuzzySearch: boolean;
  readonly includePseudoClasses: boolean;
  readonly prioritizeActiveFile: boolean;
  /** Absolute path of the active editor, used for the active-file boost. */
  readonly activeFilePath?: string;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  maxResults: 100,
  enableFuzzySearch: true,
  includePseudoClasses: false,
  prioritizeActiveFile: true,
};
