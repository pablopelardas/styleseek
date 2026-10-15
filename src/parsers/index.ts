import type { ParseResult } from '../types/selector';
import { parseCss } from './cssParser';
import { parseScss } from './scssParser';
import { parseVue, type VueParseResult } from './vueParser';

export type SupportedExtension = '.scss' | '.css' | '.vue';

export const SUPPORTED_EXTENSIONS: readonly SupportedExtension[] = ['.scss', '.css', '.vue'];

export interface FileParseResult extends ParseResult {
  /** Only populated for `.vue` files using `<style src="...">`. */
  readonly externalStyles: string[];
}

export function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((extension) => filePath.toLowerCase().endsWith(extension));
}

/** Dispatches to the right parser based on the file extension. */
export function parseFile(filePath: string, text: string): FileParseResult {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.vue')) {
    const result: VueParseResult = parseVue(filePath, text);
    return result;
  }
  const result = lower.endsWith('.scss') ? parseScss(filePath, text) : parseCss(filePath, text);
  return { ...result, externalStyles: [] };
}

export { parseCss, parseScss, parseVue };
