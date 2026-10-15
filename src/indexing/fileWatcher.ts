import * as vscode from 'vscode';

import { CONFIG_SECTION, readConfig } from '../config';
import { isSupportedFile } from '../parsers';
import type { WorkspaceIndexer } from './workspaceIndexer';

type Job = () => void | Promise<void>;

/**
 * Coalesces file system and editor events into one debounced job per path.
 *
 * Without this, a single save fires the watcher *and* the document listener,
 * and a fast typist triggers a reparse per keystroke.
 */
class Debouncer implements vscode.Disposable {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private delay: number) {}

  setDelay(delay: number): void {
    this.delay = delay;
  }

  schedule(key: string, job: Job): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void job();
      }, this.delay),
    );
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}

/** Wires every incremental-update source to the indexer. */
export function registerFileWatchers(indexer: WorkspaceIndexer): vscode.Disposable {
  const config = readConfig();
  const debouncer = new Debouncer(config.indexDebounceMs);
  const disposables: vscode.Disposable[] = [debouncer];

  const watchers: vscode.FileSystemWatcher[] = [];
  const createWatchers = (): void => {
    for (const watcher of watchers.splice(0)) {
      watcher.dispose();
    }
    const current = readConfig();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const include of current.include) {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, include),
        );
        watcher.onDidCreate((uri) => schedule(uri));
        watcher.onDidChange((uri) => schedule(uri));
        watcher.onDidDelete((uri) => {
          debouncer.schedule(uri.fsPath, () => indexer.removeFile(uri));
        });
        watchers.push(watcher);
      }
    }
  };

  const schedule = (uri: vscode.Uri, text?: string): void => {
    if (!isSupportedFile(uri.fsPath)) {
      return;
    }
    debouncer.schedule(uri.fsPath, () => indexer.updateFile(uri, text));
  };

  createWatchers();
  disposables.push({ dispose: () => watchers.forEach((watcher) => watcher.dispose()) });

  // Unsaved edits: the index must mirror what the editor shows, not the disk.
  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length === 0) {
        return;
      }
      schedule(event.document.uri, event.document.getText());
    }),
  );

  // Closing a dirty document reverts the buffer: fall back to disk content.
  disposables.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      schedule(document.uri);
    }),
  );

  disposables.push(
    vscode.workspace.onDidRenameFiles((event) => {
      for (const { oldUri, newUri } of event.files) {
        void indexer.renameFile(oldUri, newUri);
      }
    }),
  );

  disposables.push(
    vscode.workspace.onDidDeleteFiles((event) => {
      for (const uri of event.files) {
        indexer.removeFile(uri);
      }
    }),
  );

  disposables.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      createWatchers();
      void indexer.rebuild();
    }),
  );

  disposables.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(CONFIG_SECTION)) {
        return;
      }
      const updated = readConfig();
      debouncer.setDelay(updated.indexDebounceMs);
      createWatchers();
      void indexer.rebuild();
    }),
  );

  return vscode.Disposable.from(...disposables);
}
