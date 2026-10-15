import * as vscode from 'vscode';

import { findSelectedSelectorCommand } from './commands/findSelectedSelector';
import { goToDefinitionCommand } from './commands/goToDefinition';
import { rebuildIndexCommand } from './commands/rebuildIndex';
import { searchSelectorCommand } from './commands/searchSelector';
import { showIndexStatusCommand } from './commands/showIndexStatus';
import { readConfig } from './config';
import { registerFileWatchers } from './indexing/fileWatcher';
import { WorkspaceIndexer } from './indexing/workspaceIndexer';
import { disposeNavigation } from './ui/navigation';

/**
 * Activation is deliberately cheap: wiring only.
 *
 * The workspace is not parsed until the first command runs (or the first
 * stylesheet is touched), so opening VS Code on a large monorepo costs
 * nothing until StyleSeek is actually used.
 */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('StyleSeek');
  const indexer = new WorkspaceIndexer(output);

  context.subscriptions.push(
    output,
    indexer,
    registerFileWatchers(indexer),
    { dispose: disposeNavigation },
    vscode.commands.registerCommand('styleseek.searchSelector', () =>
      guard(() => searchSelectorCommand(indexer)),
    ),
    vscode.commands.registerCommand('styleseek.findSelectedSelector', () =>
      guard(() => findSelectedSelectorCommand(indexer)),
    ),
    vscode.commands.registerCommand('styleseek.goToDefinition', () =>
      guard(() => goToDefinitionCommand(indexer)),
    ),
    vscode.commands.registerCommand('styleseek.rebuildIndex', () =>
      guard(() => rebuildIndexCommand(indexer)),
    ),
    vscode.commands.registerCommand('styleseek.showIndexStatus', () =>
      guard(() => showIndexStatusCommand(indexer, output)),
    ),
  );

  if (!readConfig().enabled) {
    output.appendLine('StyleSeek is disabled via `styleseek.enabled`.');
  }
}

export function deactivate(): void {
  // Everything is registered in `context.subscriptions`.
}

/** A failing command must report, never leave the user staring at nothing. */
async function guard(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    void vscode.window.showErrorMessage(`StyleSeek: ${(error as Error).message}`);
  }
}
