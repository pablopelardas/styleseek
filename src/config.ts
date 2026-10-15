import * as vscode from 'vscode';

export const CONFIG_SECTION = 'styleseek';

export interface StyleSeekConfig {
  readonly enabled: boolean;
  readonly include: string[];
  readonly exclude: string[];
  readonly respectSearchExclude: boolean;
  readonly maxResults: number;
  readonly enableFuzzySearch: boolean;
  readonly includePseudoClasses: boolean;
  readonly prioritizeActiveFile: boolean;
  readonly indexDebounceMs: number;
}

const DEFAULT_INCLUDE = ['**/*.scss', '**/*.css', '**/*.vue'];
const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
];

/** Reads and validates the user configuration. Bad values fall back silently. */
export function readConfig(scope?: vscode.ConfigurationScope): StyleSeekConfig {
  const raw = vscode.workspace.getConfiguration(CONFIG_SECTION, scope);
  return {
    enabled: raw.get<boolean>('enabled') ?? true,
    include: stringArray(raw.get('include'), DEFAULT_INCLUDE),
    exclude: stringArray(raw.get('exclude'), DEFAULT_EXCLUDE),
    respectSearchExclude: raw.get<boolean>('respectSearchExclude') ?? true,
    maxResults: clamp(raw.get<number>('maxResults'), 100, 1, 5000),
    enableFuzzySearch: raw.get<boolean>('enableFuzzySearch') ?? true,
    includePseudoClasses: raw.get<boolean>('includePseudoClasses') ?? false,
    prioritizeActiveFile: raw.get<boolean>('prioritizeActiveFile') ?? true,
    indexDebounceMs: clamp(raw.get<number>('indexDebounceMs'), 250, 0, 5000),
  };
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const cleaned = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return cleaned.length > 0 ? cleaned : [...fallback];
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Builds the single brace-glob that `findFiles` understands, merging the
 * StyleSeek exclusions with the user's `files.exclude` / `search.exclude`.
 */
export function buildExcludeGlob(config: StyleSeekConfig): string | undefined {
  const patterns = new Set(config.exclude);
  if (config.respectSearchExclude) {
    for (const section of ['files.exclude', 'search.exclude']) {
      const [namespace, key] = section.split('.');
      const values = vscode.workspace.getConfiguration(namespace).get<Record<string, boolean>>(key);
      for (const [pattern, enabled] of Object.entries(values ?? {})) {
        if (enabled) {
          patterns.add(pattern);
        }
      }
    }
  }
  if (patterns.size === 0) {
    return undefined;
  }
  return `{${[...patterns].join(',')}}`;
}
