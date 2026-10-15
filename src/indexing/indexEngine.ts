import { isSupportedFile, parseFile } from '../parsers';
import type { ParseError, SelectorEntry } from '../types/selector';
import { SelectorIndex } from './selectorIndex';

export interface CancellationLike {
  readonly isCancellationRequested: boolean;
}

export interface IndexEngineHost {
  /** Every indexable file of the workspace, already filtered by the globs. */
  listFiles(): Promise<string[]>;
  /** File contents, preferring unsaved editor state. `undefined` if gone. */
  readFile(filePath: string): Promise<string | undefined>;
  /** Resolves a `<style src="...">` target, or `undefined` when out of scope. */
  resolveExternalStyle?(fromFile: string, src: string): string | undefined;
  onProgress?(done: number, total: number): void;
}

export interface RebuildTimings {
  /** Time spent resolving the include/exclude globs across the workspace. */
  readonly discoveryMs: number;
  /** Time spent reading and parsing the discovered files. */
  readonly parseMs: number;
}

export type IndexState = 'idle' | 'indexing' | 'ready';

const BATCH_SIZE = 24;

/**
 * Orchestrates parsing into the index.
 *
 * Two invariants matter here and both are enforced with a per-file sequence
 * number: a slow parse must never overwrite a newer one, and a cancelled
 * rebuild must never publish its half-finished results.
 */
export class IndexEngine {
  readonly index = new SelectorIndex();

  private state: IndexState = 'idle';
  private sequence = new Map<string, number>();
  private generation = 0;
  private lastTimings: RebuildTimings | undefined;

  constructor(private readonly host: IndexEngineHost) {}

  get indexState(): IndexState {
    return this.state;
  }

  get isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Where the time went on the last full rebuild.
   *
   * Split on purpose: "indexing is slow" is unactionable, "discovery took
   * 6 s and parsing took 0.3 s" points straight at the glob walk.
   */
  get timings(): RebuildTimings | undefined {
    return this.lastTimings;
  }

  /** Full rebuild. Safe to call concurrently: the newest call wins. */
  async rebuild(token?: CancellationLike): Promise<void> {
    const generation = ++this.generation;
    this.state = 'indexing';

    const discoveryStart = Date.now();
    let files: string[];
    try {
      files = (await this.host.listFiles()).filter(isSupportedFile);
    } catch {
      files = [];
    }
    const discoveryMs = Date.now() - discoveryStart;
    if (this.isStale(generation, token)) {
      return;
    }

    const parseStart = Date.now();
    const fresh = new SelectorIndex();
    const external = new Set<string>();

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      if (this.isStale(generation, token)) {
        return;
      }
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((filePath) => this.parseInto(fresh, filePath, external)));
      this.host.onProgress?.(Math.min(i + BATCH_SIZE, files.length), files.length);
      await yieldToEventLoop();
    }

    // `<style src="...">` targets that are not covered by the include globs.
    for (const filePath of external) {
      if (this.isStale(generation, token)) {
        return;
      }
      if (!fresh.hasFile(filePath)) {
        await this.parseInto(fresh, filePath, new Set());
      }
    }

    if (this.isStale(generation, token)) {
      return;
    }

    this.index.replaceWith(fresh);
    this.sequence.clear();
    this.lastTimings = { discoveryMs, parseMs: Date.now() - parseStart };
    this.state = 'ready';
  }

  /**
   * Re-indexes a single file. Pass `text` to index unsaved editor content;
   * omit it to re-read from the host (i.e. from disk).
   */
  async updateFile(filePath: string, text?: string): Promise<void> {
    if (!isSupportedFile(filePath)) {
      return;
    }
    const token = (this.sequence.get(filePath) ?? 0) + 1;
    this.sequence.set(filePath, token);

    const content = text ?? (await this.host.readFile(filePath));
    if (this.sequence.get(filePath) !== token) {
      return; // A newer edit already superseded this one.
    }
    if (content === undefined) {
      this.index.removeFile(filePath);
      return;
    }

    const result = safeParse(filePath, content);
    if (this.sequence.get(filePath) !== token) {
      return;
    }
    this.index.setFile(filePath, result.entries, result.errors);

    for (const src of result.externalStyles) {
      const resolved = this.host.resolveExternalStyle?.(filePath, src);
      if (resolved && !this.index.hasFile(resolved)) {
        void this.updateFile(resolved);
      }
    }
  }

  removeFile(filePath: string): void {
    this.sequence.set(filePath, (this.sequence.get(filePath) ?? 0) + 1);
    this.index.removeFile(filePath);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    this.removeFile(oldPath);
    await this.updateFile(newPath);
  }

  private async parseInto(
    target: SelectorIndex,
    filePath: string,
    external: Set<string>,
  ): Promise<void> {
    const content = await this.host.readFile(filePath);
    if (content === undefined) {
      return;
    }
    const result = safeParse(filePath, content);
    target.setFile(filePath, result.entries, result.errors);
    for (const src of result.externalStyles) {
      const resolved = this.host.resolveExternalStyle?.(filePath, src);
      if (resolved) {
        external.add(resolved);
      }
    }
  }

  private isStale(generation: number, token?: CancellationLike): boolean {
    return generation !== this.generation || token?.isCancellationRequested === true;
  }
}

interface SafeParseResult {
  entries: SelectorEntry[];
  errors: ParseError[];
  externalStyles: string[];
}

/** A broken file must degrade gracefully, never take the whole index down. */
function safeParse(filePath: string, content: string): SafeParseResult {
  try {
    const result = parseFile(filePath, content);
    return {
      entries: [...result.entries],
      errors: [...result.errors],
      externalStyles: [...result.externalStyles],
    };
  } catch (error) {
    return {
      entries: [],
      errors: [{ filePath, message: (error as Error).message }],
      externalStyles: [],
    };
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
