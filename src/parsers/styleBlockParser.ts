import postcss, { type AtRule, type Container, type Node, type Rule } from 'postcss';
import scssSyntax from 'postcss-scss';

import type { ParseError, ParseResult, SelectorEntry } from '../types/selector';
import { LineIndex } from './position';
import {
  ROOT_CONTEXT,
  containsInterpolation,
  hasTrailingPseudo,
  resolveSelector,
  splitSelectorList,
  type SelectorContext,
} from './selectorResolver';

export type StyleSyntax = 'scss' | 'css';

export interface StyleBlock {
  /** Text handed to PostCSS. */
  readonly source: string;
  /** Offset of `source` inside the full file. 0 for plain stylesheets. */
  readonly baseOffset: number;
  readonly syntax: StyleSyntax;
}

export interface ParseBlocksInput {
  readonly filePath: string;
  /** Full file text, used for line/column mapping and previews. */
  readonly fileText: string;
  readonly blocks: readonly StyleBlock[];
}

/** At-rules whose body is *not* a selector context (`0%`, `from`, `to`). */
const KEYFRAMES = /^(-[a-z]+-)?keyframes$/i;
/** At-rules that hide the value of `&` from static analysis. */
const OPAQUE_SCOPES = new Set(['mixin', 'function']);

export function parseStyleBlocks(input: ParseBlocksInput): ParseResult {
  const fileIndex = new LineIndex(input.fileText);
  const entries: SelectorEntry[] = [];
  const errors: ParseError[] = [];
  const seen = new Set<string>();

  for (const block of input.blocks) {
    const collector = new Collector(input.filePath, block, fileIndex, entries, errors, seen);
    collector.run();
  }

  return { entries, errors };
}

class Collector {
  constructor(
    private readonly filePath: string,
    private readonly block: StyleBlock,
    private readonly fileIndex: LineIndex,
    private readonly entries: SelectorEntry[],
    private readonly errors: ParseError[],
    private readonly seen: Set<string>,
  ) {}

  run(): void {
    let root: Container;
    try {
      const syntax = this.block.syntax === 'scss' ? scssSyntax : postcss;
      root = syntax.parse(this.block.source, { from: this.filePath });
    } catch (error) {
      this.errors.push(this.toParseError(error));
      return;
    }
    this.walk(root, ROOT_CONTEXT);
  }

  private walk(container: Container, context: SelectorContext): void {
    const nodes = container.nodes;
    if (!nodes) {
      return;
    }
    for (const node of nodes) {
      if (node.type === 'rule') {
        this.walkRule(node as Rule, context);
      } else if (node.type === 'atrule') {
        this.walkAtRule(node as AtRule, context);
      }
    }
  }

  private walkRule(rule: Rule, context: SelectorContext): void {
    const raw = rule.raws.selector?.raw ?? rule.selector;
    const ruleOffset = this.offsetOf(rule);
    const childParents: string[] = [];
    let anyUnresolved = false;

    for (const part of splitSelectorList(raw)) {
      const resolved = resolveSelector(part.text, context);
      if (resolved.length === 0) {
        anyUnresolved = true;
        continue;
      }
      for (const selector of resolved) {
        if (!childParents.includes(selector)) {
          childParents.push(selector);
        }
        this.push(selector, part.text, ruleOffset + part.offset);
      }
    }

    const childContext: SelectorContext =
      childParents.length > 0
        ? { parents: childParents, resolvable: true }
        : { parents: [], resolvable: !anyUnresolved && context.resolvable };

    this.walk(rule, childContext);
  }

  private walkAtRule(atRule: AtRule, context: SelectorContext): void {
    const name = atRule.name.toLowerCase();

    if (KEYFRAMES.test(name)) {
      // `0% { ... }` is a keyframe step, not a selector. Skip the whole subtree.
      return;
    }

    if (OPAQUE_SCOPES.has(name)) {
      this.walk(atRule, { parents: [], resolvable: false });
      return;
    }

    if (name === 'at-root') {
      this.walkAtRoot(atRule);
      return;
    }

    // `@media`, `@supports`, `@if`, `@each`, `@include ... { }`, `@layer`, ...
    // are transparent: the nesting context flows straight through them.
    this.walk(atRule, context);
  }

  private walkAtRoot(atRule: AtRule): void {
    const params = atRule.raws.params?.raw ?? atRule.params ?? '';
    if (!params.trim() || params.trimStart().startsWith('(')) {
      this.walk(atRule, ROOT_CONTEXT);
      return;
    }
    const afterName = (atRule.raws as { afterName?: string }).afterName ?? ' ';
    const paramsOffset = this.offsetOf(atRule) + 1 + atRule.name.length + afterName.length;
    const parents: string[] = [];
    for (const part of splitSelectorList(params)) {
      parents.push(part.text);
      this.push(part.text, part.text, paramsOffset + part.offset);
    }
    this.walk(atRule, { parents, resolvable: true });
  }

  /** Offset of a node inside the *file*, resilient to missing `source.offset`. */
  private offsetOf(node: Node): number {
    const start = node.source?.start;
    if (!start) {
      return this.block.baseOffset;
    }
    const local =
      typeof start.offset === 'number'
        ? start.offset
        : this.localOffsetFromLineColumn(start.line, start.column);
    return this.block.baseOffset + local;
  }

  private localOffsetFromLineColumn(line: number, column: number): number {
    const text = this.block.source;
    let offset = 0;
    let current = 1;
    while (current < line && offset < text.length) {
      const next = text.indexOf('\n', offset);
      if (next === -1) {
        break;
      }
      offset = next + 1;
      current++;
    }
    return offset + column - 1;
  }

  private push(selector: string, sourceSelector: string, fileOffset: number): void {
    const { line, column } = this.fileIndex.positionAt(fileOffset);
    const key = `${selector}\u0000${line}\u0000${column}`;
    if (this.seen.has(key)) {
      return;
    }
    this.seen.add(key);
    this.entries.push({
      selector,
      sourceSelector,
      filePath: this.filePath,
      line,
      column,
      length: sourceSelector.length,
      preview: this.fileIndex.lineTextAt(fileOffset).trim(),
      hasPseudo: hasTrailingPseudo(selector),
      hasInterpolation: containsInterpolation(selector),
    });
  }

  private toParseError(error: unknown): ParseError {
    const syntaxError = error as { reason?: string; message?: string; line?: number; column?: number };
    const local = syntaxError.line ?? 1;
    const absolute = this.fileIndex.positionAt(
      this.block.baseOffset + this.localOffsetFromLineColumn(local, syntaxError.column ?? 1),
    );
    return {
      filePath: this.filePath,
      message: syntaxError.reason ?? syntaxError.message ?? String(error),
      line: absolute.line,
      column: absolute.column,
    };
  }
}
