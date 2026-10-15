# StyleSeek — Smart CSS Selector Search

Find any CSS/SCSS selector in your project, **even when its full name never
appears literally in the source**.

## The problem

With BEM and Sass nesting, this is what you write:

```scss
.org-tree {
  &__header { height: 40px; }

  &__controls {
    display: flex;

    &-button { cursor: pointer; }
  }
}
```

…and this is what the browser shows you: `.org-tree__controls-button`.

Hit `Ctrl+Shift+F`, paste that class, and VS Code finds **nothing** — the file
only contains `&-button`. You end up searching `.org-tree`, opening the file,
and walking the nesting by eye.

StyleSeek reconstructs the full selector *before* indexing it, so the above
file is searchable as:

```text
.org-tree
.org-tree__header
.org-tree__controls
.org-tree__controls-button
```

Each one remembers the exact file, line and column of **its own**
declaration — searching `.org-tree__controls-button` jumps to `&-button`, not
to the `.org-tree` block that contains it.

## Search examples

| You type | You get |
| --- | --- |
| `.org-tree__controls` | exact match |
| `org-tree__controls` | same — the leading dot is optional |
| `__controls` | every `__controls` in the project, at any nesting depth |
| `controls-button` | `.org-tree__controls-button` |
| `tree__cont` | `.org-tree__controls` |
| `header` | everything containing `header` |
| `org ctrl` | `.org-tree__controls` (fuzzy) |

Search is case-insensitive, results keep their original casing, and ranking
**orders** matches — it never discards a valid one.

### Ranking order

1. Exact selector match
2. Exact match ignoring the optional leading `.`
3. BEM suffix / segment match
4. Prefix match
5. Continuous partial match
6. Fuzzy match

Ties break on: active file first, then shorter selector, then a stable
alphabetical order so results never jump around while you type.

## Commands

| Command | Default keybinding | What it does |
| --- | --- | --- |
| `StyleSeek: Search Selector` | `Ctrl+Alt+F` / `Cmd+Alt+F` | Opens the global selector search |
| `StyleSeek: Find Selected Selector` | `Ctrl+Alt+S` / `Cmd+Alt+S` | Opens the search pre-filled with the selection, or the class under the cursor |
| `StyleSeek: Go to Definition` | — | Jumps from a class used in a template to its declaration; asks when several match |
| `StyleSeek: Rebuild Index` | — | Re-parses the whole workspace |
| `StyleSeek: Show Index Status` | — | Files indexed, selectors found, parse errors, timing |

`Find Selected Selector` works from HTML, Vue, JSX, TSX, CSS and SCSS — it
reads the text, not the language server, and it does **not** stop at hyphens
the way VS Code's default word definition does.

### Changing a keybinding

Both defaults are free in a stock VS Code install, but extensions may claim
them. Open **Keyboard Shortcuts** (`Ctrl+K Ctrl+S`), search `styleseek`, and
rebind. Or in `keybindings.json`:

```json
{ "key": "ctrl+shift+alt+f", "command": "styleseek.searchSelector" }
```

`Go to Definition` is intentionally **not** bound to `F12`. That key belongs
to the language servers, and hijacking it to guess at CSS would get in your
way. Bind `styleseek.goToDefinition` yourself if you want it.

## Supported files

- `.scss` — full Sass nesting
- `.css` — including native CSS nesting
- `.vue` — every `<style>` block, `scoped` or not, extracted with
  `@vue/compiler-sfc` so positions point at the real line of the `.vue` file

`<style src="./styles.scss">` is followed: the referenced file is indexed once,
without duplicating its selectors into the component.

### What is understood

- Unlimited nesting depth (`.a { &__b { &--active { &-icon { … } } } }`)
- Descendant selectors — `.container { .button { } }` becomes
  `.container .button`, never `.container.button`
- Child, adjacent and general sibling combinators (`>`, `+`, `~`)
- Pseudo-classes and pseudo-elements, including functional ones with
  arguments: the comma inside `:is(.a, .b)` is not a selector-list separator
- Attribute selectors, even containing commas or `&`
- Selector lists — `&__title, &__subtitle` produces two entries, each with its
  own position
- Parent lists — `.a, .b { &__x { } }` expands to `.a__x` and `.b__x`
- Multiple `&` in one selector — `.page & { }`, `& + & { }`
- `@media`, `@supports`, `@if`, `@each`, `@include … { }` are transparent to
  the nesting context
- `@at-root` resolves against the document root

### Deliberate limitations

These are decisions, not omissions:

