/**
 * Loads the produced bundle against a minimal `vscode` stub and drives a real
 * search end to end.
 *
 * Unit tests cover the pure core; this is the piece they cannot reach — that
 * `dist/extension.js` actually activates, registers its commands, indexes a
 * workspace and navigates, using the VS Code API shapes it claims to use.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, '..', 'tests', 'fixtures', 'workspace');

const FILES = new Map([
  [
    path.join(fixtureRoot, 'src', 'styles', '_tree.scss'),
    `.org-tree {\n  &__header {\n    height: 40px;\n  }\n\n  &__controls {\n    display: flex;\n\n    &-button {\n      cursor: pointer;\n    }\n  }\n}\n`,
  ],
  [
    path.join(fixtureRoot, 'src', 'UserPanel.vue'),
    `<template>\n  <div class="user-panel" />\n</template>\n\n<style scoped lang="scss">\n.user-panel {\n  &__controls {\n    display: grid;\n  }\n}\n</style>\n`,
  ],
]);

const log = [];
let documentChangeHandler;
const registeredCommands = new Map();
let quickPick;

class Disposable {
  constructor(fn) {
    this.dispose = fn ?? (() => {});
  }
  static from(...items) {
    return new Disposable(() => items.forEach((item) => item.dispose?.()));
  }
}

const noopEvent = () => new Disposable();

const vscodeStub = {
  Disposable,
  Uri: { file: (fsPath) => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }) },
  Range: class {
    constructor(a, b, c, d) {
      this.start = { line: a, character: b };
      this.end = { line: c, character: d };
    }
  },
  Selection: class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  ThemeColor: class {
    constructor(id) {
      this.id = id;
    }
  },
  RelativePattern: class {
    constructor(folder, pattern) {
      this.baseUri = folder.uri;
      this.pattern = pattern;
    }
  },
  CancellationTokenSource: class {
    constructor() {
      this.token = { isCancellationRequested: false };
    }
    cancel() {
      this.token.isCancellationRequested = true;
    }
    dispose() {}
  },
  ProgressLocation: { Window: 10 },
  TextEditorRevealType: { InCenter: 2 },
  commands: {
    registerCommand(id, handler) {
      registeredCommands.set(id, handler);
      return new Disposable();
    },
  },
  window: {
    activeTextEditor: undefined,
    createOutputChannel: () => ({
      appendLine: (line) => log.push(line),
      clear() {},
      show() {},
      dispose() {},
    }),
    createTextEditorDecorationType: () => ({ dispose() {} }),
    withProgress: (_options, task) => task({ report() {} }, { isCancellationRequested: false }),
    createQuickPick: () => {
      quickPick = {
        value: '',
        items: [],
        selectedItems: [],
        busy: false,
        title: '',
        placeholder: '',
        matchOnDescription: false,
        matchOnDetail: false,
        handlers: {},
        onDidChangeValue(fn) {
          this.handlers.change = fn;
        },
        onDidAccept(fn) {
          this.handlers.accept = fn;
        },
        onDidHide(fn) {
          this.handlers.hide = fn;
        },
        show() {},
        hide() {
          this.handlers.hide?.();
        },
        dispose() {},
      };
      return quickPick;
    },
    showInformationMessage: (message) => {
      log.push(`info: ${message}`);
      return Promise.resolve(undefined);
    },
    showErrorMessage: (message) => {
      log.push(`error: ${message}`);
      return Promise.resolve(undefined);
    },
    showTextDocument: (document) => {
      const editor = {
        document,
        selection: undefined,
        revealRange(range) {
          log.push(`reveal ${range.start.line}:${range.start.character}`);
        },
        setDecorations() {},
      };
      vscodeStub.window.activeTextEditor = editor;
      return Promise.resolve(editor);
    },
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: fixtureRoot }, name: 'fixture', index: 0 }],
    textDocuments: [],
    getConfiguration: (section) => ({
      get: (key) => (section === 'styleseek' ? undefined : {}),
    }),
    findFiles: (pattern) => {
      const extension = pattern.pattern.replace('**/*', '');
      return Promise.resolve(
        [...FILES.keys()]
          .filter((file) => file.endsWith(extension))
          .map((fsPath) => vscodeStub.Uri.file(fsPath)),
      );
    },
    fs: {
      readFile: (uri) => {
        const content = FILES.get(uri.fsPath);
        if (content === undefined) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve(Buffer.from(content, 'utf8'));
      },
    },
    openTextDocument: (uri) => {
      const lines = (FILES.get(uri.fsPath) ?? '').split('\n');
      return Promise.resolve({
        uri,
        lineCount: lines.length,
        isClosed: false,
        lineAt: (line) => ({ text: lines[line] ?? '' }),
        getText: () => FILES.get(uri.fsPath) ?? '',
      });
    },
    getWorkspaceFolder: () => vscodeStub.workspace.workspaceFolders[0],
    asRelativePath: (fsPath) => path.relative(fixtureRoot, fsPath).split(path.sep).join('/'),
    createFileSystemWatcher: () => ({
      onDidCreate: noopEvent,
      onDidChange: noopEvent,
      onDidDelete: noopEvent,
      dispose() {},
    }),
    onDidChangeTextDocument: (fn) => {
      documentChangeHandler = fn;
      return new Disposable();
    },
    onDidCloseTextDocument: noopEvent,
    onDidRenameFiles: noopEvent,
    onDidDeleteFiles: noopEvent,
    onDidChangeWorkspaceFolders: noopEvent,
    onDidChangeConfiguration: noopEvent,
  },
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const extension = require('../dist/extension.js');

