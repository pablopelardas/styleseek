import * as vscode from 'vscode';

import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';

/** `StyleSeek: Show Index Status` — a quick health check of the index. */
export async function showIndexStatusCommand(
  indexer: WorkspaceIndexer,
  output: vscode.OutputChannel,
): Promise<void> {
  const { state, files, selectors, errors, lastRunMs } = indexer.status;
  const lines = [
    `State: ${state}`,
    `Files indexed: ${files}`,
    `Selectors found: ${selectors}`,
    `Parse errors: ${errors}`,
    lastRunMs !== undefined ? `Last full index: ${lastRunMs} ms` : 'Last full index: never',
  ];

  const action = await vscode.window.showInformationMessage(
    `StyleSeek — ${selectors} selectors in ${files} files`,
    { modal: false, detail: lines.join('\n') },
    ...(errors > 0 ? ['Show Parse Errors'] : []),
  );

  if (action === 'Show Parse Errors') {
    output.clear();
    for (const error of indexer.parseErrors) {
      const where = error.line ? `${error.filePath}:${error.line}:${error.column ?? 1}` : error.filePath;
      output.appendLine(`${where} — ${error.message}`);
    }
    output.show(true);
  }
}