- **No Sass compiler.** `#{$prefix}` is kept literally, so
  `.#{$prefix}-button` is indexed under that exact name and flagged
  internally. It is still findable by its static parts (`-button`), and
  StyleSeek never invents a resolved name it cannot prove.
- **`@mixin` / `@function` bodies.** A `&` inside a mixin has no statically
  known parent, so those selectors are skipped rather than guessed. Plain
  selectors inside a mixin are still indexed.
- **`@keyframes` steps** (`0%`, `from`, `to`) are not selectors and are never
  indexed.
- **A file with a syntax error** is reported in `Show Index Status` and
  contributes no selectors; the rest of the index is unaffected.
- **`.sass` (indented), `.less` and `.styl`** are not supported. The
  architecture has one dispatch point (`src/parsers/index.ts`) if you want to
  add one.

## Configuration

```json
{
  "styleseek.enabled": true,
  "styleseek.include": ["**/*.scss", "**/*.css", "**/*.vue"],
  "styleseek.exclude": [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.next/**",
    "**/.nuxt/**"
  ],
  "styleseek.respectSearchExclude": true,
  "styleseek.maxResults": 100,
  "styleseek.enableFuzzySearch": true,
  "styleseek.includePseudoClasses": false,
  "styleseek.prioritizeActiveFile": true,
  "styleseek.indexDebounceMs": 250
}
```

`respectSearchExclude` additionally honours your `files.exclude` and
`search.exclude` settings. Multi-root workspaces are supported; nothing
outside a workspace folder is ever indexed.

## Indexing behaviour

Activation is cheap — opening VS Code costs nothing. The workspace is parsed
on first use, and the search opens **immediately** with a loading state rather
than blocking on it.

After that, updates are incremental:

- Create, change, delete and rename are watched
- **Unsaved edits are indexed**: a selector you just typed is findable before
  you save
- Closing a dirty document reverts the index to the content on disk
- Events are debounced and coalesced per file
- A slow parse can never overwrite a newer one, and a superseded full rebuild
  publishes nothing

## Privacy and security

StyleSeek is fully local and does exactly nothing else:

- No network access, no telemetry, no analytics
- No credentials, no accounts
- Never runs your project's scripts, build or package manager
- Never downloads anything at runtime
- No `eval`, no dynamic code generation
- Four runtime dependencies, all widely used: `postcss`, `postcss-scss`,
  `postcss-selector-parser`, `@vue/compiler-sfc`

## Try it

A playground workspace with every supported and every deliberately-unsupported
case lives in [`examples/playground`](examples/playground). Open it as its own
window and work through its checklist:

```bash
code examples/playground
```

Its README states exactly what each search must return; `tests/playground.test.ts`
asserts the same things against the real parsers, so the documentation cannot
drift from the behaviour.

## Development

```bash
npm install
npm run verify      # types + lint + unit tests + bundle smoke test
```

Individually:

```bash
npm run check-types # tsc --noEmit
npm run lint        # eslint
npm test            # vitest
npm run build       # esbuild bundle into dist/
npm run smoke       # builds, then drives the bundle against a vscode stub
```

Press **F5** in VS Code to launch the Extension Development Host (it starts
`npm run watch` for you).

### Architecture

```text
src/
  extension.ts            activation and command wiring
  config.ts               settings, validation, glob merging
  commands/               one file per command
  parsers/
    selectorResolver.ts   & resolution, selector-list splitting  <- the core
    styleBlockParser.ts   PostCSS AST walk, context stack, positions
    scssParser.ts  cssParser.ts  vueParser.ts  position.ts
  indexing/
    indexEngine.ts        parse orchestration, versioning, cancellation
    selectorIndex.ts      in-memory store, per-file slices
    workspaceIndexer.ts   the only VS Code-aware indexing code
    fileWatcher.ts        watchers, debouncing, event coalescing
  search/
    fuzzyMatcher.ts  ranking.ts  selectorSearch.ts
  ui/
    selectorQuickPick.ts  navigation.ts
```

`parsers/`, `search/`, `indexing/indexEngine.ts` and `indexing/selectorIndex.ts`
import **no** `vscode` — which is why they are covered by fast unit tests
instead of an Extension Host harness.

Selector reconstruction is AST-based, never regex-driven. A hand-written
scanner exists only as a fallback for Sass syntax that
`postcss-selector-parser` cannot read.

## Packaging

```bash
npm run package     # -> styleseek.vsix
```

Install it:

```bash
code --install-extension styleseek.vsix
```

Or in VS Code: **Extensions** → `…` menu → **Install from VSIX…**

The manifest uses the placeholder publisher `local-dev`. Replace it with your
own before publishing anywhere; StyleSeek is not published to the Marketplace.

## License

MIT.
