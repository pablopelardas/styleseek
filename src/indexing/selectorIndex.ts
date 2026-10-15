import type { ParseError, SelectorEntry } from '../types/selector';

interface FileRecord {
  readonly entries: readonly SelectorEntry[];
  readonly errors: readonly ParseError[];
}

export interface IndexStats {
  readonly files: number;
  readonly selectors: number;
  readonly errors: number;
}

/**
 * In-memory store of every reconstructed selector, keyed by file.
 *
 * Keeping entries grouped per file is what makes incremental updates cheap:
 * a changed file replaces exactly its own slice, nothing else is re-parsed.
 */
export class SelectorIndex {
  private readonly files = new Map<string, FileRecord>();
  private flatCache: SelectorEntry[] | undefined;

  setFile(filePath: string, entries: readonly SelectorEntry[], errors: readonly ParseError[]): void {
    this.files.set(filePath, { entries, errors });
    this.flatCache = undefined;
  }

  removeFile(filePath: string): boolean {
    const removed = this.files.delete(filePath);
    if (removed) {
      this.flatCache = undefined;
    }
    return removed;
  }

  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  clear(): void {
    this.files.clear();
    this.flatCache = undefined;
  }

  /** Flat, cached view used by the search. */
  get entries(): readonly SelectorEntry[] {
    if (!this.flatCache) {
      const flat: SelectorEntry[] = [];
      for (const record of this.files.values()) {
        flat.push(...record.entries);
      }
      this.flatCache = flat;
    }
    return this.flatCache;
  }

  entriesForFile(filePath: string): readonly SelectorEntry[] {
    return this.files.get(filePath)?.entries ?? [];
  }

  errorsForFile(filePath: string): readonly ParseError[] {
    return this.files.get(filePath)?.errors ?? [];
  }

  get filePaths(): string[] {
    return [...this.files.keys()];
  }

  /** Replaces the whole content of this index with another one's. */
  replaceWith(other: SelectorIndex): void {
    this.files.clear();
    for (const filePath of other.filePaths) {
      this.files.set(filePath, {
        entries: other.entriesForFile(filePath),
        errors: other.errorsForFile(filePath),
      });
    }
    this.flatCache = undefined;
  }

  get errors(): ParseError[] {
    const all: ParseError[] = [];
    for (const record of this.files.values()) {
      all.push(...record.errors);
    }
    return all;
  }

  get stats(): IndexStats {
    let selectors = 0;
    let errors = 0;
    for (const record of this.files.values()) {
      selectors += record.entries.length;
      errors += record.errors.length;
    }
    return { files: this.files.size, selectors, errors };
  }
}
