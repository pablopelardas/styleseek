import selectorParser from 'postcss-selector-parser';

/**
 * Reconstruction of nested selectors.
 *
 * This module is intentionally AST-first: `postcss-selector-parser` knows that
 * the comma inside `:is(.a, .b)` is *not* a selector-list separator, and that
 * the `&` inside `[data-x="&"]` is *not* a nesting reference. A hand written
 * scanner only kicks in when the parser throws on Sass-specific syntax it was
 * never designed to read (interpolation, `@if` guards inside selectors, ...).
 */

/** The resolved selectors of the enclosing rule. */
export interface SelectorContext {
  /** Fully resolved parent selectors. Empty at the top level. */
  readonly parents: readonly string[];
  /**
   * False inside `@mixin` / `@function` bodies, where the value of `&` cannot
   * be known statically. We refuse to guess rather than index a fake selector.
   */
  readonly resolvable: boolean;
}

export const ROOT_CONTEXT: SelectorContext = { parents: [], resolvable: true };

export interface SplitSelector {
  /** The selector text, trimmed. */
  readonly text: string;
  /** 0-based offset of `text` inside the raw selector string. */
  readonly offset: number;
}

const SEPARATORS = new Set([' ', '\t', '\n', '\r', '>', '+', '~', ',']);

/**
 * Splits a raw rule selector into its comma separated parts, keeping the exact
 * offset of each part so that `&__title, &__subtitle` yields two independently
 * navigable entries.
 */
export function splitSelectorList(raw: string): SplitSelector[] {
  let parsed: SplitSelector[] | undefined;
  try {
    parsed = splitWithParser(raw);
  } catch {
    parsed = undefined;
  }
  const result = parsed ?? scanSelectorList(raw);
  return result.filter((part) => part.text.length > 0);
}

function splitWithParser(raw: string): SplitSelector[] {
  const root = selectorParser().astSync(raw);
  const parts: SplitSelector[] = [];
  let cursor = 0;
  root.each((selector) => {
    const text = selector.toString().trim();
    if (!text) {
      return;
    }
    const hinted = selector.nodes[0]?.sourceIndex ?? -1;
    // `sourceIndex` is unreliable once Sass interpolation is involved, so it is
    // only trusted when it actually points at the selector text.
    const offset =
      hinted >= 0 && raw.startsWith(text, hinted) ? hinted : raw.indexOf(text, cursor);
    const safeOffset = offset >= 0 ? offset : cursor;
    parts.push({ text, offset: safeOffset });
    cursor = safeOffset + text.length;
  });
  return parts;
}

/** Comma splitter that understands quotes, brackets and `#{...}`. */
function scanSelectorList(raw: string): SplitSelector[] {
  const parts: SplitSelector[] = [];
  let start = 0;
  for (const index of topLevelCommas(raw)) {
    parts.push(makePart(raw, start, index));
    start = index + 1;
  }
  parts.push(makePart(raw, start, raw.length));
  return parts;
}

function makePart(raw: string, from: number, to: number): SplitSelector {
  const slice = raw.slice(from, to);
  const leading = slice.length - slice.trimStart().length;
  return { text: slice.trim(), offset: from + leading };
}

function* topLevelCommas(raw: string): Generator<number> {
  for (const { index, char, depth, inString } of scan(raw)) {
    if (char === ',' && depth === 0 && !inString) {
      yield index;
    }
  }
}

interface ScanToken {
  index: number;
  char: string;
  depth: number;
  inString: boolean;
}

/** Single pass tokenizer tracking nesting depth of `()`, `[]` and `#{}`. */
function* scan(raw: string): Generator<ScanToken> {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quote) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      yield { index: i, char, depth, inString: true };
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      yield { index: i, char, depth, inString: true };
      continue;
    }
    if (char === '#' && raw[i + 1] === '{') {
      depth++;
      yield { index: i, char, depth, inString: false };
      i++;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1);
    }
    yield { index: i, char, depth, inString: false };
  }
}

/** True when the selector contains a real `&` nesting reference. */
export function containsNesting(selector: string): boolean {
  for (const token of scan(selector)) {
    if (token.char === '&' && !token.inString) {
      return true;
    }
  }
  return false;
}

export function containsInterpolation(selector: string): boolean {
  return selector.includes('#{');
}

/**
 * Expands one selector against its parent context, following Sass semantics:
 * `&` is textually replaced by each parent, anything else is a descendant.
 *
 * Returns an empty array when the result cannot be known (a `&` with no
 * statically known parent). Never fabricates a selector.
 */
export function resolveSelector(selector: string, context: SelectorContext): string[] {
  const hasNesting = containsNesting(selector);
  const parents = context.parents;

  if (!hasNesting) {
    if (parents.length === 0) {
      return context.resolvable ? [selector] : [selector];
    }
    return parents.map((parent) => `${parent} ${selector}`);
  }

  if (!context.resolvable || parents.length === 0) {
    return [];
  }
  return parents.map((parent) => replaceNesting(selector, parent));
}

/** Replaces every top-level `&` in `selector` with `parent`. */
export function replaceNesting(selector: string, parent: string): string {
  try {
    const root = selectorParser().astSync(selector);
    let replaced = false;
    root.walk((node) => {
      if (node.type === 'nesting') {
        node.replaceWith(selectorParser.string({ value: parent }));
        replaced = true;
      }
    });
    if (replaced) {
      return root.toString().trim();
    }
  } catch {
    // fall through to the scanner
  }
  return replaceNestingByScan(selector, parent);
}

function replaceNestingByScan(selector: string, parent: string): string {
  let out = '';
  let last = 0;
  for (const token of scan(selector)) {
    if (token.char === '&' && !token.inString) {
      out += selector.slice(last, token.index) + parent;
      last = token.index + 1;
    }
  }
  out += selector.slice(last);
  return out.trim();
}

/**
 * True when the *last compound* of the selector carries a pseudo-class or
 * pseudo-element. `.a:hover` is a pseudo entry; `.a:hover .b` is not, because
 * the thing being declared is `.b`.
 */
export function hasTrailingPseudo(selector: string): boolean {
  const compound = lastCompound(selector);
  for (const token of scan(compound)) {
    if (token.char === ':' && !token.inString && token.depth === 0) {
      return true;
    }
  }
  return false;
}

/** The last compound selector, i.e. everything after the final combinator. */
export function lastCompound(selector: string): string {
  let start = 0;
  for (const token of scan(selector)) {
    if (token.depth === 0 && !token.inString && SEPARATORS.has(token.char)) {
      start = token.index + 1;
    }
  }
  return selector.slice(start);
}
