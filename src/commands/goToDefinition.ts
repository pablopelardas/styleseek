import * as vscode from 'vscode';

import { readConfig } from '../config';
import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';
import { searchSelectors } from '../search/selectorSearch';
import { TIER } from '../search/ranking';
import { revealEntry } from '../ui/navigation';
import { showSelectorQuickPick } from '../ui/selectorQuickPick';
import { currentToken } from './findSelectedSelector';

/**
 * `StyleSeek: Go to Definition` — jumps from a class used in a template to
 * where it is declared.
 *
 * This is a plain command rather than a `DefinitionProvider` on purpose: F12
 * already belongs to the language servers, and hijacking it to guess at CSS
 * would be hostile. Bind it yourself if you want it on a key.
 */
export async function goToDefinitionCommand(indexer: WorkspaceIndexer): Promise<void> {
  const token = currentToken();
  if (!token) {
    void vscode.window.showInformationMessage('StyleSeek: no class name under the cursor.');
    return;
  }

  await indexer.ensureIndexed();
  const config = readConfig();
  const results = searchSelectors(indexer.entries, token, {
    maxResults: config.maxResults,
    enableFuzzySearch: config.enableFuzzySearch,
    includePseudoClasses: config.includePseudoClasses,
    prioritizeActiveFile: config.prioritizeActiveFile,
    activeFilePath: vscode.window.activeTextEditor?.document.uri.fsPath,
  });

  const confident = results.filter((result) => result.score >= TIER.normalizedExact);
  if (confident.length === 1) {
    await revealEntry(confident[0].entry);
    return;
  }
  if (results.length === 0) {
    void vscode.window.showInformationMessage(`StyleSeek: no definition found for "${token}".`);
    return;
  }

  // Several candidates (or only fuzzy ones): let the user choose.
  const entry = await showSelectorQuickPick(indexer, token);
  if (entry) {
    await revealEntry(entry);
  }
}
