import * as vscode from 'vscode';

import { readConfig } from '../config';
import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';
import { searchSelectors } from '../search/selectorSearch';
import type { SearchResult, SelectorEntry } from '../types/selector';

interface SelectorItem extends vscode.QuickPickItem {
  readonly entry?: SelectorEntry;
}

const KIND_ICON: Record<SearchResult['kind'], string> = {
  exact: '$(check-all)',
  'normalized-exact': '$(check-all)',
  suffix: '$(check)',
  segment: '$(check)',
  prefix: '$(check)',
  'multi-token': '$(list-selection)',
  substring: '$(search)',
  fuzzy: '$(sparkle)',
};

/**
 * The search UI.
 *
 * VS Code's built-in QuickPick filter is bypassed on purpose (`alwaysShow`):
 * it knows nothing about BEM boundaries and would silently drop hits that our
 * ranking considers relevant. We own the filtering, it owns the rendering.
 */
export function showSelectorQuickPick(
  indexer: WorkspaceIndexer,
  initialValue = '',
): Promise<SelectorEntry | undefined> {
  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick<SelectorItem>();
    let settled = false;
    let hidden = false;

    picker.placeholder = 'Type any part of a selector — fragments, BEM suffixes and fuzzy work';
    picker.matchOnDescription = false;
    picker.matchOnDetail = false;
    picker.value = initialValue;

    const render = (): void => {
      if (hidden) {
        return;
      }
      const config = readConfig();
      const activeFilePath = vscode.window.activeTextEditor?.document.uri.fsPath;
      const results = searchSelectors(indexer.entries, picker.value, {
        maxResults: config.maxResults,
        enableFuzzySearch: config.enableFuzzySearch,
        includePseudoClasses: config.includePseudoClasses,
        prioritizeActiveFile: config.prioritizeActiveFile,
        activeFilePath,
      });

      picker.items = results.length > 0 ? results.map(toItem) : [emptyItem(indexer)];
      picker.title = buildTitle(indexer, results.length);
    };

    picker.onDidChangeValue(render);

    picker.onDidAccept(() => {
      const entry = picker.selectedItems[0]?.entry;
      if (!entry) {
        return;
      }
      settled = true;
      picker.hide();
      resolve(entry);
    });

    picker.onDidHide(() => {
      hidden = true;
      picker.dispose();
      if (!settled) {
        resolve(undefined);
      }
    });

    picker.busy = !indexer.isReady;
    render();
    picker.show();

    // Never block on the index: the picker opens immediately and fills in.
    void indexer.ensureIndexed().then(() => {
      if (hidden) {
        return;
      }
      picker.busy = false;
      render();
    });
  });
}

function toItem(result: SearchResult): SelectorItem {
  const { entry } = result;
  const relative = vscode.workspace.asRelativePath(entry.filePath, true);
  return {
    label: `${KIND_ICON[result.kind]} ${entry.selector}`,
    description: `${relative}:${entry.line}`,
    detail: entry.preview,
    alwaysShow: true,
    entry,
  };
}

function emptyItem(indexer: WorkspaceIndexer): SelectorItem {
  return indexer.isReady
    ? { label: '$(circle-slash) No selector matches this query', alwaysShow: true }
    : { label: '$(loading~spin) Indexing workspace selectors…', alwaysShow: true };
}

function buildTitle(indexer: WorkspaceIndexer, shown: number): string {
  const { selectors, files, state } = indexer.status;
  if (state !== 'ready') {
    return 'StyleSeek — indexing…';
  }
  return `StyleSeek — ${shown} of ${selectors} selectors in ${files} files`;
}