const subscriptions = [];
extension.activate({ subscriptions });

assert.ok(
  ['searchSelector', 'findSelectedSelector', 'goToDefinition', 'rebuildIndex', 'showIndexStatus'].every(
    (name) => registeredCommands.has(`styleseek.${name}`),
  ),
  'all five commands must be registered',
);

// Case B + E: open the picker, type a fragment, accept the best hit.
const running = registeredCommands.get('styleseek.searchSelector')();
await new Promise((resolve) => setTimeout(resolve, 150));

quickPick.value = '__controls';
quickPick.handlers.change();

const labels = quickPick.items.map((item) => item.label.replace(/^\$\([a-z-~]+\)\s*/, ''));
assert.deepEqual(
  labels.slice(0, 2).sort(),
  ['.org-tree__controls', '.user-panel__controls'],
  `expected both __controls declarations, got ${JSON.stringify(labels)}`,
);
assert.ok(
  quickPick.items.every((item) => item.alwaysShow),
  'items must bypass the built-in QuickPick filter',
);

quickPick.selectedItems = [quickPick.items.find((item) => item.label.endsWith('.org-tree__controls'))];
quickPick.handlers.accept();
await running;

assert.ok(
  log.includes('reveal 5:2'),
  `expected navigation to &__controls on line 6 col 3, log was ${JSON.stringify(log)}`,
);

// Case F: a selector typed but not saved must become findable.
const scssPath = path.join(fixtureRoot, 'src', 'styles', '_tree.scss');
const draft = FILES.get(scssPath).replace('&__header {', '&__header-unsaved {\n    color: red;\n  }\n\n  &__header {');
const draftDocument = {
  uri: vscodeStub.Uri.file(scssPath),
  isClosed: false,
  getText: () => draft,
};
assert.ok(documentChangeHandler, 'the extension must listen to document changes');
documentChangeHandler({ document: draftDocument, contentChanges: [{ text: 'x' }] });
await new Promise((resolve) => setTimeout(resolve, 600));

const second = registeredCommands.get('styleseek.searchSelector')();
await new Promise((resolve) => setTimeout(resolve, 50));
quickPick.value = '__header-unsaved';
quickPick.handlers.change();
const unsavedLabels = quickPick.items.map((item) => item.label);
assert.ok(
  unsavedLabels.some((label) => label.endsWith('.org-tree__header-unsaved')),
  `unsaved selector must be indexed, got ${JSON.stringify(unsavedLabels)}`,
);
quickPick.hide();
await second;

// The status breakdown must reach the output channel, not a notification
// `detail` (which VS Code only renders on modal dialogs and otherwise drops).
log.length = 0;
await registeredCommands.get('styleseek.showIndexStatus')();
const statusFields = [
  'State',
  'Files indexed',
  'Selectors found',
  'Parse errors',
  'Last full index',
  'Workspace folders',
  'discovery',
  'parsing',
  'fixture',
];
for (const field of statusFields) {
  assert.ok(
    log.some((line) => line.includes(field)),
    `index status must report "${field}", log was ${JSON.stringify(log)}`,
  );
}
assert.ok(
  log.some((line) => line.startsWith('info: StyleSeek — ') && line.includes('selectors in')),
  'index status must also show a headline notification',
);

subscriptions.forEach((item) => item.dispose?.());
Module._load = originalLoad;

console.log('smoke: bundle activates, indexes, searches, navigates and tracks unsaved edits — OK');
