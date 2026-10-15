import * as vscode from 'vscode';

import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';
import { cleanSelection, extractSelectorToken } from '../util/selectorToken';
import { searchSelectorCommand } from './searchSelector';

/**
 * `StyleSeek: Find Selected Selector` — opens the search pre-filled with the
 * class under the cursor. Works from HTML, Vue, JSX/TSX and stylesheets alike,
 * because it only looks at the text, never at the language server.
 */
export async function findSelectedSelectorCommand(indexer: WorkspaceIndexer): Promise<void> {
  await searchSelectorCommand(indexer, currentToken() ?? '');
}

/** The selected text, or the class-like token under the caret. */
export function currentToken(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }
  const { document, selection } = editor;
  if (!selection.isEmpty) {
    return cleanSelection(document.getText(selection));
  }
  const lineText = document.lineAt(selection.active.line).text;
  return extractSelectorToken(lineText, selection.active.character);
}
