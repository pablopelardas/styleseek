import type { ParseResult } from '../types/selector';
import { parseStyleBlocks } from './styleBlockParser';

/**
 * Parses a standalone `.css` file.
 *
 * Native CSS nesting is handled by the same resolver used for SCSS, so
 * `.card { &:hover { } }` and `.card { .title { } }` both reconstruct
 * correctly without pulling in a second syntax.
 */
export function parseCss(filePath: string, text: string): ParseResult {
  return parseStyleBlocks({
    filePath,
    fileText: text,
    blocks: [{ source: text, baseOffset: 0, syntax: 'css' }],
  });
}
