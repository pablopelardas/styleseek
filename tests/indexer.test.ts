import { describe, expect, it } from 'vitest';

import { IndexEngine, type IndexEngineHost } from '../src/indexing/indexEngine';
import { searchSelectors } from '../src/search/selectorSearch';
import { DEFAULT_SEARCH_OPTIONS } from '../src/types/selector';

/** In-memory workspace, so indexing can be tested without a file system. */
class FakeWorkspace implements IndexEngineHost {
  readonly reads: string[] = [];
  private readonly delays = new Map<string, number>();

  constructor(private readonly files: Map<string, string>) {}

  listFiles(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()]);
  }

  async readFile(filePath: string): Promise<string | undefined> {
    this.reads.push(filePath);
    const delay = this.delays.get(filePath);
    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return this.files.get(filePath);
  }

  resolveExternalStyle(_fromFile: string, src: string): string | undefined {
    const resolved = src.replace(/^\.\//, '/p/');
    return this.files.has(resolved) ? resolved : undefined;
  }

  write(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  delete(filePath: string): void {
    this.files.delete(filePath);
  }

  delayRead(filePath: string, ms: number): void {
    this.delays.set(filePath, ms);
  }
}

function workspace(files: Record<string, string>): FakeWorkspace {
  return new FakeWorkspace(new Map(Object.entries(files)));
}

function selectors(engine: IndexEngine): string[] {
  return engine.index.entries.map((entry) => entry.selector).sort();
}

describe('initial indexing', () => {
  it('indexes every supported file and ignores the rest', async () => {
    const host = workspace({
      '/p/a.scss': '.a { &__b { color: red; } }',
      '/p/b.css': '.c { color: red; }',
      '/p/C.vue': '<template><div /></template>\n<style lang="scss">.d { &__e { color: red; } }</style>',
      '/p/readme.md': 'not a stylesheet',
    });
    const engine = new IndexEngine(host);

    await engine.rebuild();

    expect(selectors(engine)).toEqual(['.a', '.a__b', '.c', '.d', '.d__e']);
    expect(engine.index.stats.files).toBe(3);
    expect(engine.isReady).toBe(true);
    expect(host.reads).not.toContain('/p/readme.md');
  });

  it('follows <style src> targets without duplicating selectors', async () => {
    const host = workspace({
      '/p/Comp.vue': '<template><div /></template>\n<style src="./shared.scss" lang="scss"></style>',
      '/p/shared.scss': '.shared { &__x { color: red; } }',
    });
    const engine = new IndexEngine(host);

    await engine.rebuild();

    expect(selectors(engine)).toEqual(['.shared', '.shared__x']);
    expect(engine.index.entriesForFile('/p/Comp.vue')).toEqual([]);
  });

  it('keeps a broken file isolated from the rest of the index', async () => {
    const host = workspace({
      '/p/ok.scss': '.ok { color: red; }',
      '/p/bad.scss': '.bad { color: red;',
    });
    const engine = new IndexEngine(host);

    await engine.rebuild();

    expect(selectors(engine)).toEqual(['.ok']);
    expect(engine.index.stats.errors).toBe(1);
  });
});

describe('incremental updates', () => {
  it('replaces only the entries of the changed file', async () => {
    const host = workspace({
      '/p/a.scss': '.a { color: red; }',
      '/p/b.scss': '.b { color: red; }',
    });
    const engine = new IndexEngine(host);
    await engine.rebuild();

    host.write('/p/a.scss', '.a { &__new { color: red; } }');
    await engine.updateFile('/p/a.scss');

    expect(selectors(engine)).toEqual(['.a', '.a__new', '.b']);
  });

  it('indexes unsaved editor content ahead of what is on disk', async () => {
    const host = workspace({ '/p/a.scss': '.a { color: red; }' });
    const engine = new IndexEngine(host);
    await engine.rebuild();

    await engine.updateFile('/p/a.scss', '.a { &__draft { color: red; } }');

    expect(selectors(engine)).toEqual(['.a', '.a__draft']);
    expect(
      searchSelectors(engine.index.entries, '__draft', DEFAULT_SEARCH_OPTIONS),
    ).toHaveLength(1);
  });

  it('falls back to disk content when the editor is closed unsaved', async () => {
    const host = workspace({ '/p/a.scss': '.a { color: red; }' });
    const engine = new IndexEngine(host);
    await engine.rebuild();

    await engine.updateFile('/p/a.scss', '.a { &__draft { color: red; } }');
    await engine.updateFile('/p/a.scss');

    expect(selectors(engine)).toEqual(['.a']);
  });

  it('drops the entries of a deleted file', async () => {
    const host = workspace({ '/p/a.scss': '.a { color: red; }' });
    const engine = new IndexEngine(host);
    await engine.rebuild();

    host.delete('/p/a.scss');
    engine.removeFile('/p/a.scss');

    expect(selectors(engine)).toEqual([]);
    expect(engine.index.stats.files).toBe(0);
  });

  it('moves entries to the new path on rename', async () => {
    const host = workspace({ '/p/old.scss': '.moved { color: red; }' });
    const engine = new IndexEngine(host);
    await engine.rebuild();

    host.delete('/p/old.scss');
    host.write('/p/new.scss', '.moved { color: red; }');
    await engine.renameFile('/p/old.scss', '/p/new.scss');

    expect(engine.index.entriesForFile('/p/old.scss')).toEqual([]);
    expect(engine.index.entriesForFile('/p/new.scss')).toHaveLength(1);
  });

  it('ignores a stale parse that finishes after a newer one', async () => {
    const host = workspace({ '/p/a.scss': '.a { color: red; }' });
    const engine = new IndexEngine(host);
    await engine.rebuild();

    host.delayRead('/p/a.scss', 30);
    host.write('/p/a.scss', '.stale { color: red; }');
    const slow = engine.updateFile('/p/a.scss');
    const fast = engine.updateFile('/p/a.scss', '.fresh { color: red; }');
    await Promise.all([slow, fast]);

    expect(selectors(engine)).toEqual(['.fresh']);
  });
});

describe('cancellation and large workspaces', () => {
  it('publishes nothing when the rebuild is cancelled', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      files[`/p/file${i}.scss`] = `.block-${i} { &__el { color: red; } }`;
    }
    const engine = new IndexEngine(workspace(files));
    const token = { isCancellationRequested: false };

    const running = engine.rebuild(token);
    token.isCancellationRequested = true;
    await running;

    expect(engine.index.entries).toEqual([]);
    expect(engine.isReady).toBe(false);
  });

  it('lets the newest rebuild win when two overlap', async () => {
    const host = workspace({ '/p/a.scss': '.first { color: red; }' });
    const engine = new IndexEngine(host);

    const stale = engine.rebuild();
    host.write('/p/a.scss', '.second { color: red; }');
    const fresh = engine.rebuild();
    await Promise.all([stale, fresh]);

    expect(selectors(engine)).toEqual(['.second']);
  });

  it('indexes a few thousand selectors and still searches instantly', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 300; i++) {
      files[`/p/file${i}.scss`] =
        `.block-${i} {\n  &__header { color: red; }\n  &__controls { &-button { color: red; } }\n}`;
    }
    const engine = new IndexEngine(workspace(files));
    await engine.rebuild();

    expect(engine.index.stats.selectors).toBe(1200);

    const started = Date.now();
    const results = searchSelectors(engine.index.entries, 'blk ctrl', {
      ...DEFAULT_SEARCH_OPTIONS,
      maxResults: 50,
    });
    const elapsed = Date.now() - started;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
