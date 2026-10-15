import * as vscode from 'vscode';

import type { SelectorEntry } from '../types/selector';

const HIGHLIGHT_MS = 900;

const highlightDecoration = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  borderRadius: '2px',
});

/**
 * Opens the declaration of `entry` and puts the caret on the exact token.
 *
 * The range comes from the AST node that produced the selector, so searching
 * `.org-tree__controls-button` lands on `&-button`, not on the `.org-tree`
 * block that happens to contain it.
 */
export async function revealEntry(entry: SelectorEntry): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(entry.filePath));
  const editor = await vscode.window.showTextDocument(document, { preview: false });

  const line = Math.min(Math.max(entry.line - 1, 0), document.lineCount - 1);
  const lineLength = document.lineAt(line).text.length;
  const startColumn = Math.min(Math.max(entry.column - 1, 0), lineLength);
  const endColumn = Math.min(startColumn + entry.length, lineLength);

  const range = new vscode.Range(line, startColumn, line, endColumn);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

  editor.setDecorations(highlightDecoration, [range]);
  setTimeout(() => {
    if (!editor.document.isClosed) {
      editor.setDecorations(highlightDecoration, []);
    }
  }, HIGHLIGHT_MS);
}

export function disposeNavigation(): void {
  highlightDecoration.dispose();
}
