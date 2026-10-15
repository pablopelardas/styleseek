import * as path from 'node:path';
import * as vscode from 'vscode';

import { buildExcludeGlob, readConfig, type StyleSeekConfig } from '../config';
import { isSupportedFile } from '../parsers';
import type { ParseError, SelectorEntry } from '../types/selector';
import { IndexEngine, type IndexEngineHost } from './indexEngine';

export interface IndexStatus {
  readonly state: 'idle' | 'indexing' | 'ready';
  readonly files: number;
  readonly selectors: number;
  readonly errors: number;
  readonly lastRunMs?: number;
}

/**
 * Bridges the pure `IndexEngine` to the VS Code workspace.
 *
 * Everything that touches the editor lives here: glob resolution, reading
 * unsaved buffers, progress reporting and cancellation of a rebuild that a
 * newer one has superseded.
 */
export class WorkspaceIndexer implements vscode.Disposable, IndexEngineHost {
  private readonly engine = new IndexEngine(this);
  private config: StyleSeekConfig;
  private cancellation?: vscode.CancellationTokenSource;
  private lastRunMs?: number;

  constructor(private readonly output: vscode.OutputChannel) {
    this.config = readConfig();
  }

  get entries(): readonly SelectorEntry[] {
    return this.engine.index.entries;
  }

  get parseErrors(): ParseError[] {
    return this.engine.index.errors;
  }

  get status(): IndexStatus {
    const stats = this.engine.index.stats;
    return {
      state: this.engine.indexState,
      files: stats.files,
      selectors: stats.selectors,
      errors: stats.errors,
      lastRunMs: this.lastRunMs,
    };
  }

  get isReady(): boolean {
    return this.engine.isReady;
  }

  /**
   * Per-folder counts.
   *
   * Without this, "why does the count differ from last time?" is unanswerable
   * — a multi-root workspace or a second window looks identical in a single
   * total. Files outside every folder are grouped under `(outside workspace)`
   * so a stray `<style src>` target can never hide.
   */
  get folderBreakdown(): Array<{ label: string; files: number; selectors: number }> {
    const buckets = new Map<string, { files: Set<string>; selectors: number }>();

    for (const filePath of this.engine.index.filePaths) {
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
      const label = folder ? `${folder.name}  (${folder.uri.fsPath})` : '(outside workspace)';
      let bucket = buckets.get(label);
      if (!bucket) {
        bucket = { files: new Set(), selectors: 0 };
        buckets.set(label, bucket);
      }
      bucket.files.add(filePath);
      bucket.selectors += this.engine.index.entriesForFile(filePath).length;
    }

    return [...buckets.entries()]
      .map(([label, bucket]) => ({ label, files: bucket.files.size, selectors: bucket.selectors }))
      .sort((a, b) => b.selectors - a.selectors);
  }

  refreshConfig(): void {
    this.config = readConfig();
  }

  /** Indexes on first use. Subsequent calls reuse the existing index. */
  ensureIndexed(): Promise<void> {
    if (this.engine.isReady) {
      return Promise.resolve();
    }
    return this.rebuild();
  }

  rebuild(): Promise<void> {
    this.refreshConfig();
    if (!this.config.enabled) {
      return Promise.resolve();
    }

    this.cancellation?.cancel();
    this.cancellation?.dispose();
    const source = new vscode.CancellationTokenSource();
    this.cancellation = source;

    const started = Date.now();
    const running = Promise.resolve(
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'StyleSeek: indexing selectors' },
        () => this.engine.rebuild(source.token),
      ),
    ).then(() => {
      if (!source.token.isCancellationRequested) {
        this.lastRunMs = Date.now() - started;
        this.logErrors();
      }
    });

    return running;
  }

  async updateFile(uri: vscode.Uri, text?: string): Promise<void> {
    if (!this.config.enabled || !this.engine.isReady) {
      return;
    }
    await this.engine.updateFile(uri.fsPath, text);
  }

  removeFile(uri: vscode.Uri): void {
    this.engine.removeFile(uri.fsPath);
  }

  async renameFile(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    if (!this.engine.isReady) {
      return;
    }
    await this.engine.renameFile(oldUri.fsPath, newUri.fsPath);
  }

  // ---- IndexEngineHost -------------------------------------------------

  async listFiles(): Promise<string[]> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const exclude = buildExcludeGlob(this.config);
    const found = new Set<string>();

    for (const folder of folders) {
      for (const include of this.config.include) {
        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, include),
          exclude,
        );
        for (const uri of uris) {
          found.add(uri.fsPath);
        }
      }
    }
    return [...found];
  }

  async readFile(filePath: string): Promise<string | undefined> {
    // An open buffer is the source of truth: unsaved edits must be searchable.
    const open = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === filePath);
    if (open && !open.isClosed) {
      return open.getText();
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return undefined;
    }
  }

  /** Resolves `<style src="...">`, refusing anything outside the workspace. */
  resolveExternalStyle(fromFile: string, src: string): string | undefined {
    if (/^[a-z][a-z0-9+.-]*:/i.test(src)) {
      return undefined; // remote or aliased, nothing we can safely read
    }
    const resolved = path.resolve(path.dirname(fromFile), src);
    if (!isSupportedFile(resolved)) {
      return undefined;
    }
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(resolved));
    return folder ? resolved : undefined;
  }

  // ---------------------------------------------------------------------

  private logErrors(): void {
    const errors = this.parseErrors;
    if (errors.length === 0) {
      return;
    }
    this.output.appendLine(`--- ${new Date().toISOString()} — ${errors.length} parse issue(s)`);
    for (const error of errors) {
      const where = error.line ? `${error.filePath}:${error.line}:${error.column ?? 1}` : error.filePath;
      this.output.appendLine(`  ${where} — ${error.message}`);
    }
  }

  dispose(): void {
    this.cancellation?.cancel();
    this.cancellation?.dispose();
  }
}
