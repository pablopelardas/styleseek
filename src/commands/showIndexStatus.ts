import * as vscode from 'vscode';

import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';

/**
 * `StyleSeek: Show Index Status` — a health check of the index.
 *
 * The full breakdown goes to the output channel, never to the notification's
 * `detail`: VS Code only renders `detail` on *modal* dialogs, so a non-modal
 * notification silently drops it. The notification carries the headline, the
 * channel carries everything worth reading.
 */
export async function showIndexStatusCommand(
  indexer: WorkspaceIndexer,
  output: vscode.OutputChannel,
): Promise<void> {
  const { state, files, selectors, errors, lastRunMs } = indexer.status;

  output.clear();
  output.appendLine(`StyleSeek index status — ${new Date().toLocaleString()}`);
  output.appendLine('');
  output.appendLine(`  State            ${state}`);
  output.appendLine(`  Files indexed    ${files}`);
  output.appendLine(`  Selectors found  ${selectors}`);
  output.appendLine(`  Parse errors     ${errors}`);
  output.appendLine(`  Last full index  ${lastRunMs !== undefined ? `${lastRunMs} ms` : 'never'}`);

  const breakdown = indexer.folderBreakdown;
  if (breakdown.length > 0) {
    output.appendLine('');
    output.appendLine('Workspace folders');
    for (const folder of breakdown) {
      output.appendLine(
        `  ${folder.label} — ${folder.files} files, ${folder.selectors} selectors`,
      );
    }
  }

  if (errors > 0) {
    output.appendLine('');
    output.appendLine(`Parse errors (${errors}) — these files contribute no selectors:`);
    for (const error of indexer.parseErrors) {
      const where = error.line
        ? `${error.filePath}:${error.line}:${error.column ?? 1}`
        : error.filePath;
      output.appendLine(`  ${where} — ${error.message}`);
    }
  }

  const headline = `StyleSeek — ${selectors} selectors in ${files} files${
    errors > 0 ? `, ${errors} parse error${errors === 1 ? '' : 's'}` : ''
  }`;
  const details = errors > 0 ? 'Show Parse Errors' : 'Show Details';

  const action = await vscode.window.showInformationMessage(headline, details);
  if (action === details) {
    output.show(true);
  }
}
