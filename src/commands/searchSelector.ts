import type { WorkspaceIndexer } from '../indexing/workspaceIndexer';
import { revealEntry } from '../ui/navigation';
import { showSelectorQuickPick } from '../ui/selectorQuickPick';

/** `StyleSeek: Search Selector` — the global search entry point. */
export async function searchSelectorCommand(
  indexer: WorkspaceIndexer,
  initialValue = '',
): Promise<void> {
  const entry = await showSelectorQuickPick(indexer, initialValue);
  if (entry) {
    await revealEntry(entry);
  }
}
