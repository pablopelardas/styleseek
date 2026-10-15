import * as vscode from 'vscode';

import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';

/** `StyleSeek: Rebuild Index` — discards the index and parses everything again. */
export async function rebuildIndexCommand(indexer: WorkspaceIndexer): Promise<void> {
  await indexer.rebuild();
  const { selectors, files, lastRunMs } = indexer.status;
  const duration = lastRunMs !== undefined ? ` in ${lastRunMs} ms` : '';
  void vscode.window.showInformationMessage(
    `StyleSeek: indexed ${selectors} selectors across ${files} files${duration}.`,
  );
}
