import type { ParseResult } from '../types/selector';
import { parseStyleBlocks } from './styleBlockParser';

/** Parses a standalone `.scss` file. */
export function parseScss(filePath: string, text: string): ParseResult {
  return parseStyleBlocks({
    filePath,
    fileText: text,
    blocks: [{ source: text, baseOffset: 0, syntax: 'scss' }],
  });
}
