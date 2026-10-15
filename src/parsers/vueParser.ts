import { parse as parseSfc } from '@vue/compiler-sfc';

import type { ParseError, ParseResult } from '../types/selector';
import { parseStyleBlocks, type StyleBlock, type StyleSyntax } from './styleBlockParser';

export interface VueParseResult extends ParseResult {
  /**
   * `src` targets of `<style src="...">` blocks, relative to the `.vue` file.
   * The indexer resolves and indexes those files instead of duplicating them.
   */
  readonly externalStyles: string[];
}

const SYNTAX_BY_LANG: Record<string, StyleSyntax> = {
  css: 'css',
  scss: 'scss',
  postcss: 'css',
};

/**
 * Extracts every `<style>` block of a Vue SFC.
 *
 * Positions are reported against the `.vue` file, not against the block, so
 * navigation lands on the real line even for a deeply nested `&__controls`
 * inside the third `<style>` block of the file.
 */
export function parseVue(filePath: string, text: string): VueParseResult {
  const blocks: StyleBlock[] = [];
  const externalStyles: string[] = [];
  const errors: ParseError[] = [];

  let descriptor;
  try {
    const parsed = parseSfc(text, { filename: filePath });
    descriptor = parsed.descriptor;
    for (const error of parsed.errors) {
      errors.push({ filePath, message: error.message });
    }
  } catch (error) {
    return {
      entries: [],
      errors: [{ filePath, message: (error as Error).message }],
      externalStyles: [],
    };
  }

  for (const style of descriptor.styles) {
    const src = typeof style.src === 'string' ? style.src : undefined;
    if (src) {
      externalStyles.push(src);
      continue;
    }
    const lang = (style.lang ?? 'css').toLowerCase();
    const syntax = SYNTAX_BY_LANG[lang];
    if (!syntax) {
      errors.push({
        filePath,
        message: `Unsupported <style lang="${lang}"> block; skipped.`,
        line: style.loc.start.line,
        column: style.loc.start.column,
      });
      continue;
    }
    blocks.push({
      source: style.content,
      baseOffset: style.loc.start.offset,
      syntax,
    });
  }

  const result = parseStyleBlocks({ filePath, fileText: text, blocks });
  return {
    entries: result.entries,
    errors: [...errors, ...result.errors],
    externalStyles,
  };
}
